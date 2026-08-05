# NCP (Negotiated Care Plan) Module — How It Works

This document explains how the **NCP PDF-to-DOCX** feature (built by your junior dev) works end-to-end: data model, backend pipeline, APIs, and frontend.

---

## 1. What This NCP Module Is

- **Name:** NCP = Negotiated Care Plan (assessment documents for Adult Family Homes).
- **This module does:** Upload assessment **PDFs** → **AI extracts** 432+ structured fields → **Store** in DB → **Populate a DOCX template** → **Download** the filled document.
- **It is separate from:** The general “Care Plan” module (problems, goals, interventions). Those are different features; this one is purely **PDF in → DOCX out** with AI extraction in between.

**In one sentence:** User uploads a PDF; the system extracts data in the background, then fills a Word template so the user can download a completed DOCX.

---

## 2. Data Model (Prisma)

**Model:** `NcpExtraction` (table `ncp_extractions`).

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant (facility) — all access filtered by tenant |
| `userId` | UUID? | User who uploaded |
| `residentId` | UUID? | Optional link to a resident |
| `sourcePdfS3Key` | String | S3 key of uploaded PDF |
| `sourcePdfFileName` | String | Original file name |
| `sourcePdfSize` | Int? | File size (bytes) |
| `extractedData` | Json | 432+ fields from schema (`afh_ncp_schema_flat.json`) |
| `status` | NcpStatus | PENDING → EXTRACTING → EXTRACTED → REVIEWED → POPULATED / FAILED |
| `extractionMethod` | String? | e.g. "openai", "hybrid" |
| `extractionModel` | String? | e.g. "gpt-4o" |
| `errorMessage` | String? | Error or progress text (e.g. `PROGRESS:Downloading PDF...`) |
| `retryCount` | Int | Default 0 |
| `progressPercent` | Int? | 0–100 during EXTRACTING (for UI) |
| `bullJobId` | String? | BullMQ job id when Redis is used |
| `populatedDocxS3Key` | String? | S3 key of generated DOCX |
| `populatedDocxUrl` | String? | Pre-signed or public URL for download |
| `createdAt`, `updatedAt`, `extractedAt`, `populatedAt` | DateTime | Timestamps |

**Enum `NcpStatus`:**  
`PENDING` | `EXTRACTING` | `EXTRACTED` | `REVIEWED` | `POPULATED` | `FAILED`

Relations: `tenant`, `user`, `resident`.

---

## 3. Backend Flow (High Level)

```
Upload PDF → Validate → Store in S3 → Create DB row (PENDING) → Queue job
                                                                    ↓
                                            Worker: download PDF → extract data → save EXTRACTED
                                            (BullMQ if REDIS_URL set, else in-memory queue)
```

Later:

```
User clicks "Generate DOCX" → Load extractedData + template → Fill DOCX → Upload to S3
                            → Update row (POPULATED, populatedDocxS3Key/Url)
User clicks "Download"      → Return pre-signed URL or stream from S3
```

---

## 4. Upload and Queue (Detail)

**Entry:** `POST /api/ncp/extract` (multipart: `file` or `files`, optional `residentId` / `tenantId` for SUPER_ADMIN).

1. **Controller** (`ncp.controller.js`):  
   Normalizes single/bulk files, parses `residentId` (single or array for bulk). Calls service once per file or bulk.

2. **Service** (`uploadAndExtractNcp` / `uploadAndExtractNcpBulk` in `ncp.service.js`):
   - Validate PDF structure (`validatePdfStructure` from `ncp-pdf-extraction.service.js`).
   - Upload PDF to S3 (`uploadPdfToS3` in `s3.util.js`).
   - Optionally validate `residentId` against tenant.
   - Create `NcpExtraction` with `status: PENDING`, `extractedData: {}`.
   - Queue job:
     - If **Redis** (`REDIS_URL`): `ncp-extraction.queue.js` → `addNcpExtractionJob` → BullMQ queue `ncp-extraction`; worker runs `processNcpExtraction` from `ncp.service.js`; optional `bullJobId` stored on row.
     - Else: **in-memory** queue in `background-jobs.js` → same `processNcpExtraction` invoked when worker runs.

3. Response: `{ success, extractions: [{ id, status: "PENDING" }], summary?, errors? }`.

---

## 5. Background Extraction Pipeline (`processNcpExtraction`)

Runs inside BullMQ worker or in-memory worker.

1. **Download PDF** from S3 (`downloadPdfFromS3`).
2. **Status** → `EXTRACTING`, `errorMessage = "PROGRESS:..."` (and optional `progressPercent` if DB column exists).
3. **Decide method:** `shouldUseVisionApi(pdfBuffer)` in `ncp-vision-extraction.service.js`:
   - **Vision path:** Image-based PDFs or complex layouts → render pages to images → OpenAI Vision API to extract JSON matching schema.
   - **Text path:** Extract text from PDF (`extractTextFromPdf` in `ncp-pdf-extraction.service.js`), then chunk and call **AI text extraction** (`ncp-ai-extraction.service.js`).
4. **Schema:** All extraction uses `afh_ncp_schema_flat.json` (loaded via `loadNcpSchema()`). Schema defines ~432 fields (type, enum, description). AI returns JSON with same keys; missing/empty filled with `""` or `"Not indicated in assessment"` (`ensureAllSchemaKeys`).
5. **Vision path** can be followed by a **Layer 2** text pass for missing fields (`getMissingFields` → `extractMissingFieldsFromText`).
6. **Normalize** values (`normalizeFieldValues`), **validate** (`validateExtractedData`).
7. **Update DB:** `extractedData`, `status: "EXTRACTED"`, `extractedAt`, `extractionMethod`, `extractionModel`, clear `errorMessage` / progress.
8. **Audit:** `logUserAction` with `PHI_EXTRACT_NCP`.
9. On error: set `status: "FAILED"`, `errorMessage: error.message`, rethrow so queue marks job failed.

---

## 6. AI Extraction Services

- **`ncp-ai-extraction.service.js`**:  
  Loads schema, converts to JSON Schema for OpenAI, builds system/user prompts (strict extraction rules, checkboxes `X`/`""`, dates MM/DD/YYYY). Text-based extraction: `extractNcpDataFromText`, chunking, optional `fillEmptyFieldsWithAI`, `getMissingFields`, `extractMissingFieldsFromText`, `normalizeFieldValues`, `validateExtractedData`.

- **`ncp-vision-extraction.service.js`**:  
  Renders PDF pages to images (`pdfPageToImage` from `aiFieldDetection.service`), sends to OpenAI Vision with schema summary; returns JSON. Used when `shouldUseVisionApi` is true.

- **`ncp-pdf-extraction.service.js`**:  
  PDF text extraction and validation (`extractTextFromPdf`, `validatePdfStructure`, `chunkPdfText`).

Schema file: **`afh_ncp_schema_flat.json`** at project root (backend). Defines all field names and types the AI must fill.

---

## 7. DOCX Generation and Download

- **Generate DOCX:** `POST /api/ncp/extractions/:id/populate`  
  - Loads extraction (must be EXTRACTED/REVIEWED, not PENDING/EXTRACTING).  
  - `generatePopulatedDocx` in `ncp-docx-population.service.js`: loads template from S3 (`getNcpTemplateFromS3`), maps `extractedData` to template placeholders (`prepareTemplateData`), uses **docxtemplater** + **pizzip** to fill DOCX, uploads result to S3 (`uploadPopulatedDocxToS3`).  
  - Updates row: `populatedDocxS3Key`, `populatedDocxUrl`, `status: "POPULATED"`, `populatedAt`.  
  - Audit: `PHI_GENERATE_NCP_DOCX`.

- **Download:** `GET /api/ncp/extractions/:id/download`  
  - Returns pre-signed URL or stream for `populatedDocxS3Key`.  
  - Audit: `PHI_DOWNLOAD_NCP_DOCX`.

Template: DOCX in S3; placeholders match schema field names.

---

## 8. Other Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ncp/schema` | NCP schema with sections and field metadata (for UI review/edit). From `getNcpSchema()` in `ncp.service.js`: loads flat schema, groups into 11 sections (Summary, Responsible Parties, Communication, Health, Medications, etc.), adds field types (checkbox, date, text, textarea). |
| GET | `/api/ncp/extractions` | List extractions (paginated). Query: `limit`, `offset`, `status`, `residentId`, `tenantId` (SUPER_ADMIN). Tenant from JWT or query. |
| GET | `/api/ncp/extractions/:id` | Get one extraction (for detail page). |
| GET | `/api/ncp/extractions/:id/progress` | Lightweight progress for polling: `step`, `percent`, `status` (from `errorMessage` PROGRESS: or `progressPercent`). |
| PUT | `/api/ncp/extractions/:id` | Update `extractedData` (merge with existing), set `status: "REVIEWED"`. |
| POST | `/api/ncp/extractions/:id/summary` | AI-generated assessment summary from extracted data (GPT); returns HTML. |
| DELETE | `/api/ncp/extractions/:id` | Delete extraction, delete source PDF and populated DOCX from S3, then delete DB row. Query `tenantId` for SUPER_ADMIN. |

All NCP routes use `authenticate()` and `requirePermission("NCP", "view")`. Tenant isolation via `enforceTenantIsolation("tenantId")` where applicable.

---

## 9. Frontend Structure

**Routes (e.g. in `routeConstants`):**

- List: `/ncp/extractions` → `NcpExtractionsPage`
- Detail: `/ncp/extractions/:id` → `NcpExtractionDetailPage`

**Permission:** NCP module requires `NCP` / `view` (and actions like create/update as used). **SUPER_ADMIN is currently redirected away** from NCP pages (`Navigate to ROUTES.DASHBOARD` in both pages).

**API layer:** `src/api/ncp.ts`  
- Types: `NcpExtraction`, `NcpExtractionStatus`, `NcpExtractedData`, pagination, upload/list/get/update/populate/download/delete/schema/progress/summary.  
- Functions: `uploadExtraction`, `uploadBulkExtractions`, `getExtractions`, `getExtractionById`, `getProgress`, `updateExtraction`, `populateDocx`, `downloadDocx`, `deleteExtraction`, `getSchema`, `generateSummary`.

**Hooks:**

- `useNcpExtractions(params)` — list with pagination/filters; refetch.
- `useNcpExtraction({ id, autoPoll, pollInterval })` — single extraction; optional polling when status is PENDING/EXTRACTING (detail page uses polling; progress modal can use GET progress).
- `useNcpUpload()` — single/bulk upload, progress state, toasts.
- `useNcpSchema()` — fetch schema once, cached (for sections/field types).
- `useNcpDocx()` — generate DOCX, download DOCX (with loading flags).
- `useNcpExtractionUpdate()` — update extracted data (detail/edit).
- `useNcpUpload` (and upload API) support optional `tenantId` for SUPER_ADMIN (backend accepts it; frontend currently blocks SUPER_ADMIN from NCP pages).

**Pages:**

- **NcpExtractionsPage:** Table of extractions, filters (status, resident), search by file name, pagination, tenant selector for SUPER_ADMIN (then redirect). Upload zone (single/bulk), resident selector for upload. Actions: view (navigate to detail), generate DOCX, download DOCX, delete (modal). Uses `ExtractionTable`, `ExtractionFilters`, `UploadZone`, `DeleteExtractionModal`.
- **NcpExtractionDetailPage:** One extraction by `id`. Shows status; if PENDING/EXTRACTING, shows progress modal (polls GET progress). When EXTRACTED, can show status modal, assessment summary modal, extracted data form (review/edit), DOCX actions (generate/download), delete modal. Back link to list. Uses `ExtractionDetailView`, `ExtractedDataForm`, `DocxActions`, `ExtractionStatusModal`, `ExtractionProgressModal`, `AssessmentSummaryModal`, `DeleteExtractionModal`.

**Components (`src/components/ncp/`):**

- `ExtractionTable`, `ExtractionFilters`, `ExtractionCard`, `StatusBadge`
- `UploadZone`, `UploadProgressModal`
- `ExtractionDetailView`, `ExtractedDataForm`, `ViewExtractionModal`
- `ExtractionProgressModal`, `ExtractionStatusModal`, `AssessmentSummaryModal`
- `DocxActions`, `GenerateDocxButton`, `DownloadDocxButton`
- `DeleteExtractionModal`

Sidebar: NCP section links to NCP extractions list (e.g. “Care Plans” or “NCP Extractions” depending on copy).

---

## 10. End-to-End User Journey

1. User opens **NCP Extractions** list.
2. Clicks **Upload**, picks PDF(s), optionally selects resident(s). Submits.
3. API uploads to S3, creates row(s) with PENDING, queues job(s). Response returns extraction id(s).
4. Frontend shows new row(s) as PENDING; on single upload may navigate to detail.
5. **Detail page:** If status is PENDING/EXTRACTING, progress modal opens and polls GET `/extractions/:id/progress` until status is EXTRACTED or FAILED.
6. When EXTRACTED: user can view/edit extracted data (sections from schema), trigger “Generate DOCX”, then “Download”. Status becomes POPULATED.
7. List page can also “Generate DOCX” and “Download” per row; list refetches to show updated status.
8. Delete removes S3 files and DB row; list or detail navigates as needed.

---

## 11. Configuration and Environment

- **Backend:**  
  - `OPENAI_API_KEY` for extraction and summary.  
  - `REDIS_URL` (or `REDIS_URI`): if set, NCP extraction uses BullMQ; else in-memory queue.  
  - S3: bucket and keys for PDF upload, DOCX template, populated DOCX (`s3.util.js`, env for bucket name).  
  - Schema: `afh_ncp_schema_flat.json` at backend project root.  
  - DOCX template: stored in S3 (path/config in `getNcpTemplateFromS3` / `uploadPopulatedDocxToS3`).

- **Frontend:**  
  - API base URL and endpoints in `config`; NCP endpoints in `api/ncp.ts`.

---

## 12. Summary Diagram

```
[User] → Upload PDF → [API] → S3 + DB (PENDING) → [Queue: BullMQ or in-memory]
                                                          ↓
[Worker] → Download PDF → Vision or Text extraction → AI (OpenAI) → extractedData
         → DB (EXTRACTED) + audit
                                                          ↓
[User] → Generate DOCX → [API] → load template + data → docxtemplater → S3 DOCX
       → DB (POPULATED)
                                                          ↓
[User] → Download DOCX → [API] → S3 URL/stream
```

You now have a full picture of how NCP works from upload through extraction to DOCX generation and download, and where each piece lives in backend and frontend.

# Document Upload Mechanism - Questionnaire Section

## Overview

The document upload feature in the Questionnaire section allows users to upload a PDF document containing resident information. The system automatically extracts data from the PDF using OpenAI Vision API and pre-fills the resident creation form.

---

## Architecture Flow

```
Frontend (QuestionnairePage.tsx)
    ↓
    [User uploads PDF]
    ↓
    [Validation: File type, size (100MB max)]
    ↓
    [POST /api/residents/pdf]
    ↓
Backend (resident.controller.js)
    ↓
    [Multer middleware: file upload]
    ↓
    [extractResidentDataFromPdf service]
    ↓
    [PDF Processing Pipeline]
    ↓
    [OpenAI Vision API]
    ↓
    [Field Validation & Mapping]
    ↓
    [Return extracted fields]
    ↓
Frontend
    ↓
    [Populate form fields]
    ↓
    [User reviews/edits]
    ↓
    [POST /api/residents - Create resident]
```

---

## Frontend Implementation

### File: `QuestionnairePage.tsx`

#### Key Components:

1. **State Management:**
   ```typescript
   const [isUploadingPdf, setIsUploadingPdf] = useState(false);
   const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   ```

2. **Upload Handler (`handlePdfUpload`):**
   - **Location:** Lines 54-118
   - **Validations:**
     - File type: Must be PDF (checks `file.type` and `.pdf` extension)
     - File size: Maximum 100MB
   - **Process:**
     1. Sets loading state
     2. Calls `residentsApi.uploadPdf(file)`
     3. Maps returned fields to form data
     4. Handles date conversion for date fields
     5. Updates form state with extracted data
     6. Shows success/error toast

3. **Date Conversion:**
   - **Function:** `convertDateForInput` (Lines 35-51)
   - Converts ISO date strings to `YYYY-MM-DD` format for HTML date inputs
   - Handles fields containing: "date", "dob", "birth_date", "date_of_birth"

4. **UI Components:**
   - **Drag & Drop Zone:** Lines 402-471
     - Supports drag-and-drop file upload
     - Click to browse files
     - Shows upload progress
     - Displays uploaded file name

5. **Form Population:**
   - Extracted fields are mapped to `formData` state
   - Form fields are rendered from `fields.json` schema
   - User can review and edit before submission

---

## API Layer

### File: `src/api/residents.ts`

#### Function: `uploadPdf`

```typescript
async uploadPdf(file: File): Promise<UploadResidentPdfResponse>
```

- **Endpoint:** `POST /api/residents/pdf`
- **Content-Type:** `multipart/form-data`
- **Request:** FormData with `file` field
- **Response:**
  ```typescript
  {
    success: boolean;
    message: string;
    fields: Record<string, unknown>; // Extracted fields matching fields.json
  }
  ```

---

## Backend Implementation

### Route: `src/routes/resident/resident.routes.js`

**Endpoint:** `POST /api/residents/pdf`

- **Middleware:**
  - `authenticate()` - JWT authentication required
  - `upload.single("file")` - Multer file upload (max 100MB)
  - Error handler for Multer errors

### Controller: `src/controllers/resident/resident.controller.js`

**Function:** `extractResidentDataFromPdfHandler` (Lines 414-531)

**Process:**
1. **Authentication Check:** Verifies user is authenticated
2. **File Validation:**
   - Checks if file exists (`req.file?.buffer`)
   - Validates MIME type: `application/pdf`
   - Validates file size: Max 100MB
3. **Tenant ID Resolution:**
   - SUPER_ADMIN can specify `tenantId` in body
   - Others use `req.user.tenantId` from JWT
4. **PDF Processing:**
   - Calls `extractResidentDataFromPdf(req.file.buffer, req.file.originalname)`
5. **Audit Logging:**
   - Logs PHI access event
   - Records file name, size, fields extracted
6. **Response:**
   - Returns extracted fields (does NOT create resident)
   - Frontend will create resident via separate `POST /api/residents` call

---

## PDF Extraction Service

### File: `src/services/resident/resident-pdf-extraction.service.js`

**Main Function:** `extractResidentDataFromPdf(pdfBuffer, fileName)`

#### Step-by-Step Process:

1. **Load PDF Document:**
   ```javascript
   const pdfDoc = await PDFDocument.load(pdfBuffer);
   const totalPages = pdfDoc.getPages().length;
   ```

2. **Load Fields Schema:**
   - Reads `fields.json` from project root
   - Defines expected field structure (98 fields total)

3. **Create Extraction Prompt:**
   - **Function:** `createExtractionPrompt(fieldsSchema, useVision)`
   - Groups fields by category (resident, admission, emergency, medical, etc.)
   - Creates comprehensive prompt for OpenAI Vision API
   - Includes field types, formats, and examples

4. **Process PDF in Batches:**
   - **Batch Size:** 5 pages per batch (to avoid API token limits)
   - **Process:**
     - Convert PDF pages to images (PNG, base64)
     - Send images + prompt to OpenAI Vision API
     - Model: `gpt-4.1-2025-04-14`
     - Response format: JSON object

5. **Image Conversion:**
   - Uses `pdfPageToImage(pdfBuffer, pageIndex, scaleFactor)`
   - Scale factor: 2 (for better OCR quality)
   - Returns base64-encoded PNG images

6. **OpenAI Vision API Call:**
   ```javascript
   const completion = await openai.chat.completions.create({
     model: "gpt-4.1-2025-04-14",
     messages: [
       {
         role: "system",
         content: "You are an expert at extracting structured healthcare data..."
       },
       {
         role: "user",
         content: [
           { type: "text", text: batchPrompt },
           ...batchImageMessages // Array of image_url objects
         ]
       }
     ],
     response_format: { type: "json_object" } // Force JSON response
   });
   ```

7. **Data Merging:**
   - Merges data from all batches
   - Handles arrays (e.g., medications) by concatenation
   - For strings, prefers longer/more complete values
   - Updates values if more recent information found

8. **Field Validation:**
   - **Function:** Validates extracted data against `fields.json` schema
   - **Process:**
     - Only includes fields that exist in `fields.json`
     - Validates data types (string, boolean, date, array)
     - Converts string booleans to actual booleans
     - Handles date format conversion
     - Skips null/undefined/empty values
     - Warns about fields not in schema (excludes them)

9. **Type Conversion:**
   - **Booleans:** Converts "true"/"false" strings, "yes"/"no", etc.
   - **Dates:** Validates and normalizes date formats
   - **Arrays:** Ensures proper array structure
   - **Numbers:** Validates numeric fields

10. **Return Validated Data:**
    - Returns only fields matching `fields.json` structure
    - Logs matched vs unmatched fields
    - Does NOT create resident record (frontend does that)

---

## Fields Schema

### File: `fields.json` (Frontend root)

**Structure:** 98 fields organized by category:

- **Resident Info:** `resident_*` (16 fields)
- **Admission:** `admission_*` (8 fields)
- **Emergency Contacts:** `emergency_*` (13 fields)
- **Medical:** `medical_*` (9 fields)
- **Insurance:** `insurance_*` (7 fields)
- **Preventive Care:** `preventive_*` (9 fields)
- **Functional:** `functional_*` (3 fields)
- **Medications:** `medication_*` (8 fields)
- **Diet:** `diet_*` (5 fields)
- **Skin:** `skin_*` (5 fields)
- **Mental Health:** `mental_*` (4 fields)
- **End of Life:** `eol_*` (4 fields)
- **Compliance:** `compliance_*` (5 fields)

**Field Types:**
- `string` - Text fields
- `boolean` - Checkbox/yes-no fields
- `YYYY-MM-DD` - Date fields
- `array` - List fields (e.g., medications, diagnoses)
- `number` - Numeric fields

---

## Data Flow Example

### 1. User Uploads PDF:
```
User selects "Medical Release Form.pdf" (127KB)
```

### 2. Frontend Validation:
```typescript
✅ File type: PDF
✅ File size: 127KB < 100MB
```

### 3. API Request:
```http
POST /api/residents/pdf
Content-Type: multipart/form-data
Authorization: Bearer <JWT_TOKEN>

FormData:
  file: <PDF buffer>
```

### 4. Backend Processing:
```
[Resident-PDF] Processing PDF: Medical Release Form.pdf
[Resident-PDF] PDF has 3 page(s)
[Resident-PDF] Processing 3 pages in 1 batch(es) of 5 pages each...
[Resident-PDF] ✅ Converted page 1/3 to image (1654x2140)
[Resident-PDF] ✅ Converted page 2/3 to image (1654x2140)
[Resident-PDF] ✅ Converted page 3/3 to image (1654x2140)
[Resident-PDF] Sending batch 1 (3 images) to OpenAI Vision API...
[Resident-PDF] ✅ Batch 1 extracted 45 fields
[Resident-PDF] ✅ Matched 42 fields with fields.json schema
```

### 5. Response:
```json
{
  "success": true,
  "message": "PDF processed successfully",
  "fields": {
    "resident_full_legal_name": "John Doe",
    "resident_date_of_birth": "1950-05-15",
    "resident_gender_sex": "Male",
    "admission_date": "2024-01-10",
    "medical_primary_diagnosis": "Diabetes Type II",
    "medical_allergies": "Penicillin",
    ...
  }
}
```

### 6. Frontend Population:
```typescript
setFormData({
  "resident_full_legal_name": "John Doe",
  "resident_date_of_birth": "1950-05-15",
  ...
});
// Form fields are now pre-filled
```

### 7. User Review & Submit:
```
User reviews extracted data
User edits any incorrect fields
User clicks "Submit"
POST /api/residents → Creates resident record
```

---

## Key Features

### 1. **Batch Processing**
- Processes large PDFs in batches of 5 pages
- Prevents API token limit issues
- Merges data intelligently across batches

### 2. **Field Validation**
- Only returns fields that exist in `fields.json`
- Validates data types
- Converts formats (dates, booleans, etc.)
- Excludes unmatched fields

### 3. **Error Handling**
- File validation errors (type, size)
- PDF processing errors (no text, corrupted)
- OpenAI API errors
- Network errors
- All errors return user-friendly messages

### 4. **Audit Logging**
- Logs all PDF uploads
- Records PHI access (HIPAA compliance)
- Tracks file name, size, fields extracted

### 5. **Multi-tenant Support**
- Tenant isolation enforced
- SUPER_ADMIN can specify tenant
- Regular users use their own tenant

---

## Configuration

### Environment Variables Required:

```env
# OpenAI API (Required)
OPENAI_API_KEY=sk-proj-...

# Optional: Model selection
OPENAI_MODEL=gpt-4.1-2025-04-14
```

### File Limits:

- **Max File Size:** 100MB
- **Supported Format:** PDF only
- **Batch Size:** 5 pages per batch

---

## Error Scenarios

### 1. **No Text in PDF:**
```
Error: "No text found in PDF. The PDF may be scanned or image-based."
```
**Solution:** PDF needs OCR or contains only images

### 2. **File Too Large:**
```
Error: "File too large. Maximum size is 100MB."
```
**Solution:** Compress PDF or split into smaller files

### 3. **OpenAI API Error:**
```
Error: "Failed to process PDF with AI. Please try again."
```
**Solution:** Check API key, quota, or network connection

### 4. **Invalid File Type:**
```
Error: "Only PDF files are allowed"
```
**Solution:** Convert file to PDF format

---

## Testing

### Test Cases:

1. **Valid PDF Upload:**
   - Upload PDF with resident information
   - Verify fields are extracted
   - Verify form is populated

2. **Invalid File Type:**
   - Upload .docx, .jpg, etc.
   - Verify error message

3. **Large File:**
   - Upload file > 100MB
   - Verify size limit error

4. **Empty PDF:**
   - Upload blank PDF
   - Verify appropriate error

5. **Multi-page PDF:**
   - Upload 10+ page PDF
   - Verify batch processing works
   - Verify all data merged correctly

---

## Future Enhancements

Potential improvements:

1. **Progress Tracking:**
   - Show upload progress percentage
   - Show batch processing status

2. **Field Confidence Scores:**
   - Return confidence levels for extracted fields
   - Highlight low-confidence fields for review

3. **OCR Fallback:**
   - If Vision API fails, try OCR
   - Support scanned PDFs

4. **Field Mapping Preview:**
   - Show which fields were found
   - Allow user to map manually

5. **Multiple File Support:**
   - Upload multiple PDFs
   - Merge data from all files

---

## Related Files

### Frontend:
- `src/pages/forms/QuestionnairePage.tsx` - Main component
- `src/api/residents.ts` - API client
- `src/api/config.ts` - API endpoints
- `fields.json` - Field schema

### Backend:
- `src/routes/resident/resident.routes.js` - Route definition
- `src/controllers/resident/resident.controller.js` - Controller
- `src/services/resident/resident-pdf-extraction.service.js` - Extraction logic
- `fields.json` - Field schema (backend copy)

---

## Summary

The document upload mechanism provides a seamless way to extract resident information from PDF documents using AI. The system:

1. ✅ Validates file uploads
2. ✅ Processes PDFs in batches
3. ✅ Extracts structured data using OpenAI Vision API
4. ✅ Validates against fields.json schema
5. ✅ Pre-fills form for user review
6. ✅ Maintains audit trail
7. ✅ Handles errors gracefully

The extracted data is returned to the frontend, where users can review and edit before creating the resident record.


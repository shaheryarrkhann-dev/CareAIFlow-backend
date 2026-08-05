# 🏛️ WAC/RCW Compliance Implementation Guide

## Overview

This document describes the **Washington Administrative Code (WAC) and Revised Code of Washington (RCW) compliance system** integrated into the AI-driven form schema generation pipeline for Adult Family Homes (AFHs).

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Implementation Details](#implementation-details)
3. [API Endpoints](#api-endpoints)
4. [Database Schema](#database-schema)
5. [Setup Instructions](#setup-instructions)
6. [Usage Examples](#usage-examples)
7. [Security & Compliance](#security--compliance)
8. [Monitoring & Maintenance](#monitoring--maintenance)

---

## System Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                  WAC/RCW Compliance System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│  │   WA LawDoc  │───▶│  Regulation  │───▶│   Pinecone      │  │
│  │   API/Web    │    │   Fetcher    │    │  Vector Store   │  │
│  └──────────────┘    └──────────────┘    └─────────────────┘  │
│         │                                          │           │
│         │                                          ▼           │
│         │                            ┌─────────────────────┐  │
│         │                            │  Semantic Search    │  │
│         │                            │  for Relevance      │  │
│         │                            └─────────────────────┘  │
│         │                                          │           │
│         ▼                                          ▼           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │            AI Schema Generation (GPT-4o)                 │ │
│  │  • Analyzes form fields from PDF                        │ │
│  │  • Retrieves relevant WAC/RCW regulations               │ │
│  │  • Attaches citations to each field                     │ │
│  │  • Generates compliance metadata                         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                             │                                  │
│                             ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │          Human-in-the-Loop (HITL) Review                │ │
│  │  • Admin reviews schema compliance                      │ │
│  │  • Approves or rejects with notes                       │ │
│  │  • Version control & audit trail                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                             │                                  │
│                             ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │           Monthly Regulation Updates (Cron)             │ │
│  │  • Fetches latest WAC/RCW versions                      │ │
│  │  • Updates vector database                              │ │
│  │  • Flags schemas for revalidation                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Regulation Fetching Service

**File**: `src/services/wacRcwCompliance.service.js`

**Key Functions**:
- `fetchWACRegulation(citeCode)`: Fetches WAC regulation from API/web
- `fetchRCWRegulation(citeCode)`: Fetches RCW regulation from API/web
- `storeRegulationInVectorDB(regulation)`: Stores in Pinecone with embeddings
- `findRelevantRegulations(fieldName, fieldLabel, fieldType, context)`: Semantic search for relevant regulations
- `initializeRegulations()`: Loads all AFH-related regulations on first run

**AFH Regulations Tracked** (23 total):
- **WAC (14)**: 388-76-10010 (General), 388-76-10600 (Rights), 388-76-10620 (Agreements), etc.
- **RCW (9)**: 70.128.010 (Definitions), 70.129.030 (Medication), 70.129.040 (Healthcare), etc.

---

### 2. AI Schema Generation with Compliance

**File**: `src/services/ai.service.js`

**Enhanced Function**: `generateFormSchema({ tenantId, formName, description, userId })`

**New Workflow**:
1. ✅ Retrieve form context from PDF embeddings
2. 🆕 **Fetch relevant WAC/RCW regulations** via semantic search
3. 🆕 **Pass regulations to GPT-4o** in system prompt
4. ✅ GPT-4o generates fields with **citations**:
   ```json
   {
     "label": "Resident Rights Acknowledgment",
     "name": "resident_rights_acknowledgment",
     "type": "checkbox",
     "required": true,
     "wacCitation": "WAC 388-76-10600(3)",
     "rcwCitation": null,
     "complianceNote": "Required by state law to acknowledge resident rights"
   }
   ```
5. 🆕 **Calculate compliance metrics** (% fields with citations)
6. 🆕 **Store compliance metadata** in database

---

### 3. Database Schema Updates

**File**: `prisma/schema.prisma`

**New Fields Added to `FormSchema` Model**:
```prisma
model FormSchema {
  // ... existing fields ...
  
  // 🆕 Compliance fields
  isWacRcwCompliant     Boolean   @default(false)
  complianceVersion     String?   // e.g., "2025-01"
  lastComplianceCheck   DateTime?
  
  // 🆕 HITL approval fields
  adminApproved         Boolean   @default(false)
  adminApprovedBy       String?
  adminApprovedAt       DateTime?
  complianceNotes       String?
  
  @@index([isWacRcwCompliant])
  @@index([adminApproved])
}
```

**Stored in `schemaJson`**:
```json
{
  "form_name": "Emergency Contact Form",
  "fields": [ /* ... fields with citations ... */ ],
  "compliance": {
    "isCompliant": true,
    "totalFields": 25,
    "fieldsWithCitations": 18,
    "compliancePercentage": "72.0",
    "wacCitations": ["WAC 388-76-10600", "WAC 388-76-10650", ...],
    "rcwCitations": ["RCW 70.129.030", ...],
    "generatedAt": "2025-01-15T10:30:00.000Z",
    "complianceVersion": "2025-01"
  }
}
```

---

### 4. HITL Admin Review Workflow

**File**: `src/controllers/complianceAdmin.controller.js`

**Endpoints**:
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/compliance/pending-review` | Get schemas awaiting admin approval |
| GET | `/api/compliance/schema/:schemaId` | Get full schema details for review |
| POST | `/api/compliance/schema/:schemaId/approve` | Approve schema (with notes) |
| POST | `/api/compliance/schema/:schemaId/reject` | Reject schema (with reason) |
| POST | `/api/compliance/schema/:schemaId/revalidate` | Revalidate against latest regulations |
| GET | `/api/compliance/stats` | Get compliance statistics |

**Permissions**: ADMIN or SUPER_ADMIN only

---

### 5. PII/PHI Masking (HIPAA Compliance)

**File**: `src/services/piiPhiMasking.service.js`

**Key Functions**:
- `maskPiiPhi(text)`: Masks PII/PHI in text (SSN, phone, email, dates, addresses, etc.)
- `maskFormData(formData)`: Masks PII/PHI in form data objects
- `sanitizeForAI(text)`: Removes all PII/PHI before sending to AI
- `detectPiiPhi(text)`: Checks if text contains PII/PHI
- `logPiiAccess(userId, action, resource)`: Audit trail for PII access

**Patterns Detected**:
- Social Security Numbers (SSN)
- Phone numbers
- Email addresses
- Dates (DOB)
- Credit card numbers
- Medical Record Numbers (MRN)
- Street addresses
- Names with titles (Dr., Mr., Mrs., etc.)

**Usage Example**:
```javascript
const { sanitizeForAI } = require('./services/piiPhiMasking.service');

// Before sending to AI
const formData = {
  resident_name: "Dr. John Smith",
  ssn: "123-45-6789",
  phone: "(555) 123-4567"
};

const { maskedData } = maskFormData(formData);
// maskedData = {
//   resident_name: "[NAMEWITHTITLE_0]",
//   ssn: "[SSN_1]",
//   phone: "[PHONE_2]"
// }
```

---

### 6. Regulation Monitoring Service

**File**: `src/jobs/regulationMonitoring.job.js`

**Cron Schedule**: **1st of every month at 2:00 AM** (Pacific Time)

**Workflow**:
1. Fetch latest WAC/RCW regulations from WA LawDoc API
2. Update Pinecone vector database with new versions
3. Mark all compliant schemas for revalidation
4. Log update results
5. (Future) Send email notifications to admins

**Manual Trigger**:
```bash
POST /api/compliance/regulations/update
Authorization: Bearer <SUPER_ADMIN_TOKEN>
```

---

## API Endpoints

### Authentication Required
All compliance endpoints require authentication token in header:
```
Authorization: Bearer <JWT_TOKEN>
```

### 1. Get Pending Review Schemas
```http
GET /api/compliance/pending-review
```

**Response**:
```json
{
  "schemas": [
    {
      "id": "uuid",
      "formName": "Emergency Contact Form",
      "description": "Form description",
      "tenantName": "Springfield AFH",
      "compliance": {
        "totalFields": 25,
        "fieldsWithCitations": 18,
        "compliancePercentage": "72.0",
        "wacCitations": ["WAC 388-76-10600", ...],
        "rcwCitations": ["RCW 70.129.030", ...]
      },
      "isWacRcwCompliant": true,
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

### 2. Get Schema for Review
```http
GET /api/compliance/schema/:schemaId
```

**Response**: Full schema with all fields and citations

### 3. Approve Schema
```http
POST /api/compliance/schema/:schemaId/approve
Content-Type: application/json

{
  "notes": "Reviewed and approved. All citations verified."
}
```

**Response**:
```json
{
  "message": "Schema approved successfully",
  "schemaId": "uuid",
  "adminApprovedAt": "2025-01-15T11:00:00.000Z"
}
```

### 4. Reject Schema
```http
POST /api/compliance/schema/:schemaId/reject
Content-Type: application/json

{
  "reason": "Missing citations for medication fields",
  "notes": "Please add RCW 70.129.030 citations to medication consent fields"
}
```

### 5. Get Compliance Statistics
```http
GET /api/compliance/stats
```

**Response**:
```json
{
  "totalSchemas": 50,
  "compliantSchemas": 40,
  "compliancePercentage": "80.0",
  "approvedSchemas": 35,
  "approvalPercentage": "87.5",
  "pendingSchemas": 5
}
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd AI_powered
npm install node-cron axios
```

### 2. Database Migration

```bash
npx prisma migrate dev --name add-wac-rcw-compliance
```

### 3. Environment Variables (Optional)

Add to `.env` if needed:
```env
# WAC/RCW Configuration
WAC_RCW_ENABLED=true
REGULATION_UPDATE_CRON=0 2 1 * *  # Monthly at 2 AM on 1st
REGULATION_TIMEZONE=America/Los_Angeles
```

### 4. Initialize Regulations

On first server start, regulations will be automatically initialized from WA LawDoc API.

**Manual initialization**:
```javascript
const { initializeRegulations } = require('./src/services/wacRcwCompliance.service');
await initializeRegulations();
```

### 5. Start Server

```bash
npm run dev
```

**You should see**:
```
[SERVER] 🏛️ Starting WAC/RCW compliance monitoring...
[REG-MONITOR] Checking if regulations are initialized...
[WAC-RCW] 🚀 Initializing WAC/RCW regulations database...
[WAC-RCW] Fetching WAC 388-76-10010...
[WAC-RCW] ✅ Fetched WAC 388-76-10010 from API
...
[REG-MONITOR] ✅ Regulations initialized
[REG-MONITOR] 📅 Scheduling monthly regulation updates...
[SERVER] ✅ Compliance monitoring active
```

---

## Usage Examples

### Example 1: Generate Compliant Schema

```javascript
// POST /api/forms/generate-schema
{
  "formName": "Medication Consent Form",
  "description": "Medication administration and consent"
}
```

**AI will automatically**:
1. Analyze form content from embeddings
2. Find relevant regulations (WAC 388-76-10700, RCW 70.129.030)
3. Generate fields with citations:
   ```json
   {
     "label": "Medication Consent",
     "name": "medication_consent",
     "type": "checkbox",
     "required": true,
     "wacCitation": "WAC 388-76-10700",
     "rcwCitation": "RCW 70.129.030(1)",
     "complianceNote": "Required by state law for medication administration"
   }
   ```

### Example 2: Admin Reviews & Approves

```javascript
// 1. Get pending schemas
GET /api/compliance/pending-review

// 2. Review specific schema
GET /api/compliance/schema/schema-uuid

// 3. Approve
POST /api/compliance/schema/schema-uuid/approve
{
  "notes": "All WAC/RCW citations verified. Approved for use."
}
```

### Example 3: Monthly Regulation Update

```bash
# Automatically runs monthly via cron

# Or trigger manually (SUPER_ADMIN only)
POST /api/compliance/regulations/update
```

---

## Security & Compliance

### HIPAA Compliance

1. **PII/PHI Masking**: All form data is masked before processing by AI
   ```javascript
   const { maskFormData } = require('./services/piiPhiMasking.service');
   const { maskedData } = maskFormData(formData);
   // Send maskedData to AI, never original data
   ```

2. **Encryption**: 
   - Data at rest: AES-256 (database encryption)
   - Data in transit: TLS 1.2+

3. **Access Control (RBAC)**:
   - SUPER_ADMIN: Full system access
   - ADMIN: Tenant-specific compliance review
   - STAFF: No compliance access

4. **Audit Trail**:
   - All PII access logged via `logPiiAccess()`
   - All compliance approvals/rejections stored
   - Regulation updates tracked

### Data Retention

- Regulation versions: Stored indefinitely for audit purposes
- Schema versions: Maintained with full history
- Admin approval records: Permanent audit trail

---

## Monitoring & Maintenance

### Health Checks

1. **Regulation Database Status**:
   ```javascript
   GET /api/compliance/stats
   ```

2. **Pinecone Vector Count**:
   ```javascript
   const { getPineconeIndex } = require('./config/pinecone.config');
   const index = await getPineconeIndex();
   const stats = await index.describeIndexStats();
   console.log(stats.namespaces['wac-rcw-regulations']);
   ```

### Troubleshooting

#### Issue: Regulations Not Initializing

**Symptoms**: No citations in generated schemas

**Fix**:
```javascript
const { initializeRegulations } = require('./src/services/wacRcwCompliance.service');
await initializeRegulations();
```

#### Issue: WA LawDoc API Unavailable

**Fallback**: System automatically falls back to web scraping from official WAC/RCW websites.

#### Issue: Cron Job Not Running

**Check**:
```javascript
// In server.js, verify regulation monitoring started
[SERVER] ✅ Compliance monitoring active
```

**Manual test**:
```javascript
const { triggerManualUpdate } = require('./src/jobs/regulationMonitoring.job');
await triggerManualUpdate();
```

---

## Benefits

### 1. Legal Compliance
- ✅ Every form field linked to specific state regulations
- ✅ Automatic updates when regulations change
- ✅ Audit-ready documentation

### 2. Risk Mitigation
- ✅ Reduces liability from non-compliant forms
- ✅ HITL review ensures accuracy
- ✅ Version control for regulatory inspections

### 3. Automation
- ✅ AI automatically identifies relevant regulations
- ✅ Monthly updates without manual intervention
- ✅ Seamless integration with existing workflow

### 4. Transparency
- ✅ Clear citations for every required field
- ✅ Compliance notes explain legal requirements
- ✅ Statistics dashboard for compliance tracking

---

## Future Enhancements

1. **Multi-State Support**: Extend to Oregon, California, etc.
2. **Email Notifications**: Alert admins of regulation changes
3. **Compliance Reports**: Generate PDF reports for audits
4. **Automated Change Detection**: Compare regulation versions and highlight changes
5. **Field-Level Revalidation**: Automatically suggest field updates when regulations change

---

## API Summary

### Compliance Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/compliance/pending-review` | ADMIN+ | List schemas awaiting approval |
| GET | `/api/compliance/schema/:id` | ADMIN+ | Get schema details |
| POST | `/api/compliance/schema/:id/approve` | ADMIN+ | Approve schema |
| POST | `/api/compliance/schema/:id/reject` | ADMIN+ | Reject schema |
| POST | `/api/compliance/schema/:id/revalidate` | ADMIN+ | Revalidate schema |
| GET | `/api/compliance/stats` | ADMIN+ | Compliance statistics |
| POST | `/api/compliance/regulations/update` | SUPER_ADMIN | Manual regulation update |

---

## Support

For questions or issues:
- Check logs: `[WAC-RCW]`, `[COMPLIANCE]`, `[REG-MONITOR]` prefixes
- Review this documentation
- Contact system administrator

---

## Version History

- **v1.0** (2025-01): Initial WAC/RCW compliance implementation
  - Regulation fetching and vector storage
  - AI schema generation with citations
  - HITL admin review workflow
  - PII/PHI masking
  - Monthly regulation monitoring

---

## License & Compliance

This system is designed to assist with WAC/RCW compliance for Adult Family Homes in Washington State. It does not constitute legal advice. Always consult with legal counsel for compliance verification.

**Regulations Source**: Washington State Legislature (https://leg.wa.gov)


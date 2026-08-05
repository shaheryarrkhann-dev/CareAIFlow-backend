# PDF Template Filling System - Complete Guide

## Overview

This system enables automatic PDF form filling where:
1. Tenants upload PDF templates with field position mappings
2. When users submit forms, the system automatically fills all PDF templates
3. Filled PDFs are stored in S3 under a user-specific directory structure
4. Each tenant can have up to 40 (or more) PDF templates

---

## Architecture

### Data Flow

```
PDF Upload with Field Positions → Store Template in DB + S3
    ↓
User Submits Form → Auto-fill All PDFs → Store in S3
    ↓
S3 Structure: tenant-id/users/user-id/filled-pdfs/timestamp_filename.pdf
```

### Database Schema

#### `pdf_templates` Table
Stores PDF template metadata and field position mappings:

```sql
{
  id: UUID,
  tenantId: String,
  fileName: String,
  s3Key: String,
  s3Url: String,
  displayName: String (optional),
  description: String (optional),
  fieldMapping: JSON, // Array of field position objects
  isActive: Boolean,
  createdBy: String (userId),
  createdAt: DateTime,
  updatedAt: DateTime
}
```

#### Field Mapping Structure
The `fieldMapping` JSON field contains an array of field position objects:

```json
[
  {
    "fieldName": "employee_name",
    "page": 0,
    "x": 100,
    "y": 200,
    "width": 200,
    "height": 20,
    "type": "text"
  },
  {
    "fieldName": "joining_date",
    "page": 0,
    "x": 100,
    "y": 250,
    "width": 150,
    "height": 20,
    "type": "date"
  },
  {
    "fieldName": "is_fulltime",
    "page": 1,
    "x": 50,
    "y": 100,
    "width": 20,
    "height": 20,
    "type": "checkbox"
  }
]
```

**Field Position Properties:**
- `fieldName`: Must match form schema field name
- `page`: Zero-based page index (0 = first page)
- `x`: X coordinate in PDF points (from left)
- `y`: Y coordinate in PDF points (from top)
- `width`: Field width in points
- `height`: Field height in points
- `type`: Field type (`text`, `number`, `date`, `checkbox`, `dropdown`)

---

## API Endpoints

### 1. Upload PDF Template with Field Positions

**Endpoint:** `POST /api/embeddings/upload`

**Description:** Upload a PDF template and optionally provide field position mappings. This endpoint serves dual purpose:
- Processes PDF for RAG embeddings (existing functionality)
- Stores PDF template with field mappings (new functionality)

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body (Form Data):**
```
file: [PDF file]
fieldMapping: [JSON string - optional]
displayName: "Employee Information Form" (optional)
description: "New hire onboarding form" (optional)
tenantId: [for SUPER_ADMIN only] (optional)
```

**Field Mapping Example:**
```json
[
  {
    "fieldName": "employee_name",
    "page": 0,
    "x": 100,
    "y": 200,
    "width": 200,
    "height": 20,
    "type": "text"
  },
  {
    "fieldName": "department",
    "page": 0,
    "x": 100,
    "y": 250,
    "width": 150,
    "height": 20,
    "type": "text"
  }
]
```

**cURL Example:**
```bash
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@employee_form.pdf" \
  -F 'fieldMapping=[{"fieldName":"employee_name","page":0,"x":100,"y":200,"width":200,"height":20,"type":"text"},{"fieldName":"department","page":0,"x":100,"y":250,"width":150,"height":20,"type":"text"}]' \
  -F "displayName=Employee Information Form" \
  -F "description=New hire onboarding form"
```

**Response:**
```json
{
  "success": true,
  "message": "PDF uploaded and form schema updated",
  "chunks": 15,
  "schemaUpdated": true,
  "schemaId": "abc-123",
  "merged": true,
  "newFieldsAdded": 2,
  "s3": {
    "url": "https://bucket.s3.region.amazonaws.com/tenant-id/timestamp_employee_form.pdf",
    "key": "tenant-id/timestamp_employee_form.pdf",
    "bucket": "your-bucket"
  },
  "template": {
    "id": "template-uuid",
    "displayName": "Employee Information Form",
    "hasFieldMapping": true
  }
}
```

---

### 2. Get All PDF Templates

**Endpoint:** `GET /api/embeddings/templates`

**Description:** Retrieve all active PDF templates for the tenant.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
```
tenantId: [for SUPER_ADMIN only] (optional)
```

**cURL Example:**
```bash
curl -X GET http://localhost:4000/api/embeddings/templates \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 40,
  "templates": [
    {
      "id": "template-uuid-1",
      "fileName": "employee_form.pdf",
      "displayName": "Employee Information Form",
      "description": "New hire onboarding form",
      "s3Url": "https://bucket.s3.region.amazonaws.com/tenant-id/timestamp_employee_form.pdf",
      "fieldCount": 8,
      "createdAt": "2025-10-15T00:00:00.000Z"
    },
    {
      "id": "template-uuid-2",
      "fileName": "benefits_form.pdf",
      "displayName": "Benefits Enrollment Form",
      "description": null,
      "s3Url": "https://bucket.s3.region.amazonaws.com/tenant-id/timestamp_benefits_form.pdf",
      "fieldCount": 12,
      "createdAt": "2025-10-15T00:10:00.000Z"
    }
  ]
}
```

---

### 3. Get Template Details

**Endpoint:** `GET /api/pdfs/templates/:templateId`

**Description:** Get detailed information about a specific template, including field mappings.

**Headers:**
```
Authorization: Bearer <token>
```

**cURL Example:**
```bash
curl -X GET http://localhost:4000/api/pdfs/templates/template-uuid-1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "template-uuid-1",
    "fileName": "employee_form.pdf",
    "displayName": "Employee Information Form",
    "description": "New hire onboarding form",
    "s3Url": "https://bucket.s3.region.amazonaws.com/tenant-id/timestamp_employee_form.pdf",
    "fieldMapping": [
      {
        "fieldName": "employee_name",
        "page": 0,
        "x": 100,
        "y": 200,
        "width": 200,
        "height": 20,
        "type": "text"
      }
    ],
    "isActive": true,
    "createdAt": "2025-10-15T00:00:00.000Z",
    "updatedAt": "2025-10-15T00:00:00.000Z"
  }
}
```

---

### 4. Submit Form (Auto-fills PDFs)

**Endpoint:** `POST /api/forms/:formId/submit`

**Description:** Submit form data. The system automatically fills ALL active PDF templates for the tenant and saves them to S3.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "employee_name": "John Doe",
  "department": "Engineering",
  "joining_date": "2025-10-15",
  "is_fulltime": true,
  "salary": 75000
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:4000/api/forms/form-uuid/submit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "Engineering",
    "joining_date": "2025-10-15",
    "is_fulltime": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "submissionId": "submission-uuid",
  "tableName": "tenant_abc123_form_xyz789",
  "pdfGeneration": {
    "success": true,
    "totalTemplates": 40,
    "successfulFills": 40,
    "failedFills": 0,
    "filledPdfs": [
      {
        "success": true,
        "templateId": "template-uuid-1",
        "templateName": "Employee Information Form",
        "filledPdfUrl": "https://bucket.s3.region.amazonaws.com/tenant-id/users/user-id/filled-pdfs/1729000000000_filled_employee_form.pdf",
        "filledPdfKey": "tenant-id/users/user-id/filled-pdfs/1729000000000_filled_employee_form.pdf"
      },
      {
        "success": true,
        "templateId": "template-uuid-2",
        "templateName": "Benefits Enrollment Form",
        "filledPdfUrl": "https://bucket.s3.region.amazonaws.com/tenant-id/users/user-id/filled-pdfs/1729000000001_filled_benefits_form.pdf",
        "filledPdfKey": "tenant-id/users/user-id/filled-pdfs/1729000000001_filled_benefits_form.pdf"
      }
    ]
  }
}
```

---

### 5. Fill Specific Template

**Endpoint:** `POST /api/pdfs/fill/:templateId`

**Description:** Manually fill a specific PDF template with provided data (useful for re-generating a single PDF).

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "employee_name": "Jane Smith",
  "department": "Marketing",
  "joining_date": "2025-11-01"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:4000/api/pdfs/fill/template-uuid-1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "Jane Smith",
    "department": "Marketing"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "PDF template filled successfully",
  "templateId": "template-uuid-1",
  "templateName": "Employee Information Form",
  "filledPdfUrl": "https://bucket.s3.region.amazonaws.com/tenant-id/users/user-id/filled-pdfs/1729000000002_filled_employee_form.pdf",
  "filledPdfKey": "tenant-id/users/user-id/filled-pdfs/1729000000002_filled_employee_form.pdf"
}
```

---

### 6. Fill All Templates

**Endpoint:** `POST /api/pdfs/fill-all`

**Description:** Manually fill all PDF templates for the tenant with provided data.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "employee_name": "Bob Johnson",
  "department": "Sales",
  "joining_date": "2025-12-01"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:4000/api/pdfs/fill-all \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "Bob Johnson",
    "department": "Sales"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully filled 40 of 40 PDF templates",
  "totalTemplates": 40,
  "successfulFills": 40,
  "failedFills": 0,
  "filledPdfs": [
    {
      "success": true,
      "templateId": "template-uuid-1",
      "templateName": "Employee Information Form",
      "filledPdfUrl": "https://bucket.s3.region.amazonaws.com/tenant-id/users/user-id/filled-pdfs/1729000000003_filled_employee_form.pdf",
      "filledPdfKey": "tenant-id/users/user-id/filled-pdfs/1729000000003_filled_employee_form.pdf"
    }
  ]
}
```

---

## S3 Directory Structure

```
s3://your-bucket/
├── tenant-1-uuid/
│   ├── timestamp_template1.pdf          # Template storage
│   ├── timestamp_template2.pdf
│   └── users/
│       ├── user-1-uuid/
│       │   └── filled-pdfs/
│       │       ├── 1729000000000_filled_template1.pdf
│       │       ├── 1729000000001_filled_template2.pdf
│       │       └── ...
│       └── user-2-uuid/
│           └── filled-pdfs/
│               ├── 1729000000010_filled_template1.pdf
│               └── ...
└── tenant-2-uuid/
    ├── timestamp_template1.pdf
    └── users/
        └── user-3-uuid/
            └── filled-pdfs/
                └── ...
```

**Key Points:**
- Templates are stored at: `{tenantId}/{timestamp}_{filename}.pdf`
- Filled PDFs are stored at: `{tenantId}/users/{userId}/filled-pdfs/{timestamp}_filled_{filename}.pdf`
- Each user has their own directory for filled PDFs
- Timestamps ensure unique filenames and chronological ordering

---

## Step-by-Step Workflow

### For Tenant Admin (Setting Up Templates)

1. **Upload PDF Templates (40 PDFs)**

For each PDF template, determine field positions and upload:

```bash
# Upload Template 1
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -F "file=@form1.pdf" \
  -F 'fieldMapping=[{"fieldName":"employee_name","page":0,"x":100,"y":200,"width":200,"height":20,"type":"text"}]' \
  -F "displayName=Form 1"

# Upload Template 2
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -F "file=@form2.pdf" \
  -F 'fieldMapping=[{"fieldName":"employee_name","page":0,"x":120,"y":180,"width":180,"height":20,"type":"text"}]' \
  -F "displayName=Form 2"

# ... repeat for all 40 PDFs
```

2. **Verify Templates**

```bash
curl -X GET http://localhost:4000/api/embeddings/templates \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### For Staff Users (Filling Forms)

1. **Get Form Schema**

```bash
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer STAFF_TOKEN"
```

2. **Submit Form (Auto-fills all 40 PDFs)**

```bash
curl -X POST http://localhost:4000/api/forms/{formId}/submit \
  -H "Authorization: Bearer STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "Engineering",
    "joining_date": "2025-10-15"
  }'
```

3. **Download Filled PDFs**

The filled PDF URLs are returned in the response. Use these URLs to download:

```bash
# Using the URL from the response
curl -o filled_form1.pdf "https://bucket.s3.region.amazonaws.com/tenant-id/users/user-id/filled-pdfs/timestamp_filled_form1.pdf"
```

---

## How to Determine Field Positions

To map field positions in your PDF templates, you can use one of these methods:

### Method 1: PDF Inspection Tools
1. Open PDF in Adobe Acrobat or similar tool
2. Enable ruler/grid view
3. Measure coordinates from top-left corner
4. Note: PDF coordinate system starts from bottom-left, but our system converts it

### Method 2: pdf-lib Inspection (Code)
```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function inspectPdf() {
  const pdfBytes = fs.readFileSync('form.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  
  pages.forEach((page, index) => {
    console.log(`Page ${index}:`);
    console.log(`  Width: ${page.getWidth()}`);
    console.log(`  Height: ${page.getHeight()}`);
  });
}
```

### Method 3: Trial and Error
1. Start with estimated coordinates
2. Fill the PDF
3. Download and review
4. Adjust coordinates as needed
5. Repeat until positions are correct

---

## Coordinate System

**PDF Coordinate System:**
- Origin (0,0) is at **bottom-left**
- X increases to the right
- Y increases upward

**Our API Expects:**
- Origin (0,0) is at **top-left** (more intuitive)
- X increases to the right
- Y increases downward

**The system automatically converts coordinates internally.**

---

## Field Type Support

| Type | Description | Example Value |
|------|-------------|---------------|
| `text` | Plain text input | "John Doe" |
| `number` | Numeric values | 75000 |
| `date` | Date values | "2025-10-15" or Date object |
| `checkbox` | Boolean checkbox | true/false |
| `dropdown` | Selection from options | "Engineering" |
| `textarea` | Multi-line text | "Long description..." |

---

## Error Handling

### Common Errors

**Invalid Field Mapping:**
```json
{
  "success": false,
  "message": "fieldMapping must be an array of field position objects"
}
```

**Template Not Found:**
```json
{
  "success": false,
  "message": "PDF template not found"
}
```

**PDF Filling Failed:**
- If PDF filling fails for some templates, the form submission still succeeds
- Failed PDFs are listed in the `errors` array of the response

---

## Performance Considerations

- **40 PDFs per tenant**: Each form submission will fill 40 PDFs
- **Parallel Processing**: PDFs are filled sequentially (can be optimized for parallel processing)
- **S3 Upload Time**: ~1-2 seconds per PDF
- **Total Time**: Approximately 40-80 seconds for 40 PDFs
- **Recommendation**: Consider background job processing for production

---

## Security & Access Control

- **Template Upload**: Only ADMIN, STAFF, GUARDIAN, and SUPER_ADMIN roles
- **Template Viewing**: All authenticated tenant users
- **PDF Filling**: All authenticated tenant users
- **Filled PDFs**: Isolated per user and tenant
- **S3 Security**: Server-side AES256 encryption enabled

---

## Next Steps

1. ✅ Upload all 40 PDF templates with field mappings
2. ✅ Test form submission and verify PDFs are filled correctly
3. ✅ Adjust field coordinates if necessary
4. ✅ Implement frontend to display filled PDF URLs to users
5. ✅ Consider adding download buttons for filled PDFs
6. ✅ Monitor S3 storage usage

---

## Troubleshooting

### PDFs Not Being Filled

**Check:**
1. Are field mappings provided during upload?
2. Do field names in mapping match form schema field names?
3. Are coordinates within page boundaries?
4. Check server logs for specific errors

### Incorrect Field Positions

**Solution:**
1. Review field coordinates
2. Remember: Y coordinate is from TOP in API (converted internally)
3. Adjust and re-upload template

### Performance Issues

**Optimization Options:**
1. Implement background job queue (Bull, BullMQ)
2. Process PDFs in parallel
3. Return immediately and notify when complete
4. Cache templates in memory

---

## Summary

This system provides a complete solution for:
- ✅ Storing PDF templates with field positions
- ✅ Automatically filling PDFs when forms are submitted
- ✅ Organizing filled PDFs per user in S3
- ✅ Supporting multiple PDF templates per tenant (40+)
- ✅ Maintaining tenant isolation and security
- ✅ Flexible field type support

All filled PDFs are automatically generated and stored in AWS S3 under the structure:
`tenant-id/users/user-id/filled-pdfs/timestamp_filled_filename.pdf`


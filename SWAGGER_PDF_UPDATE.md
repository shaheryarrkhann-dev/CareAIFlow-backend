# Swagger Documentation Update - PDF Endpoints

## Summary

Added comprehensive Swagger/OpenAPI documentation for PDF-related endpoints that were previously missing from the API documentation.

---

## New Endpoints Documented

### 1. Get Template Details
**Endpoint:** `GET /api/pdfs/templates/{templateId}`

**Documented:**
- Template retrieval with full field mapping details
- SUPER_ADMIN tenant filtering support
- Template metadata (fileName, displayName, description, etc.)
- Field mapping structure with coordinates

**Response Fields:**
- Template ID, file name, display name
- S3 URL for original PDF
- Field mapping array with x, y, width, height coordinates
- Active status and timestamps

---

### 2. Get User Filled PDFs
**Endpoint:** `GET /api/pdfs/users/{userId}/filled-pdfs`

**Documented:**
- Pagination support (limit, offset)
- Response structure with file metadata
- S3 URLs for downloading PDFs
- File size and modification dates

**Response Fields:**
- Count of PDFs in current page
- Total PDFs available
- File list with:
  - File name and template name
  - S3 URL for download
  - File size in bytes and KB
  - Last modified date
- Pagination object with hasMore flag

---

## Updated Documentation

### Upload PDF Endpoint
**Endpoint:** `POST /api/embeddings/upload`

**Enhanced to include:**
- New request parameters (displayName, description, fieldMapping, enableAIDetection)
- Interactive fields detection response
- AI detection information
- Template creation in response
- S3 upload information

**New Response Fields:**
```json
{
  "interactiveFields": {
    "found": true,
    "count": 10,
    "fieldNames": ["firstName", "lastName", ...]
  },
  "aiDetection": {
    "enabled": true,
    "fieldsDetected": 10,
    "usedAI": false
  },
  "template": {
    "id": "uuid",
    "displayName": "Employee Form",
    "hasFieldMapping": true,
    "fieldCount": 10,
    "aiGenerated": false
  }
}
```

---

## New Tag Added

Added **"PDF Management"** tag to organize PDF-related endpoints separately from embeddings.

**Tag Description:** "PDF template management and filled PDF retrieval"

---

## Files Created/Modified

### New File
- ✅ `src/docs/pdf.docs.js` - New documentation for PDF endpoints (212 lines)

### Modified Files
- ✅ `src/config/swagger.js` - Added "PDF Management" tag
- ✅ `src/docs/embedding.docs.js` - Enhanced upload endpoint documentation

---

## Tag Organization

### Swagger Tags (Updated)

| Tag | Description | Endpoints |
|-----|-------------|-----------|
| **Authentication** | User authentication | Login, Register |
| **User Management** | User operations | User CRUD |
| **Tenant Management** | Organization management | Tenant CRUD |
| **Embeddings** | PDF processing | Upload, Templates list |
| **PDF Management** | **NEW** - PDF operations | Template details, Filled PDFs |
| **AI-Powered Forms** | Form generation | Schema, Submit |
| **Form Drafts** | Draft management | Save, List, Delete |

---

## Example API Usage (From Swagger UI)

### Get Template Details

```http
GET /api/pdfs/templates/123e4567-e89b-12d3-a456-426614174000
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "fileName": "employee_form.pdf",
    "displayName": "Employee Application",
    "s3Url": "https://bucket.s3.region.amazonaws.com/...",
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
    ]
  }
}
```

### Get User Filled PDFs

```http
GET /api/pdfs/users/user-123/filled-pdfs?limit=10&offset=0
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "total": 45,
  "files": [
    {
      "fileName": "1729000000000_filled_form.pdf",
      "templateName": "Employee Form",
      "s3Url": "https://bucket.s3.region.amazonaws.com/...",
      "sizeInKB": 512,
      "lastModified": "2025-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 45,
    "hasMore": true
  }
}
```

---

## Testing in Swagger UI

### Steps:

1. **Start your server**:
   ```bash
   npm run dev
   ```

2. **Open Swagger UI**:
   ```
   http://localhost:4000/api-docs
   ```

3. **Navigate to "PDF Management" tag**

4. **Try the endpoints:**
   - Get Template Details
   - Get User Filled PDFs

5. **Authenticate** with "Authorize" button (Bearer token)

6. **Test with real data** from your database

---

## Benefits

✅ **Complete API documentation** - All PDF endpoints now documented  
✅ **Interactive testing** - Test endpoints directly in Swagger UI  
✅ **Clear structure** - Endpoints organized by tags  
✅ **Pagination documented** - Clear pagination parameters and responses  
✅ **Request/Response examples** - See exact data structures  

---

## Next Steps

1. **Restart your server** to load new Swagger docs
2. **Open Swagger UI** at `/api-docs`
3. **Navigate to "PDF Management"** tag
4. **Test the new endpoints** with your authentication token

---

## Verification

After restart, you should see in Swagger UI:

- ✅ **New "PDF Management" tag** in the tags list
- ✅ **2 endpoints** under PDF Management tag:
  - GET /api/pdfs/templates/{templateId}
  - GET /api/pdfs/users/{userId}/filled-pdfs
- ✅ **Updated upload endpoint** with all new fields in response


















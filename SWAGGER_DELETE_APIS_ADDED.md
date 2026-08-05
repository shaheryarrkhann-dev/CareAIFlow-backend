# Swagger Documentation - DELETE APIs Added

## ✅ Added Missing DELETE Endpoints

Two DELETE API endpoints were implemented but missing from Swagger documentation. Now added!

### Files Modified:
1. ✅ `src/docs/embedding.docs.js` - Added DELETE PDF documentation
2. ✅ `src/docs/form.docs.js` - Added DELETE form schema documentation

---

## 📋 New Swagger Endpoints

### 1. DELETE /api/embeddings/:id

**Delete PDF Template and Embeddings**

```
DELETE /api/embeddings/{id}
```

**Description:**
- Permanently deletes a PDF template and all associated embeddings/chunks
- Automatically cleans up master form fields that are no longer used by other PDFs
- Only ADMIN and SUPER_ADMIN can delete
- ⚠️ WARNING: Cannot be undone!

**Parameters:**
- `id` (path, required) - PDF template ID (UUID)
- `tenantId` (query, optional) - SUPER_ADMIN can target specific tenant

**Response Example:**
```json
{
  "success": true,
  "message": "PDF deleted successfully and 3 unused field(s) removed from master form",
  "deletedPdf": {
    "id": "abc-123",
    "fileName": "employment_form.pdf",
    "displayName": "Employment Application",
    "chunksDeleted": 42
  },
  "fieldCleanup": {
    "fieldsRemoved": 3,
    "fieldsStillInUse": 12,
    "masterFormDeleted": false,
    "masterFormUpdated": true
  }
}
```

**Features Documented:**
- Shows number of chunks deleted
- Shows field cleanup results
- Indicates if master form was deleted (last PDF)
- Shows which fields were removed vs kept

---

### 2. GET /api/embeddings/:id/preview-delete

**Preview Field Cleanup Before Deletion**

```
GET /api/embeddings/{id}/preview-delete
```

**Description:**
- Shows which fields will be removed from master form if this PDF is deleted
- Helps users understand the impact before deleting
- No actual deletion occurs

**Response Example:**
```json
{
  "success": true,
  "preview": {
    "willRemoveFields": ["unique_field_1", "unique_field_2"],
    "fieldsStillInUse": ["employee_name", "employee_email"],
    "willDeleteMasterForm": false
  },
  "pdfTemplate": {
    "id": "abc-123",
    "fileName": "form.pdf",
    "displayName": "My Form"
  }
}
```

---

### 3. DELETE /api/forms/schemas/:id

**Delete Form Schema**

```
DELETE /api/forms/schemas/{id}
```

**Description:**
- Permanently deletes an AI-generated form schema
- Deletes all associated form responses
- Drops the dynamic database table
- Only ADMIN and SUPER_ADMIN can delete
- ⚠️ WARNING: Cannot be undone! All submissions will be deleted!

**Parameters:**
- `id` (path, required) - Form schema ID (UUID)
- `tenantId` (query, optional) - SUPER_ADMIN can target specific tenant

**Response Example:**
```json
{
  "success": true,
  "message": "Form schema deleted successfully",
  "deleted": {
    "schemaId": "abc-123",
    "formName": "Employee Onboarding Form",
    "tableName": "tenant_abc123_form_xyz789",
    "tableDropped": true
  }
}
```

**Features Documented:**
- Shows which dynamic table was dropped
- Confirms successful deletion
- Warning about data loss

---

## 🔍 How to Access in Swagger

### 1. Restart Server
```bash
npm run dev
```

### 2. Open Swagger UI
```
http://localhost:4000/api-docs
```

### 3. Find the Endpoints

**For PDF Delete:**
- Navigate to **"Embeddings"** tag
- Find `DELETE /api/embeddings/{id}`
- Find `GET /api/embeddings/{id}/preview-delete`

**For Form Schema Delete:**
- Navigate to **"AI-Powered Forms"** tag
- Find `DELETE /api/forms/schemas/{id}`

### 4. Test the APIs
1. Click "Try it out"
2. Enter the ID
3. Add Authorization Bearer token
4. Execute

---

## 📊 Complete DELETE Endpoint Coverage

| Endpoint | Swagger Status | Functionality |
|----------|---------------|---------------|
| `DELETE /api/embeddings/{id}` | ✅ Now Added | Delete PDF template |
| `GET /api/embeddings/{id}/preview-delete` | ✅ Now Added | Preview cleanup |
| `DELETE /api/forms/schemas/{id}` | ✅ Now Added | Delete form schema |
| `DELETE /api/forms/{formId}/responses/{id}` | ✅ Already documented | Delete form response |
| `DELETE /api/forms/{formId}/draft/{draftId}` | ✅ Already documented | Delete draft |
| `DELETE /api/tenants/{id}` | ✅ Already documented | Delete organization |
| `DELETE /api/users/{id}` | ✅ Already documented | Delete user |

---

## 🎯 Key Features Documented

### PDF Deletion Features:
- ✅ Deletes PDF template
- ✅ Deletes all embeddings/chunks
- ✅ Automatic field cleanup
- ✅ Shows cleanup results
- ✅ Preview before delete option
- ✅ Handles last PDF scenario

### Form Schema Deletion Features:
- ✅ Deletes form schema
- ✅ Deletes all responses
- ✅ Drops dynamic table
- ✅ Shows table name
- ✅ Confirms table dropped

---

## 📝 API Request Examples

### Delete PDF (cURL)
```bash
curl -X DELETE "http://localhost:4000/api/embeddings/abc-123" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Preview Delete (cURL)
```bash
curl -X GET "http://localhost:4000/api/embeddings/abc-123/preview-delete" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Delete Form Schema (cURL)
```bash
curl -X DELETE "http://localhost:4000/api/forms/schemas/xyz-789" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### SUPER_ADMIN with TenantId
```bash
curl -X DELETE "http://localhost:4000/api/embeddings/abc-123?tenantId=tenant-id" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

---

## ⚠️ Important Warnings Documented

### PDF Deletion:
- **Cannot be undone** - Emphasized in description
- **Deletes all chunks** - Documented in response
- **Field cleanup** - Automatic and documented
- **Last PDF** - Special behavior documented

### Form Schema Deletion:
- **Cannot be undone** - Emphasized in description
- **Deletes all submissions** - Warning in description
- **Drops table** - Database impact documented
- **Data loss** - Clearly warned

---

## ✅ Testing Checklist

After server restart:

- [ ] Open http://localhost:4000/api-docs
- [ ] Verify "Embeddings" tag shows DELETE endpoint
- [ ] Verify "Embeddings" tag shows preview endpoint
- [ ] Verify "AI-Powered Forms" tag shows DELETE endpoint
- [ ] Test "Try it out" functionality
- [ ] Verify request/response examples display correctly
- [ ] Check all parameters are documented
- [ ] Verify warnings are visible

---

## 📚 Related Documentation

- `LAST_PDF_DELETION_ENHANCEMENT.md` - PDF deletion feature details
- `MASTER_FORM_FIELD_CLEANUP.md` - Field cleanup system
- `FIELD_CLEANUP_IMPLEMENTATION_SUMMARY.md` - Cleanup implementation
- `SWAGGER_GUIDE.md` - General Swagger documentation guide

---

**Status:** ✅ Complete  
**Version:** 1.2.4  
**Date:** November 1, 2025  
**Documentation:** Swagger UI


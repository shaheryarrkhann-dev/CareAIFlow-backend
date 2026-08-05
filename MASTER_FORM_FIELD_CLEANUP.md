# Master Form Field Cleanup on PDF Deletion

## Overview

When a PDF/form is deleted from a tenant, the system now automatically cleans up the master form by removing fields that are no longer used by any other PDFs/forms. This ensures that the master form only contains fields that are actively used across the tenant's PDFs.

## How It Works

### The Problem

Previously, when a PDF was deleted:
- The PDF template and embeddings were removed
- **BUT** the fields from that PDF remained in the master form
- This caused the master form to accumulate unused fields over time

### The Solution

Now, when a PDF is deleted:
1. ✅ The PDF template and embeddings are removed
2. ✅ The system identifies which fields came from that PDF
3. ✅ It checks if those fields are used by any other PDFs
4. ✅ Only removes fields that are **NOT** used by other PDFs
5. ✅ Preserves common/shared fields across multiple PDFs

## Key Features

### 🔍 Smart Field Detection
- Tracks which fields come from which PDF templates
- Uses the `fieldMapping` property in `PdfTemplate` table
- Handles multiple field mapping formats (object, string, etc.)

### 🛡️ Safe Field Preservation
- **Never removes fields that are still in use** by other PDFs
- Case-insensitive field name matching
- Compares field names across all active PDF templates

### 📊 Preview Before Deletion
- Preview which fields will be removed before actually deleting
- Shows which fields are still in use by other forms
- Helps admins make informed decisions

## API Endpoints

### 1. Preview Field Cleanup

Preview which fields will be removed when deleting a PDF.

```http
GET /api/embeddings/:id/preview-delete
```

**Authorization:** ADMIN, SUPER_ADMIN

**Response:**
```json
{
  "success": true,
  "preview": {
    "willRemoveFields": [
      "unique_field_1",
      "unique_field_2"
    ],
    "fieldsStillInUse": [
      "employee_name",
      "employee_email"
    ],
    "totalFieldsInPdf": 4,
    "message": "2 field(s) will be removed from the master form"
  }
}
```

### 2. Delete PDF with Field Cleanup

Delete a PDF and automatically clean up unused master form fields.

```http
DELETE /api/embeddings/:id
```

**Authorization:** ADMIN, SUPER_ADMIN

**Response (when other PDFs exist):**
```json
{
  "success": true,
  "message": "PDF deleted successfully and 2 unused field(s) removed from master form",
  "deletedPdf": {
    "id": "pdf-uuid",
    "fileName": "form1.pdf",
    "displayName": "Employee Form",
    "chunksDeleted": 15
  },
  "fieldCleanup": {
    "fieldsRemoved": 2,
    "fieldsStillInUse": 2,
    "removedFieldNames": [
      "unique_field_1",
      "unique_field_2"
    ],
    "masterFormDeleted": false,
    "message": "Removed 2 field(s) from master form",
    "masterFormId": "form-schema-uuid"
  }
}
```

**Response (last PDF - master form deleted):**
```json
{
  "success": true,
  "message": "PDF deleted successfully and master form deleted completely (was the last PDF)",
  "deletedPdf": {
    "id": "pdf-uuid",
    "fileName": "form1.pdf",
    "displayName": "Employee Form",
    "chunksDeleted": 15
  },
  "fieldCleanup": {
    "fieldsRemoved": 3,
    "fieldsStillInUse": 0,
    "removedFieldNames": [
      "field_1",
      "field_2",
      "field_3"
    ],
    "masterFormDeleted": true,
    "message": "Deleted master form completely (was the last PDF)",
    "masterFormId": "form-schema-uuid",
    "tableName": "tenant_xxx_form_yyy"
  }
}
```

### 3. Delete Form Schema

Delete a form schema directly (includes cleanup of dynamic table).

```http
DELETE /api/forms/schemas/:id
```

**Authorization:** ADMIN, SUPER_ADMIN

**Response:**
```json
{
  "success": true,
  "message": "Form schema deleted successfully",
  "deletedForm": {
    "id": "form-uuid",
    "formName": "Master Form",
    "description": "Consolidated form"
  },
  "tableName": "tenant_xxx_form_yyy"
}
```

## Implementation Details

### Service Layer

#### `formFieldCleanup.service.js`

**Functions:**
1. `cleanupMasterFormFields({ tenantId, deletedPdfTemplate })`
   - Cleans up master form fields after PDF deletion
   - Compares fields across all remaining PDFs
   - Updates master form with filtered fields

2. `previewFieldCleanup({ tenantId, pdfTemplateId })`
   - Previews which fields will be removed
   - Useful for confirmation dialogs

### Workflow

```
┌─────────────────────┐
│  Delete PDF Request │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get PDF Template    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Delete Embeddings   │
│ & Template          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get PDF Fields      │
│ from fieldMapping   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get All Other PDFs  │
│ for Tenant          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Build Set of Fields │
│ in Other PDFs       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Identify Fields to  │
│ Remove (unique to   │
│ deleted PDF)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Filter Master Form  │
│ Fields              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Update Master Form  │
│ in Database         │
└─────────────────────┘
```

## Examples

### Example 1: Deleting PDF with Unique Fields

**Scenario:**
- Tenant has 3 PDFs: `form1.pdf`, `form2.pdf`, `form3.pdf`
- `form1.pdf` has fields: `employee_name`, `employee_email`, `unique_field_1`
- `form2.pdf` has fields: `employee_name`, `employee_email`
- `form3.pdf` has fields: `employee_name`, `department`

**Action:** Delete `form1.pdf`

**Result:**
- ✅ `form1.pdf` deleted
- ✅ `unique_field_1` removed from master form (not in other PDFs)
- ✅ `employee_name`, `employee_email` **preserved** (used by other PDFs)

### Example 2: Deleting PDF with Only Common Fields

**Scenario:**
- Tenant has 2 PDFs: `form1.pdf`, `form2.pdf`
- `form1.pdf` has fields: `employee_name`, `employee_email`
- `form2.pdf` has fields: `employee_name`, `employee_email`, `department`

**Action:** Delete `form1.pdf`

**Result:**
- ✅ `form1.pdf` deleted
- ✅ **No fields removed** from master form (all fields still used by `form2.pdf`)
- ✅ Master form still contains: `employee_name`, `employee_email`, `department`

### Example 3: Deleting Last PDF (Complete Master Form Deletion)

**Scenario:**
- Tenant has only 1 PDF: `form1.pdf`
- `form1.pdf` has fields: `employee_name`, `employee_email`, `department`
- Master form contains: `employee_name`, `employee_email`, `department`

**Action:** Delete `form1.pdf`

**Result:**
- ✅ `form1.pdf` deleted
- ⚠️ **Master form COMPLETELY DELETED** (no fields remain)
- ⚠️ Dynamic table dropped (if existed)
- ✅ When you upload a new PDF, a fresh master form will be created

### Example 4: Preview Before Deletion

**Request:**
```bash
curl -X GET http://localhost:4000/api/embeddings/pdf-uuid-123/preview-delete \
  -H "Authorization: Bearer <admin-token>"
```

**Response (when other PDFs exist):**
```json
{
  "success": true,
  "preview": {
    "willRemoveFields": ["unique_signature_field", "custom_checkbox"],
    "fieldsStillInUse": ["employee_name", "employee_email", "department"],
    "totalFieldsInPdf": 5,
    "willDeleteMasterForm": false,
    "message": "2 field(s) will be removed from the master form"
  }
}
```

**Response (when this is the last PDF):**
```json
{
  "success": true,
  "preview": {
    "willRemoveFields": ["employee_name", "employee_email", "department"],
    "fieldsStillInUse": [],
    "totalFieldsInPdf": 3,
    "willDeleteMasterForm": true,
    "message": "⚠️  Master form will be COMPLETELY DELETED (this is the last PDF)"
  }
}
```

## Use Cases

### 1. Testing and Development
- Upload multiple test PDFs
- Delete test PDFs without polluting master form
- Keep only production PDF fields

### 2. Form Version Management
- Replace old form versions with new ones
- Remove outdated fields automatically
- Maintain only current form fields

### 3. Multi-Tenant SaaS
- Each tenant manages their own forms
- Field cleanup happens per tenant
- No cross-tenant field pollution

### 4. Regulatory Compliance
- Remove fields from deprecated forms
- Ensure master form reflects current requirements
- Audit trail of field removals

## Technical Notes

### Field Name Matching
- **Case-insensitive**: "Employee_Name" matches "employee_name"
- **Normalized**: Handles different field name formats
- **Flexible**: Works with various `fieldMapping` structures

### Data Integrity
- ✅ Atomic operations (database transactions)
- ✅ Graceful error handling (cleanup failure doesn't fail PDF deletion)
- ✅ Detailed logging for debugging
- ✅ No data loss risk (only removes truly unused fields)

### Performance
- Efficient queries (indexed by tenantId)
- Minimal database operations
- Fast field comparison using Sets
- No impact on PDF upload/form submission

## Database Schema

The system uses existing tables without requiring schema changes:

### `pdf_templates`
```sql
{
  id: uuid,
  tenantId: uuid,
  fileName: string,
  fieldMapping: json,  -- Array of field objects/strings
  isActive: boolean,
  ...
}
```

### `tenant_form_schemas`
```sql
{
  id: uuid,
  tenantId: uuid,
  formName: string,
  schemaJson: json,  -- Contains { fields: [...] }
  isActive: boolean,
  ...
}
```

## Logging

The system provides detailed logging for debugging:

```
[FIELD-CLEANUP] Starting cleanup for tenant abc123 after deleting PDF: form1.pdf
[FIELD-CLEANUP] Deleted PDF had 5 fields
[FIELD-CLEANUP] Found 2 remaining PDF templates
[FIELD-CLEANUP] Fields still in use by other PDFs: 3
[FIELD-CLEANUP] Fields to remove from master form: 2
[FIELD-CLEANUP] Master form fields before cleanup: 8
[FIELD-CLEANUP] Master form fields after cleanup: 6
[FIELD-CLEANUP] ✅ Successfully removed 2 fields from master form
```

## Error Handling

### Graceful Degradation
- If field cleanup fails, PDF deletion still succeeds
- Error is logged but doesn't break the delete operation
- Returns error info in response

### Error Response Example
```json
{
  "success": true,
  "message": "PDF deleted successfully",
  "deletedPdf": { ... },
  "fieldCleanup": {
    "error": "Failed to update master form",
    "fieldsRemoved": 0
  }
}
```

## Files Modified

### New Files
1. `src/services/formFieldCleanup.service.js` - Core cleanup logic

### Modified Files
1. `src/services/embedding.service.js` - Integrated cleanup into PDF deletion
2. `src/controllers/embedding.controller.js` - Added preview endpoint
3. `src/routes/embedding.routes.js` - Added preview route
4. `src/controllers/form.controller.js` - Added form schema deletion
5. `src/routes/form.routes.js` - Added form schema delete route

## Testing

### Manual Testing

1. **Test Field Cleanup on PDF Deletion:**
```bash
# Upload 2 PDFs with overlapping fields
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@form1.pdf"

curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@form2.pdf"

# Check master form fields
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"

# Preview cleanup
curl -X GET http://localhost:4000/api/embeddings/<pdf-id>/preview-delete \
  -H "Authorization: Bearer <token>"

# Delete first PDF
curl -X DELETE http://localhost:4000/api/embeddings/<pdf-id> \
  -H "Authorization: Bearer <token>"

# Verify master form fields were cleaned up
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"
```

2. **Test Common Field Preservation:**
- Upload 2 PDFs with same field names
- Delete one PDF
- Verify common fields remain in master form

## Best Practices

### For Administrators
1. ✅ Use preview endpoint before deleting important PDFs
2. ✅ Review field cleanup results after deletion
3. ✅ Keep at least one PDF for commonly used fields
4. ✅ Document which PDFs contribute which fields

### For Developers
1. ✅ Always check cleanup results in logs
2. ✅ Handle cleanup errors gracefully
3. ✅ Test with various field mapping formats
4. ✅ Monitor master form field counts

## Future Enhancements

### Potential Improvements
- [ ] Field usage statistics (track which PDFs use which fields)
- [ ] Undo field deletion (restore removed fields)
- [ ] Field dependency graph visualization
- [ ] Batch PDF deletion with consolidated cleanup
- [ ] Field versioning and history tracking

## Support

For issues or questions:
1. Check logs for detailed cleanup information
2. Use preview endpoint to understand field cleanup before deletion
3. Review this documentation for common scenarios
4. Contact support with tenant ID and PDF details

---

**Status:** ✅ Implemented and Tested  
**Version:** 1.0  
**Last Updated:** October 30, 2025


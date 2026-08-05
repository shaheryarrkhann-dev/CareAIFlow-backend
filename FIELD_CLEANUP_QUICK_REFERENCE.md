# Field Cleanup Quick Reference

## 🎯 Quick Overview

When you delete a PDF/form, the system automatically removes fields from the master form that are no longer used by any other PDFs.

## 🔑 Key Endpoints

### Preview Field Cleanup
```bash
GET /api/embeddings/:id/preview-delete
Authorization: Bearer <admin-token>
```

**Example:**
```bash
curl -X GET http://localhost:4000/api/embeddings/abc123/preview-delete \
  -H "Authorization: Bearer <admin-token>"
```

**Response (when other PDFs exist):**
```json
{
  "preview": {
    "willRemoveFields": ["unique_field_1", "unique_field_2"],
    "fieldsStillInUse": ["employee_name", "employee_email"],
    "totalFieldsInPdf": 4,
    "willDeleteMasterForm": false,
    "message": "2 field(s) will be removed from the master form"
  }
}
```

**Response (when this is the last PDF):**
```json
{
  "preview": {
    "willRemoveFields": ["field_1", "field_2", "field_3"],
    "fieldsStillInUse": [],
    "totalFieldsInPdf": 3,
    "willDeleteMasterForm": true,
    "message": "⚠️  Master form will be COMPLETELY DELETED (this is the last PDF)"
  }
}
```

---

### Delete PDF (with automatic field cleanup)
```bash
DELETE /api/embeddings/:id
Authorization: Bearer <admin-token>
```

**Example:**
```bash
curl -X DELETE http://localhost:4000/api/embeddings/abc123 \
  -H "Authorization: Bearer <admin-token>"
```

**Response (when other PDFs exist):**
```json
{
  "success": true,
  "message": "PDF deleted successfully and 2 unused field(s) removed from master form",
  "deletedPdf": {
    "id": "abc123",
    "fileName": "form1.pdf",
    "displayName": "Employee Form",
    "chunksDeleted": 15
  },
  "fieldCleanup": {
    "fieldsRemoved": 2,
    "fieldsStillInUse": 2,
    "removedFieldNames": ["unique_field_1", "unique_field_2"],
    "masterFormDeleted": false,
    "message": "Removed 2 field(s) from master form"
  }
}
```

**Response (when this was the last PDF):**
```json
{
  "success": true,
  "message": "PDF deleted successfully and master form deleted completely (was the last PDF)",
  "deletedPdf": {
    "id": "abc123",
    "fileName": "form1.pdf",
    "displayName": "Employee Form",
    "chunksDeleted": 15
  },
  "fieldCleanup": {
    "fieldsRemoved": 3,
    "fieldsStillInUse": 0,
    "removedFieldNames": ["field_1", "field_2", "field_3"],
    "masterFormDeleted": true,
    "message": "Deleted master form completely (was the last PDF)",
    "masterFormId": "form-uuid",
    "tableName": "tenant_xxx_form_yyy"
  }
}
```

---

### Delete Form Schema
```bash
DELETE /api/forms/schemas/:id
Authorization: Bearer <admin-token>
```

**Example:**
```bash
curl -X DELETE http://localhost:4000/api/forms/schemas/xyz789 \
  -H "Authorization: Bearer <admin-token>"
```

---

## 📋 Common Scenarios

### Scenario 1: Delete PDF with unique fields
**Situation:** PDF has fields not used by other PDFs  
**Result:** ✅ Unique fields are removed from master form  
**Example:** Delete "Old Employee Form" → removes "legacy_field_1"

---

### Scenario 2: Delete PDF with common fields only
**Situation:** All fields are shared with other PDFs  
**Result:** ✅ No fields removed (all still in use)  
**Example:** Delete "Form A" → all fields kept (used by Form B)

---

### Scenario 3: Delete last PDF (IMPORTANT!)
**Situation:** Tenant has only one PDF, and you delete it  
**Result:** ⚠️ **Master form is COMPLETELY DELETED** (no fields remain)  
**Example:** Delete the only PDF → entire master form schema deleted  
**Note:** When you upload a new PDF, a fresh master form will be created

---

### Scenario 4: Preview before deletion
**Situation:** Want to see impact before deleting  
**Action:** Call preview endpoint first  
**Result:** ✅ Shows exactly which fields will be removed  
**Warning:** Preview will indicate if master form will be deleted

---

## 🛠️ Testing Workflow

```bash
# 1. Upload multiple PDFs
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@form1.pdf"

curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@form2.pdf"

# 2. Check master form
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"

# 3. Preview cleanup (optional)
curl -X GET http://localhost:4000/api/embeddings/<pdf-id>/preview-delete \
  -H "Authorization: Bearer <token>"

# 4. Delete PDF
curl -X DELETE http://localhost:4000/api/embeddings/<pdf-id> \
  -H "Authorization: Bearer <token>"

# 5. Verify cleanup
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"
```

---

## 🔍 What Gets Cleaned Up?

### ✅ Cleaned Up
- Fields that exist ONLY in the deleted PDF
- Fields with no usage in other active PDFs
- Exact field name matches (case-insensitive)
- **⚠️ ENTIRE MASTER FORM** if this is the last PDF

### ⛔ NOT Cleaned Up
- Fields used by other PDFs
- Fields with different names (even if similar)
- Common fields across multiple PDFs

---

## 📊 Response Fields Explained

| Field | Description | Example |
|-------|-------------|---------|
| `fieldsRemoved` | Number of fields removed | `2` |
| `fieldsStillInUse` | Number of fields preserved | `3` |
| `removedFieldNames` | Array of removed field names | `["field1", "field2"]` |
| `masterFormDeleted` | Whether entire master form was deleted | `true` or `false` |
| `willDeleteMasterForm` | Preview: will master form be deleted? | `true` or `false` |
| `willRemoveFields` | Preview of fields to remove | `["field1"]` |
| `fieldsStillInUse` (preview) | Fields that won't be removed | `["name", "email"]` |
| `tableName` | Dynamic table name (if deleted) | `"tenant_xxx_form_yyy"` |

---

## ⚠️ Important Notes

1. **Automatic Cleanup:** Field cleanup happens automatically when you delete a PDF
2. **Safe Operation:** Only removes truly unused fields
3. **No Data Loss:** Preserved fields remain in master form
4. **Tenant Isolated:** Cleanup only affects the specific tenant
5. **Preview Available:** Use preview endpoint to see impact before deletion
6. **⚠️ Last PDF Special Case:** If you delete the ONLY PDF, the entire master form is deleted
7. **Fresh Start:** When you upload a new PDF after deleting all, a fresh master form is created

---

## 🐛 Troubleshooting

### Problem: Fields not being removed
**Check:**
- Are the fields used by other PDFs?
- Is field name matching case-insensitive?
- Check logs for cleanup errors

### Problem: Wrong fields removed
**Check:**
- Field name matching logic
- Other PDFs' fieldMapping
- Master form state before deletion

### Problem: Cleanup failed but PDF deleted
**Result:** PDF is deleted, but fields remain
**Action:** Manual cleanup required or re-upload PDFs

---

## 📝 Logging

Watch for these log messages:
```
[FIELD-CLEANUP] Starting cleanup for tenant...
[FIELD-CLEANUP] Deleted PDF had X fields
[FIELD-CLEANUP] Found X remaining PDF templates
[FIELD-CLEANUP] Fields still in use by other PDFs: X
[FIELD-CLEANUP] Fields to remove from master form: X
[FIELD-CLEANUP] ✅ Successfully removed X fields
```

---

## 🎓 Best Practices

1. ✅ **Preview First:** Always preview before deleting important PDFs
2. ✅ **Check Results:** Review cleanup results in API response
3. ✅ **Monitor Logs:** Watch logs for cleanup details
4. ✅ **Backup Data:** Keep backups before bulk deletions
5. ✅ **Test First:** Test with sample PDFs before production

---

## 🔗 Related Documentation

- Full Documentation: `MASTER_FORM_FIELD_CLEANUP.md`
- API Documentation: `SWAGGER_GUIDE.md`
- PDF Upload Guide: `PDF_FILLING_GUIDE.md`
- Form Merging: `FORM_MERGING_UPDATE.md`

---

**Quick Help:**
- Preview: `GET /api/embeddings/:id/preview-delete`
- Delete: `DELETE /api/embeddings/:id`
- Check Fields: `GET /api/forms/schemas`

---

**Status:** ✅ Ready to Use  
**Version:** 1.0


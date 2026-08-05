# Form Schema Merging - Implementation Summary

## 🎯 Problem Solved

**Before:** Each PDF upload created a **new separate form schema**, resulting in multiple forms per tenant.

**After:** All PDFs uploaded by a tenant now contribute to **ONE consolidated "Master Form"** with merged fields.

---

## ✨ Key Changes

### 1. **Automatic Schema Generation on PDF Upload**
- Previously: Users had to manually call `/api/forms/generate-schema` after uploading PDFs
- Now: Schema is automatically generated/updated when uploading a PDF
- Location: `src/services/embedding.service.js`

### 2. **Field Merging Logic**
- First PDF upload → Creates new "Master Form" schema
- Subsequent PDFs → Merges new fields into existing schema
- Duplicate detection: Fields with same name (case-insensitive) are NOT duplicated
- Location: `src/services/ai.service.js` (lines 126-162)

### 3. **One Form Per Tenant**
- Each tenant has exactly ONE form schema called "Master Form"
- All 22 (or more) PDF uploads add fields to this single form
- No more multiple form entries per tenant

---

## 🔄 New Workflow

### **Upload PDFs (all 22 forms for a tenant)**
```bash
# Upload PDF 1
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@form1.pdf"

# Response:
{
  "success": true,
  "message": "PDF uploaded and form schema updated",
  "chunks": 15,
  "schemaUpdated": true,
  "schemaId": "d7e09ba7-...",
  "merged": false,  // First upload - created new
  "newFieldsAdded": 8
}

# Upload PDF 2
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@form2.pdf"

# Response:
{
  "success": true,
  "message": "PDF uploaded and form schema updated",
  "chunks": 12,
  "schemaUpdated": true,
  "schemaId": "d7e09ba7-...",  // SAME schema ID
  "merged": true,  // Merged into existing
  "newFieldsAdded": 5  // Only 5 new unique fields added
}

# Upload PDF 3... PDF 22
# All merge into the SAME schema
```

### **View the Consolidated Schema**
```bash
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"

# Returns ONE schema with ALL fields from all PDFs
{
  "success": true,
  "count": 1,  // Only ONE form per tenant
  "schemas": [
    {
      "id": "d7e09ba7-...",
      "formName": "Master Form",
      "description": "Consolidated form from all uploaded documents",
      "schemaJson": {
        "form_name": "Master Form",
        "fields": [
          // All unique fields from all 22 PDFs
          { "name": "resident_name", "type": "text", ... },
          { "name": "guardian_name", "type": "text", ... },
          { "name": "date_of_admission", "type": "date", ... },
          { "name": "facility_address", "type": "text", ... },
          // ... total of 100+ fields from all forms
        ]
      }
    }
  ]
}
```

---

## 🔍 Technical Details

### Deduplication Strategy
Fields are considered duplicates if their **normalized names** match (case-insensitive):

```javascript
// Example: These are treated as the same field
"resident_name"
"Resident_Name"
"RESIDENT_NAME"

// The first occurrence is kept, subsequent ones are skipped
```

### Field Merging Algorithm
```javascript
1. Check if form schema exists for tenant
2. If NO → Create new "Master Form" with fields from current PDF
3. If YES → 
   a. Get existing fields from schema
   b. Normalize new field names from AI
   c. Filter out fields that already exist (by name)
   d. Append only NEW fields to existing schema
   e. Update schema in database
```

### Console Logs for Debugging
The system now logs detailed information:
```
[AUTO-SCHEMA] Triggering automatic schema generation/update for tenant 8ea807da-...
[MERGE] Found existing schema for tenant 8ea807da-..., merging fields...
[MERGE] Existing fields: 15, New unique fields: 5
[AUTO-SCHEMA] Success - Merged schema with 5 new fields
```

---

## 📊 Database Impact

### Before
```sql
-- Multiple form schemas per tenant
tenant_form_schemas:
  id: d7e09ba7-..., tenantId: 8ea807da-..., formName: "Employee Onboarding Form", fields: [8]
  id: d839ba8e-..., tenantId: 8ea807da-..., formName: "Employee Onboarding Form", fields: [5]
  id: f2a3b4c5-..., tenantId: 8ea807da-..., formName: "Employee Onboarding Form", fields: [7]
```

### After
```sql
-- ONE form schema per tenant with merged fields
tenant_form_schemas:
  id: d7e09ba7-..., tenantId: 8ea807da-..., formName: "Master Form", fields: [20]
```

---

## 🧪 Testing Guide

### Test Case 1: Fresh Tenant (No Existing Schema)
1. Upload first PDF
2. Verify `merged: false` in response
3. Check database: ONE schema created

### Test Case 2: Existing Tenant (Has Schema)
1. Upload second PDF
2. Verify `merged: true` in response
3. Check `newFieldsAdded` count
4. Verify same `schemaId` as first upload

### Test Case 3: Duplicate Fields
1. Upload PDF with fields: `resident_name`, `date`
2. Upload another PDF with: `resident_name`, `address`
3. Verify only `address` is added (resident_name already exists)
4. Check `newFieldsAdded: 1`

### Test Case 4: Multiple PDFs (Full Workflow)
1. Upload 22 PDFs sequentially
2. Verify ONE schema exists per tenant
3. Verify total field count is cumulative
4. Verify no duplicate field names

---

## 🎯 Benefits

✅ **One Form Per Tenant**: Simplified schema management  
✅ **Automatic Updates**: No manual API calls needed  
✅ **No Duplicates**: Smart field name matching  
✅ **Scalable**: Supports 22+ PDFs easily  
✅ **Backwards Compatible**: Old endpoints still work  
✅ **Transparent Logging**: Easy to debug and monitor  

---

## 🔧 API Changes

### Modified Endpoints

#### `POST /api/embeddings/upload`
**New Response Fields:**
```json
{
  "success": true,
  "message": "PDF uploaded and form schema updated",
  "chunks": 15,
  "schemaUpdated": true,      // NEW
  "schemaId": "uuid",          // NEW
  "merged": true,              // NEW
  "newFieldsAdded": 5          // NEW
}
```

#### `POST /api/forms/generate-schema` (Still Works)
Can still be called manually if needed. Now supports merging too.

---

## 🚨 Migration for Existing Data

If you already have multiple form schemas for the same tenant:

### Option 1: Clean Slate (Recommended for Testing)
```sql
-- Delete old duplicate schemas
DELETE FROM tenant_form_schemas 
WHERE "tenantId" = 'your-tenant-id' 
AND "formName" = 'Employee Onboarding Form';

-- Re-upload all PDFs (they will create ONE merged form)
```

### Option 2: Manual Merge (For Production)
```sql
-- Keep the first schema, update its name
UPDATE tenant_form_schemas 
SET "formName" = 'Master Form',
    "isActive" = true
WHERE id = 'keep-this-id';

-- Deactivate duplicates
UPDATE tenant_form_schemas 
SET "isActive" = false
WHERE "tenantId" = 'your-tenant-id' 
AND id != 'keep-this-id';

-- Future PDF uploads will merge into the active one
```

---

## 📝 Files Modified

1. **`src/services/ai.service.js`**
   - Added merge logic in `generateFormSchema()`
   - Checks for existing schema before creating
   - Deduplicates fields by name

2. **`src/services/embedding.service.js`**
   - Added automatic schema generation after PDF processing
   - Passes `userId` for audit trail
   - Returns schema update status

3. **`src/controllers/embedding.controller.js`**
   - Updated response to include schema info
   - Passes `userId` to service

---

## 🎉 Result

**One tenant can now upload 22+ PDFs, and the system will maintain ONE consolidated form with all unique fields!**

Example final schema after 22 uploads:
- Form Name: "Master Form"
- Description: "Consolidated form from all uploaded documents"
- Fields: 100+ unique fields (deduplicated automatically)
- Tenant has only ONE form schema entry in database

---

## 💡 Usage Tips

1. **Upload PDFs in any order** - merging works regardless
2. **Check logs** - Use `[MERGE]` and `[AUTO-SCHEMA]` tags to monitor
3. **Verify deduplication** - Compare `newFieldsAdded` vs AI-generated field count
4. **One form name** - All schemas use "Master Form" for consistency
5. **Reprocess PDFs** - If needed, upload same PDF again (no duplicates will be created)

---

**Last Updated:** October 13, 2025  
**Status:** ✅ Implemented and Tested


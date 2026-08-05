# Fix Missing Fields Issue

## Problem Identified

From the logs, we can see:
1. **Only 5 fields detected** from the PDF during upload
2. **3 fields have schemaKey="none"** so they can't match formData
3. **"RESIDENT'S NAME" field is missing** from detection entirely

## Quick Fix: Remap Template

### Step 1: Get Template ID
From your logs: The template was uploaded and stored.

Find the template ID:
```bash
# Use this API to list templates
GET http://localhost:4000/api/embeddings/templates
Authorization: Bearer YOUR_JWT_TOKEN
```

### Step 2: Run Remap API
```bash
POST http://localhost:4000/api/pdfs/remap/:templateId
Authorization: Bearer YOUR_JWT_TOKEN
```

This will automatically match:
- `providers_date` → `provider_resident_manager_signature_date`
- `residents_signature` → `resident_guardian_signature`
- `residents_date` → `resident_guardian_signature_date`

### Step 3: Re-upload PDF to Re-detect All Fields

The current detection only found 5 fields, but your PDF has more (including "RESIDENT'S NAME").

**To re-detect all fields:**
```bash
# Delete the current template first
DELETE http://localhost:4000/api/embeddings/templates/:templateId

# Then re-upload with hybrid detection
POST http://localhost:4000/api/embeddings/upload
Content-Type: multipart/form-data

file: your-pdf-file
useHybridDetection: true  # Use hybrid for best results
```

This should detect ALL fields including:
- RESIDENT'S NAME
- NAME OF RESIDENT'S GUARDIAN
- DATE OF ADMISSION
- Provider/Manager signature and date
- Resident/Guardian signature and date
- All the item checkboxes (DENTURES, HEARING AID, JEWELRY, etc.)
- All the clothing list items
- Other fields

## Alternative: Manual Schema Key Assignment

If remap doesn't work perfectly, manually update the field mapping:

```bash
PUT http://localhost:4000/api/pdfs/:templateId/field-mapping
Content-Type: application/json

{
  "fieldMapping": [
    {
      "fieldName": "name_of_residents_guardian",
      "label": "NAME OF RESIDENT'S GUARDIAN",
      "schemaKey": "resident_guardian_name",
      "x": 420,
      "y": 117.36,
      "width": 100,
      "height": 20,
      "type": "text",
      "page": 0
    },
    {
      "fieldName": "residents_name",
      "label": "RESIDENT'S NAME",
      "schemaKey": "resident_name",  // ← Add this field manually
      "x": 100,  // You'll need to provide coordinates
      "y": 100,
      "width": 200,
      "height": 20,
      "type": "text",
      "page": 0
    },
    {
      "fieldName": "providers_date",
      "label": "DATE",
      "schemaKey": "provider_resident_manager_signature_date",  // ← Fix this
      "x": ...,
      "y": ...,
      "type": "date",
      "page": 0
    },
    {
      "fieldName": "residents_signature",
      "label": "RESIDENT'S OR GUARDIAN'S SIGNATURE",
      "schemaKey": "resident_guardian_signature",  // ← Fix this
      "x": ...,
      "y": ...,
      "type": "text",
      "page": 0
    },
    {
      "fieldName": "residents_date",
      "label": "DATE",
      "schemaKey": "resident_guardian_signature_date",  // ← Fix this
      "x": ...,
      "y": ...,
      "type": "date",
      "page": 0
    }
  ]
}
```

## Recommended Action

**Best approach: Re-upload the PDF**

1. Delete current template
2. Re-upload with `useHybridDetection: true`
3. This should detect ALL fields (not just 5)
4. Then run remap API to set schemaKeys automatically

This will ensure:
- All fields are detected (including "RESIDENT'S NAME")
- Coordinates are accurate
- schemaKeys are properly linked

## Why Only 5 Fields Were Detected?

Possible reasons:
1. **Vision API missed fields** - Some fields might be in tables or have complex layouts
2. **Text-based detection missed fields** - Labels might be formatted differently
3. **Hybrid detection not used** - Or detection parameters need adjustment

**Solution:** Re-upload with hybrid detection to catch all fields.


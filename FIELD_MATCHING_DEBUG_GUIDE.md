# Field Matching Debug Guide

## Problem

When a PDF is first uploaded, fields are detected and saved with certain names (like `"name"`, `"resident_name"`). However, when filling the PDF, the system can't find the values because:

1. **During PDF Upload**: Fields detected as `fieldName: "name"`, `label: "Resident Name:"`
2. **During Form Submission**: formData has keys based on schema like `"resident_name"`
3. **Mismatch**: `"name"` ≠ `"resident_name"`, so no match!

## Solution Added

I've added comprehensive logging to `pdf.service.js` that will show you **exactly** what's happening:

### What the Logging Shows

When you submit a form and PDFs are auto-filled, you'll see:

```
[PDF-COORD] ========== FIELD MAPPING DEBUG ==========
[PDF-COORD] Total fields in mapping: 15
[PDF-COORD] Available formData keys: [resident_name, date_of_birth, phone_number, ...]
[PDF-COORD] formData values: {
  "resident_name": "John Doe",
  "date_of_birth": "1990-01-15",
  ...
}

[PDF-COORD] Field mapping summary:
[PDF-COORD]   1. fieldName="name", label="Resident Name:", schemaKey="none", type="text"
[PDF-COORD]   2. fieldName="dob", label="Date of Birth:", schemaKey="none", type="date"
[PDF-COORD]   3. fieldName="phone", label="Phone Number:", schemaKey="resident_phone", type="text"
  ...
[PDF-COORD] ==========================================
```

Then for each field:
- ✅ If matched: `[PDF-COORD] ✅ Found value for "name" (label: "Resident Name:"): "John Doe" (matched via label: resident_name)`
- ⚠️ If NOT matched: `[PDF-COORD] ⚠️ No value found for field "name" (schemaKey: none, label: Resident Name:)`

## How to Use This

### Step 1: Submit a Form

1. Upload a PDF template (if you haven't already)
2. Fill out and submit a form with data
3. Watch the console/terminal logs

### Step 2: Analyze the Output

Look for the debug section. You'll see:

**What's in fieldMapping (from PDF detection):**
```
fieldName="name", label="Resident Name:", schemaKey="none"
```

**What's in formData (from form submission):**
```
"resident_name": "John Doe"
```

**The mismatch:**
- PDF field uses: `fieldName="name"`
- formData has key: `"resident_name"`
- Label matching tries: "Resident Name:" → "residentname" → should match "resident_name" ✅

### Step 3: Check Which Fields Don't Match

Any field showing:
```
⚠️ No value found for field "xyz"
```

Is a field that couldn't be matched. The log will show:
- What the field's `fieldName`, `label`, and `schemaKey` are
- What keys are available in formData

## Common Mismatches and Fixes

### Case 1: fieldName Mismatch
**Problem:**
- fieldName: `"name"`
- formData key: `"resident_name"`
- label: `"Resident Name:"`

**Current Solution:** Label matching should handle this
- "Resident Name:" normalizes to "residentname"
- "resident_name" normalizes to "residentname"
- **Should match! ✅**

### Case 2: schemaKey is Set But Wrong
**Problem:**
- fieldName: `"name"`
- schemaKey: `"full_name"` (wrong!)
- formData key: `"resident_name"`

**Solution:** Use the `remapTemplateFieldMapping` API to fix schemaKeys:
```bash
POST /api/pdfs/remap/:templateId
```

### Case 3: Label is Missing or Incomplete
**Problem:**
- fieldName: `"field_1"`
- label: `null` or `""`
- formData key: `"resident_name"`

**Solution:** Label matching won't work. You need to:
1. Re-upload the PDF with better field detection
2. Or manually set schemaKeys using `updateTemplateFieldMapping`

## Matching Priority Order

The `findFieldValue` function tries to match in this order:

1. **schemaKey** (exact match) - Highest priority
2. **fieldName** (exact match)
3. **label** (normalized matching) - **Key fix for your issue!**
   - Removes colons, spaces
   - Normalizes: `"Resident Name:"` → `"residentname"`
   - Matches against formData keys
4. **fieldName** (normalized, substring)
5. **fieldName** (word-based matching)

## What to Send Me

After running a form submission, please send:

1. **The debug output** showing:
   - Field mapping summary (all fields with their fieldName, label, schemaKey)
   - Available formData keys
   
2. **Specific fields that didn't match**, for example:
   ```
   ⚠️ No value found for field "name" (schemaKey: none, label: Resident Name:)
   Available formData keys: resident_name, date_of_birth, ...
   ```

This will help me identify if:
- Label matching is working correctly
- schemaKeys need to be set
- There's a different issue

## Quick Fix Options

### Option A: Use remapTemplateFieldMapping API
This automatically matches PDF fields to schema fields:
```javascript
POST /api/pdfs/remap/:templateId
```

This will:
- Look at each PDF field's `fieldName` and `label`
- Try to match it to the schema's field names
- Set the `schemaKey` for better matching

### Option B: Manual schemaKey Assignment
If automatic mapping doesn't work, manually update:
```javascript
PUT /api/pdfs/:templateId/field-mapping
{
  "fieldMapping": [
    {
      "fieldName": "name",
      "label": "Resident Name:",
      "schemaKey": "resident_name",  // ← Manually set this
      "x": 150,
      "y": 100,
      ...
    }
  ]
}
```

## Expected Behavior After Fix

With proper label matching, you should see:
```
[PDF-COORD] ✅ Found value for "name" (label: "Resident Name:"): "John Doe" (matched via label: resident_name)
```

This means:
- PDF field `fieldName="name"` with `label="Resident Name:"`
- Matched to formData key `"resident_name"`
- Via label-based normalized matching

## Next Steps

1. **Submit a form** and check the console logs
2. **Send me the debug output** showing which fields aren't matching
3. I'll help you identify if:
   - Label matching is working
   - We need to improve the normalization logic
   - schemaKeys need to be set
   - There's a different issue

---

**Remember:** The label-based matching should handle most cases where `fieldName` doesn't match formData keys, as long as the labels are present and descriptive.


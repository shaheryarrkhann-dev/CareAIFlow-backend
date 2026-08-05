# 🔄 Azure Document Intelligence - Re-Upload Required

## ❌ Current Problem

Looking at your logs, **Azure Document Intelligence did NOT run during PDF prefill**. The system used a stored field mapping from upload that has only **18 fields** with several issues:

### Issues in Current Template:
1. **Azure only ran during upload** - Not during prefill (by design after the last fix)
2. **Only 18 fields detected** - Many fields missing from your form
3. **Wrong field mappings**:
   - `nickname` is mapped to `schemaKey="name"` (LINE 111)
   - This blocks the actual "Name" field from being detected
   - "Male" field has null coordinates (LINE 132-134)
4. **Overlapping fields** - Multiple fields trying to use same coordinates

### From Your Logs:
```
[PDF-FILL] Using stored field mapping (18 fields)  ← Using OLD mapping
[PDF-COORD]   4. fieldName="resident_nickname", label="Nickname", schemaKey="name"  ← WRONG!
[PDF-COORD]   1. fieldName="male", label="Male:", schemaKey="none", coords: (null, null)  ← BROKEN!
```

**No `[AZURE-DI]` logs in your output** = Azure didn't run during prefill.

---

## ✅ Why This Happened

The current template was created when:
1. Azure had the coordinate system mismatch issue (NaN coordinates)
2. Layout-inferred fields were causing problems
3. Only 3 fields were detected by Azure, the rest came from text-based AI

**These issues have been fixed**, but your template still has the OLD broken field mapping.

---

## 🔧 Solution: Delete and Re-Upload

### Step 1: Delete Current PDF Template

1. **In your frontend**: Go to PDF Templates section
2. **Delete** the "Emergency_Contact.pdf" template
3. Or use API:
   ```bash
   DELETE /api/pdfs/templates/{templateId}
   ```

### Step 2: Re-Upload the PDF

1. **Upload the same PDF again** through your frontend
2. **Make sure** these are NOT set in upload request:
   - `useCoordinateDetection=false` (or omit it)
   - `useHybridDetection=true` (default)
   - `enableAIDetection=true` (default)

### Step 3: Verify Azure Runs During Upload

After uploading, check the backend logs for:

```
[AZURE-DI] 🔍 Starting Azure Document Intelligence field detection...
[AZURE-DI] ✅ Azure Document Intelligence client initialized
[AZURE-DI] Using model: prebuilt-document
[AZURE-DI] Found 19 key-value pairs
[AZURE-DI]   ✓ "nickname" (Nickname) at page 1, (267.4, 204.9)
[AZURE-DI]   ✓ "name" (Name) at page 1, (150.5, 180.2)  ← Should detect main name!
[AZURE-DI]   ✓ "address" (Address) at page 1, (...)
[AZURE-DI] ⚠️ Layout-inferred fields disabled - coordinate system mismatch
[AZURE-DI] Text-based AI will supplement with accurate coordinates
[AZURE-DI] ✅ Total fields detected: 20+ fields  ← Should be MORE than 18!
[AZURE-DI] Field breakdown:
[AZURE-DI]   text: 15 fields
[AZURE-DI]   date: 3 fields
[AZURE-DI]   checkbox: 2 fields
```

### Step 4: Test Form Filling

After re-uploading:
1. **Fill out the form** with test data
2. **Check the filled PDF** - all fields should now appear
3. **No more overlapping** - proper field coordinates from Azure

---

## 🎯 Expected Results

### ✅ During Upload (with Fresh Azure Detection):
```
[AZURE-DI] Found 19 key-value pairs
[HYBRID-AI] Combining Azure (15 fields) + Text-based AI (12 fields) + Vision-based (3 fields)
[HYBRID-AI] ✅ Deduplication: 30 total → 22 unique fields
[PDF-TEMPLATE] Storing PDF template with 22 AI-detected field mappings...
```

### ✅ During Prefill (Using Stored Mapping):
```
[PDF-FILL] Using stored field mapping (22 fields)  ← MORE fields!
[PDF-COORD] ✅ Found value for "name" (label: "Name"): "Muhammad Ashar Usman"
[PDF-COORD] ✅ Found value for "nickname" (label: "Nickname"): "vbv"
[PDF-COORD] ✅ Filled field "name" with "Muhammad Ashar Usman" at (150.5, 590.1)
[PDF-COORD] ✅ Filled field "nickname" with "vbv" at (267.4, 590.1)
```

**No overlapping!** Each field has its own proper coordinates.

---

## 📋 Why Re-Upload Fixes This

1. **Azure will run fresh** during upload with the fixed code
2. **No more coordinate system mismatch** - layout-inferred fields disabled
3. **Hybrid AI will combine**:
   - Azure key-value pairs (with valid coordinates)
   - Text-based AI (with accurate PDF.js coordinates)
   - Vision-based AI (for checkboxes and complex fields)
4. **Better deduplication** - removes true duplicates while keeping legitimate fields
5. **Correct field mappings** - nickname → nickname, name → name

---

## 🚀 Quick Commands

```bash
# If you want to do it via API:

# 1. Get template ID
GET /api/pdfs/templates

# 2. Delete old template
DELETE /api/pdfs/templates/{templateId}

# 3. Re-upload PDF
POST /api/embeddings/upload
Content-Type: multipart/form-data

file: <your_pdf_file>
useHybridDetection: true
enableAIDetection: true
displayName: "Emergency Contact Form"
```

---

## 💡 Important Notes

1. **Azure is working correctly** - the code is fixed
2. **The stored mapping is old** - from before the fixes
3. **Re-uploading is required** - to get fresh Azure detection
4. **This is a one-time fix** - future PDFs will work correctly

---

## ❓ Need Help?

If you see any errors during re-upload, check:
1. Azure environment variables are set correctly
2. Backend logs show `[AZURE-DI]` messages
3. Field count is > 18 (should be 20-25 for your form)

Let me know if you need any assistance! 🙌


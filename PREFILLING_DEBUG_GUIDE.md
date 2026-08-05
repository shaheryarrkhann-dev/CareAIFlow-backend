# 🔍 Prefilling Debug Guide - Empty Fields Issue

## 🐛 Problem

From your screenshot:
- **Some fields are empty** in prefilled PDF
- Inline fields like "AFRatames _______", "I, _______ authorize..." are not filled
- Form has 9 fields, but PDF has more fields (inline fields)

---

## 🔍 Diagnosis Steps

### 1. Check Field Detection Logs

**After uploading PDF, check logs for:**
```
[SCHEMA-DRIVEN] ✅ Bulk detection found X fields
[SCHEMA-DRIVEN] ✅ Schema fields found in PDF: Y
[SCHEMA-DRIVEN] 📋 Additional PDF fields (not in schema): Z
```

**Current logs show:**
- Bulk detection: 14 fields
- Schema fields found: 10/11
- Additional fields: 1

**Issue**: Only 1 additional field detected, but PDF should have more inline fields!

---

### 2. Check Field Mapping

**After template is saved, check the fieldMapping in database:**
- Does it include ALL inline fields?
- Are field names correct (e.g., "resident_name", "authorized_person_name")?
- Do coordinates look correct?

---

### 3. Check Form Submission Data

**When submitting form, check:**
- Does formData include values for all fields?
- Are formData keys matching field names in mapping?
- Example: formData should have `resident_name`, `authorized_person_name`, etc.

---

### 4. Check Prefilling Logs

**During prefilling, check logs for:**
```
[PDF-COORD] ⚠️ No value found for field "field_name"
[PDF-COORD]    Available formData keys: [list of keys]
```

**This tells you:**
- Which fields are being processed
- Which fields have no matching formData
- What formData keys are available

---

## ✅ Solutions

### Solution 1: Verify Inline Fields Are Detected

**The bulk detection should find inline fields like:**
- "AFRatames _______" → `resident_name`
- "I, _______ authorize..." → `authorized_person_name`
- "information or medical records of _______" → `recipient_name`
- "to _______ of _______" → `recipient_facility`

**If not detected:**
- Check if PDF structure extraction is finding these fields
- Check if OpenAI is detecting inline patterns correctly
- May need to enhance detection prompts

---

### Solution 2: Verify Field Matching

**During prefilling, fields are matched by:**
1. `schemaKey` (primary) - e.g., `resident_name`
2. `fieldName` (secondary) - e.g., `resident_name`
3. `label` (tertiary) - e.g., "Resident Name"

**If fields aren't filling:**
- Check if formData has matching keys
- Check if field names match formData keys
- Check if labels are being used for matching

---

### Solution 3: Check Coordinates

**If fields are detected but not filling correctly:**
- Check if coordinates (x, y) are accurate
- Check if text is being placed at correct position
- Check if field width/height is correct

---

## 🧪 Testing Steps

### Test 1: Check Field Detection

1. Upload PDF
2. Check logs for bulk detection count
3. Verify all inline fields are detected
4. Check fieldMapping in database

### Test 2: Check Form Data

1. Submit form with data
2. Check logs for formData keys
3. Verify all required fields have values
4. Check if field names match mapping

### Test 3: Check Prefilling

1. Submit form and check prefilled PDF
2. Check logs for fields that weren't filled
3. Verify coordinates are correct
4. Check if formData matches field names

---

## 📊 Expected vs Actual

### Expected:
- Bulk detection: 15+ fields (including inline fields)
- Schema mapping: 11/11 fields
- Additional fields: 4+ (inline fields not in schema)
- Prefilling: All fields filled if formData available

### Actual (from logs):
- Bulk detection: 14 fields ✅
- Schema mapping: 10/11 fields ⚠️
- Additional fields: 1 ⚠️ (should be more)
- Prefilling: Some fields empty ❌

---

## 🔧 Next Steps

1. **Check what fields are being detected** - Look at fieldMapping in database
2. **Verify inline fields are included** - Check if "AFRatames _______", "I, _______" are detected
3. **Check formData keys** - Ensure they match detected field names
4. **Test prefilling** - Submit form and check logs for missing fields

---

## 💡 Quick Fix

**If inline fields aren't being detected:**
- Enhanced detection prompts already in place
- May need to adjust detection logic
- Or manually map inline fields

**If fields are detected but not filling:**
- Check formData keys match field names
- Check field matching logic
- Check coordinates are correct

---

## 📝 Action Items

1. ✅ Check fieldMapping in database
2. ✅ Verify inline fields are detected
3. ✅ Check formData keys during submission
4. ✅ Test prefilling and check logs
5. ✅ Fix any missing detections or mismatches



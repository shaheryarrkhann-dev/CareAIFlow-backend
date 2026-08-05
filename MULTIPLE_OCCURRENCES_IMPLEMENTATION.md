# 🔄 Multiple Occurrences Implementation

## 🎯 User Requirements

1. **Deep, thorough analysis** - detect ALL occurrences of the same field in a PDF
2. **Multiple occurrences in same PDF** - if "resident_name" appears 3 times, detect all 3 and fill all 3
3. **Multiple PDFs** - if "resident_name" exists in 5 PDFs, save mappings for all 5 PDFs, and fill all 5 when form is submitted

---

## ✅ Implementation

### 1. **Enhanced Bulk Detection** ✅
- **File**: `schemaDrivenFieldDetection.service.js`
- **Change**: Modified `findSchemaFieldInPdf` to collect **ALL matching fields** instead of returning just the first one
- **Logic**: 
  - Loop through all detected fields
  - Collect ALL matches (not just the first)
  - Return all matches with metadata (`multipleOccurrences`, `allOccurrences`, `totalOccurrences`)

### 2. **Enhanced Field Mapping Storage** ✅
- **File**: `schemaDrivenFieldDetection.service.js`
- **Change**: Modified mapping logic to store **ALL occurrences** of the same schema field
- **Logic**:
  - When multiple occurrences found, add ALL of them to `allMappings`
  - Each occurrence has unique coordinates (x, y, page)
  - Track occurrence index and total occurrences
  - Only prevent duplicate **locations**, not duplicate **field names**

### 3. **Enhanced Detection Prompts** ✅
- **File**: `aiFieldDetectionCoordinate.service.js`
- **Change**: Added explicit instructions to detect **ALL occurrences** of the same field
- **Instructions**:
  - "If the same field appears multiple times, detect ALL occurrences"
  - "Each occurrence = SEPARATE field entry with its own coordinates"
  - "Don't skip duplicate field names - they're different locations in the PDF!"

### 4. **Enhanced Targeted Search** ✅
- **File**: `schemaDrivenFieldDetection.service.js`
- **Change**: Modified targeted search to return **ALL occurrences** if found
- **Response Format**:
  ```json
  {
    "found": true,
    "occurrences": [
      { "fieldName": "resident_name", "x": 100, "y": 200, ... },
      { "fieldName": "resident_name", "x": 100, "y": 300, ... },
      { "fieldName": "resident_name", "x": 100, "y": 400, ... }
    ]
  }
  ```

### 5. **Prefilling Logic** ✅
- **File**: `pdf.service.js`
- **Status**: Already handles multiple occurrences correctly!
- **Logic**: 
  - `fillPdfByCoordinates` loops through ALL fields in `fieldMapping`
  - If same `schemaKey` appears multiple times with different coordinates, all are filled
  - Each occurrence is filled at its unique coordinates

---

## 📊 How It Works

### Scenario 1: Same Field, Multiple Occurrences in One PDF

**Example**: "Resident Name" appears 3 times in the same PDF

1. **Detection**: 
   - Bulk detection finds 3 occurrences at different coordinates
   - All 3 are collected and returned with metadata

2. **Mapping**:
   ```json
   [
     {
       "schemaKey": "resident_name",
       "fieldName": "resident_name",
       "x": 100,
       "y": 200,
       "page": 0,
       "occurrenceIndex": 1,
       "totalOccurrences": 3
     },
     {
       "schemaKey": "resident_name",
       "fieldName": "resident_name",
       "x": 100,
       "y": 300,
       "page": 0,
       "occurrenceIndex": 2,
       "totalOccurrences": 3
     },
     {
       "schemaKey": "resident_name",
       "fieldName": "resident_name",
       "x": 100,
       "y": 400,
       "page": 0,
       "occurrenceIndex": 3,
       "totalOccurrences": 3
     }
   ]
   ```

3. **Prefilling**:
   - When form is submitted with `resident_name: "John Doe"`
   - All 3 occurrences are filled with "John Doe" at their respective coordinates
   - Result: "John Doe" appears 3 times in the PDF

### Scenario 2: Same Field, Multiple PDFs

**Example**: "Resident Name" exists in 5 different PDFs

1. **PDF 1 Upload**:
   - Detection finds "resident_name" at (100, 200)
   - Mapping saved: `pdf_templates[0].fieldMapping = [{ schemaKey: "resident_name", x: 100, y: 200, ... }]`

2. **PDF 2 Upload**:
   - Detection finds "resident_name" at (150, 250)
   - Mapping saved: `pdf_templates[1].fieldMapping = [{ schemaKey: "resident_name", x: 150, y: 250, ... }]`

3. **PDF 3-5 Upload**:
   - Each PDF gets its own mapping saved
   - All mappings reference the same `schemaKey: "resident_name"`

4. **Form Submission**:
   - `fillAllPdfTemplates` loops through all PDFs
   - For each PDF, `fillPdfTemplate` is called with the same `formData`
   - Each PDF is filled with "John Doe" at its respective coordinates
   - Result: "John Doe" appears in all 5 PDFs at the correct locations

---

## 🔍 Key Changes

### 1. `findSchemaFieldInPdf` Function

**Before**:
```javascript
if (exactMatch || labelMatch || nameContains || labelContains) {
  return { ...detected, schemaKey: fieldName }; // Return first match only
}
```

**After**:
```javascript
const matchingFields = [];
// Collect ALL matches
if (exactMatch || labelMatch || nameContains || labelContains) {
  matchingFields.push({ ...detected, schemaKey: fieldName });
}

// Return all matches
if (matchingFields.length > 1) {
  return {
    ...matchingFields[0],
    multipleOccurrences: true,
    allOccurrences: matchingFields,
    totalOccurrences: matchingFields.length
  };
}
```

### 2. Mapping Logic

**Before**:
```javascript
if (!usedDetectedFieldIds.has(finalFieldId)) {
  usedDetectedFieldIds.add(finalFieldId);
  allMappings.push({ ...fieldMapping, schemaKey: schemaField.name });
  foundCount++;
} else {
  // Skip duplicate
}
```

**After**:
```javascript
if (fieldMapping.multipleOccurrences && fieldMapping.allOccurrences) {
  // Add ALL occurrences
  for (const occurrence of fieldMapping.allOccurrences) {
    const occurrenceId = getFieldId(occurrence);
    if (!usedDetectedFieldIds.has(occurrenceId)) {
      usedDetectedFieldIds.add(occurrenceId);
      allMappings.push({
        ...occurrence,
        schemaKey: schemaField.name,
        occurrenceIndex: index + 1,
        totalOccurrences: fieldMapping.allOccurrences.length
      });
    }
  }
}
```

### 3. Detection Prompts

**Added Instructions**:
- "If the same field appears multiple times, detect ALL occurrences"
- "Each occurrence = SEPARATE field entry with its own coordinates"
- "Don't skip duplicate field names - they're different locations!"
- "If a field appears 5 times, return 5 entries - all must be filled!"

---

## ✅ Expected Results

### Before:
- ❌ Only first occurrence detected
- ❌ Other occurrences skipped
- ❌ Only one location filled
- ❌ Missing data in multiple locations

### After:
- ✅ All occurrences detected
- ✅ All occurrences stored in mapping
- ✅ All occurrences filled during prefilling
- ✅ Data appears in all locations

---

## 🧪 Testing

### Test 1: Multiple Occurrences in Same PDF
1. Upload PDF with "Resident Name" appearing 3 times
2. Check logs: Should show "Found 3 occurrences of resident_name"
3. Check mapping: Should have 3 entries with different coordinates
4. Submit form: Should fill all 3 occurrences

### Test 2: Same Field in Multiple PDFs
1. Upload 5 PDFs, each with "Resident Name"
2. Check mappings: Each PDF should have its own mapping
3. Submit form: Should fill all 5 PDFs with the same data
4. Verify: All 5 PDFs should have "Resident Name" filled correctly

### Test 3: Combination
1. Upload PDF with "Resident Name" appearing 2 times
2. Upload another PDF with "Resident Name" appearing 1 time
3. Submit form: Should fill all 3 occurrences (2 in first PDF, 1 in second PDF)

---

## 📝 Notes

1. **Duplicate Prevention**: Only prevents duplicate **locations** (same coordinates), not duplicate **field names**
2. **Multiple PDFs**: Each PDF has its own mapping, so same field in different PDFs is handled automatically
3. **Prefilling**: Loops through all fields in mapping, so all occurrences are filled automatically
4. **Schema Coverage**: All occurrences count towards 100% schema coverage

---

## 🎯 Summary

✅ **Deep Analysis**: Detects ALL occurrences of the same field
✅ **Multiple Occurrences**: Stores all occurrences with unique coordinates
✅ **Multiple PDFs**: Handles same field across multiple PDFs
✅ **Prefilling**: Fills all occurrences in all PDFs
✅ **100% Coverage**: Ensures all fields are detected and filled

---

## 🔧 Files Modified

1. `ai-onboarding-platform/src/services/schemaDrivenFieldDetection.service.js`
   - Enhanced `findSchemaFieldInPdf` to collect all matches
   - Enhanced mapping logic to store all occurrences
   - Enhanced targeted search to return all occurrences

2. `ai-onboarding-platform/src/services/aiFieldDetectionCoordinate.service.js`
   - Enhanced prompts to detect all occurrences
   - Added instructions for multiple occurrences

3. `ai-onboarding-platform/src/services/pdf.service.js`
   - Already handles multiple occurrences correctly (no changes needed)

---

## 🚀 Next Steps

1. ✅ Enhanced detection to find all occurrences (done)
2. ✅ Enhanced mapping to store all occurrences (done)
3. ✅ Enhanced prompts to detect all occurrences (done)
4. ⏳ **Test with PDF** - Upload PDF with multiple occurrences and verify
5. ⏳ **Test with multiple PDFs** - Upload multiple PDFs and verify
6. ⏳ **Verify prefilling** - Submit form and verify all occurrences are filled



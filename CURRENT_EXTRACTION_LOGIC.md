# Current PDF Extraction Logic - Questionnaire Section

## Overview

The system uses **OpenAI Vision API (GPT-4.1)** to extract structured data from PDF documents by converting PDF pages to images and analyzing them visually.

---

## Extraction Method

**Technology Stack:**
- **AI Model:** `gpt-4.1-2025-04-14` (OpenAI Vision API)
- **Approach:** Vision-based extraction (images, not text parsing)
- **Response Format:** JSON object (forced via `response_format: { type: "json_object" }`)

---

## Step-by-Step Process

### Step 1: Load PDF Document
```javascript
const pdfDoc = await PDFDocument.load(pdfBuffer);
const totalPages = pdfDoc.getPages().length;
```
- Uses `pdf-lib` to load PDF
- Gets total page count

### Step 2: Load Fields Schema
```javascript
const fieldsSchema = loadFieldsSchema(); // Loads fields.json (98 fields)
```
- Reads `fields.json` from project root
- Contains 98 field definitions organized by category

### Step 3: Create Extraction Prompt
```javascript
const prompt = createExtractionPrompt(fieldsSchema, true);
```

**Prompt Generation Process:**

1. **Categorizes Fields:**
   - Groups fields by prefix: `resident_*`, `admission_*`, `emergency_*`, `medical_*`, etc.
   - Creates structured field descriptions with types and examples

2. **Builds Field Descriptions:**
   - Includes field type (string, boolean, date, array, number)
   - Adds format specifications (e.g., "YYYY-MM-DD" for dates)
   - Includes enum options (e.g., "Male | Female | Other")
   - Adds common field name variations/aliases (e.g., "DOB" → "resident_date_of_birth")

3. **Creates Comprehensive Prompt:**
   - Instructions for visual analysis
   - Field mapping rules (best guess mapping)
   - JSON format requirements
   - Type conversion rules
   - Examples

**Key Prompt Features:**
- Visual analysis instructions (can see form layout, tables, checkboxes)
- Best guess mapping for field names that don't match exactly
- Strict JSON format requirement
- Type-specific formatting rules (dates, booleans, arrays)

### Step 4: Batch Processing

**Batch Configuration:**
- **Batch Size:** 5 pages per batch (to avoid API token limits)
- **Reason:** Large PDFs need to be split to stay within API limits

**Process for Each Batch:**

1. **Convert PDF Pages to Images:**
   ```javascript
   const imageData = await pdfPageToImage(pdfBuffer, pageIndex, 2);
   // Scale factor: 2 (for better OCR quality)
   ```
   - Converts each page to PNG image (base64 encoded)
   - Uses scale factor of 2 for better resolution
   - Creates `image_url` objects for OpenAI API

2. **Build API Request:**
   ```javascript
   messages: [
     {
       role: "system",
       content: "You are an expert at extracting structured healthcare data..."
     },
     {
       role: "user",
       content: [
         { type: "text", text: batchPrompt },
         ...batchImageMessages // Array of image_url objects
       ]
     }
   ]
   ```

3. **Call OpenAI Vision API:**
   ```javascript
   const completion = await openai.chat.completions.create({
     model: "gpt-4.1-2025-04-14",
     messages: messages,
     response_format: { type: "json_object" } // Forces JSON response
   });
   ```

4. **Parse Response:**
   - Cleans response (removes markdown code blocks)
   - Parses JSON
   - Merges with previous batch data

### Step 5: Data Merging (Multi-batch)

**Merging Strategy:**
- **Arrays:** Concatenates arrays from all batches (e.g., medications)
- **Strings:** Prefers longer/more complete values
- **Other types:** Uses latest value or overwrites

**Example:**
```javascript
if (Array.isArray(value)) {
  // Merge arrays
  allExtractedData[fieldName] = [
    ...allExtractedData[fieldName],
    ...value
  ];
} else if (typeof value === "string") {
  // Prefer longer string
  allExtractedData[fieldName] = 
    value.length > allExtractedData[fieldName].length
      ? value
      : allExtractedData[fieldName];
}
```

### Step 6: Field Validation & Schema Matching

**Validation Process:**

1. **Schema Matching:**
   - Only includes fields that exist in `fields.json`
   - Excludes any fields not in the schema
   - Logs unmatched fields (for debugging)

2. **Type Validation & Conversion:**

   **Booleans:**
   - Converts string representations: "true", "yes", "1", "checked" → `true`
   - Converts: "false", "no", "0", "unchecked" → `false`
   - Skips long text strings (>50 chars) that were incorrectly extracted as booleans

   **Numbers:**
   - Attempts to convert string numbers to actual numbers
   - Uses `Number()` conversion

   **Arrays:**
   - Validates array structure matches schema
   - Skips if expected array but got non-array

   **Dates:**
   - Validates date format
   - Ensures YYYY-MM-DD format (handled in prompt)

   **Strings:**
   - Direct assignment for matching types
   - Skips null/undefined/empty values

3. **Final Filtering:**
   - Double-checks all fields exist in `fields.json`
   - Removes any fields that somehow don't match
   - Returns only validated, schema-matched fields

---

## Key Features

### 1. **Vision-Based Extraction**
- **Not text parsing** - Uses visual analysis
- Can see form layout, tables, checkboxes
- Handles scanned PDFs and image-based forms

### 2. **Intelligent Field Mapping**
- **Best guess mapping:** Maps similar field names to schema fields
- **Variations supported:** "DOB" → "resident_date_of_birth", "SSN" → "resident_ssn"
- **Context-aware:** Uses section context (e.g., "Personal Information" → `resident_*` fields)

### 3. **Batch Processing**
- Processes large PDFs efficiently
- Merges data intelligently across batches
- Handles errors gracefully (continues if one batch fails)

### 4. **Strict Schema Validation**
- Only returns fields from `fields.json`
- Validates data types
- Converts formats automatically
- Excludes unmatched fields

### 5. **Type Conversion**
- String booleans → actual booleans
- Date strings → YYYY-MM-DD format
- Number strings → actual numbers
- Array validation

---

## Field Mapping Examples

The system uses "best guess mapping" when field labels don't match exactly:

| PDF Field Label | Mapped To Schema Field |
|----------------|----------------------|
| "DOB" or "Date of Birth" | `resident_date_of_birth` |
| "SSN" or "Social Security #" | `resident_ssn` |
| "Patient Name" or "Full Name" | `resident_full_legal_name` |
| "Admit Date" or "Date of Admission" | `admission_date` |
| "M/F" or "Gender" | `resident_gender_sex` |
| "Medicare #" | `resident_medicare_number` |
| "Medicaid #" or "DSHS ID" | `resident_medicaid_dshs_id` |

---

## Response Structure

**Example Response:**
```json
{
  "resident_full_legal_name": "John Doe",
  "resident_date_of_birth": "1950-05-15",
  "resident_gender_sex": "Male",
  "resident_ssn": "123-45-6789",
  "admission_date": "2024-01-15",
  "admission_type": "Long-term",
  "medical_primary_diagnosis": "Diabetes Type II",
  "medical_allergies": "Penicillin",
  "medication_auto_extracted_meds": [
    {
      "name": "Metformin",
      "dose": "500mg",
      "route": "Oral",
      "frequency": "Twice daily"
    }
  ]
}
```

**Characteristics:**
- Only fields from `fields.json` (98 fields)
- Proper data types (booleans, numbers, dates)
- Correct formats (YYYY-MM-DD for dates)
- Arrays properly structured

---

## Error Handling

1. **Image Conversion Errors:**
   - Warns but continues processing other pages
   - Skips failed pages

2. **API Errors:**
   - Logs error for batch
   - Continues with next batch
   - Fails only if all batches fail

3. **Parsing Errors:**
   - Logs parsing error
   - Skips that batch's data
   - Continues processing

4. **Validation Errors:**
   - Warns about type mismatches
   - Skips invalid fields
   - Returns only valid fields

---

## Performance Considerations

- **Batch Size:** 5 pages per batch (optimized for API limits)
- **Image Scale:** 2x (balance between quality and size)
- **Model:** GPT-4.1 (latest Vision API model)
- **Response Format:** JSON (faster parsing than markdown)

---

## Limitations

1. **API Token Limits:**
   - Batches of 5 pages to avoid limits
   - Large PDFs take longer

2. **Vision API Costs:**
   - More expensive than text extraction
   - But handles scanned/image PDFs

3. **Field Matching:**
   - Depends on "best guess" mapping
   - May miss fields with unusual labels
   - Requires validation in frontend

4. **Complex Structures:**
   - Arrays (like medications) work well
   - Nested objects supported via schema

---

## Configuration

**Model:** `gpt-4.1-2025-04-14`
- Latest OpenAI Vision model
- Best accuracy for form extraction

**Environment Variable Required:**
```env
OPENAI_API_KEY=sk-proj-...
```

---

## Summary

**Current Extraction Method:**
✅ **OpenAI Vision API (GPT-4.1-2025-04-14)**
- Converts PDF pages to images
- Sends images + comprehensive prompt to Vision API
- Processes in batches of 5 pages
- Merges results intelligently
- Validates against `fields.json` schema (98 fields)
- Returns only schema-matched, validated fields

**Strengths:**
- Handles scanned/image PDFs
- Visual layout understanding
- Intelligent field mapping
- Batch processing for large PDFs
- Strict schema validation

**Trade-offs:**
- More expensive than text extraction
- Slower for large PDFs (batch processing)
- Depends on OpenAI API availability












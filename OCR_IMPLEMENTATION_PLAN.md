# OCR Implementation Plan

## Clarification: When OCR is Needed

### ✅ During PDF Upload (Field Detection)
**YES - OCR can help here:**
- Better text extraction from scanned PDFs
- Detect underlines/dashes more accurately
- Handle PDFs with image content
- Improve field boundary detection

### ❌ During Form Submission (NOT NEEDED)
**NO - OCR is NOT needed here:**
- Fields are already detected and stored in database
- We just match formData keys to stored field mappings
- No need to re-detect fields every submission
- Only coordinates are used to fill the PDF

**Why?** The field mapping is stored once during upload. At submission, we just:
1. Get stored field mapping from database
2. Match formData keys to fieldNames/schemaKeys
3. Fill PDF using stored coordinates
4. No detection happens!

## Implementation Strategy

### Option 1: Tesseract OCR (Free, Open Source)
**Pros:**
- ✅ Free and open source
- ✅ Works offline
- ✅ Good for English text
- ✅ Can detect underlines/dashes

**Cons:**
- ❌ Slower than native text extraction
- ❌ Less accurate than cloud services
- ❌ Requires system dependencies

### Option 2: AWS Textract (Paid, Best Quality)
**Pros:**
- ✅ Excellent accuracy (>99%)
- ✅ Built-in form detection
- ✅ Handles complex layouts
- ✅ Cloud-based, no dependencies

**Cons:**
- ❌ Costs $0.05 per page
- ❌ Requires AWS account
- ❌ Network latency

### Recommended: Hybrid Approach with Tesseract
Use existing detection + Tesseract OCR as enhancement:
1. Try native PDF text extraction (current method)
2. If text is sparse, use Tesseract OCR
3. Combine results for better accuracy
4. No changes to submission logic (already correct!)


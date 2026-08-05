const OpenAI = require("openai");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Polyfill DOM APIs required by pdfjs-dist in Node.js environment
function setupDomPolyfills() {
  // Only setup if running in Node.js (not in browser)
  if (typeof global !== "undefined" && typeof window === "undefined") {
    // Polyfill DOMMatrix
    if (typeof global.DOMMatrix === "undefined") {
      class DOMMatrix {
        constructor(init) {
          if (init && typeof init === "string") {
            // Parse matrix string like "matrix(a, b, c, d, e, f)"
            const values = init.match(/[\d\.\-]+/g);
            if (values && values.length >= 6) {
              this.a = parseFloat(values[0]);
              this.b = parseFloat(values[1]);
              this.c = parseFloat(values[2]);
              this.d = parseFloat(values[3]);
              this.e = parseFloat(values[4]);
              this.f = parseFloat(values[5]);
            } else {
              this.a = 1;
              this.b = 0;
              this.c = 0;
              this.d = 1;
              this.e = 0;
              this.f = 0;
            }
          } else if (init && typeof init === "object") {
            this.a = init.a !== undefined ? init.a : 1;
            this.b = init.b !== undefined ? init.b : 0;
            this.c = init.c !== undefined ? init.c : 0;
            this.d = init.d !== undefined ? init.d : 1;
            this.e = init.e !== undefined ? init.e : 0;
            this.f = init.f !== undefined ? init.f : 0;
          } else {
            this.a = 1;
            this.b = 0;
            this.c = 0;
            this.d = 1;
            this.e = 0;
            this.f = 0;
          }
        }

        multiply(other) {
          return new DOMMatrix({
            a: this.a * other.a + this.c * other.b,
            b: this.b * other.a + this.d * other.b,
            c: this.a * other.c + this.c * other.d,
            d: this.b * other.c + this.d * other.d,
            e: this.a * other.e + this.c * other.f + this.e,
            f: this.b * other.e + this.d * other.f + this.f,
          });
        }

        translate(x, y) {
          const result = new DOMMatrix(this);
          result.e += x;
          result.f += y;
          return result;
        }

        scale(x, y) {
          const result = new DOMMatrix(this);
          result.a *= x;
          result.d *= y !== undefined ? y : x;
          return result;
        }

        toString() {
          return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
        }
      }

      global.DOMMatrix = DOMMatrix;
      global.DOMMatrixReadOnly = DOMMatrix;
    }

    // Polyfill DOMPoint
    if (typeof global.DOMPoint === "undefined") {
      class DOMPoint {
        constructor(x = 0, y = 0, z = 0, w = 1) {
          this.x = x;
          this.y = y;
          this.z = z;
          this.w = w;
        }
      }
      global.DOMPoint = DOMPoint;
      global.DOMPointReadOnly = DOMPoint;
    }

    // Polyfill DOMRect
    if (typeof global.DOMRect === "undefined") {
      class DOMRect {
        constructor(x = 0, y = 0, width = 0, height = 0) {
          this.x = x;
          this.y = y;
          this.width = width;
          this.height = height;
        }
        get left() {
          return this.x;
        }
        get top() {
          return this.y;
        }
        get right() {
          return this.x + this.width;
        }
        get bottom() {
          return this.y + this.height;
        }
      }
      global.DOMRect = DOMRect;
      global.DOMRectReadOnly = DOMRect;
    }
  }
}

// Setup polyfills immediately
setupDomPolyfills();

// Import pdfjs-dist using dynamic import for ES module compatibility
let pdfjsLib = null;

async function getPdfjsLib() {
  if (!pdfjsLib) {
    try {
      // Ensure polyfills are set up before import
      setupDomPolyfills();

      // Try legacy build first (recommended for Node.js)
      try {
        pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      } catch (legacyError) {
        // Fallback: try .js extension
        try {
          pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
        } catch (jsError) {
          // Final fallback: use regular build
          pdfjsLib = await import("pdfjs-dist");
        }
      }

      // For Node.js, workers are not needed and can cause issues
      // We'll skip worker configuration - pdfjs-dist will work without it in Node.js

      console.log("[PDFJS] Successfully loaded pdfjs-dist");
    } catch (error) {
      throw new Error(`Failed to import pdfjs-dist: ${error.message}`);
    }
  }
  return pdfjsLib;
}

/**
 * Extract structured text with coordinates from a PDF using pdfjs-dist
 * This method preserves native PDF coordinates without image conversion
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Array>} Array of page structures with text and coordinates
 */
async function extractPdfStructure(pdfBuffer) {
  try {
    console.log(
      "[PDF-Structure] Extracting native PDF structure with coordinates..."
    );

    // Convert Buffer to Uint8Array as required by pdfjs-dist v5
    // CRITICAL: In Node.js, Buffer IS a subclass of Uint8Array, but pdfjs-dist rejects it
    // So we MUST check for Buffer FIRST, before checking Uint8Array
    let pdfData;
    if (Buffer.isBuffer(pdfBuffer)) {
      // Buffer is a subclass of Uint8Array, but pdfjs-dist needs a true Uint8Array
      // Create a new Uint8Array and copy the Buffer's data into it
      // This ensures we get a pure Uint8Array that pdfjs-dist will accept
      pdfData = new Uint8Array(pdfBuffer.length);
      pdfData.set(pdfBuffer);
    } else if (pdfBuffer instanceof Uint8Array && !Buffer.isBuffer(pdfBuffer)) {
      // Already a Uint8Array (and not a Buffer)
      pdfData = pdfBuffer;
    } else {
      // Try to convert whatever it is to Uint8Array
      pdfData = new Uint8Array(pdfBuffer);
    }

    const pdfjs = await getPdfjsLib();
    const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      // Extract text items with their native PDF coordinates
      const items = textContent.items.map((item) => ({
        text: item.str,
        x: item.transform[4], // X coordinate in PDF points
        y: viewport.height - item.transform[5], // Y coordinate from top (PDF uses bottom-up)
        width: item.width || 0,
        height: item.height || 12,
        fontName: item.fontName || "",
        fontSize: item.transform[0] || 12,
      }));

      // Group items by lines for better analysis
      const lines = groupTextItemsByLines(items);

      pages.push({
        page_index: i - 1,
        width: viewport.width,
        height: viewport.height,
        items,
        lines,
        textContent: items.map((item) => item.text).join(" "),
      });

      console.log(
        `[PDF-Structure] Page ${i}: ${items.length} text items, ${lines.length} lines`
      );
    }

    console.log(
      `[PDF-Structure] ✅ Extracted structure from ${pages.length} pages`
    );
    return pages;
  } catch (error) {
    console.error("[PDF-Structure] Error extracting PDF structure:", error);
    throw error;
  }
}

/**
 * Group text items into logical lines based on Y coordinates
 * @param {Array} items - Text items with coordinates
 * @returns {Array} Array of line objects
 */
function groupTextItemsByLines(items) {
  if (!items.length) return [];

  // Sort items by Y coordinate (top to bottom), then X coordinate (left to right)
  const sortedItems = [...items].sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < 5) {
      // Same line if Y difference is less than 5 points
      return a.x - b.x; // Sort by X within the same line
    }
    return a.y - b.y; // Sort by Y for different lines
  });

  const lines = [];
  let currentLine = null;

  for (const item of sortedItems) {
    if (!currentLine || Math.abs(item.y - currentLine.y) > 5) {
      // Start a new line
      currentLine = {
        y: item.y,
        x: item.x,
        items: [item],
        text: item.text,
        height: item.height,
      };
      lines.push(currentLine);
    } else {
      // Add to current line
      currentLine.items.push(item);
      currentLine.text += " " + item.text;
      currentLine.x = Math.min(currentLine.x, item.x);
    }
  }

  return lines;
}

/**
 * Detect underlines and form field patterns in PDF structure
 * @param {Object} pageStructure - Page structure with text items and lines
 * @returns {Array} Array of detected field patterns
 */
function detectFieldPatterns(pageStructure) {
  const patterns = [];
  const { lines, items } = pageStructure;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.text.toLowerCase();

    // Look for common field patterns
    const fieldPatterns = [
      // Name fields
      { regex: /name\s*:?\s*[_\s-]{3,}/i, type: "text", name: "name" },
      {
        regex: /first\s*name\s*:?\s*[_\s-]{3,}/i,
        type: "text",
        name: "first_name",
      },
      {
        regex: /last\s*name\s*:?\s*[_\s-]{3,}/i,
        type: "text",
        name: "last_name",
      },

      // Date fields
      { regex: /date\s*:?\s*[_\s-]{3,}/i, type: "date", name: "date" },
      { regex: /birth\s*:?\s*[_\s-]{3,}/i, type: "date", name: "dob" },
      {
        regex: /admission\s*:?\s*[_\s-]{3,}/i,
        type: "date",
        name: "admission_date",
      },

      // Contact fields
      { regex: /phone\s*:?\s*[_\s-]{3,}/i, type: "text", name: "phone" },
      { regex: /email\s*:?\s*[_\s-]{3,}/i, type: "email", name: "email" },
      { regex: /address\s*:?\s*[_\s-]{3,}/i, type: "text", name: "address" },

      // Signature fields
      {
        regex: /signature\s*:?\s*[_\s-]{5,}/i,
        type: "text",
        name: "signature",
      },

      // Checkbox patterns
      {
        regex: /☐|□|\[\s*\]|_\s*(male|female|yes|no)/i,
        type: "checkbox",
        name: "checkbox",
      },
    ];

    for (const pattern of fieldPatterns) {
      const match = lineText.match(pattern.regex);
      if (match) {
        // Find the position where the underline or field starts
        const labelEnd =
          line.text.indexOf(":") + 1 || match.index + match[0].indexOf("_");
        const fieldStart = findFieldStartPosition(line, labelEnd);

        patterns.push({
          type: pattern.type,
          name: pattern.name,
          label: match[0].replace(/[_\s-]+$/, "").trim(),
          x: fieldStart.x,
          y: line.y,
          width: estimateFieldWidth(line, fieldStart.x),
          height: pattern.type === "checkbox" ? 15 : 20,
          page: pageStructure.page_index,
          confidence: 0.8,
        });
      }
    }
  }

  return patterns;
}

/**
 * Find the starting position of a field within a line
 * @param {Object} line - Line object with text items
 * @param {number} labelEndIndex - Index where the label ends
 * @returns {Object} Position object with x coordinate
 */
function findFieldStartPosition(line, labelEndIndex) {
  let currentIndex = 0;
  let x = line.x;

  for (const item of line.items) {
    if (currentIndex >= labelEndIndex) {
      return { x: item.x };
    }
    currentIndex += item.text.length + 1; // +1 for space
    x = item.x + (item.width || 0);
  }

  return { x: x + 10 }; // Add small offset if at end of line
}

/**
 * Estimate field width based on underlines or available space
 * @param {Object} line - Line object
 * @param {number} startX - Starting X coordinate
 * @returns {number} Estimated width in points
 */
function estimateFieldWidth(line, startX) {
  const lineText = line.text;
  const underlineMatch = lineText.match(/[_-]{3,}/);

  if (underlineMatch) {
    // Estimate based on underline length (roughly 6 points per character)
    return underlineMatch[0].length * 6;
  }

  // Default widths based on field type context
  if (lineText.toLowerCase().includes("signature")) return 250;
  if (lineText.toLowerCase().includes("address")) return 300;
  if (lineText.toLowerCase().includes("name")) return 200;
  if (lineText.toLowerCase().includes("date")) return 120;
  if (lineText.toLowerCase().includes("phone")) return 150;

  return 180; // Default width
}

/**
 * Use GPT-4o to analyze PDF structure and detect form fields
 * @param {Array} pages - Array of page structures
 * @param {string} fileName - Original file name
 * @param {Object} formSchema - Optional form schema for guidance
 * @returns {Promise<Array>} Array of detected field mappings
 */
async function detectFieldsFromStructure(pages, fileName, formSchema = null) {
  try {
    console.log("[AI-Structure] Analyzing PDF structure with GPT-4.1...");

    const systemPrompt = `You are an expert form analyzer. Given structured text with coordinates from a PDF page, identify ONLY ACTUAL FILLABLE FIELDS (dashes, underlines, checkboxes) and output a JSON object with accurate coordinates and types.

🚨 **CRITICAL - ONLY DETECT ACTUAL FILLABLE AREAS**:
- **ONLY detect fields where there are ACTUAL fillable areas**: dashes (_____), underlines (______), checkboxes (☐, □, [ ]), or blank spaces for filling
- **DO NOT create fields from descriptive text** - if text just describes something without a fillable area, skip it
- **DO NOT generate fields from sentences** - only detect where users actually write/check something
- Look for patterns like:
  * "Name: _______" → YES, detect this (has dashes/underlines)
  * "Date: ______" → YES, detect this (has dashes/underlines)
  * "☐ History & Physical" → YES, detect this (has checkbox)
  * "This agreement is between _____ and _____" → YES, detect both (has dashes)
  * "Resident has the right to..." → NO, skip this (just descriptive text, no fillable area)
  * "The facility will provide..." → NO, skip this (just descriptive text, no fillable area)
- **ONLY detect fields with actual fillable areas** - don't create fields from policy text, descriptions, or informational content
- **🚨 CHECKBOX DETECTION**: Only detect checkboxes that have actual checkbox symbols (☐, □, [ ])
  * "☐ History & Physical" → YES, detect (has checkbox symbol)
  * "History & Physical" (no checkbox) → NO, skip (just text, no fillable area)
  * If you see a checkbox list, detect each checkbox with a symbol
- **TABLE FIELDS**: Only detect table cells that have dashes/underlines for filling
  * If a table cell just has text (no dashes), skip it
- **INLINE FIELDS**: Only detect if there are actual dashes/underlines
  * "I, _____ (name)" → YES (has dashes)
  * "I, the resident" → NO (just text, no fillable area)
- Use the provided X/Y coordinates (in PDF points, 72 points per inch)
- Return coordinates that are accurate for form filling
- **FOCUS ON FILLABLE AREAS ONLY** - skip all descriptive text, policy statements, and informational content

CRITICAL - CONSISTENT FIELD NAMING:
- Use snake_case for all fieldName values (e.g., "emergency_contact_day_phone")
- For multi-word fields, ALWAYS use this order: [category]_[subcategory]_[type]
  Examples:
  * "emergency_contact_day_phone" NOT "emergency_contact_phone_day"
  * "emergency_contact_night_phone" NOT "emergency_contact_phone_night"
  * "emergency_contact_name_address" NOT "emergency_contact_address_name"
  * "preferred_hospital_phone" NOT "hospital_phone_preferred"
- Category order: emergency_contact, preferred_hospital, primary_insurance
- Type order: name, address, phone, email come LAST
- BE CONSISTENT - use the same field name every time you analyze this form!

Field object format:
{
  "fieldName": "snake_case_name",
  "label": "Human readable label",
  "page": 0,
  "x": 150,
  "y": 720,
  "width": 200,
  "height": 20,
  "type": "text|date|checkbox|textarea|dropdown|email|number"
}

COORDINATE SYSTEM - CRITICAL ACCURACY REQUIREMENTS:
- X coordinate: MUST be the X position where the FILLABLE AREA STARTS (where text should begin)
  * NOT the label position
  * For "Name: _______", find where the underline BEGINS (after "Name:" and spacing)
  * Look at the text items - find the last character of the label, then add spacing
  * Typical spacing: 10-15 points after label + colon
  * Example: If label "Name:" ends at X=100, field should start at X=115-120

- Y coordinate: MUST be the Y position of the UNDERLINE or FIELD BOTTOM EDGE (from top of page)
  * This is where the text baseline should sit
  * For underlines, Y is the Y position of the underline line itself
  * For boxed fields, Y is typically the bottom edge of the box
  * Use the Y coordinate from the text items on that line

- Width: Measure the LENGTH of the fillable area
  * For underlines, count the characters or estimate based on spacing
  * Typical widths: 150-250pt for names, 200-300pt for addresses, 100-150pt for dates
  * Look at the text items to see available space after the label

- Height: Use field height based on type
  * Text fields: 15-20pt (single line)
  * Date fields: 15-20pt
  * Textarea: 40-60pt (multi-line)
  * Checkboxes: 12-15pt

FIELD DETECTION RULES - **ONLY ACTUAL FILLABLE AREAS**:
1. Text fields: **ONLY** if there are dashes/underlines after the label
   * "Name: _______" → YES (has dashes)
   * "Name:" (no dashes) → NO (skip)
   * "agreement between _____ and _____" → YES (has dashes)
   * "agreement between parties" → NO (just text, skip)
2. Date fields: **ONLY** if there are dashes/underlines
   * "Date: ______" → YES
   * "Date:" (no dashes) → NO (skip)
3. Checkboxes: **ONLY** if there's a checkbox symbol (☐, □, [ ])
   * "☐ History & Physical" → YES
   * "History & Physical" (no checkbox) → NO (skip)
4. Email/Phone fields: **ONLY** if there are dashes/underlines
   * "Email: ______" → YES
   * "Email:" (no dashes) → NO (skip)
5. Signature fields: **ONLY** if there's a signature line or dashes
   * "Signature: ______" → YES
   * "Signature:" (no line) → NO (skip)
6. **CRITICAL**: If there's NO fillable area (no dashes, underlines, or checkboxes), DO NOT create a field
   * Descriptive text, policy statements, informational content → SKIP ALL OF THESE

CRITICAL - CHECKBOX DETECTION:
- "Male", "Female", "M", "F" followed by underscore or box → type: "checkbox"
- Gender selection options are ALWAYS checkboxes, NEVER text fields
- **LIST ITEMS WITH BOXES**: Any item in a list with a box (☐, □, [ ]) before the text → type: "checkbox"
- **RECORDS CHECKLIST**: Items like "History & Physical", "Service or Care Plan", "Current Assessment", "Current Diagnosis", "Medications", "Other records" with boxes → type: "checkbox"
- **EACH CHECKBOX IS A SEPARATE FIELD**: If you see a list like:
  ☐ History & Physical
  ☐ Service or Care Plan
  ☐ Current Assessment
  ☐ Current Diagnosis
  ☐ Complete list of current Medications
  ☐ Any other records...
  → Each item is a SEPARATE checkbox field (6 fields total)
- **DETECT ALL CHECKBOXES**: If you find ANY list with boxes/checkmarks, detect EVERY item as a separate checkbox field
- **DON'T SKIP CHECKBOXES**: Checkboxes are often in lists - detect ALL of them, not just the first few

FIELD NAMING:
- Convert labels to snake_case: "First Name" → "first_name"
- Remove special characters and spaces
- Use descriptive names based on context

COORDINATE CALCULATION WORKFLOW:
1. Identify the label text items and their X positions
2. Find the END of the label (last character X + width)
3. Add spacing (10-15pt) to get field start X
4. Use the Y coordinate from the text items on that line for field Y
5. Estimate width based on available space or underline length

**CRITICAL - MULTIPLE OCCURRENCES**:
- If you see the same field name multiple times (e.g., "Name", "Date", "Signature"), detect ALL occurrences
- Each occurrence should have a SEPARATE entry in the "fields" array
- Each occurrence will have DIFFERENT coordinates (x, y)
- Example: If "Resident Name" appears 3 times at (100, 200), (100, 300), (100, 400), return 3 separate entries:
  [
    { "fieldName": "resident_name", "x": 100, "y": 200, ... },
    { "fieldName": "resident_name", "x": 100, "y": 300, ... },
    { "fieldName": "resident_name", "x": 100, "y": 400, ... }
  ]
- **Don't deduplicate by field name - include ALL occurrences with their unique coordinates!**
- **If a field appears 5 times, return 5 entries - all must be filled during prefilling!**

Return ONLY a valid JSON object with a "fields" array.`;

    const allDetectedFields = [];

    // Process each page
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];

      console.log(
        `[AI-Structure] Processing page ${pageIndex + 1}/${pages.length}...`
      );

      // First, try pattern-based detection for quick wins
      const patternFields = detectFieldPatterns(page);

      // Prepare structured data for GPT analysis
      // CRITICAL: Include ALL text items, not just first 50, to find all fields
      // Include more items for better field detection, especially for complex forms
      const maxItems = Math.min(page.items.length, 200); // Increase from 50 to 200
      const pageData = {
        page_index: pageIndex,
        page_number: pageIndex + 1, // 1-based page number for clarity
        dimensions: { width: page.width, height: page.height },
        lines: page.lines.map((line) => ({
          y: line.y,
          x: line.x,
          text: line.text,
          height: line.height,
          items_count: line.items?.length || 0,
        })),
        // Include ALL text items for accurate coordinate detection
        text_items: page.items.slice(0, maxItems).map((item) => ({
          text: item.text,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize || 12,
        })),
        total_items: page.items.length,
        total_lines: page.lines.length,
      };

      const userPrompt = `Analyze this structured PDF page data and identify ONLY ACTUAL FILLABLE FIELDS (dashes, underlines, checkboxes).

File: ${fileName}
Page: ${pageIndex + 1} of ${pages.length}
Dimensions: ${page.width}x${page.height} points

IMPORTANT: This is page ${
        pageIndex + 1
      }. Each page has its own coordinate system starting from (0,0) at top-left.
Y coordinates are relative to THIS PAGE'S TOP, not the entire document.

🚨 **CRITICAL RULE**: ONLY detect fields where there are ACTUAL fillable areas (dashes, underlines, checkboxes). DO NOT create fields from descriptive text!

STRUCTURED DATA:
${JSON.stringify(pageData, null, 2)}

TASK: Scan the page and find ONLY fields with actual fillable areas:

1. TEXT INPUT FIELDS - **ONLY IF DASHES/UNDERLINES EXIST**:
   - "Name: _______" → YES (has dashes) → detect
   - "Name:" (no dashes) → NO (skip)
   - "Address: ______" → YES (has dashes) → detect
   - "The resident has the right to..." → NO (just text, skip)
   - Inline fields: "between _____ and _____" → YES (has dashes) → detect both
   - Inline text: "between parties" → NO (no dashes, skip)

2. CHECKBOX FIELDS - **ONLY IF CHECKBOX SYMBOL EXISTS**:
   - "☐ History & Physical" → YES (has ☐) → detect
   - "History & Physical" (no checkbox) → NO (skip)
   - "□ Service or Care Plan" → YES (has □) → detect
   - "Service or Care Plan" (no checkbox) → NO (skip)
   - **ONLY detect checkboxes with actual symbols** - don't create fields from plain text lists

3. TABLE FIELDS - **ONLY IF CELLS HAVE DASHES/UNDERLINES**:
   - Table cell with "_______" → YES → detect
   - Table cell with just text → NO (skip)

4. DATE & SIGNATURE FIELDS - **ONLY IF DASHES/LINES EXIST**:
   - "Date: ______" → YES → detect
   - "Date:" (no dashes) → NO (skip)
   - "Signature: ______" → YES → detect
   - "Signature:" (no line) → NO (skip)

**SKIP ALL OF THESE**:
- Descriptive text (e.g., "The facility will provide...")
- Policy statements (e.g., "Residents have the right to...")
- Informational content (e.g., "This agreement is subject to...")
- Labels without fillable areas (e.g., "Section 1: Resident Information" with no dashes)
- Any text that doesn't have dashes, underlines, or checkboxes

**ONLY DETECT WHERE USERS ACTUALLY FILL SOMETHING IN!**

COORDINATE CALCULATION - STEP BY STEP (USE ACTUAL PDF COORDINATES):
For each field you detect:
1. Find the label text items (e.g., "Name:", "Date:") OR inline text (e.g., "I,", "of") in the text_items array
2. Identify the LAST character of the label/inline text: lastLabelX = item.x + item.width
3. Look for the NEXT text item or underline pattern on the same line (same Y coordinate ±3pt for precision)
4. Calculate field start X using ACTUAL spacing from PDF:
   - **CRITICAL**: If underline/dash item found: fieldX = underlineItem.x (use ACTUAL underline start position)
   - **CRITICAL**: If gap detected: fieldX = lastLabelX + actualGap (MEASURE the gap from text items, don't estimate)
   - **CRITICAL**: For inline fields: fieldX = position right after the preceding text (comma, space, etc.)
   - If no next item: fieldX = lastLabelX + measuredGap (MEASURE from lines data, don't use fixed values)
5. Use the EXACT Y coordinate from the UNDERLINE/DASH text items (not the label!)
   - **CRITICAL**: For underlines, use Y coordinate of the underline/dash item itself
   - **CRITICAL**: For inline fields, use Y coordinate of the underline/dash within the sentence
   - **ACCURACY**: Y must match the underline position exactly (±1pt tolerance)
6. Calculate width from actual spacing:
   - **CRITICAL**: If underline found: width = underlineItem.width (use ACTUAL underline width)
   - **CRITICAL**: If next item found: width = nextItem.x - fieldX (from actual positions)
   - Otherwise: estimate based on available space, but prefer actual measurements

EXAMPLE WITH ACTUAL COORDINATES:
If you see text items: [
  {"text":"Name:", "x":100, "y":720, "width":30},
  {"text":"___", "x":145, "y":720, "width":150}
]
- Label "Name:" ends at X=130 (100+30)
- Underline starts at X=145 (from actual text item)
- ACTUAL spacing = 145 - 130 = 15pt (use this, not estimate!)
- Field X = 145 (use actual underline start)
- Y coordinate = 720 (from text items)
- Width = 150 (from underline width, not estimate)

CRITICAL RULES:
- ALWAYS use actual coordinates from text_items when available
- NEVER estimate spacing if you can measure it from text items
- Calculate gaps: gap = nextItem.x - (currentItem.x + currentItem.width)
- X must be where FILLABLE AREA starts (underline start, not label start)
- Measure actual spacing from PDF, don't use fixed values like "10-15pt"

${
  formSchema
    ? `\nEXPECTED FIELDS (for reference): ${formSchema.fields
        ?.map((f) => f.name || f.label)
        .join(", ")}`
    : ""
}

🚨 **FINAL REMINDER - ONLY ACTUAL FILLABLE AREAS**:
- **ONLY detect checkboxes with actual symbols** (☐, □, [ ])
  * "☐ History & Physical" → YES → detect
  * "History & Physical" (no checkbox) → NO → skip
- **ONLY detect text fields with dashes/underlines**
  * "Name: _______" → YES → detect
  * "Name:" (no dashes) → NO → skip
- **SKIP all descriptive text, policy statements, and informational content**
- **ONLY detect where users actually fill something in!**

Return JSON with detected fields:`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1, // Lower temperature for consistent, accurate field detection
          max_tokens: 4000,
          response_format: { type: "json_object" },
        });

        const aiResponse = response.choices[0].message.content;
        const parsed = JSON.parse(aiResponse);
        const aiFields = parsed.fields || [];

        // Combine pattern-based and AI-detected fields
        const combinedFields = [...patternFields];

        // Add AI fields that don't overlap with pattern fields
        for (const aiField of aiFields) {
          const hasOverlap = combinedFields.some(
            (pf) =>
              Math.abs(pf.x - aiField.x) < 20 && Math.abs(pf.y - aiField.y) < 10
          );

          if (!hasOverlap) {
            combinedFields.push({
              ...aiField,
              page: pageIndex,
              confidence: 0.9,
            });
          }
        }

        allDetectedFields.push(...combinedFields);
        console.log(
          `[AI-Structure] Page ${pageIndex + 1}: Found ${
            combinedFields.length
          } fields`
        );
      } catch (error) {
        console.error(
          `[AI-Structure] Error processing page ${pageIndex + 1}:`,
          error
        );
        // Fall back to pattern-based detection only
        allDetectedFields.push(...patternFields);
      }

      // Small delay to avoid rate limits
      if (pageIndex < pages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    console.log(
      `[AI-Structure] ✅ Total detected fields: ${allDetectedFields.length}`
    );
    return allDetectedFields;
  } catch (error) {
    console.error("[AI-Structure] Error in field detection:", error);
    throw error;
  }
}

/**
 * Refine AI-detected fields using form schema (same as existing implementation)
 * @param {Array} detectedFields - Fields detected by AI
 * @param {Object} formSchema - Form schema with expected fields
 * @returns {Array} Refined field mappings
 */
function refineFieldsWithSchema(detectedFields, formSchema) {
  if (!formSchema || !formSchema.fields) {
    return detectedFields.map((field) => ({ ...field, schemaKey: null }));
  }

  // Filter and validate schema fields
  const schemaFields = formSchema.fields
    .filter((f) => f && (f.name || f.label)) // Only process fields with name or label
    .map((f) => ({
      key: f.name || f.label || "unknown",
      label: f.label || f.name || "",
      type: f.type || "text",
      normalized: [
        (f.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        (f.label || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        (f.name || "").toLowerCase().replace(/[^a-z0-9]/g, "_"),
        (f.label || "").toLowerCase().replace(/[^a-z0-9]/g, "_"),
      ].filter((n) => n.length > 0), // Remove empty normalized strings
    }));

  // Filter out invalid detected fields and log warnings
  const validDetectedFields = detectedFields.filter((detected) => {
    if (!detected) {
      console.warn("[AI-Coordinate] Skipping null/undefined detected field");
      return false;
    }
    if (!detected.fieldName && !detected.label) {
      console.warn(
        "[AI-Coordinate] Skipping field with no fieldName or label:",
        JSON.stringify(detected)
      );
      return false;
    }
    return true;
  });

  console.log(
    `[AI-Coordinate] Processing ${validDetectedFields.length}/${detectedFields.length} valid detected fields`
  );

  // Track used schemaKeys to prevent duplicates
  const usedSchemaKeys = new Set();

  // Special rules: fields that should NEVER match to certain schemaKeys
  const blockList = {
    nickname: ["name", "resident_name"],
    resident_nickname: ["name", "resident_name"],
    primary_insurance_name: ["name", "resident_name"], // Should match primary_insurance
    signed_name: ["name", "resident_name"], // Should match authorization_signature
    signed_date: ["name", "resident_name"], // Should match authorization_date
  };

  // Use semantic normalization for consistent matching
  const {
    normalizeFieldNameSemantic,
  } = require("../../utils/fieldNormalization.util");

  const refinedFields = validDetectedFields.map((detected) => {
    // Safely handle missing fieldName or label
    // Use semantic normalization for better matching (handles word order variations)
    const detectedFieldName = detected.fieldName || "";
    const detectedNormSemantic =
      normalizeFieldNameSemantic(detectedFieldName) ||
      detectedFieldName.toLowerCase();
    const detectedNorm = detectedNormSemantic
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const detectedLabel = (detected.label || detected.fieldName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const fieldNameLower = (detected.fieldName || "").toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    // Check if this field has blocked schemaKeys
    const blocked = blockList[fieldNameLower] || [];

    for (const schemaField of schemaFields) {
      // Skip if this schemaKey is already used (prevent duplicates)
      if (usedSchemaKeys.has(schemaField.key)) {
        continue;
      }

      // Skip if this schemaKey is blocked for this field
      if (blocked.includes(schemaField.key)) {
        continue;
      }

      let score = 0;

      // Normalize schema field name semantically for comparison
      const schemaNormSemantic =
        normalizeFieldNameSemantic(schemaField.key) ||
        schemaField.key.toLowerCase();
      const schemaNorm = schemaNormSemantic.replace(/[^a-z0-9]/g, "");

      // Exact match (highest priority) - using semantic normalization
      if (
        detectedNorm === schemaNorm ||
        schemaField.normalized.includes(detectedNorm)
      ) {
        score = 100;
      }
      // Check for compound field matches (e.g., "primary_insurance" should match "primary_insurance_name")
      else if (
        detectedNorm.includes(schemaNorm) ||
        detectedNorm.includes(
          schemaField.key.toLowerCase().replace(/[^a-z0-9]/g, "")
        )
      ) {
        score = 90; // High score for compound matches
      }
      // Partial match
      else if (
        schemaField.normalized.some(
          (norm) => norm.includes(detectedNorm) || detectedNorm.includes(norm)
        )
      ) {
        // Lower score if field contains extra qualifiers
        const hasQualifier =
          fieldNameLower.includes("resident_") ||
          fieldNameLower.includes("primary_") ||
          fieldNameLower.includes("signed_");
        score = hasQualifier ? 70 : 80;
      }
      // Label-based matching
      else if (
        schemaField.normalized.some(
          (norm) => norm.includes(detectedLabel) || detectedLabel.includes(norm)
        )
      ) {
        score = 60;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = schemaField;
      }
    }

    const schemaKey = bestMatch && bestScore >= 50 ? bestMatch.key : null;

    // Mark this schemaKey as used
    if (schemaKey) {
      usedSchemaKeys.add(schemaKey);
    }

    const finalType =
      bestMatch && bestScore >= 80 ? bestMatch.type : detected.type || "text";

    // Ensure fieldName exists, fallback to label
    const finalFieldName =
      detected.fieldName || detected.label || "unknown_field";

    if (schemaKey) {
      console.log(
        `[MAPPING] Matched "${finalFieldName}" → "${schemaKey}" (score: ${bestScore})`
      );
    } else {
      console.log(
        `[MAPPING] No match found for "${finalFieldName}" (best score: ${bestScore}) - will retry after schema generation`
      );
    }

    return {
      ...detected,
      fieldName: finalFieldName, // Ensure fieldName is always set
      schemaKey,
      type: finalType,
    };
  });

  return refinedFields;
}

/**
 * Generate field mapping with coordinate-accurate AI detection
 * @param {Object} params - Parameters
 * @param {Buffer} params.pdfBuffer - PDF file buffer
 * @param {string} params.fileName - File name
 * @param {string} params.tenantId - Tenant ID
 * @param {Object} [params.formSchema] - Optional form schema
 * @returns {Promise<Array>} Field mapping array
 */
async function generateFieldMappingWithCoordinateAI({
  pdfBuffer,
  fileName,
  tenantId,
  formSchema = null,
}) {
  try {
    console.log(
      `[AI-Coordinate] Starting coordinate-accurate field detection for ${fileName}...`
    );

    // Get form schema if not provided
    if (!formSchema) {
      const prisma = require("../../lib/prisma");
      const schemas = await prisma.formSchema.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      });

      if (schemas.length > 0) {
        formSchema = schemas[0].schemaJson;
        console.log("[AI-Coordinate] Using existing form schema for guidance");
      }
    }

    // Step 1: Extract PDF structure with native coordinates
    const pages = await extractPdfStructure(pdfBuffer);

    // Step 2: Detect fields using structure analysis + GPT-4o
    let detectedFields = await detectFieldsFromStructure(
      pages,
      fileName,
      formSchema
    );

    // Step 3: Refine with schema matching
    detectedFields = refineFieldsWithSchema(detectedFields, formSchema);

    // Step 4: Validate and clean up coordinates using enhanced validator
    const {
      validateAndRefineCoordinates,
    } = require("../pdf/pdfStructureAnalyzer.service");

    const validatedFields = detectedFields
      .filter(
        (field) =>
          field.fieldName &&
          typeof field.x === "number" &&
          typeof field.y === "number" &&
          field.x >= 0 &&
          field.y >= 0
      )
      .map((field) => {
        const baseField = {
          fieldName: field.fieldName,
          label: field.label || field.fieldName,
          page: field.page || 0,
          x: Math.round(field.x * 100) / 100, // Round to 2 decimal places
          y: Math.round(field.y * 100) / 100,
          width: Math.round((field.width || 200) * 100) / 100,
          height: Math.round((field.height || 20) * 100) / 100,
          type: field.type || "text",
          schemaKey: field.schemaKey || null,
          confidence: field.confidence || 0.8,
        };

        // Use page dimensions for validation (if available)
        const page = pages[baseField.page];
        if (page && page.width && page.height) {
          return validateAndRefineCoordinates(
            [baseField],
            page.width,
            page.height
          )[0];
        }

        return baseField;
      });

    console.log(
      `[AI-Coordinate] ✅ Generated ${validatedFields.length} coordinate-accurate field mappings`
    );

    // Log sample fields for debugging
    if (validatedFields.length > 0) {
      console.log(
        "[AI-Coordinate] Sample fields:",
        validatedFields
          .slice(0, 3)
          .map(
            (f) => `${f.fieldName} at (${f.x}, ${f.y}) ${f.width}x${f.height}`
          )
      );
    }

    return validatedFields;
  } catch (error) {
    console.error(
      "[AI-Coordinate] Error generating coordinate-accurate field mapping:",
      error
    );
    throw error;
  }
}

/**
 * Detect form fields using coordinate-accurate method (main export)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Original file name
 * @param {Object} formSchema - Optional form schema to guide detection
 * @returns {Promise<Array>} Array of detected field mappings
 */
async function detectFormFieldsWithCoordinateAI(
  pdfBuffer,
  fileName,
  formSchema = null
) {
  return generateFieldMappingWithCoordinateAI({
    pdfBuffer,
    fileName,
    tenantId: null, // Will be provided by caller
    formSchema,
  });
}

module.exports = {
  extractPdfStructure,
  detectFieldsFromStructure,
  generateFieldMappingWithCoordinateAI,
  detectFormFieldsWithCoordinateAI,
  refineFieldsWithSchema,
};

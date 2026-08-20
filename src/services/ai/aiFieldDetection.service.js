const { PDFDocument } = require("pdf-lib");
const OpenAI = require("openai");
const sharp = require("sharp");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Convert PDF page to base64 image using pdfjs-dist directly (fallback method)
 * This method works with Node.js 18+ and doesn't require process.getBuiltinModule
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} pageIndex - Page index to convert (0-based)
 * @param {number} scale - Scale factor for rendering (default 2 for better quality)
 * @returns {Promise<Object>} Object with base64 image, width, height, pageIndex, and scale
 */
async function pdfPageToImageWithPdfjs(pdfBuffer, pageIndex = 0, scale = 2) {
  try {
    const { createCanvas } = require("canvas");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Convert Buffer to Uint8Array
    const pdfData = new Uint8Array(pdfBuffer.length);
    pdfData.set(pdfBuffer);

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;

    if (pageIndex < 0 || pageIndex >= pdfDocument.numPages) {
      throw new Error(
        `Page ${pageIndex} does not exist. PDF has ${pdfDocument.numPages} pages.`
      );
    }

    // Get the page (pdfjs uses 1-based indexing)
    const page = await pdfDocument.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Convert canvas to PNG buffer
    const imageBuffer = canvas.toBuffer("image/png");
    const base64Image = imageBuffer.toString("base64");

    // Get dimensions
    const width = viewport.width;
    const height = viewport.height;

    console.log(
      `[AI-Vision] ✅ Converted page ${pageIndex} to image using pdfjs-dist: ${width}x${height} (scale ${scale})`
    );

    return {
      base64: base64Image,
      width,
      height,
      pageIndex,
      scale,
    };
  } catch (error) {
    console.error(
      "[AI-Field-Detection] Error converting PDF to image with pdfjs-dist:",
      error
    );
    throw error;
  }
}

/**
 * Convert PDF page to base64 image for OpenAI Vision API
 * Uses pdf-to-img library for simple, reliable PDF to image conversion
 * Falls back to pdfjs-dist directly if pdf-to-img fails (e.g., Node.js version issues)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} pageIndex - Page index to convert (0-based)
 * @param {number} scale - Scale factor for rendering (default 2 for better quality)
 * @returns {Promise<Object>} Object with base64 image, width, height, pageIndex, and scale
 */
async function pdfPageToImage(pdfBuffer, pageIndex = 0, scale = 2) {
  try {
    // Try pdf-to-img first (requires Node.js 20+)
    const { pdf } = await import("pdf-to-img");

    // Convert buffer to data URL format that pdf-to-img accepts
    const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString(
      "base64"
    )}`;

    // Load PDF document
    const document = await pdf(dataUrl, { scale });

    // Get the specific page (pdf-to-img getPage uses 1-based indexing)
    const pageBuffer = await document.getPage(pageIndex + 1);

    if (!pageBuffer) {
      throw new Error(
        `Page ${pageIndex} does not exist. PDF has ${document.length} pages.`
      );
    }

    // Get image dimensions from the PNG buffer using sharp
    const imageMetadata = await sharp(pageBuffer).metadata();
    const width = imageMetadata.width || 800;
    const height = imageMetadata.height || 1100;

    // Convert buffer to base64
    const base64Image = pageBuffer.toString("base64");

    console.log(
      `[AI-Vision] ✅ Converted page ${pageIndex} to image using pdf-to-img: ${width}x${height} (scale ${scale})`
    );

    return {
      base64: base64Image,
      width,
      height,
      pageIndex,
      scale,
    };
  } catch (error) {
    // Check if error is related to process.getBuiltinModule (Node.js version issue)
    const isNodeVersionError =
      error.message?.includes("process.getBuiltinModule") ||
      error.message?.includes("getBuiltinModule is not a function");

    if (isNodeVersionError) {
      console.warn(
        `[AI-Field-Detection] pdf-to-img failed due to Node.js version compatibility. Falling back to pdfjs-dist directly...`
      );
      try {
        // Fallback to pdfjs-dist with canvas (works with Node.js 18+)
        return await pdfPageToImageWithPdfjs(pdfBuffer, pageIndex, scale);
      } catch (fallbackError) {
        console.error(
          "[AI-Field-Detection] Both pdf-to-img and pdfjs-dist fallback failed:",
          fallbackError
        );
        // Final fallback: return dimensions only
        try {
          const pdfDoc = await PDFDocument.load(pdfBuffer);
          const pages = pdfDoc.getPages();
          const page = pages[pageIndex];
          const { width, height } = page.getSize();
          return { width, height, pageIndex, base64: null };
        } catch (finalFallbackError) {
          throw error; // Throw original error
        }
      }
    } else {
      // Other errors - try fallback anyway
      console.warn(
        `[AI-Field-Detection] pdf-to-img failed: ${error.message}. Trying fallback...`
      );
      try {
        return await pdfPageToImageWithPdfjs(pdfBuffer, pageIndex, scale);
      } catch (fallbackError) {
        console.error("[AI-Field-Detection] Error converting PDF to image:", error);
        // Final fallback: return dimensions only
        try {
          const pdfDoc = await PDFDocument.load(pdfBuffer);
          const pages = pdfDoc.getPages();
          const page = pages[pageIndex];
          const { width, height } = page.getSize();
          return { width, height, pageIndex, base64: null };
        } catch (finalFallbackError) {
          throw error; // Throw original error
        }
      }
    }
  }
}

/**
 * Extract text from a specific page of PDF
 */
async function extractTextFromPdfPage(pdfBuffer, pageIndex) {
  const { extractText } = require("pdf-parse");
  try {
    // Parse PDF to get text from specific page
    const pdfData = await extractText(pdfBuffer);
    // Split by page breaks (approximate, since pdf-parse doesn't give exact page boundaries)
    const lines = pdfData.split("\n").filter(Boolean);
    return lines.join("\n");
  } catch (error) {
    console.error(
      "[AI-Field-Detection] Error extracting text from page:",
      error
    );
    return "";
  }
}

/**
 * Use OpenAI Vision API to detect form fields in PDF (PROCESS PAGE BY PAGE)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Original file name
 * @param {Object} formSchema - Optional form schema to guide detection
 * @returns {Promise<Array>} Array of detected field mappings
 */
async function detectFormFieldsWithAI(pdfBuffer, fileName, formSchema = null) {
  try {
    console.log(
      "[AI-Field-Detection] Starting AI-powered field detection with PAGE-BY-PAGE processing..."
    );

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    console.log(
      `[AI-Field-Detection] PDF has ${totalPages} page(s) - processing each page separately`
    );

    // Get page dimensions for each page
    const pageInfo = pages.map((page, index) => {
      const { width, height } = page.getSize();
      return { page: index, width, height };
    });

    // Extract text content from entire PDF for context
    const pdfText = await extractTextFromPdf(pdfBuffer);

    // Split PDF text into approximate page chunks
    const textLines = pdfText.split("\n").filter(Boolean);
    const linesPerPage = Math.ceil(textLines.length / totalPages);

    // Process each page separately
    const allDetectedFields = [];

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const startLine = pageIndex * linesPerPage;
      const endLine = Math.min(
        (pageIndex + 1) * linesPerPage,
        textLines.length
      );
      const pageText = textLines.slice(startLine, endLine).join("\n");

      console.log(
        `[AI-Field-Detection] Processing page ${pageIndex + 1}/${totalPages} (${
          pageText.length
        } chars)`
      );

      try {
        const pageFields = await detectFieldsOnPage({
          pageIndex,
          pageText,
          pageInfo: pageInfo[pageIndex],
          fileName,
          formSchema,
          pdfBuffer, // Pass PDF buffer for Vision API
        });

        if (pageFields && pageFields.length > 0) {
          allDetectedFields.push(...pageFields);
          console.log(
            `[AI-Field-Detection] ✅ Page ${pageIndex + 1}: Found ${
              pageFields.length
            } fields`
          );
        }
      } catch (error) {
        console.error(
          `[AI-Field-Detection] ❌ Page ${pageIndex + 1} failed:`,
          error.message
        );
        // Continue with other pages
      }

      // Small delay to avoid rate limits
      if (pageIndex < totalPages - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `[AI-Field-Detection] 🎉 TOTAL: Detected ${allDetectedFields.length} fields across ${totalPages} pages`
    );

    // Deduplicate by fieldName (normalized)
    const seen = new Map();
    const deduplicatedFields = [];

    for (const field of allDetectedFields) {
      const normalizedName = (field.fieldName || "").toLowerCase().trim();
      if (!seen.has(normalizedName)) {
        seen.set(normalizedName, true);
        deduplicatedFields.push(field);
      } else {
        // Keep the first occurrence, skip duplicates
      }
    }

    console.log(
      `[AI-Field-Detection] 🔄 After deduplication: ${deduplicatedFields.length} unique fields`
    );
    return deduplicatedFields;
  } catch (error) {
    console.error("[AI-Field-Detection] Error in field detection:", error);
    throw error;
  }
}

/**
 * Detect fields on a single page using Vision API
 */
async function detectFieldsOnPage({
  pageIndex,
  pageText,
  pageInfo,
  fileName,
  formSchema,
  pdfBuffer,
}) {
  try {
    // Try to use Vision API with actual PDF image
    let useVision = false;
    let imageData = null;

    try {
      imageData = await pdfPageToImage(pdfBuffer, pageIndex, 2);
      if (imageData && imageData.base64) {
        useVision = true;
        console.log(
          `[AI-Vision] ✅ Using Vision API for page ${pageIndex} - will analyze actual PDF image`
        );
      }
    } catch (visionError) {
      console.warn(
        `[AI-Vision] Failed to convert PDF to image, falling back to text-only: ${visionError.message}`
      );
    }

    // Create prompt for GPT-4 (build dynamically based on whether we have vision)
    const analysisMethod = useVision
      ? "the VISUAL IMAGE of"
      : "the text content from";
    const coordinateInstructions = useVision
      ? `The image dimensions are ${imageData.width}x${imageData.height} pixels (scale ${imageData.scale}x) - calculate coordinates by converting pixel positions to points (divide by ${imageData.scale})`
      : "Calculate coordinates based on text line positions";

    const analysisDetails = useVision
      ? `VISUAL ANALYSIS - CRITICAL FOR ACCURATE PLACEMENT:
- Look at the ACTUAL PDF image provided
- Find horizontal UNDERLINES (dash lines) where text should be written
- For each field, identify:
  1. Where the UNDERLINE STARTS (X coordinate) - this is where text begins
  2. Where the UNDERLINE IS LOCATED (Y coordinate) - this is where text baseline sits
  3. The WIDTH of the underline - this is the field width
- The Y coordinate MUST be the Y position of the UNDERLINE itself (the line, not above or below it)
- The X coordinate MUST be where the underline BEGINS (after any label like "Date:" or "Signature:")
- Measure EXACT pixel positions in the image, then convert: divide by ${imageData.scale} to get points
- Example: If underline starts at pixel (400, 300) and scale is 2, then X=200pts, Y=150pts
- The height should be small (15-20pts) - just enough for the text to sit on the line`
      : `TEXT-BASED ANALYSIS - CRITICAL FOR ACCURATE PLACEMENT:
- Find labels like "Date:", "Name:", "Signature:" followed by UNDERLINES
- For each field:
  1. X coordinate = Where the UNDERLINE STARTS (after the label, not including the label)
  2. Y coordinate = Where the UNDERLINE IS LOCATED (the Y position of the underline line itself)
  3. Width = Length of the underline from start to end
- Y coordinate is NOT where the field area starts - it's where the UNDERLINE is (the line position)
- Each line of text with an underline is roughly 12-14 points high
- The underline is typically at the BOTTOM of the text line
- Calculate Y: Find the line number where underline appears, then Y = ~50 + (lineNum * 14) + 10 (for underline position)`;

    const systemPrompt = `You are an expert at analyzing form documents and identifying fillable field locations.
Your task is to analyze ONE page of a PDF form and identify where form fields should be placed.

CRITICAL INSTRUCTIONS:
- Analyze ${analysisMethod} the page provided
- Identify ALL fillable fields on THIS page (don't skip any)
- This page may have 5-50 fields depending on the form
- Return up to 50 fields if needed for this page

Return a JSON object with a "fields" array containing field objects with this structure:
{
  "fields": [
    {
      "fieldName": "snake_case_field_name",
      "label": "Human readable label",
      "page": 0,
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 20,
      "type": "text|number|date|checkbox|dropdown|textarea"
    }
  ]
}

COORDINATE SYSTEM:
- X coordinate: Distance from LEFT edge of page in POINTS
- Y coordinate: Distance from TOP edge of page in POINTS
- PDF page is typically 612pts wide x 792pts tall (8.5" x 11")
- Page dimensions: Width=${pageInfo.width}pts, Height=${pageInfo.height}pts
- ${coordinateInstructions}

FIELD TYPE DETECTION RULES:
- Small square boxes (☐) next to labels = type: "checkbox"
- Lines after "Name:", "Address:", "Nickname:", etc. = type: "text"
- Lines after "Date:", "DOB:", "Admission Date:", etc. = type: "date"
- Lines after "Amount:", "Fee:", "Rate:", "SSN:", "Phone:", etc. = type: "text" (or number if clearly numeric)
- Large boxes or multiple lines for descriptions = type: "textarea"
- Dropdown arrows or option lists = type: "dropdown"
- Table cells with underlines = type: "text" (unless specifically date/number fields)

COORDINATE DETECTION STRATEGY:
${analysisDetails}

FIELD NAMING GUIDELINES:
- Convert labels to snake_case: "Resident Name" → "name", "Emergency Contact" → "emergency_contact_name"
- For dates: "Date of Birth" → "dob", "Admission Date" → "admission_date"
- For signatures: "Provider Signature" → "provider_signature"
- For addresses: "Home Address" → "address", "Emergency Contact Address" → "emergency_contact_address"
- For phone numbers: "Phone" → "phone", "Phone # Day" → "phone_day", "Phone # Night" → "phone_night"
- For medical info: "Pharmacy" → "pharmacy", "Preferred Hospital" → "preferred_hospital"
- For table fields: Use descriptive names like "physician_name", "physician_phone_day", "dentist_name", etc.
- For checkboxes: Use the item name: "Male" → "male", "Female" → "female"
- Keep names concise but descriptive

SIZING GUIDELINES:
- Checkboxes: width=15, height=15, position at checkbox center
- Short text fields: width=150-200pts, height=18-20pts
- Long text fields (names, addresses): width=250-350pts, height=18-20pts
- Date fields: width=100-150pts, height=18-20pts
- Signature fields: width=200-300pts, height=18-20pts
- Textarea fields: width=300-500pts, height=40-100pts
- Number fields: width=80-120pts, height=18-20pts

IMPORTANT:
- Set page number to ${pageIndex} (this specific page)
- Return ONLY valid JSON object, no explanations
- Analyze the ACTUAL form content, don't assume any specific form type`;

    // Build user prompt
    let userPrompt = `Analyze this PDF form and identify ALL fillable fields - BE THOROUGH!

PDF: ${fileName}
Page: ${pageIndex + 1} (analyze ONLY this page)
Page Dimensions: Width=${pageInfo.width}pts, Height=${pageInfo.height}pts

⚠️ CRITICAL: This form may have 20-50+ fields. DO NOT SKIP ANY FIELDS!

TASK: Scan the ENTIRE page systematically and identify EVERY fillable field by looking for:

1. TEXT INPUT FIELDS:
   - Underlines after labels (Name:___, Address:___, etc.)
   - Blank lines for writing
   - Empty spaces after labels

2. CHECKBOXES:
   - Small squares (☐ or □) next to items/options
   - Checkbox lists (CONTACT LENSES ☐, DENTURES ☐, HEARING AID ☐, etc.)
   - Multiple choice options

3. TABLE FIELDS:
   - Each cell in a table that needs filling
   - Table rows with columns (Bathrobe|__, Belt|__, Blouse|__, etc.)
   - CLOTHING LIST tables with NUMBER|ITEM|DESCRIPTION columns

4. DATE FIELDS:
   - Any field with "Date", "DOB", "Admission", etc.
   - Date signature fields

5. SIGNATURE FIELDS:
   - Provider/Manager signature lines
   - Resident/Guardian signature lines

6. LARGE TEXT AREAS:
   - Multi-line boxes
   - Description areas
   - Notes sections

7. OTHER FIELDS:
   - Dropdown indicators
   - Number inputs
   - Money/Amount fields

⚠️ IMPORTANT SCANNING STRATEGY:
- Start from TOP of page, scan down systematically
- Check LEFT side, then RIGHT side
- Examine TABLES row by row
- Don't skip checkbox lists - each checkbox is a separate field
- Include ALL fields in tables, even if they're empty

ANALYSIS APPROACH:`;

    if (useVision && imageData.base64) {
      // Use Vision API with image
      userPrompt += `
VISUAL ANALYSIS - CRITICAL INSTRUCTIONS:
You are looking at a PDF form image. Your job is to find EVERY fillable field and measure its EXACT position.

STEP 1: SCAN THE ENTIRE IMAGE
- Look at every section: header, body, tables, signature areas
- Identify different types of fillable areas:
  * UNDERLINES (___________) after labels like "Name:", "Date:", "Address:"
  * CHECKBOXES (small squares ☐) next to items
  * TABLE CELLS with underlines or blank spaces
  * LARGE TEXT AREAS (big boxes for multiple lines)
  * SIGNATURE LINES (longer underlines for signatures)

STEP 2: MEASURE EXACT COORDINATES - CRITICAL ACCURACY
For EACH field you find:
- X coordinate: Measure from LEFT edge of page to where the FILLABLE AREA STARTS (where text begins)
  * NOT where the label starts
  * For "Name: _______", measure where the underline BEGINS (after "Name:" and spacing)
  * Typical spacing: 10-15 pixels after label + colon
  * Example: If label "Name:" is at pixel 100, field should start at pixel 115-120

- Y coordinate: Measure from TOP edge of page to where the UNDERLINE or FIELD BOTTOM EDGE is
  * This is where the text baseline should sit
  * For underlines, Y is the Y position of the underline line itself
  * For boxed fields, Y is typically the bottom edge of the box
  * Be precise - measure the actual line position, not above or below it

- Width: Measure the LENGTH of the fillable area (underline length, box width, etc.)
  * Measure from field start to field end
  * Typical widths: 150-250pt for names, 200-300pt for addresses, 100-150pt for dates

- Height: Use appropriate height (15pts for checkboxes, 20pts for single lines, 40+ for text areas)

STEP 3: COORDINATE CONVERSION - CRITICAL ACCURACY
- Measure in PIXELS first, then convert to POINTS
- X_points = X_pixels ÷ ${imageData.scale}
- Y_points = Y_pixels ÷ ${imageData.scale}
- Width_points = Width_pixels ÷ ${imageData.scale}
- IMPORTANT: The Y coordinate should be the Y position of the UNDERLINE LINE itself
- When measuring, look at the actual line position - this is where text should sit
- Do NOT measure above or below the line - measure the line's exact position

STEP 4: FIELD IDENTIFICATION
- Read the LABEL text near each field to determine the field name
- Convert labels to snake_case: "Emergency Contact Name" → "emergency_contact_name"
- Determine field type based on context:
  * "Date", "DOB", "Admission Date" → date
  * "Phone", "SSN", "Medicare #" → text (but could be number)
  * "Amount", "Fee", "Rate" → number
  * Small squares → checkbox
  * Large areas → textarea

STEP 5: SPECIAL ATTENTION TO TABLES
- If you see a TABLE with rows and columns, identify EACH FILLABLE CELL as a separate field
- For table cells, name them descriptively: "physician_name", "physician_phone_day", "physician_phone_night"
- Measure each cell's position individually
- Common table structures:
  * CLOTHING LIST: NUMBER|ITEM|DESCRIPTION (detect each row)
  * Contact tables: Name|Phone columns
  * Inventory tables: Item|Quantity|Description columns

STEP 6: CHECKBOX LISTS - DON'T MISS THESE!
- Checkbox lists are critical - each checkbox is a separate field
- Examples: "CONTACT LENSES ☐", "DENTURES ☐", "HEARING AID ☐"
- For checkbox lists, use the item name: dentures, hearing_aid, contact_lenses
- Measure position of each checkbox individually
- Look for checkbox patterns both in:
  * Horizontal lists (☐ Item1  ☐ Item2  ☐ Item3)
  * Vertical lists (one checkbox per line)
  * Table cells with checkboxes

STEP 7: COMPREHENSIVE FIELD COUNT CHECK
- After detection, review your list
- Forms typically have 15-50+ fields
- If you only found 5-10 fields, you likely MISSED MANY
- Re-scan for:
  * Fields in the TOP section (header info)
  * Fields in TABLE rows
  * All CHECKBOXES in lists
  * SIGNATURE fields at bottom
  * DATE fields throughout

CRITICAL: Be extremely precise with coordinates AND thorough with detection. The success of form filling depends on:
1. Finding ALL fields (completeness)
2. Accurate positioning (precision)

Don't stop until you've scanned the entire page!`;
    } else {
      // Use text-based analysis
      const maxPageText = 15000;
      userPrompt += `
TEXT-BASED ANALYSIS - Use the text content below:
${pageText.substring(0, maxPageText)}

1. Look for patterns like:
   - "Name: ____" or "Name:_______" → text field
   - "Date: ____" or "Date:_______" → date field
   - "☐ Item" or "□ Item" → checkbox
   - Large spaces or multiple underlines → textarea

2. Estimate coordinates based on:
   - Line position in the text (each line ≈ 14-16pts apart)
   - Typical form margins (50-100pts from edges)
   - Field spacing (20-40pts between fields)
   - Multi-column layouts (left column X≈100pts, right column X≈400pts)`;
    }

    // If form schema is provided, use it to guide detection
    if (formSchema && formSchema.fields) {
      const fieldNames = formSchema.fields
        .map((f) => f.name || f.label)
        .join(", ");
      userPrompt += `\n\nHINT - Expected field names from existing schema: ${fieldNames}
Try to match detected fields to these names when possible, but don't force it if the form is different.
Focus on what you actually see in the form, not what's expected.`;
    }

    // Prepare messages for Vision or text-only
    const messages = [{ role: "system", content: systemPrompt }];

    if (useVision && imageData.base64) {
      // Use Vision API
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageData.base64}`,
              detail: "high", // High detail for better field detection
            },
          },
        ],
      });
    } else {
      // Use text-only
      messages.push({ role: "user", content: userPrompt });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: messages,
      temperature: 0.1, // Lower temperature for more consistent, accurate detection
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    const aiResponse = response.choices[0].message.content;

    // Parse AI response
    let detectedFields;
    try {
      const parsed = JSON.parse(aiResponse);
      detectedFields = parsed.fields || [];

      if (!Array.isArray(detectedFields)) {
        detectedFields =
          Object.values(parsed).find((v) => Array.isArray(v)) || [];
      }
    } catch (parseError) {
      console.error(
        "[AI-Field-Detection] Failed to parse AI response:",
        parseError
      );
      throw new Error("AI returned invalid JSON format");
    }

    // Validate and clean up detected fields
    // CRITICAL: For vision API, coordinates may be in pixels and need conversion
    // But AI should already convert them - we just validate here
    const validatedFields = detectedFields
      .filter(
        (field) =>
          field.fieldName && field.x !== undefined && field.y !== undefined
      )
      .map((field) => {
        // Ensure coordinates are valid numbers
        let x = parseFloat(field.x);
        let y = parseFloat(field.y);
        let width = parseFloat(field.width) || 200;
        let height = parseFloat(field.height) || 20;

        // Validate coordinates are within reasonable bounds
        // If coordinates seem way off (likely pixel values not converted), log warning
        if (useVision && imageData && (x > 2000 || y > 2000)) {
          console.warn(
            `[AI-Vision] Suspicious coordinates for field "${field.fieldName}": (${x}, ${y}) - may need conversion`
          );
          // Try to convert if they look like pixels
          if (imageData.scale) {
            x = x / imageData.scale;
            y = y / imageData.scale;
            width = width / imageData.scale;
            height = height / imageData.scale;
            console.log(
              `[AI-Vision] Converted coordinates: (${x.toFixed(1)}, ${y.toFixed(
                1
              )})`
            );
          }
        }

        return {
          fieldName: field.fieldName,
          label: field.label || field.fieldName,
          page: pageIndex, // Ensure correct page number
          x: x,
          y: y,
          width: width,
          height: height,
          type: field.type || "text",
          detectionMethod: "vision",
        };
      });

    return validatedFields;
  } catch (error) {
    console.error(
      "[AI-Field-Detection] Error detecting fields on page:",
      error
    );
    throw error;
  }
}

/**
 * Extract text content from PDF
 * @param {Buffer} pdfBuffer - PDF buffer
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPdf(pdfBuffer) {
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(pdfBuffer);
    return data.text || "";
  } catch (error) {
    console.error("[AI-Field-Detection] Error extracting text:", error);
    return "";
  }
}

/**
 * Refine AI-detected fields using form schema
 * @param {Array} detectedFields - Fields detected by AI
 * @param {Object} formSchema - Form schema with expected fields
 * @returns {Array} Refined field mappings
 */
function refineFieldsWithSchema(detectedFields, formSchema) {
  if (!formSchema || !formSchema.fields) {
    return detectedFields.map((field) => ({ ...field, schemaKey: null }));
  }

  const schemaFields = formSchema.fields.map((f) => ({
    key: f.name,
    label: f.label,
    type: f.type,
    // Create multiple normalized versions for better matching
    normalized: [
      f.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
      f.label.toLowerCase().replace(/[^a-z0-9]/g, ""),
      f.name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      f.label.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    ],
  }));

  // Enhanced matching algorithm
  const refinedFields = detectedFields.map((detected) => {
    const detectedNorm = detected.fieldName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const detectedLabel = detected.label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    let bestMatch = null;
    let bestScore = 0;

    for (const schemaField of schemaFields) {
      let score = 0;

      // Exact match (highest priority)
      if (schemaField.normalized.includes(detectedNorm)) {
        score = 100;
      }
      // Partial match - one contains the other
      else if (
        schemaField.normalized.some(
          (norm) => norm.includes(detectedNorm) || detectedNorm.includes(norm)
        )
      ) {
        score = 80;
      }
      // Label-based matching
      else if (
        schemaField.normalized.some(
          (norm) => norm.includes(detectedLabel) || detectedLabel.includes(norm)
        )
      ) {
        score = 70;
      }
      // Word-based matching for complex fields
      else {
        const detectedWords = detectedNorm.match(/\w+/g) || [];
        const schemaWords =
          schemaField.normalized.join(" ").match(/\w+/g) || [];

        let wordMatches = 0;
        for (const word of detectedWords) {
          if (schemaWords.includes(word)) {
            wordMatches++;
          }
        }

        if (wordMatches > 0 && detectedWords.length > 0) {
          score = (wordMatches / detectedWords.length) * 60;
        }
      }

      // Special handling for common field variations
      if (score > 0) {
        // Phone number variations
        if (
          (detectedNorm.includes("phone") ||
            detectedNorm.includes("day") ||
            detectedNorm.includes("night")) &&
          (schemaField.key.includes("phone") ||
            schemaField.key.includes("day") ||
            schemaField.key.includes("night"))
        ) {
          score += 10;
        }

        // Emergency contact variations
        if (
          detectedNorm.includes("emergency") &&
          schemaField.key.includes("emergency")
        ) {
          score += 15;
        }

        // Date variations
        if (
          (detectedNorm.includes("date") || detectedNorm.includes("dob")) &&
          (schemaField.key.includes("date") || schemaField.key === "dob")
        ) {
          score += 10;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = schemaField;
      }
    }

    // Only use match if score is reasonable (at least 50%)
    const schemaKey = bestMatch && bestScore >= 50 ? bestMatch.key : null;
    const finalType =
      bestMatch && bestScore >= 80 ? bestMatch.type : detected.type;

    if (schemaKey) {
      console.log(
        `[MAPPING] Matched "${
          detected.fieldName
        }" → "${schemaKey}" (score: ${bestScore.toFixed(1)})`
      );
    }

    return {
      ...detected,
      schemaKey,
      type: finalType,
    };
  });

  return refinedFields;
}

/**
 * Generate field mapping with AI assistance
 * @param {Object} params - Parameters
 * @param {Buffer} params.pdfBuffer - PDF file buffer
 * @param {string} params.fileName - File name
 * @param {string} params.tenantId - Tenant ID
 * @param {Object} [params.formSchema] - Optional form schema
 * @returns {Promise<Array>} Field mapping array
 */
async function generateFieldMappingWithAI({
  pdfBuffer,
  fileName,
  tenantId,
  formSchema = null,
}) {
  try {
    console.log(
      `[AI-Field-Detection] Generating field mapping for ${fileName}...`
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
        console.log(
          "[AI-Field-Detection] Using existing form schema for guidance"
        );
      }
    }

    // Detect fields using AI
    let detectedFields = await detectFormFieldsWithAI(
      pdfBuffer,
      fileName,
      formSchema
    );

    // Refine with schema if available (this adds schemaKey to each field)
    detectedFields = refineFieldsWithSchema(detectedFields, formSchema);

    console.log(
      `[AI-Field-Detection] Generated mapping with ${detectedFields.length} fields`
    );

    return detectedFields;
  } catch (error) {
    console.error(
      "[AI-Field-Detection] Error generating field mapping:",
      error
    );
    throw error;
  }
}

module.exports = {
  detectFormFieldsWithAI,
  generateFieldMappingWithAI,
  refineFieldsWithSchema,
  pdfPageToImage, // Export for OCR enhancement
};

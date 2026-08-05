const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const prisma = require("../../lib/prisma");
const {
  downloadPdfFromS3,
  uploadFilledPdfToS3,
} = require("../../utils/s3.util");
const { nanoid } = require("nanoid");
const {
  calculateOptimalTextBaseline,
  calculateOptimalTextX,
} = require("./pdfStructureAnalyzer.service");
const {
  calculateDynamicSpacing,
  analyzeFieldPosition,
} = require("./pdfSpacingAnalyzer.service");
const {
  getOptimalPositioning,
  detectFieldTypeFromStructure,
} = require("./pdfFieldTypeDetector.service");
const { findActualUnderlineY } = require("./pdfUnderlineDetector.service");

/**
 * Store PDF template with field positions
 * @param {Object} params - Template parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.fileName - Original file name
 * @param {string} params.s3Key - S3 storage key
 * @param {string} params.s3Url - S3 URL
 * @param {Array} params.fieldMapping - Array of field mappings with positions
 * @param {string} [params.displayName] - Display name
 * @param {string} [params.description] - Description
 * @param {string} [params.userId] - User who uploaded
 * @returns {Promise<Object>} Created template record
 */
async function storePdfTemplate({
  tenantId,
  fileName,
  s3Key,
  s3Url,
  fieldMapping,
  displayName = null,
  description = null,
  userId = null,
  fileHash = null, // SHA256 hash of PDF content for duplicate detection
}) {
  try {
    const template = await prisma.pdfTemplate.create({
      data: {
        tenantId,
        fileName,
        s3Key,
        s3Url,
        displayName: displayName || fileName,
        description,
        fieldMapping: fieldMapping, // JSON array of field mappings
        fileHash, // Store hash for duplicate detection
        isActive: true,
        createdBy: userId,
      },
    });

    console.log(
      `[PDF] Template stored: ${template.id} (hash: ${
        fileHash ? fileHash.substring(0, 16) + "..." : "none"
      })`
    );
    return template;
  } catch (error) {
    console.error("[PDF] Error storing template:", error);
    throw new Error(`Failed to store PDF template: ${error.message}`);
  }
}

/**
 * Get all active PDF templates for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of templates
 */
async function getTenantPdfTemplates(tenantId) {
  try {
    const templates = await prisma.pdfTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return templates;
  } catch (error) {
    console.error("[PDF] Error fetching templates:", error);
    throw new Error(`Failed to fetch PDF templates: ${error.message}`);
  }
}

/**
 * Get a specific PDF template by ID
 * @param {string} templateId - Template ID
 * @param {string} tenantId - Tenant ID (for security)
 * @returns {Promise<Object>} Template record
 */
async function getPdfTemplateById(templateId, tenantId) {
  try {
    const template = await prisma.pdfTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
        isActive: true,
      },
    });

    if (!template) {
      throw new Error("PDF template not found");
    }

    return template;
  } catch (error) {
    console.error("[PDF] Error fetching template:", error);
    throw error;
  }
}

/**
 * Fill PDF using coordinate-based approach with schema awareness (ensures 100% coverage)
 * @param {PDFDocument} pdfDoc - PDF document instance
 * @param {Array} fieldMapping - Array of field mappings with coordinates
 * @param {Object} formData - Form data to fill
 * @param {Object} pdfStructure - PDF structure for dynamic spacing
 * @param {Object} formSchema - Form schema to ensure 100% coverage
 */
async function fillPdfByCoordinatesWithSchema(
  pdfDoc,
  fieldMapping,
  formData,
  pdfStructure = null,
  formSchema = null
) {
  // Track which schema fields were filled
  const filledSchemaKeys = new Set();
  let filledCount = 0;
  let skippedCount = 0;
  let notInPdfCount = 0;

  console.log(`[PDF-COORD-SCHEMA] Starting schema-aware coordinate filling...`);
  console.log(
    `[PDF-COORD-SCHEMA] Mapping entries: ${fieldMapping?.length || 0}`
  );

  if (formSchema?.schemaJson?.fields) {
    const schemaFields = formSchema.schemaJson.fields;
    console.log(`[PDF-COORD-SCHEMA] Schema fields: ${schemaFields.length}`);
    console.log(`[PDF-COORD-SCHEMA] Ensuring 100% schema field coverage...`);

    // First, fill all found fields
    const foundMappings = fieldMapping.filter(
      (m) => !m.notInPdf && m.x !== null && m.y !== null
    );
    if (foundMappings.length > 0) {
      console.log(
        `[PDF-COORD-SCHEMA] Filling ${foundMappings.length} found fields...`
      );
      for (const field of foundMappings) {
        if (field.schemaKey) {
          filledSchemaKeys.add(field.schemaKey);
        }
      }
      await fillPdfByCoordinates(pdfDoc, foundMappings, formData, pdfStructure);
      filledCount = foundMappings.length;
    }

    // Track which schema fields don't exist in this PDF
    const notInPdfFields = fieldMapping.filter((m) => m.notInPdf);
    notInPdfCount = notInPdfFields.length;
    notInPdfFields.forEach((f) => {
      if (f.schemaKey) {
        filledSchemaKeys.add(f.schemaKey);
      }
    });

    // Check if all schema fields were processed
    const processedCount = filledSchemaKeys.size;
    const totalSchemaFields = schemaFields.length;

    console.log(
      `[PDF-COORD-SCHEMA] ✅ Schema coverage: ${processedCount}/${totalSchemaFields} fields processed`
    );
    console.log(`[PDF-COORD-SCHEMA] ✅ Filled: ${filledCount} fields`);
    console.log(`[PDF-COORD-SCHEMA] ⚠️ Not in PDF: ${notInPdfCount} fields`);
    console.log(
      `[PDF-COORD-SCHEMA] 📊 Coverage: ${(
        (processedCount / totalSchemaFields) *
        100
      ).toFixed(1)}%`
    );

    if (processedCount < totalSchemaFields) {
      skippedCount = totalSchemaFields - processedCount;
      console.warn(
        `[PDF-COORD-SCHEMA] ⚠️ WARNING: ${skippedCount} schema fields were not in mapping`
      );
    }
  } else {
    // No schema, use traditional approach
    console.log(
      `[PDF-COORD-SCHEMA] No schema provided, using traditional coordinate filling...`
    );
    await fillPdfByCoordinates(pdfDoc, fieldMapping, formData, pdfStructure);
  }
}

/**
 * Fill PDF using coordinate-based approach (for non-interactive PDFs)
 * @param {PDFDocument} pdfDoc - Loaded PDF document
 * @param {Array} fieldMapping - Array of field mappings with coordinates
 * @param {Object} formData - Form data to fill
 * @param {Object} pdfStructure - PDF structure for dynamic spacing
 */
async function fillPdfByCoordinates(
  pdfDoc,
  fieldMapping,
  formData,
  pdfStructure = null
) {
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;

  // Track signature field positions to prevent relationship field overlap
  const signatureFieldPositions = new Map(); // page -> Set of X coordinates

  // Reduced logging for performance
  console.log(`[PDF-COORD] Filling ${fieldMapping?.length || 0} fields`);

  if (!Array.isArray(fieldMapping) || fieldMapping.length === 0) {
    console.warn(
      "[PDF-COORD] No field mapping provided for coordinate-based filling"
    );
    return;
  }

  // Helper function for improved field name matching
  const findFieldValue = (fieldName, schemaKey, label, formData) => {
    const normalize = (s) =>
      (s || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    // Helper: Word-order-insensitive matching (for fields like "emergency_contact_phone_day" vs "emergency_contact_day_phone")
    const wordSetMatch = (str1, str2) => {
      const words1 = (str1 || "").toLowerCase().match(/\w+/g) || [];
      const words2 = (str2 || "").toLowerCase().match(/\w+/g) || [];

      if (words1.length === 0 || words2.length === 0) return false;
      if (words1.length !== words2.length) return false;

      // Check if same words in different order
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      if (set1.size !== set2.size) return false;

      for (const word of set1) {
        if (!set2.has(word)) return false;
      }
      return true; // All words match, just different order
    };

    // PRIORITY 0: Common field name mappings (handle known variations)
    const fieldMappings = {
      signed: ["authorization_signature", "signature", "signed_by"],
      signedname: ["authorization_signature", "signature", "signed_by"],
      signeddate: ["authorization_date", "signature_date", "signed_date"],
      date_signed: ["authorization_date", "signature_date", "signed_date"],
      datesigned: ["authorization_date", "signature_date", "signed_date"],
      resident_poa: ["authorization_signature", "name", "resident_name"],
      resident: ["name", "resident_name"],
      resident_name: ["name", "resident_name"],
      residentnickname: ["nickname"],
      male: ["gender"],
      female: ["gender"],
      phone: [
        "pharmacy_phone",
        "preferred_hospital_phone",
        "emergency_contact_phone",
      ],
      dob: ["dob", "date_of_birth"],
      ssn: ["ssn", "social_security"],
      // Primary insurance variations
      primaryinsurancename: ["primary_insurance"],
      // Emergency contact field variations (word order)
      emergencycontactphoneday: [
        "emergency_contact_day_phone",
        "emergency_contact_phone_day",
      ],
      emergencycontactphonenight: [
        "emergency_contact_night_phone",
        "emergency_contact_phone_night",
      ],
      emergencycontactdayphone: [
        "emergency_contact_day_phone",
        "emergency_contact_phone_day",
      ],
      emergencycontactnightphone: [
        "emergency_contact_night_phone",
        "emergency_contact_phone_night",
      ],
      phonenumberday: [
        "emergency_contact_day_phone",
        "emergency_contact_phone_day",
        "phone_day",
      ],
      phonenumbernight: [
        "emergency_contact_night_phone",
        "emergency_contact_phone_night",
        "phone_night",
      ],
    };

    // Check if fieldName has a known mapping
    const normalizedFieldName = normalize(fieldName);
    if (fieldMappings[normalizedFieldName]) {
      for (const mappedKey of fieldMappings[normalizedFieldName]) {
        if (
          formData[mappedKey] !== undefined &&
          formData[mappedKey] !== null &&
          formData[mappedKey] !== ""
        ) {
          console.log(
            `[FIELD-MATCH] Mapped "${fieldName}" → "${mappedKey}" = "${formData[mappedKey]}"`
          );
          return formData[mappedKey];
        }
      }
    }

    // Also check label-based mappings
    if (label) {
      const normalizedLabelText = normalize(label);
      if (fieldMappings[normalizedLabelText]) {
        for (const mappedKey of fieldMappings[normalizedLabelText]) {
          if (
            formData[mappedKey] !== undefined &&
            formData[mappedKey] !== null &&
            formData[mappedKey] !== ""
          ) {
            console.log(
              `[FIELD-MATCH] Mapped label "${label}" → "${mappedKey}" = "${formData[mappedKey]}"`
            );
            return formData[mappedKey];
          }
        }
      }
    }

    // PRIORITY 1: Try schemaKey if provided (exact match - highest priority)
    if (schemaKey) {
      if (
        formData[schemaKey] !== undefined &&
        formData[schemaKey] !== null &&
        formData[schemaKey] !== ""
      ) {
        return formData[schemaKey];
      }
      // Also try normalized schemaKey
      const normalizedSchemaKey = normalize(schemaKey);
      for (const key of Object.keys(formData)) {
        if (
          normalize(key) === normalizedSchemaKey &&
          formData[key] !== undefined &&
          formData[key] !== null &&
          formData[key] !== ""
        ) {
          return formData[key];
        }
      }
    }

    // PRIORITY 2: Try exact fieldName match
    if (
      formData[fieldName] !== undefined &&
      formData[fieldName] !== null &&
      formData[fieldName] !== ""
    ) {
      return formData[fieldName];
    }

    // PRIORITY 3: Try matching using LABEL (heading text) - this is the key fix!
    // The label (e.g., "Resident Name:") should match formData keys like "resident_name" or "residentname"
    if (label && label.trim()) {
      // Clean label: remove colon, trim, normalize
      const cleanLabel = label.replace(/[:\s]+$/, "").trim(); // Remove trailing colon and spaces
      const normalizedLabel = normalize(cleanLabel);

      // Try exact normalized label match
      for (const key of Object.keys(formData)) {
        if (
          formData[key] === undefined ||
          formData[key] === null ||
          formData[key] === ""
        ) {
          continue;
        }
        const normalizedKey = normalize(key);
        if (normalizedKey === normalizedLabel) {
          return formData[key];
        }
      }

      // Try substring match with label
      let bestMatch = null;
      let bestScore = 0;

      for (const key of Object.keys(formData)) {
        if (
          formData[key] === undefined ||
          formData[key] === null ||
          formData[key] === ""
        ) {
          continue;
        }
        const normalizedKey = normalize(key);

        // Check if label contains key or key contains label
        if (
          normalizedKey.includes(normalizedLabel) ||
          normalizedLabel.includes(normalizedKey)
        ) {
          const matchRatio =
            Math.min(normalizedKey.length, normalizedLabel.length) /
            Math.max(normalizedKey.length, normalizedLabel.length);
          if (matchRatio > bestScore) {
            bestScore = matchRatio;
            bestMatch = formData[key];
          }
        }
      }

      // If we found a good label match (>70%), use it
      if (bestMatch !== null && bestScore > 0.7) {
        return bestMatch;
      }

      // Try word-based matching with label
      const labelWords = normalizedLabel.match(/\w+/g) || [];
      if (labelWords.length > 0) {
        bestMatch = null;
        bestScore = 0;

        for (const key of Object.keys(formData)) {
          if (
            formData[key] === undefined ||
            formData[key] === null ||
            formData[key] === ""
          ) {
            continue;
          }
          const normalizedKey = normalize(key);
          const keyWords = normalizedKey.match(/\w+/g) || [];

          if (keyWords.length > 0) {
            let matchingWords = 0;
            for (const word of labelWords) {
              if (keyWords.includes(word)) {
                matchingWords++;
              }
            }

            const wordMatchRatio =
              matchingWords / Math.max(labelWords.length, keyWords.length);
            const minWords =
              labelWords.length === 1 ? 1 : Math.min(2, labelWords.length);
            if (
              wordMatchRatio >= 0.5 &&
              matchingWords >= minWords &&
              wordMatchRatio > bestScore
            ) {
              bestScore = wordMatchRatio;
              bestMatch = formData[key];
            }

            // Strong match: all words matched
            if (
              labelWords.length > 1 &&
              matchingWords === labelWords.length &&
              matchingWords >= Math.min(2, keyWords.length)
            ) {
              if (wordMatchRatio > bestScore) {
                bestScore = wordMatchRatio;
                bestMatch = formData[key];
              }
            }
          }
        }

        if (bestMatch !== null) {
          return bestMatch;
        }
      }
    }

    // PRIORITY 4: Try normalized matching with fieldName
    // normalizedFieldName already declared above, just reuse it

    // Try exact normalized fieldName match
    for (const key of Object.keys(formData)) {
      if (
        formData[key] === undefined ||
        formData[key] === null ||
        formData[key] === ""
      ) {
        continue;
      }
      const normalizedKey = normalize(key);
      if (normalizedKey === normalizedFieldName) {
        return formData[key];
      }
    }

    // Try substring match with fieldName
    let bestMatch = null;
    let bestScore = 0;

    for (const key of Object.keys(formData)) {
      if (
        formData[key] === undefined ||
        formData[key] === null ||
        formData[key] === ""
      ) {
        continue;
      }
      const normalizedKey = normalize(key);

      if (
        normalizedKey.includes(normalizedFieldName) ||
        normalizedFieldName.includes(normalizedKey)
      ) {
        const matchRatio =
          Math.min(normalizedKey.length, normalizedFieldName.length) /
          Math.max(normalizedKey.length, normalizedFieldName.length);
        if (matchRatio > bestScore) {
          bestScore = matchRatio;
          bestMatch = formData[key];
        }
      }
    }

    // If we found a good substring match (>70%), use it
    if (bestMatch !== null && bestScore > 0.7) {
      return bestMatch;
    }

    // PRIORITY 5: Word-based matching for multi-word fieldName
    const fieldWords = normalizedFieldName.match(/\w+/g) || [];
    if (fieldWords.length > 0) {
      bestMatch = null;
      bestScore = 0;

      for (const key of Object.keys(formData)) {
        if (
          formData[key] === undefined ||
          formData[key] === null ||
          formData[key] === ""
        ) {
          continue;
        }
        const normalizedKey = normalize(key);
        const keyWords = normalizedKey.match(/\w+/g) || [];

        if (keyWords.length > 0) {
          let matchingWords = 0;
          for (const word of fieldWords) {
            if (keyWords.includes(word)) {
              matchingWords++;
            }
          }

          const wordMatchRatio =
            matchingWords / Math.max(fieldWords.length, keyWords.length);
          const minWords =
            fieldWords.length === 1 ? 1 : Math.min(2, fieldWords.length);
          if (
            wordMatchRatio >= 0.5 &&
            matchingWords >= minWords &&
            wordMatchRatio > bestScore
          ) {
            bestScore = wordMatchRatio;
            bestMatch = formData[key];
          }

          // Also check if all significant words match (for multi-word fields)
          if (
            fieldWords.length > 1 &&
            matchingWords === fieldWords.length &&
            matchingWords >= Math.min(2, keyWords.length)
          ) {
            if (wordMatchRatio > bestScore) {
              bestScore = wordMatchRatio;
              bestMatch = formData[key];
            }
          }
        }
      }

      if (bestMatch !== null) {
        return bestMatch;
      }
    }

    // PRIORITY 6: Word-order-insensitive exact matching
    // For fields like "emergency_contact_phone_day" vs "emergency_contact_day_phone"
    for (const key of Object.keys(formData)) {
      if (
        formData[key] === undefined ||
        formData[key] === null ||
        formData[key] === ""
      ) {
        continue;
      }
      if (wordSetMatch(fieldName, key)) {
        console.log(
          `[FIELD-MATCH] Word-order match "${fieldName}" → "${key}" = "${formData[key]}"`
        );
        return formData[key];
      }
    }

    return null;
  };

  // Log summary (reduced logging for performance)
  console.log(
    `[PDF-COORD] Processing ${fieldMapping.length} fields with ${
      Object.keys(formData).length
    } formData keys`
  );

  // Fill each field based on mapping
  // CRITICAL: Process ALL fields, including multiple occurrences of the same field
  let filledCount = 0;
  let skippedCount = 0;
  let emptyValueCount = 0;

  // First pass: Collect signature field positions to prevent relationship field overlap
  for (const field of fieldMapping) {
    const { fieldName, page, x } = field;
    if (
      fieldName &&
      fieldName.toLowerCase().includes("signature") &&
      !fieldName.toLowerCase().includes("relationship")
    ) {
      if (!signatureFieldPositions.has(page)) {
        signatureFieldPositions.set(page, new Set());
      }
      signatureFieldPositions.get(page).add(x);
    }
  }

  // Second pass: Fill all fields
  for (const field of fieldMapping) {
    const {
      fieldName,
      page,
      x,
      y,
      width,
      height,
      type = "text",
      schemaKey = null,
      label = null,
    } = field;

    // Skip if coordinates are invalid
    if (
      x === undefined ||
      y === undefined ||
      x === null ||
      y === null ||
      isNaN(x) ||
      isNaN(y)
    ) {
      skippedCount++;
      continue;
    }

    const value = findFieldValue(fieldName, schemaKey, label, formData);

    // Skip if no value found
    if (value === null || value === undefined || value === "") {
      emptyValueCount++;
      continue;
    }

    // DISABLED: Placeholder detection removed - was too aggressive and skipping valid data
    // Only skip if value contains asterisk (clear placeholder indicator)
    // All other values are treated as valid data
    if (typeof value === "string" && value.includes("*")) {
      // Only skip if it has an asterisk (clear placeholder like "Recipient Name*")
      emptyValueCount++;
      continue;
    }

    // Validate page index
    if (page < 0 || page >= pages.length) {
      console.warn(`[PDF] Invalid page index ${page} for field ${fieldName}`);
      continue;
    }

    const pdfPage = pages[page];
    const pageHeight = pdfPage.getHeight();

    // Convert coordinates (PDF uses bottom-left origin)
    // IMPORTANT: Y coordinate from AI is the UNDERLINE position (from top of page)
    // y: position of the UNDERLINE itself (from top of page, where text should sit)
    // PDF uses bottom-left origin, so we need to convert: pdfY = pageHeight - y
    // This gives us the Y position of the underline in PDF coordinates
    // Text baseline should be positioned exactly at or slightly above the underline
    const underlineY = pageHeight - y; // Convert top-to-bottom Y to bottom-to-top PDF Y

    // Handle different field types
    if (type === "checkbox" || type === "boolean") {
      // Draw checkbox as a box with optional X mark (ASCII-safe)
      // For checkboxes, use the Y coordinate as-is (center of checkbox)
      const checkboxY = pageHeight - y;
      const checkboxWidth = Math.min(width || 15, 15);
      const checkboxHeight = Math.min(height || 15, 15);

      // Draw checkbox rectangle
      pdfPage.drawRectangle({
        x: x,
        y: checkboxY - checkboxHeight / 2, // Center checkbox vertically
        width: checkboxWidth,
        height: checkboxHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.5,
      });

      // If checked, draw a checkmark (tick) inside
      // Handle various boolean representations
      const isChecked =
        value === true ||
        value === "true" ||
        value === 1 ||
        value === "1" ||
        value === "yes" ||
        value === "Yes";

      if (isChecked) {
        const checkSize = Math.min(checkboxWidth, checkboxHeight);
        const centerX = x + checkboxWidth / 2;
        const centerY = checkboxY;

        // Draw checkmark (tick) using lines
        // Checkmark shape: bottom-left to center, then center to top-right
        const checkWidth = checkSize * 0.5;
        const checkHeight = checkSize * 0.5;

        // Calculate checkmark points (forming a ✓ shape)
        // Bottom-left point (start of checkmark)
        const leftX = centerX - checkWidth * 0.25;
        const bottomY = centerY - checkHeight * 0.2;

        // Center point (where lines meet)
        const centerXCheck = centerX - checkWidth * 0.05;
        const centerYCheck = centerY + checkHeight * 0.05;

        // Top-right point (end of checkmark)
        const rightX = centerX + checkWidth * 0.35;
        const topY = centerY + checkHeight * 0.3;

        // Draw checkmark using two connected lines
        // Line 1: bottom-left to center
        pdfPage.drawLine({
          start: { x: leftX, y: bottomY },
          end: { x: centerXCheck, y: centerYCheck },
          thickness: 2,
          color: rgb(0, 0, 0),
        });

        // Line 2: center to top-right
        pdfPage.drawLine({
          start: { x: centerXCheck, y: centerYCheck },
          end: { x: rightX, y: topY },
          thickness: 2,
          color: rgb(0, 0, 0),
        });
      }

      filledCount++;
    } else {
      // Handle text, number, date fields
      let textValue = String(value);

      if (type === "date" && value instanceof Date) {
        textValue = value.toLocaleDateString();
      }

      // Enhanced coordinate calculation using improved algorithms
      // Coordinate System:
      // - AI Detection: Y from TOP of page (where field/line is)
      // - PDF System: Y from BOTTOM of page (origin at bottom-left)
      // - Conversion: pdfY = pageHeight - aiY

      // Get optimal positioning from PDF structure (if available)
      let optimalPos = null;
      let detectedFieldType = type;
      let actualUnderlineY = y;

      if (pdfStructure) {
        // CRITICAL: Find actual underline Y position from PDF structure
        // This is more accurate than AI-detected coordinates
        const underlineInfo = findActualUnderlineY(field, pdfStructure);
        if (
          underlineInfo &&
          underlineInfo.underlineY !== null &&
          underlineInfo.underlineY !== undefined
        ) {
          actualUnderlineY = underlineInfo.underlineY;
        }

        // Detect actual field type from structure
        detectedFieldType = detectFieldTypeFromStructure(field, pdfStructure);

        // Get optimal positioning using PDF structure
        optimalPos = getOptimalPositioning(field, pdfStructure);

        // Use actual underline Y if found in optimal positioning
        if (optimalPos.underlineY && optimalPos.underlineY !== y) {
          actualUnderlineY = optimalPos.underlineY;
        }
      }

      // Use optimal positions if available, otherwise use detected coordinates
      // CRITICAL: Use actual underline Y position (from PDF structure) for accurate alignment
      const fieldYFromTop = actualUnderlineY;
      const fieldWidth = width || 200;

      // Use improved baseline calculation
      const textBaseline = calculateOptimalTextBaseline(
        fieldYFromTop,
        fontSize,
        height,
        pageHeight
      );

      // Reduced logging - only log if there's an issue

      // Calculate dynamic spacing from PDF structure if available
      let spacingInfo = null;
      let positionInfo = null;

      if (pdfStructure) {
        spacingInfo = calculateDynamicSpacing(field, pdfStructure);
        positionInfo = analyzeFieldPosition(field, pdfStructure);

        // Merge position info into spacing info
        if (positionInfo.needsXAdjustment) {
          spacingInfo.needsXAdjustment = true;
          spacingInfo.suggestedX = positionInfo.suggestedX;
        }

        // Use optimal X position if available
        if (optimalPos && optimalPos.fromPdfStructure) {
          spacingInfo.labelEndX = null; // We have exact position
          spacingInfo.actualSpacing = 0; // Already at correct position
          spacingInfo.fromPdfStructure = true;
        }
      }

      // Validate coordinates are valid numbers
      if (typeof x !== "number" || isNaN(x) || !isFinite(x)) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid X coordinate (${x})`
        );
        continue;
      }

      if (
        typeof fieldYFromTop !== "number" ||
        isNaN(fieldYFromTop) ||
        !isFinite(fieldYFromTop)
      ) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid Y coordinate (${fieldYFromTop})`
        );
        continue;
      }

      // Use improved X position calculation with dynamic spacing
      // Prefer optimal position from PDF structure if available
      const baseX =
        optimalPos?.x != null &&
        typeof optimalPos.x === "number" &&
        !isNaN(optimalPos.x)
          ? optimalPos.x
          : x;

      // Validate baseX is valid
      if (typeof baseX !== "number" || isNaN(baseX) || !isFinite(baseX)) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid baseX coordinate (${baseX})`
        );
        continue;
      }

      const xResult = calculateOptimalTextX(
        baseX,
        label,
        fieldWidth,
        fontSize,
        spacingInfo
      );

      // Validate xResult.textX is valid
      if (
        typeof xResult.textX !== "number" ||
        isNaN(xResult.textX) ||
        !isFinite(xResult.textX)
      ) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid textX from calculateOptimalTextX (${xResult.textX})`
        );
        continue;
      }

      const fieldX = xResult.textX;
      const leftPadding =
        optimalPos?.padding != null && typeof optimalPos.padding === "number"
          ? optimalPos.padding
          : xResult.padding || 5;

      // Reduced logging - only log significant adjustments
      if (fieldX !== x && Math.abs(fieldX - x) > 20) {
        console.log(
          `[PDF-COORD] X adjusted for "${fieldName}": ${x.toFixed(
            1
          )} → ${fieldX.toFixed(1)}`
        );
      }

      // Determine text alignment based on field type and name
      // Date fields should be right-aligned (at end of field)
      // Signature fields should be centered
      // Other fields should be left-aligned
      const isDateField =
        type === "date" ||
        (fieldName &&
          (fieldName.toLowerCase().includes("date") ||
            fieldName.toLowerCase().endsWith("_date")));

      // CRITICAL: Only center signature fields, NOT relationship fields
      // Relationship fields should be left-aligned to avoid overlap with signatures
      const isRelationshipField =
        fieldName &&
        (fieldName.toLowerCase().includes("relationship") ||
          fieldName.toLowerCase().includes("witness_relationship") ||
          fieldName.toLowerCase().includes("authorized_person_relationship"));

      const shouldCenter =
        fieldName &&
        !isRelationshipField &&
        ((fieldName.toLowerCase().includes("signature") &&
          !fieldName.toLowerCase().includes("relationship")) ||
          (fieldName.toLowerCase().includes("signed") &&
            !fieldName.toLowerCase().includes("relationship")));

      // Relationship fields should be left-aligned, not centered
      // This prevents overlap with signature fields which are centered
      // CRITICAL: Relationship fields must use their own X coordinates from detection

      // Calculate final text X position
      let textX;
      const textWidth = font.widthOfTextAtSize(textValue, fontSize);
      // Get right padding from spacing info or use default
      const rightPadding = spacingInfo?.rightPadding || 5;

      if (isDateField) {
        // Right-align date fields: position at end of field (right side)
        // For better alignment, position text closer to the right edge of the field
        textX = fieldX + fieldWidth - textWidth - Math.max(rightPadding, 2);
        // Ensure text doesn't go outside field bounds
        const minX = fieldX + leftPadding;
        textX = Math.max(minX, textX);
      } else if (shouldCenter) {
        // Center text within the field width
        const availableWidth = fieldWidth - (leftPadding + rightPadding);
        const centeredX =
          fieldX + leftPadding + (availableWidth - textWidth) / 2;
        // Ensure text doesn't go outside field bounds
        const minX = fieldX + leftPadding;
        const maxX = fieldX + fieldWidth - textWidth - rightPadding;
        textX = Math.max(minX, Math.min(centeredX, maxX));
      } else {
        // Left-align with calculated padding
        // For inline fields, use minimal padding for precise alignment
        const isInlineField =
          label &&
          (label.includes(",") ||
            label.includes("of") ||
            label.includes("to") ||
            label.includes("between"));
        const inlinePadding = isInlineField
          ? Math.min(leftPadding, 2)
          : leftPadding;

        // CRITICAL: For relationship fields, ensure we use the detected X coordinate
        // Relationship fields are typically to the RIGHT of signature fields
        // Use the field's own X coordinate to prevent overlap
        if (isRelationshipField) {
          // Relationship fields should use their detected X position directly
          // Check if this X position overlaps with any signature field on the same page
          const pageSignatureX = signatureFieldPositions.get(page) || new Set();
          let adjustedX = fieldX;

          // If relationship field X is too close to a signature field, adjust it
          for (const sigX of pageSignatureX) {
            const distance = Math.abs(adjustedX - sigX);
            // If within 50pt of a signature field, move relationship field to the right
            if (distance < 50) {
              adjustedX = Math.max(adjustedX, sigX + 60); // Ensure at least 60pt separation
            }
          }

          textX = adjustedX + Math.max(inlinePadding, 2); // Minimal padding for relationship fields
        } else {
          textX = fieldX + inlinePadding;
        }
      }

      // Validate textX is a valid number before proceeding
      if (typeof textX !== "number" || isNaN(textX) || !isFinite(textX)) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid textX after calculation (${textX})`
        );
        continue;
      }

      // Validate textBaseline is a valid number
      if (
        typeof textBaseline !== "number" ||
        isNaN(textBaseline) ||
        !isFinite(textBaseline)
      ) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid textBaseline (${textBaseline})`
        );
        continue;
      }

      // Final validation: Ensure text doesn't overflow page
      const pageWidth = pdfPage.getWidth();
      const maxX = pageWidth - 10; // 10pt margin from right edge
      if (textX + textWidth > maxX) {
        textX = maxX - textWidth;
        console.log(
          `[PDF-COORD] Adjusted textX to prevent overflow: ${textX.toFixed(1)}`
        );
      }

      // Final check: ensure textX is still valid after overflow adjustment
      if (typeof textX !== "number" || isNaN(textX) || !isFinite(textX)) {
        console.warn(
          `[PDF-COORD] ⚠️ Skipping field "${fieldName}": Invalid textX after overflow adjustment (${textX})`
        );
        continue;
      }

      // Calculate max width more accurately - account for padding and margins
      const effectiveMaxWidth = fieldWidth - leftPadding - rightPadding;

      // AUTO-SCALE TEXT TO FIT: If text is too long, reduce font size to fit in one line
      let finalFontSize = fontSize;
      let finalTextWidth = textWidth;
      const maxAllowedWidth =
        effectiveMaxWidth > 0 ? effectiveMaxWidth : fieldWidth * 0.8;

      if (textWidth > maxAllowedWidth) {
        // Calculate scale factor to fit text within maxWidth
        const scaleFactor = maxAllowedWidth / textWidth;
        finalFontSize = Math.max(fontSize * scaleFactor, 6); // Minimum 6pt font
        finalTextWidth = font.widthOfTextAtSize(textValue, finalFontSize);

        // Recalculate textX with new text width
        if (isDateField) {
          textX = fieldX + fieldWidth - finalTextWidth - rightPadding;
          textX = Math.max(fieldX + leftPadding, textX);
        } else if (shouldCenter) {
          const availableWidth = fieldWidth - (leftPadding + rightPadding);
          const centeredX =
            fieldX + leftPadding + (availableWidth - finalTextWidth) / 2;
          textX = Math.max(
            fieldX + leftPadding,
            Math.min(
              centeredX,
              fieldX + fieldWidth - finalTextWidth - rightPadding
            )
          );
        } else {
          textX = fieldX + leftPadding;
        }

        // Reduced logging - only log significant scaling
        if (finalFontSize < fontSize * 0.7) {
          console.log(
            `[PDF-COORD] 📏 Auto-scaled text for "${fieldName}": ${fontSize.toFixed(
              1
            )}pt → ${finalFontSize.toFixed(1)}pt`
          );
        }
      }

      pdfPage.drawText(textValue, {
        x: textX,
        y: textBaseline,
        size: finalFontSize,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: maxAllowedWidth,
      });

      filledCount++;
    }
  }

  // Summary logging (only log if there are issues)
  if (filledCount < fieldMapping.length * 0.8) {
    console.warn(
      `[PDF-COORD] ⚠️ Low coverage: ${filledCount}/${
        fieldMapping.length
      } fields filled (${((filledCount / fieldMapping.length) * 100).toFixed(
        1
      )}%)`
    );
    if (emptyValueCount > 0) {
      console.warn(
        `[PDF-COORD]    ${emptyValueCount} fields skipped (no value)`
      );
    }
    if (skippedCount > 0) {
      console.warn(
        `[PDF-COORD]    ${skippedCount} fields skipped (invalid coordinates)`
      );
    }
  } else {
    console.log(
      `[PDF-COORD] ✅ Filled ${filledCount}/${fieldMapping.length} fields (${(
        (filledCount / fieldMapping.length) *
        100
      ).toFixed(1)}% coverage)`
    );
  }
}

/**
 * Fill a PDF template with form data
 * @param {Object} params - Fill parameters
 * @param {string} params.templateId - Template ID to fill
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {Object} params.formData - Form data to fill
 * @returns {Promise<Object>} Result with filled PDF info
 */
async function fillPdfTemplate({ templateId, tenantId, userId, formData }) {
  try {
    // Get template
    const template = await getPdfTemplateById(templateId, tenantId);

    // Download original PDF from S3
    console.log(`[PDF] Downloading template from S3: ${template.s3Key}`);
    const pdfBuffer = await downloadPdfFromS3(template.s3Key);

    // Get form schema to ensure 100% field coverage
    const prisma = require("../../lib/prisma");
    const formSchema = await prisma.formSchema.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    // Use stored field mapping (with 100% schema coverage)
    // Reduced logging for performance
    console.log(
      `[PDF-FILL] Filling PDF with ${
        template.fieldMapping?.length || 0
      } field mappings`
    );

    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Try to get form fields (if PDF has interactive form fields)
    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    // If PDF has form fields, try to fill them directly
    if (formFields.length > 0) {
      console.log("[PDF] Attempting to fill interactive form fields");

      const fieldNames = formFields.map((f) => f.getName()).join(", ");
      console.log(`[PDF] Form field names: ${fieldNames}`);
      let filledCount = 0;

      for (const formField of formFields) {
        const fieldName = formField.getName();
        // If we have a stored mapping for this PDF field, use its schemaKey for value lookup
        const mapping = Array.isArray(template.fieldMapping)
          ? template.fieldMapping.find(
              (m) =>
                (m.fieldName || "").toLowerCase().replace(/[^a-z0-9]/g, "") ===
                fieldName.toLowerCase().replace(/[^a-z0-9]/g, "")
            )
          : null;

        // Try to match field name with our form data
        // Field names might be like "lastName", "first_name", "Date of Birth", etc.
        const matchedKey = Object.keys(formData).find((key) => {
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          const normalizedFieldName = fieldName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          return (
            normalizedKey === normalizedFieldName ||
            normalizedKey.includes(normalizedFieldName) ||
            normalizedFieldName.includes(normalizedKey)
          );
        });

        const valueKey = mapping?.schemaKey || matchedKey; // prefer schemaKey if present
        if (
          valueKey &&
          formData[valueKey] !== undefined &&
          formData[valueKey] !== null
        ) {
          try {
            const value = formData[valueKey];
            const fieldType = formField.constructor.name;

            console.log(
              `[PDF] Filling field "${fieldName}" (using key "${valueKey}") with value: ${value}`
            );

            if (fieldType === "PDFTextField") {
              formField.setText(String(value));
              filledCount += 1;
            } else if (fieldType === "PDFCheckBox") {
              if (value === true || value === "true" || value === 1) {
                formField.check();
              } else {
                formField.uncheck();
              }
              filledCount += 1;
            } else if (fieldType === "PDFDropdown") {
              formField.select(String(value));
              filledCount += 1;
            } else if (fieldType === "PDFRadioGroup") {
              formField.select(String(value));
              filledCount += 1;
            }

            console.log(`[PDF] Successfully filled field "${fieldName}"`);
          } catch (fieldError) {
            console.warn(
              `[PDF] Could not fill field "${fieldName}": ${fieldError.message}`
            );
          }
        }
      }
      console.log(`[PDF] Interactive fields filled: ${filledCount}`);

      // If nothing matched/filled, attempt coordinate-based fallback (if mapping has coordinates)
      if (filledCount === 0) {
        const hasCoordinateMapping =
          Array.isArray(template.fieldMapping) &&
          template.fieldMapping.some(
            (m) => typeof m.x === "number" && typeof m.y === "number"
          );
        if (hasCoordinateMapping) {
          console.log(
            "[PDF] No interactive fields matched form data. Falling back to coordinate-based filling."
          );
          // Extract PDF structure for dynamic spacing analysis
          const {
            extractPdfStructure,
          } = require("../ai/aiFieldDetectionCoordinate.service");
          let pdfStructure = null;
          try {
            pdfStructure = await extractPdfStructure(pdfBuffer);
            console.log(
              "[PDF] Extracted PDF structure for dynamic spacing analysis"
            );
          } catch (error) {
            console.warn(
              "[PDF] Could not extract PDF structure, using static spacing:",
              error.message
            );
          }

          // Use schema-aware coordinate filling (ensures all schema fields are checked)
          await fillPdfByCoordinatesWithSchema(
            pdfDoc,
            template.fieldMapping,
            formData,
            pdfStructure,
            formSchema
          );
        } else {
          console.warn(
            "[PDF] No interactive fields matched and no coordinate mapping available. PDF may remain empty."
          );
        }
      } else {
        // Still check if we missed any schema fields that weren't interactive
        if (formSchema?.schemaJson?.fields) {
          console.log(
            "[PDF] Checking for additional schema fields that need coordinate-based filling..."
          );
          const filledSchemaKeys = new Set();
          for (const formField of formFields) {
            const fieldName = formField.getName();
            const mapping = Array.isArray(template.fieldMapping)
              ? template.fieldMapping.find(
                  (m) =>
                    (m.fieldName || "")
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "") ===
                    fieldName.toLowerCase().replace(/[^a-z0-9]/g, "")
                )
              : null;
            if (mapping?.schemaKey) {
              filledSchemaKeys.add(mapping.schemaKey);
            }
          }

          // Fill remaining schema fields that weren't interactive
          const remainingMappings = template.fieldMapping.filter(
            (m) =>
              m.schemaKey &&
              !filledSchemaKeys.has(m.schemaKey) &&
              !m.notInPdf &&
              m.x !== null &&
              m.y !== null
          );

          if (remainingMappings.length > 0) {
            console.log(
              `[PDF] Filling ${remainingMappings.length} additional schema fields with coordinate-based method...`
            );
            const {
              extractPdfStructure,
            } = require("../ai/aiFieldDetectionCoordinate.service");
            let pdfStructure = null;
            try {
              pdfStructure = await extractPdfStructure(pdfBuffer);
            } catch (error) {
              console.warn(
                "[PDF] Could not extract PDF structure:",
                error.message
              );
            }
            await fillPdfByCoordinates(
              pdfDoc,
              remainingMappings,
              formData,
              pdfStructure
            );
          }
        }

        // Flatten only if we actually filled interactive fields
        form.flatten();
      }
    } else {
      // Fall back to coordinate-based filling for non-interactive PDFs
      console.log(
        "[PDF] No interactive form fields found, using coordinate-based filling with schema awareness"
      );
      // Extract PDF structure for dynamic spacing analysis
      const {
        extractPdfStructure,
      } = require("../ai/aiFieldDetectionCoordinate.service");
      let pdfStructure = null;
      try {
        pdfStructure = await extractPdfStructure(pdfBuffer);
        console.log(
          "[PDF] Extracted PDF structure for dynamic spacing analysis"
        );
      } catch (error) {
        console.warn(
          "[PDF] Could not extract PDF structure, using static spacing:",
          error.message
        );
      }

      // Use schema-aware coordinate filling (ensures all schema fields are checked)
      await fillPdfByCoordinatesWithSchema(
        pdfDoc,
        template.fieldMapping,
        formData,
        pdfStructure,
        formSchema
      );
    }

    // Save filled PDF
    const filledPdfBytes = await pdfDoc.save();
    const filledBuffer = Buffer.from(filledPdfBytes);

    // Upload to S3 in user-specific folder
    const fileName = `filled_${template.fileName}`;
    console.log(`[PDF] Uploading filled PDF for user ${userId}`);
    const uploadResult = await uploadFilledPdfToS3({
      tenantId,
      userId,
      fileName,
      buffer: filledBuffer,
      templateId: template.id,
    });

    return {
      success: true,
      templateId: template.id,
      templateName: template.displayName || template.fileName,
      filledPdfUrl: uploadResult.s3Url,
      filledPdfKey: uploadResult.s3Key,
    };
  } catch (error) {
    console.error("[PDF] Error filling PDF template:", error);
    throw new Error(`Failed to fill PDF template: ${error.message}`);
  }
}

/**
 * Fill all active PDF templates for a tenant with user's form data
 * @param {Object} params - Fill parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {Object} params.formData - Form data to fill
 * @returns {Promise<Object>} Result with all filled PDFs
 */
async function fillAllTenantPdfTemplates({ tenantId, userId, formData }) {
  try {
    // Get all active templates for tenant
    const templates = await getTenantPdfTemplates(tenantId);

    if (templates.length === 0) {
      return {
        success: true,
        message: "No PDF templates found for this tenant",
        filledPdfs: [],
      };
    }

    console.log(
      `[PDF] Filling ${templates.length} PDF templates for user ${userId}`
    );

    const results = [];
    const errors = [];

    // Fill each template
    for (const template of templates) {
      try {
        const result = await fillPdfTemplate({
          templateId: template.id,
          tenantId,
          userId,
          formData,
        });
        results.push(result);
      } catch (error) {
        console.error(
          `[PDF] Failed to fill template ${template.id}:`,
          error.message
        );
        errors.push({
          templateId: template.id,
          templateName: template.displayName || template.fileName,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      totalTemplates: templates.length,
      successfulFills: results.length,
      failedFills: errors.length,
      filledPdfs: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("[PDF] Error filling all templates:", error);
    throw new Error(`Failed to fill PDF templates: ${error.message}`);
  }
}

/**
 * Remap a template's fieldMapping to current schema (populate schemaKey)
 * Improved matching algorithm with better field name recognition
 */
async function remapTemplateFieldMapping({ templateId, tenantId }) {
  try {
    const prisma = require("../../lib/prisma");
    const template = await getPdfTemplateById(templateId, tenantId);
    const mapping = Array.isArray(template.fieldMapping)
      ? template.fieldMapping
      : [];
    const latestSchema = await prisma.formSchema.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!latestSchema?.schemaJson?.fields) {
      return {
        success: false,
        message: "No active schema found to remap against",
      };
    }

    // Create schema fields with multiple normalization strategies
    const schemaFields = latestSchema.schemaJson.fields.map((f) => {
      const name = (f.name || f.label || "").toString();
      const label = (f.label || f.name || "").toString();
      return {
        key: name,
        label: label,
        norm: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        normLabel: label.toLowerCase().replace(/[^a-z0-9]/g, ""),
        // Additional patterns for common field variations
        patterns: [
          name.toLowerCase().replace(/[^a-z0-9]/g, ""),
          label.toLowerCase().replace(/[^a-z0-9]/g, ""),
          name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          label.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        ],
      };
    });

    // Use semantic normalization for consistent matching
    const {
      normalizeFieldNameSemantic,
    } = require("../../utils/fieldNormalization.util");
    const normalize = (s) =>
      (s || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    // Improved matching with multiple strategies
    const remapped = mapping.map((m) => {
      const fieldName = (m.fieldName || m.label || "").toString();
      // Use semantic normalization for better matching (handles word order variations)
      const pdfNormSemantic =
        normalizeFieldNameSemantic(fieldName) || fieldName.toLowerCase();
      const pdfNorm = normalize(pdfNormSemantic);

      let best = null;
      let bestScore = 0;

      // Strategy 1: Exact match (using semantic normalization)
      for (const sf of schemaFields) {
        // Normalize schema field name semantically for comparison
        const schemaNormSemantic =
          normalizeFieldNameSemantic(sf.key) || sf.key.toLowerCase();
        const schemaNorm = normalize(schemaNormSemantic);

        if (
          pdfNorm === schemaNorm ||
          sf.norm === pdfNorm ||
          sf.normLabel === pdfNorm
        ) {
          best = sf;
          bestScore = 100;
          break;
        }
      }

      // Strategy 2: Substring matching with scoring
      if (!best) {
        for (const sf of schemaFields) {
          let score = 0;

          // Check if one contains the other
          if (sf.norm.includes(pdfNorm) || pdfNorm.includes(sf.norm)) {
            score =
              (Math.min(sf.norm.length, pdfNorm.length) /
                Math.max(sf.norm.length, pdfNorm.length)) *
              80;
          }

          // Check label matching
          if (
            sf.normLabel.includes(pdfNorm) ||
            pdfNorm.includes(sf.normLabel)
          ) {
            const labelScore =
              (Math.min(sf.normLabel.length, pdfNorm.length) /
                Math.max(sf.normLabel.length, pdfNorm.length)) *
              75;
            score = Math.max(score, labelScore);
          }

          // Pattern matching for common variations
          for (const pattern of sf.patterns) {
            if (
              pattern === pdfNorm ||
              pattern.includes(pdfNorm) ||
              pdfNorm.includes(pattern)
            ) {
              score = Math.max(score, 70);
            }
          }

          if (score > bestScore) {
            bestScore = score;
            best = sf;
          }
        }
      }

      // Strategy 3: Word-based matching for multi-word fields
      if (!best || bestScore < 60) {
        const pdfWords = pdfNorm.match(/\w+/g) || [];
        for (const sf of schemaFields) {
          const schemaWords = sf.norm.match(/\w+/g) || [];
          const labelWords = sf.normLabel.match(/\w+/g) || [];

          let wordMatches = 0;
          let totalWords = Math.max(
            pdfWords.length,
            Math.max(schemaWords.length, labelWords.length)
          );

          // Count matching words
          for (const pdfWord of pdfWords) {
            if (schemaWords.includes(pdfWord) || labelWords.includes(pdfWord)) {
              wordMatches++;
            }
          }

          if (totalWords > 0) {
            const wordScore = (wordMatches / totalWords) * 60;
            if (wordScore > bestScore) {
              bestScore = wordScore;
              best = sf;
            }
          }
        }
      }

      // Only use match if score is reasonable (at least 50%)
      if (best && bestScore >= 50) {
        console.log(
          `[MAPPING] Matched "${fieldName}" → "${
            best.key
          }" (score: ${bestScore.toFixed(1)})`
        );
        return { ...m, schemaKey: best.key };
      } else {
        console.log(
          `[MAPPING] No match found for "${fieldName}" (best score: ${bestScore.toFixed(
            1
          )})`
        );
        return { ...m, schemaKey: m.schemaKey || null };
      }
    });

    const updated = await prisma.pdfTemplate.update({
      where: { id: templateId },
      data: { fieldMapping: remapped },
    });

    const matched = remapped.filter((m) => !!m.schemaKey).length;
    const matchedFields = remapped
      .filter((m) => !!m.schemaKey)
      .map((m) => ({
        pdfField: m.fieldName || m.label,
        schemaField: m.schemaKey,
      }));
    const unmatchedFields = remapped
      .filter((m) => !m.schemaKey)
      .map((m) => ({
        pdfField: m.fieldName || m.label,
      }));

    console.log(
      `[MAPPING] Remapped template ${templateId}: ${matched}/${remapped.length} fields linked to schema`
    );
    if (matchedFields.length > 0) {
      console.log(
        `[MAPPING] ✅ Matched fields:`,
        matchedFields.map((f) => `${f.pdfField} → ${f.schemaField}`).join(", ")
      );
    }
    if (unmatchedFields.length > 0) {
      console.log(
        `[MAPPING] ⚠️  Unmatched fields:`,
        unmatchedFields.map((f) => f.pdfField).join(", ")
      );
    }

    return {
      success: true,
      templateId,
      matched,
      total: remapped.length,
      matchedFields,
      unmatchedFields,
    };
  } catch (err) {
    console.error("[MAPPING] Remap failed:", err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Update field mapping for an existing PDF template
 * Allows manual adjustment of coordinates
 */
async function updateTemplateFieldMapping({
  templateId,
  tenantId,
  fieldMapping,
}) {
  try {
    const prisma = require("../../lib/prisma");

    // Verify template exists and belongs to tenant
    const template = await getPdfTemplateById(templateId, tenantId);

    // Validate field mapping structure
    if (!Array.isArray(fieldMapping)) {
      return { success: false, message: "fieldMapping must be an array" };
    }

    // Validate each field has required properties
    for (const field of fieldMapping) {
      if (!field.fieldName && !field.label) {
        return {
          success: false,
          message: "Each field must have fieldName or label",
        };
      }
      if (typeof field.page !== "number" || field.page < 0) {
        return {
          success: false,
          message: "Each field must have a valid page number (>= 0)",
        };
      }
      if (typeof field.x !== "number" || typeof field.y !== "number") {
        return {
          success: false,
          message: "Each field must have valid x and y coordinates",
        };
      }
    }

    // Update template with new field mapping
    const updated = await prisma.pdfTemplate.update({
      where: { id: templateId },
      data: {
        fieldMapping: fieldMapping,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[MAPPING] Updated template ${templateId} with ${fieldMapping.length} fields`
    );
    return {
      success: true,
      templateId,
      fieldCount: fieldMapping.length,
      message: `Successfully updated field mapping with ${fieldMapping.length} fields`,
    };
  } catch (err) {
    console.error("[MAPPING] Update failed:", err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Regenerate field mapping for an existing PDF template using AI detection
 * This is useful when a template was uploaded before AI detection was enabled
 */
/**
 * Regenerate template field mapping using schema-driven detection (ensures 100% coverage)
 * @param {Object} params
 * @param {string} params.templateId - Template ID
 * @param {string} params.tenantId - Tenant ID
 * @returns {Promise<Object>} Remap result
 */
async function regenerateTemplateFieldMappingWithSchema({
  templateId,
  tenantId,
}) {
  try {
    console.log(
      `[REGENERATE-SCHEMA] Regenerating template ${templateId} with schema-driven detection for 100% coverage...`
    );

    const prisma = require("../../lib/prisma");

    // First, verify template exists
    const template = await prisma.pdfTemplate.findFirst({
      where: {
        id: templateId,
        tenantId: tenantId,
        isActive: true,
      },
    });

    if (!template) {
      console.warn(
        `[REGENERATE-SCHEMA] ⚠️ Template ${templateId} not found or not active - skipping remap`
      );
      return {
        success: false,
        message: `Template ${templateId} not found or not active`,
      };
    }

    // Download PDF from S3
    const pdfBuffer = await downloadPdfFromS3(template.s3Key);

    // Use schema-driven detection for 100% coverage
    const {
      detectFieldsFromSchema,
    } = require("../ai/schemaDrivenFieldDetection.service");
    const detectedFieldMapping = await detectFieldsFromSchema({
      pdfBuffer,
      fileName: template.fileName,
      tenantId,
    });

    if (!detectedFieldMapping || detectedFieldMapping.length === 0) {
      console.warn(
        `[REGENERATE-SCHEMA] ⚠️ Schema-driven detection returned no fields for template ${templateId}`
      );
      return {
        success: false,
        message: "Schema-driven detection returned no fields",
      };
    }

    // Update template with schema-driven mapping (100% coverage)
    const updated = await prisma.pdfTemplate.update({
      where: {
        id: templateId,
        tenantId: tenantId, // Add tenantId to where clause for safety
      },
      data: {
        fieldMapping: detectedFieldMapping,
        updatedAt: new Date(),
      },
    });

    const matched = detectedFieldMapping.filter(
      (m) => m.schemaKey && !m.notInPdf
    ).length;
    const notInPdf = detectedFieldMapping.filter((m) => m.notInPdf).length;
    const total = detectedFieldMapping.length;

    console.log(
      `[REGENERATE-SCHEMA] ✅ Schema-driven remap complete: ${matched} found, ${notInPdf} not in PDF, ${total} total (100% coverage)`
    );

    return {
      success: true,
      matched,
      notInPdf,
      total,
      message: `Schema-driven remap complete: ${matched} found, ${notInPdf} not in PDF (100% schema coverage)`,
    };
  } catch (error) {
    console.error(
      "[REGENERATE-SCHEMA] Error regenerating with schema-driven detection:",
      error
    );
    throw error;
  }
}

/**
 * Regenerate template field mapping (traditional method)
 * @param {Object} params
 * @param {string} params.templateId - Template ID
 * @param {string} params.tenantId - Tenant ID
 * @returns {Promise<Object>} Remap result
 */
async function regenerateTemplateFieldMapping({ templateId, tenantId }) {
  try {
    const template = await getPdfTemplateById(templateId, tenantId);

    // Download PDF from S3
    const pdfBuffer = await downloadPdfFromS3(template.s3Key);

    // Try AI detection to generate new field mapping
    const {
      generateFieldMappingWithAI,
    } = require("../ai/aiFieldDetection.service");
    const { PDFDocument } = require("pdf-lib");

    let detectedFieldMapping = [];

    // First, try to extract interactive fields
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const form = pdfDoc.getForm();
      const formFields = form.getFields();

      if (formFields.length > 0) {
        console.log(
          `[REGENERATE] Found ${formFields.length} interactive fields`
        );
        detectedFieldMapping = formFields.map((formField) => {
          const fieldType = formField.constructor.name;
          return {
            fieldName: formField.getName(),
            label: formField
              .getName()
              .split(/(?=[A-Z])/)
              .join(" "),
            type: fieldType.replace("PDF", "").toLowerCase(),
            interactiveField: true,
          };
        });
      }
    } catch (error) {
      console.error(
        "[REGENERATE] Failed to extract interactive fields:",
        error.message
      );
    }

    // If no interactive fields, try AI detection
    if (detectedFieldMapping.length === 0) {
      try {
        console.log("[REGENERATE] Attempting AI field detection...");
        detectedFieldMapping = await generateFieldMappingWithAI({
          pdfBuffer,
          fileName: template.fileName,
          tenantId,
        });
        console.log(
          `[REGENERATE] AI detected ${detectedFieldMapping.length} fields`
        );
      } catch (error) {
        console.error("[REGENERATE] AI detection failed:", error.message);
        throw new Error("Failed to generate field mapping via AI");
      }
    }

    if (detectedFieldMapping.length === 0) {
      return { success: false, message: "No fields detected in PDF" };
    }

    // Map fields to schema
    const prisma = require("../../lib/prisma");
    const latestSchema = await prisma.formSchema.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (latestSchema?.schemaJson?.fields) {
      // Use semantic normalization for consistent matching
      const {
        normalizeFieldNameSemantic,
      } = require("../../utils/fieldNormalization.util");

      const schemaFields = latestSchema.schemaJson.fields.map((f) => ({
        key: (f.name || f.label || "").toString(),
        norm: (f.name || f.label || "")
          .toString()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
      }));
      const normalize = (s) =>
        (s || "")
          .toString()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      detectedFieldMapping = detectedFieldMapping.map((m) => {
        const fieldName = m.fieldName || m.label || "";
        // Use semantic normalization for better matching (handles word order variations)
        const pdfNormSemantic =
          normalizeFieldNameSemantic(fieldName) || fieldName.toLowerCase();
        const pdfNorm = normalize(pdfNormSemantic);

        let best = null;
        for (const sf of schemaFields) {
          // Normalize schema field name semantically for comparison
          const schemaNormSemantic =
            normalizeFieldNameSemantic(sf.key) || sf.key.toLowerCase();
          const schemaNorm = normalize(schemaNormSemantic);

          if (
            pdfNorm === schemaNorm ||
            sf.norm === pdfNorm ||
            sf.norm.includes(pdfNorm) ||
            pdfNorm.includes(sf.norm)
          ) {
            best = sf;
            break;
          }
        }
        return { ...m, schemaKey: best?.key || null };
      });
    }

    // Update template with new mapping
    const updated = await prisma.pdfTemplate.update({
      where: { id: templateId },
      data: { fieldMapping: detectedFieldMapping },
    });

    const matched = detectedFieldMapping.filter((m) => !!m.schemaKey).length;
    console.log(
      `[REGENERATE] ✅ Regenerated mapping: ${matched}/${detectedFieldMapping.length} fields linked to schema`
    );

    return {
      success: true,
      templateId,
      total: detectedFieldMapping.length,
      matched,
      newMapping: detectedFieldMapping,
    };
  } catch (err) {
    console.error("[REGENERATE] Failed:", err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  storePdfTemplate,
  getTenantPdfTemplates,
  getPdfTemplateById,
  fillPdfTemplate,
  fillAllTenantPdfTemplates,
  remapTemplateFieldMapping,
  regenerateTemplateFieldMapping,
  regenerateTemplateFieldMappingWithSchema,
};

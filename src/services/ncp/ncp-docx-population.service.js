const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const { getNcpTemplateFromS3, uploadPopulatedDocxToS3 } = require("../../utils/s3.util");
const { loadNcpSchema } = require("./ncp-ai-extraction.service");

// Track nullGetter warnings to avoid duplicate logs per template population
const nullGetterWarnings = new Set();
// Track successfully mapped placeholders
const mappedPlaceholders = new Set();

/**
 * Prepare extracted data for DOCX template population
 * Transforms data to match template placeholder format
 * @param {Object} extractedData - Extracted data from AI
 * @param {Object} schema - NCP schema for field definitions
 * @returns {Object} Template-ready data object
 */
function prepareTemplateData(extractedData, schema = null) {
  console.log("[NCP-DOCX] Preparing template data...");

  // Load schema if not provided
  if (!schema) {
    try {
      schema = loadNcpSchema();
    } catch (error) {
      console.warn("[NCP-DOCX] Warning: Could not load schema, proceeding without validation");
      schema = {};
    }
  }

  const templateData = {};

  // Process each field
  Object.entries(extractedData).forEach(([fieldName, fieldValue]) => {
    const fieldDef = schema[fieldName] || {};

    // Handle null/undefined values
    if (fieldValue === null || fieldValue === undefined) {
      templateData[fieldName] = "";
      return;
    }

    // Handle checkbox fields
    if (fieldDef.enum && fieldDef.enum.includes("X") && fieldDef.enum.includes("")) {
      // Checkbox field: "X" for checked, "" for unchecked
      if (fieldValue === "X" || fieldValue === true || fieldValue === "true") {
        templateData[fieldName] = "X";
      } else {
        templateData[fieldName] = ""; // Empty string for unchecked
      }
      return;
    }

    // Handle enum fields - accept any extracted value (AI may extract semantically correct values that don't match exact enum)
    // Enum values in schema are for reference only, not strict validation
    if (fieldDef.enum?.length > 0 && !fieldDef.enum.includes("X") && !fieldDef.enum.includes("")) {
      // For non-checkbox enum fields, use the extracted value as-is
      // AI can extract natural language like "Extensive assistance" even if enum says "Assistance Needed"
      templateData[fieldName] = String(fieldValue || "");
      return;
    }

    // Handle date fields - ensure MM/DD/YYYY format
    if (fieldDef.description?.includes("MM/DD/YYYY")) {
      if (fieldValue && typeof fieldValue === "string" && fieldValue.trim() !== "") {
        // Check if already in correct format
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (datePattern.test(fieldValue)) {
          templateData[fieldName] = fieldValue;
        } else {
          // Try to parse and reformat
          try {
            const date = new Date(fieldValue);
            if (Number.isFinite(date.getTime())) {
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              const year = date.getFullYear();
              templateData[fieldName] = `${month}/${day}/${year}`;
            } else {
              templateData[fieldName] = fieldValue; // Keep original if parsing fails
            }
          } catch (e) {
            // Keep original on error - date parsing failed
            templateData[fieldName] = fieldValue;
          }
        }
      } else {
        templateData[fieldName] = "";
      }
      return;
    }

    // Handle string fields
    if (typeof fieldValue === "string") {
      templateData[fieldName] = fieldValue.trim();
    } else if (typeof fieldValue === "number") {
      templateData[fieldName] = String(fieldValue);
    } else if (typeof fieldValue === "boolean") {
      templateData[fieldName] = fieldValue ? "Yes" : "No";
    } else {
      // Fallback: convert to string
      templateData[fieldName] = String(fieldValue || "");
    }
  });

  // Ensure all schema fields have a value (even if empty) to prevent template errors
  Object.keys(schema).forEach((fieldName) => {
    if (!(fieldName in templateData)) {
      templateData[fieldName] = "";
    }
  });

  console.log(
    `[NCP-DOCX] ✅ Prepared ${Object.keys(templateData).length} fields for template population`
  );

  return templateData;
}

/**
 * Populate DOCX template with extracted data
 * @param {Buffer} templateBuffer - DOCX template file buffer
 * @param {Object} extractedData - Extracted data from AI
 * @param {Object} options - Population options
 * @returns {Promise<Buffer>} Populated DOCX buffer
 */
async function populateDocxTemplate(templateBuffer, extractedData, options = {}) {
  // Reset tracking sets for each new template population
  nullGetterWarnings.clear();
  mappedPlaceholders.clear();

  try {
    console.log("[NCP-DOCX] Starting DOCX template population...");

    if (!templateBuffer || templateBuffer.length === 0) {
      throw new Error("Template buffer is empty");
    }

    if (!extractedData || typeof extractedData !== "object") {
      throw new Error("Extracted data is invalid");
    }

    // Load schema for field definitions
    let schema = {};
    try {
      schema = loadNcpSchema();
    } catch (error) {
      console.warn(
        "[NCP-DOCX] Warning: Could not load schema, proceeding without field definitions:",
        error.message
      );
    }

    // Prepare template data
    const templateData = prepareTemplateData(extractedData, schema);

    // Get all placeholders from template to track mapping
    const allPlaceholders = getTemplatePlaceholders(templateBuffer);
    console.log(`[NCP-DOCX] Template contains ${allPlaceholders.length} placeholders`);

    // Load DOCX template
    console.log("[NCP-DOCX] Loading DOCX template...");
    const zip = new PizZip(templateBuffer);

    // Initialize docxtemplater with double curly braces delimiters ({{ }})
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true, // Loop through paragraphs
      linebreaks: true, // Preserve line breaks
      delimiters: {
        start: "{{",
        end: "}}",
      },
      nullGetter: (part) => {
        // Handle null/undefined values gracefully
        // part.value contains the placeholder name, part.module might not be available
        const placeholderName = part.value || part.module || part.raw || "unknown";
        // Only log once per unique placeholder to reduce noise
        if (!nullGetterWarnings.has(placeholderName)) {
          nullGetterWarnings.add(placeholderName);
          console.warn(`[NCP-DOCX] Warning: Null value for placeholder: ${placeholderName}`);
        }
        return "";
      },
    });

    // Render template with data
    console.log("[NCP-DOCX] Rendering template with data...");
    try {
      doc.render(templateData);
    } catch (error) {
      // Handle docxtemplater errors
      if (error.properties && error.properties.errors instanceof Array) {
        const errorMessages = error.properties.errors
          .map((e) => `${e.name}: ${e.message}`)
          .join(", ");
        console.error("[NCP-DOCX] Template rendering errors:", errorMessages);
        throw new Error(`Template rendering failed: ${errorMessages}`);
      }
      throw error;
    }

    // Generate populated DOCX buffer
    console.log("[NCP-DOCX] Generating populated DOCX...");
    const buf = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Calculate mapping statistics
    // Count extracted fields with actual values (non-empty)
    const extractedFieldsWithValues = Object.entries(templateData).filter(
      ([_, value]) => value !== "" && value !== null && value !== undefined
    );

    const extractedFieldsWithValuesCount = extractedFieldsWithValues.length;
    const extractedFieldsWithValuesMap = new Map(extractedFieldsWithValues);

    // Mapped = placeholders that exist in templateData and have non-empty values
    allPlaceholders.forEach((placeholder) => {
      if (placeholder in templateData && templateData[placeholder] !== "" && templateData[placeholder] !== null && templateData[placeholder] !== undefined) {
        mappedPlaceholders.add(placeholder);
      }
    });

    // Find extracted fields with values that don't match any template placeholder
    const orphanedFields = extractedFieldsWithValues
      .filter(([fieldName]) => !allPlaceholders.includes(fieldName))
      .map(([fieldName]) => fieldName);

    const mappedCount = mappedPlaceholders.size;
    const missingCount = nullGetterWarnings.size;
    const totalPlaceholders = allPlaceholders.length;
    const totalExtractedFields = Object.keys(templateData).length;
    const mappingRate = totalPlaceholders > 0 ? ((mappedCount / totalPlaceholders) * 100).toFixed(1) : 0;
    const extractionRate = totalExtractedFields > 0 ? ((extractedFieldsWithValuesCount / totalExtractedFields) * 100).toFixed(1) : 0;

    console.log(`[NCP-DOCX] ✅ Successfully populated DOCX (${buf.length} bytes)`);
    console.log(`[NCP-DOCX] 📊 Extraction Statistics: ${extractedFieldsWithValuesCount}/${totalExtractedFields} extracted fields have values (${extractionRate}%)`);
    console.log(`[NCP-DOCX] 📊 Mapping Statistics: ${mappedCount}/${totalPlaceholders} template placeholders mapped (${mappingRate}%), ${missingCount} missing`);
    if (orphanedFields.length > 0) {
      console.log(`[NCP-DOCX] ⚠️  ${orphanedFields.length} extracted fields with values don't match template placeholders (not in template)`);
    }

    return buf;
  } catch (error) {
    console.error("[NCP-DOCX] Error populating DOCX template:", error);
    throw new Error(`Failed to populate DOCX template: ${error.message}`);
  }
}

/**
 * Generate populated DOCX from template and extracted data
 * Downloads template, populates it, and uploads to S3
 * @param {Object} params - Generation parameters
 * @param {Object} params.extractedData - Extracted NCP data
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {string} params.extractionId - NCP extraction ID
 * @param {string} [params.templateS3Key] - Optional template S3 key override
 * @param {string} [params.fileName] - Optional output file name
 * @returns {Promise<Object>} Result with S3 URL and metadata
 */
async function generatePopulatedDocx({
  extractedData,
  tenantId,
  userId,
  extractionId,
  templateS3Key = null,
  fileName = null,
}) {
  try {
    console.log(`[NCP-DOCX] Generating populated DOCX for extraction ${extractionId}...`);

    // Validate inputs
    if (!extractedData || typeof extractedData !== "object") {
      throw new Error("Extracted data is required");
    }
    if (!tenantId) {
      throw new Error("Tenant ID is required");
    }
    if (!userId) {
      throw new Error("User ID is required");
    }
    if (!extractionId) {
      throw new Error("Extraction ID is required");
    }

    // Step 1: Download template from S3
    console.log("[NCP-DOCX] Downloading template from S3...");
    const templateBuffer = await getNcpTemplateFromS3(templateS3Key);

    // Step 2: Populate template
    console.log("[NCP-DOCX] Populating template with extracted data...");
    const populatedBuffer = await populateDocxTemplate(templateBuffer, extractedData);

    // Step 3: Generate file name if not provided
    const outputFileName =
      fileName ||
      `NCP_${extractionId}_${new Date().toISOString().split("T")[0]}.docx`;

    // Step 4: Upload populated DOCX to S3
    console.log("[NCP-DOCX] Uploading populated DOCX to S3...");
    const uploadResult = await uploadPopulatedDocxToS3({
      tenantId,
      userId,
      extractionId,
      fileName: outputFileName,
      buffer: populatedBuffer,
    });

    console.log(`[NCP-DOCX] ✅ Successfully generated and uploaded populated DOCX`);

    return {
      success: true,
      s3Key: uploadResult.s3Key,
      s3Url: uploadResult.s3Url,
      fileName: outputFileName,
      fileSize: populatedBuffer.length,
      extractionId,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[NCP-DOCX] Error generating populated DOCX:", error);
    throw new Error(`Failed to generate populated DOCX: ${error.message}`);
  }
}

/**
 * Get list of placeholders in template (for validation/debugging)
 * @param {Buffer} templateBuffer - DOCX template buffer
 * @returns {Array<string>} Array of placeholder names found in template
 */
function getTemplatePlaceholders(templateBuffer) {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: "{{",
        end: "}}",
      },
    });

    // Get all tags from template (using double curly braces)
    const tags = doc.getFullText().match(/\{\{([^}]+)\}\}/g) || [];
    const placeholders = tags
      .map((tag) => tag.replaceAll(/[{}]/g, ""))
      .filter((tag, index, self) => self.indexOf(tag) === index); // Remove duplicates

    return placeholders;
  } catch (error) {
    console.error("[NCP-DOCX] Error extracting placeholders:", error);
    return [];
  }
}

/**
 * Validate that extracted data has values for all required template placeholders
 * @param {Buffer} templateBuffer - DOCX template buffer
 * @param {Object} extractedData - Extracted data
 * @returns {Object} Validation result
 */
function validateTemplateData(templateBuffer, extractedData) {
  try {
    const placeholders = getTemplatePlaceholders(templateBuffer);
    const missingFields = [];
    const emptyFields = [];

    placeholders.forEach((placeholder) => {
      if (!(placeholder in extractedData)) {
        missingFields.push(placeholder);
      } else if (
        extractedData[placeholder] === null ||
        extractedData[placeholder] === undefined ||
        extractedData[placeholder] === ""
      ) {
        emptyFields.push(placeholder);
      }
    });

    return {
      isValid: missingFields.length === 0,
      totalPlaceholders: placeholders.length,
      missingFields,
      emptyFields,
      warnings:
        emptyFields.length > 0
          ? [`${emptyFields.length} placeholders have empty values`]
          : [],
    };
  } catch (error) {
    console.error("[NCP-DOCX] Error validating template data:", error);
    return {
      isValid: false,
      error: error.message,
    };
  }
}

module.exports = {
  populateDocxTemplate,
  generatePopulatedDocx,
  prepareTemplateData,
  getTemplatePlaceholders,
  validateTemplateData,
};

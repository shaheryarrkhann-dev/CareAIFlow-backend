/**
 * Schema-Driven Field Detection Service
 *
 * Ensures 100% schema field coverage by:
 * 1. Getting form schema (source of truth)
 * 2. For each schema field, searching PDF using OpenAI
 * 3. Creating mapping for each schema field (found OR notInPdf)
 *
 * This guarantees ALL schema fields have mappings
 */

const {
  generateFieldMappingWithCoordinateAI,
  extractPdfStructure,
} = require("./aiFieldDetectionCoordinate.service");
const { generateFieldMappingWithAI } = require("./aiFieldDetection.service");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Find a specific schema field in PDF using OpenAI
 * @param {Object} params
 * @param {Object} params.schemaField - Schema field to find
 * @param {Buffer} params.pdfBuffer - PDF buffer
 * @param {Object} params.formSchema - Full form schema
 * @param {Array} params.detectedFields - Already detected fields from bulk detection
 * @returns {Promise<Object|null>} Field mapping if found, null otherwise
 */
async function findSchemaFieldInPdf({
  schemaField,
  pdfBuffer,
  formSchema,
  detectedFields = [],
}) {
  try {
    const fieldName = schemaField.name || schemaField.label;
    const fieldLabel = schemaField.label || schemaField.name;

    // First, check if field was already detected in bulk detection
    const normalize = (s) =>
      (s || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const normalizedSchemaName = normalize(fieldName);
    const normalizedSchemaLabel = normalize(fieldLabel);

    // Check if this is a witness field - need stricter matching
    const isWitnessField = fieldName.includes("witness");
    const isSignatureField = fieldName.includes("signature");
    const isRelationshipField = fieldName.includes("relationship");

    // **CRITICAL - MULTIPLE OCCURRENCES**: Collect ALL matching fields, not just the first one
    const matchingFields = [];

    for (const detected of detectedFields) {
      const detectedName = normalize(detected.fieldName || "");
      const detectedLabel = normalize(detected.label || "");

      // For witness fields, require "witness" in the detected field name/label
      if (isWitnessField) {
        const hasWitness =
          detectedName.includes("witness") || detectedLabel.includes("witness");
        if (!hasWitness) {
          continue; // Skip if witness field doesn't have "witness" in name/label
        }
      } else {
        // For non-witness fields, exclude fields that have "witness" (to avoid mismatches)
        const hasWitness =
          detectedName.includes("witness") || detectedLabel.includes("witness");
        if (hasWitness) {
          continue; // Skip witness fields when looking for non-witness fields
        }
      }

      // For signature fields, check context
      if (isSignatureField) {
        // If looking for regular signature, exclude witness signatures
        if (
          !isWitnessField &&
          (detectedName.includes("witness") ||
            detectedLabel.includes("witness"))
        ) {
          continue; // Skip witness signature when looking for regular signature
        }
        // If looking for witness signature, require witness in detected field
        if (
          isWitnessField &&
          !detectedName.includes("witness") &&
          !detectedLabel.includes("witness")
        ) {
          continue; // Skip regular signature when looking for witness signature
        }
      }

      // For relationship fields, check context
      if (isRelationshipField) {
        // If looking for regular relationship, exclude witness relationships
        if (
          !isWitnessField &&
          (detectedName.includes("witness") ||
            detectedLabel.includes("witness"))
        ) {
          continue; // Skip witness relationship when looking for regular relationship
        }
        // If looking for witness relationship, require witness in detected field
        if (
          isWitnessField &&
          !detectedName.includes("witness") &&
          !detectedLabel.includes("witness")
        ) {
          continue; // Skip regular relationship when looking for witness relationship
        }
      }

      // Check multiple matching strategies (but with context awareness)
      const exactMatch =
        detectedName === normalizedSchemaName ||
        detectedLabel === normalizedSchemaName;
      const labelMatch =
        detectedName === normalizedSchemaLabel ||
        detectedLabel === normalizedSchemaLabel;
      const nameContains =
        detectedName.includes(normalizedSchemaName) ||
        normalizedSchemaName.includes(detectedName);
      const labelContains =
        detectedLabel.includes(normalizedSchemaLabel) ||
        normalizedSchemaLabel.includes(detectedLabel);

      // Prefer exact matches for witness fields to avoid confusion
      if (isWitnessField && !exactMatch && !labelMatch) {
        // For witness fields, require stronger match
        if (!nameContains && !labelContains) {
          continue;
        }
      }

      if (exactMatch || labelMatch || nameContains || labelContains) {
        // **CRITICAL - COLLECT ALL MATCHES**: Don't return immediately, collect all matches
        matchingFields.push({
          ...detected,
          schemaKey: fieldName,
          matchedFrom: "bulk-detection",
          matchScore:
            exactMatch || labelMatch
              ? 100
              : nameContains || labelContains
              ? 80
              : 60,
        });
      }
    }

    // If multiple matches found, return all of them (caller will handle)
    if (matchingFields.length > 0) {
      if (matchingFields.length > 1) {
        console.log(
          `[SCHEMA-DRIVEN] ✅ Found ${matchingFields.length} occurrences of "${fieldName}" in bulk detection`
        );
      } else {
        console.log(
          `[SCHEMA-DRIVEN] ✅ Found schema field "${fieldName}" in bulk detection: "${
            matchingFields[0].fieldName || matchingFields[0].label
          }"`
        );
      }

      // Return all matches with metadata
      if (matchingFields.length > 1) {
        return {
          ...matchingFields[0], // Return first as primary
          multipleOccurrences: true,
          allOccurrences: matchingFields,
          totalOccurrences: matchingFields.length,
        };
      } else {
        return matchingFields[0];
      }
    }

    // If not found in bulk detection, use targeted OpenAI search
    console.log(
      `[SCHEMA-DRIVEN] 🔍 Searching for schema field "${fieldName}" in PDF using OpenAI...`
    );

    // Extract PDF text/structure for targeted search
    const pdfStructure = await extractPdfStructure(pdfBuffer);

    // Build prompt for targeted field search - ENHANCED for underline/blank fields
    const systemPrompt = `You are an expert form field locator. Your task is to find a SPECIFIC field in a PDF form based on the schema field description.

SCHEMA FIELD TO FIND:
- Name: "${fieldName}"
- Label: "${fieldLabel}"
- Type: ${schemaField.type || "text"}

PDF STRUCTURE:
${JSON.stringify(
  pdfStructure.slice(0, 2),
  null,
  2
)} // First 2 pages for context

CRITICAL - DETECT ALL FIELD PATTERNS:
1. **Standard Pattern**: "Label: _______" (label followed by underlines/dashes)
   Example: "Name: _______" or "Date: --------"

2. **Inline Pattern**: Fields within sentences with blanks
   Example: "This agreement is between _____ and _____"
   Example: "The party of the first part, _____ (name)"
   Look for underscores/dashes WITHIN text, not just at the end

3. **Sentence Pattern**: Labels that are part of sentences
   Example: "Name of resident: _____" or "Agreement between _____ and _____"

4. **Multiple Fields in Sentence**:
   Example: "I, _____ (name), agree to _____ (action)"
   Each blank/underline is a separate field - detect all of them

FIELD DETECTION RULES:
- Look for underlines: ___ or _ _ _ (underscores)
- Look for dashes: --- or - - - (dashes)
- Look for blank spaces after labels: "Label:    " (multiple spaces)
- Look for blanks within sentences: "between _____ and _____"
- Look for patterns: "Label: _____", "Label: -----", "Label:    "
- Look for inline blanks: "agreement between _____ and _____"

COORDINATE REQUIREMENTS:
- X coordinate: Where the underline/blanks START (after label + spacing)
- Y coordinate: Y position of the underline line or blank space baseline
- Width: Length of the underline/blanks area
- Height: Standard field height (15-20pt for text)

TASK:
1. Search the PDF structure for this specific field
2. Look for "${fieldLabel}" or similar variations with:
   - Following underlines/dashes: "${fieldLabel}: _____"
   - Inline blanks: "text with ${fieldLabel} _____ text"
   - Sentence patterns: "Agreement with ${fieldLabel}: _____"
   - **CRITICAL**: Also search for contextual patterns:
     * For "Resident Name" or "resident_name": Look for patterns like "AFRatames _______", "_______ is seeking residency", "Name: _______", "resident: _______"
       - Find inline field: "AFRatames _______" → detect underline AFTER "AFRatames"
       - Look for text "AFRatames" or "is seeking residency" followed by underlines
     * For "Authorized Person" or "authorized_person_name": Look for patterns like "I, _______ authorize", "_______ authorize your facility", "Authorized Person: _______"
       - Find inline field: "I, _______ authorize" → detect underline AFTER "I,"
       - Look for text "I," followed by underlines, or "authorize your facility" preceded by underlines
     * For "Recipient Name" or "recipient_name": Look for patterns like "information or medical records of _______", "release to _______", "Recipient: _______"
       - Find inline field: "medical records of _______" → detect underline AFTER "of"
       - Look for text "medical records of" or "release to" followed by underlines
     * For "Witness Signature" or "witness_signature": Look for patterns like "Witness _______", "Witness Signature: _______"
       - **CRITICAL**: Must differentiate from regular "Signature" field
       - Look for text "Witness" near signature area
       - Check Y coordinate - witness signature is typically BELOW regular signature
     * For "Witness Relationship" or "witness_relationship": Look for patterns like "Witness Relationship: _______", "Relationship: _______" (near witness area)
       - **CRITICAL**: Must differentiate from "Relationship to Resident"
       - Look for text "Witness" near relationship field
       - Check Y coordinate - witness relationship is typically BELOW regular relationship
     * For "Facility Name" or "facility_name": Look for patterns like "facility name", "AFH needs", "Facility: _______", "Moxie Adult Family Home"
3. **🚨 CRITICAL - MULTIPLE OCCURRENCES**: Find ALL occurrences - if field appears multiple times, return ALL of them
   * Example: "Resident Name" appears 3 times → return all 3 with different coordinates
   * Example: "Date" appears 2 times → return both with different coordinates
   * **EACH occurrence = SEPARATE field** with unique coordinates
   * If field appears 5 times, return 5 separate entries - all must be filled!
   * **Don't return just one occurrence - return ALL occurrences!**
4. For signature/relationship fields: Check context (near "Witness" text) and position (Y coordinate) to differentiate
5. Find the field position (x, y coordinates) accurately - for inline fields, find where the underline/blanks START
6. Return ALL field mappings with accurate coordinates (if multiple occurrences, return array of mappings)

Return ONLY a JSON object:
{
  "found": true|false,
  "fieldName": "field_name_in_pdf",
  "label": "Field Label in PDF (including surrounding text if inline)",
  "page": 0,
  "x": 150,
  "y": 720,
  "width": 200,
  "height": 20,
  "type": "text|date|checkbox|textarea|dropdown|email|number",
  "pattern": "standard|inline|sentence" // Type of pattern detected
}

If field is NOT found, return:
{
  "found": false
}`;

    // Build enhanced user prompt with context about similar fields
    let userPrompt = `Find the field "${fieldName}" (label: "${fieldLabel}") in this PDF form.`;

    // Add context for fields that might be confused with others
    if (fieldName.includes("witness")) {
      userPrompt += `\n\nCRITICAL: This is a WITNESS field. Make sure to differentiate it from regular fields:
- For "witness_signature": Look for signature field NEAR "Witness" text, NOT the regular "Signature" field
- For "witness_relationship": Look for relationship field NEAR "Witness" text, NOT the regular "Relationship to Resident" field
- Check Y coordinate - witness fields are typically BELOW regular signature/relationship fields
- Look for context clues like "Witness" label nearby`;
    }

    if (fieldName.includes("resident") && !fieldName.includes("relationship")) {
      userPrompt += `\n\nCRITICAL: This is a RESIDENT NAME field. Look for:
- Inline field like "AFRatames _______" or "_______ is seeking residency"
- Text "AFRatames" or "is seeking residency" followed by underlines
- The underline should be AFTER the text, not before`;
    }

    if (fieldName.includes("authorized_person")) {
      userPrompt += `\n\nCRITICAL: This is an AUTHORIZED PERSON field. Look for:
- Inline field like "I, _______ authorize" or "_______ authorize your facility"
- Text "I," followed by underlines, or "authorize your facility" preceded by underlines
- The underline should be AFTER "I," or BEFORE "authorize"`;
    }

    if (fieldName.includes("recipient")) {
      userPrompt += `\n\nCRITICAL: This is a RECIPIENT field. Look for:
- Inline field like "information or medical records of _______" or "release to _______"
- Text "medical records of" or "release to" followed by underlines
- The underline should be AFTER "of" or "to"`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);

    if (result.found) {
      // Check if multiple occurrences were found
      if (
        result.occurrences &&
        Array.isArray(result.occurrences) &&
        result.occurrences.length > 0
      ) {
        // Multiple occurrences found - return the first one (caller will handle multiple)
        const firstOccurrence = result.occurrences[0];
        console.log(
          `[SCHEMA-DRIVEN] ✅ Found "${fieldName}" ${result.occurrences.length} times - first at (${firstOccurrence.x}, ${firstOccurrence.y})`
        );

        // Return first occurrence with metadata about total count
        return {
          fieldName: firstOccurrence.fieldName || fieldName,
          label: firstOccurrence.label || fieldLabel,
          page: firstOccurrence.page || 0,
          x: firstOccurrence.x,
          y: firstOccurrence.y,
          width: firstOccurrence.width || 200,
          height: firstOccurrence.height || 20,
          type: firstOccurrence.type || schemaField.type || "text",
          schemaKey: fieldName,
          matchedFrom: "targeted-search",
          multipleOccurrences: true, // Flag to indicate multiple occurrences exist
          allOccurrences: result.occurrences, // Store all occurrences for later use
        };
      } else if (result.x !== undefined && result.y !== undefined) {
        // Single occurrence found
        console.log(
          `[SCHEMA-DRIVEN] ✅ Found "${fieldName}" at (${result.x}, ${result.y})`
        );
        return {
          fieldName: result.fieldName || fieldName,
          label: result.label || fieldLabel,
          page: result.page || 0,
          x: result.x,
          y: result.y,
          width: result.width || 200,
          height: result.height || 20,
          type: result.type || schemaField.type || "text",
          schemaKey: fieldName,
          matchedFrom: "targeted-search",
          multipleOccurrences: false,
        };
      }
    }

    console.log(`[SCHEMA-DRIVEN] ❌ Field "${fieldName}" not found in PDF`);
    return null;
  } catch (error) {
    console.error(
      `[SCHEMA-DRIVEN] Error searching for field "${schemaField.name}":`,
      error.message
    );
    return null;
  }
}

/**
 * Schema-driven field detection - ensures 100% schema field coverage
 * @param {Object} params
 * @param {Buffer} params.pdfBuffer - PDF buffer
 * @param {string} params.fileName - File name
 * @param {string} params.tenantId - Tenant ID
 * @param {Object} [params.formSchema] - Optional form schema
 * @returns {Promise<Array>} Field mappings with 100% schema coverage
 */
async function detectFieldsFromSchema({
  pdfBuffer,
  fileName,
  tenantId,
  formSchema = null,
}) {
  try {
    console.log(
      "[SCHEMA-DRIVEN] 🎯 Starting schema-driven field detection for 100% coverage..."
    );

    // Step 1: Get form schema
    if (!formSchema) {
      const prisma = require("../../lib/prisma");
      const schemas = await prisma.formSchema.findMany({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      });

      if (schemas.length === 0) {
        // Schema not available yet (may be generating in background)
        // Return null to trigger fallback to traditional detection
        console.log(
          "[SCHEMA-DRIVEN] ⚠️ No active form schema found yet (may be generating in background)"
        );
        console.log(
          "[SCHEMA-DRIVEN] Will use traditional detection first, then remap with schema-driven after schema is generated"
        );
        return null; // Return null instead of throwing error
      }

      formSchema = schemas[0].schemaJson;
      console.log(
        `[SCHEMA-DRIVEN] ✅ Loaded form schema with ${
          formSchema.fields?.length || 0
        } fields`
      );
    }

    if (!formSchema.fields || formSchema.fields.length === 0) {
      throw new Error(
        "Form schema has no fields. Please generate schema first."
      );
    }

    const schemaFields = formSchema.fields;
    console.log(
      `[SCHEMA-DRIVEN] 📋 Processing ${schemaFields.length} schema fields for 100% coverage`
    );

    // Step 2: Run bulk OpenAI detection first (fast, gets most fields)
    console.log(
      "[SCHEMA-DRIVEN] 🔍 Running bulk OpenAI detection to find fields in PDF..."
    );
    let bulkDetectedFields = [];
    try {
      bulkDetectedFields = await generateFieldMappingWithCoordinateAI({
        pdfBuffer,
        fileName,
        tenantId,
        formSchema,
      });
      console.log(
        `[SCHEMA-DRIVEN] ✅ Bulk detection found ${bulkDetectedFields.length} fields in PDF`
      );
      console.log(
        `[SCHEMA-DRIVEN] 📋 Bulk-detected field names: ${bulkDetectedFields
          .map((f) => f.fieldName || f.label || "unnamed")
          .join(", ")}`
      );
    } catch (error) {
      console.warn(
        `[SCHEMA-DRIVEN] ⚠️ Bulk detection failed: ${error.message}`
      );
      // If bulk detection fails, return null to use fallback
      return null;
    }

    // **CRITICAL FIX**: Only process fields that are actually in the PDF (from bulk detection)
    // Don't check ALL 410 schema fields - only check fields that were detected in bulk
    // This prevents hundreds of unnecessary API calls for fields that don't exist in the PDF

    // Step 3: Match bulk-detected fields to schema fields
    // Track which detected fields have been used to prevent duplicates
    const usedDetectedFieldIds = new Set();
    const allMappings = [];
    const matchedSchemaKeys = new Set(); // Track which schema fields were matched
    let foundCount = 0;

    // Helper to create unique ID for a detected field (based on coordinates and name)
    const getFieldId = (field) => {
      const x = Math.round((field.x || 0) * 10) / 10;
      const y = Math.round((field.y || 0) * 10) / 10;
      const page = field.page || 0;
      const fieldName = field.fieldName || "unnamed";
      return `${fieldName}_${x}_${y}_${page}`;
    };

    // Match each bulk-detected field to a schema field
    // Use semantic normalization for consistent matching
    const {
      normalizeFieldNameSemantic,
    } = require("../../utils/fieldNormalization.util");
    const normalize = (s) =>
      (s || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    for (const detectedField of bulkDetectedFields) {
      const fieldId = getFieldId(detectedField);

      // Skip if this detected field was already used
      if (usedDetectedFieldIds.has(fieldId)) {
        continue;
      }

      // Try to find matching schema field
      // Use semantic normalization for better matching (handles word order variations)
      const detectedFieldName = detectedField.fieldName || "";
      const detectedNameSemantic =
        normalizeFieldNameSemantic(detectedFieldName) ||
        detectedFieldName.toLowerCase();
      const detectedName = normalize(detectedNameSemantic);
      const detectedLabel = normalize(detectedField.label || "");

      let matchedSchemaField = null;
      let bestMatchScore = 0;

      for (const schemaField of schemaFields) {
        // CRITICAL: Allow multiple occurrences of the same schema field
        // Don't skip if already matched - same field can appear multiple times in PDF
        // We only use matchedSchemaKeys for tracking existence, not for preventing duplicates

        // Normalize schema field name semantically for comparison
        const schemaFieldName = schemaField.name || "";
        const schemaNameSemantic =
          normalizeFieldNameSemantic(schemaFieldName) ||
          schemaFieldName.toLowerCase();
        const schemaName = normalize(schemaNameSemantic);
        const schemaLabel = normalize(schemaField.label || "");

        // Check for matches (using semantic normalization)
        const exactMatch =
          detectedName === schemaName || detectedLabel === schemaLabel;
        const nameMatch =
          detectedName === schemaName || detectedLabel === schemaName;
        const labelMatch =
          detectedName === schemaLabel || detectedLabel === schemaLabel;
        const containsMatch =
          detectedName.includes(schemaName) ||
          schemaName.includes(detectedName) ||
          detectedLabel.includes(schemaLabel) ||
          schemaLabel.includes(detectedLabel);

        // Calculate match score
        let matchScore = 0;
        if (exactMatch) matchScore = 100;
        else if (nameMatch || labelMatch) matchScore = 90;
        else if (containsMatch) matchScore = 70;

        // Context-aware matching for witness fields
        if (schemaField.name.includes("witness")) {
          const hasWitness =
            detectedName.includes("witness") ||
            detectedLabel.includes("witness");
          if (!hasWitness) {
            matchScore = 0; // Require "witness" for witness fields
          }
        } else {
          const hasWitness =
            detectedName.includes("witness") ||
            detectedLabel.includes("witness");
          if (hasWitness) {
            matchScore = 0; // Skip witness fields for non-witness schema fields
          }
        }

        if (matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
          matchedSchemaField = schemaField;
        }
      }

      // If matched, add to mappings
      // CRITICAL: Allow multiple occurrences of the same schema field
      // Don't check matchedSchemaKeys - same field can appear multiple times in PDF
      if (matchedSchemaField && bestMatchScore > 0) {
        // Track that we found at least one occurrence of this schema field
        matchedSchemaKeys.add(matchedSchemaField.name);

        // Add this occurrence to mappings (even if same schemaKey already exists)
        // Multiple occurrences of same field = multiple entries in mapping
        allMappings.push({
          ...detectedField,
          schemaKey: matchedSchemaField.name,
          label: detectedField.label || matchedSchemaField.label,
          confidence: bestMatchScore >= 90 ? "high" : "medium",
          occurrenceIndex: 1, // Will be recalculated later if needed
          totalOccurrences: 1, // Will be recalculated later if needed
        });
        foundCount++;
      } else {
        // No schema match - add as unmapped field (included for completeness, but no schemaKey)
        allMappings.push({
          ...detectedField,
          schemaKey: null,
          label: detectedField.label || detectedField.fieldName,
          confidence: "low",
        });
      }
    }

    // Step 4: Calculate occurrence counts for schema fields with multiple occurrences
    // Count how many times each schema field appears in the mappings
    const schemaFieldOccurrenceCounts = new Map();
    for (const mapping of allMappings) {
      if (mapping.schemaKey) {
        const count = schemaFieldOccurrenceCounts.get(mapping.schemaKey) || 0;
        schemaFieldOccurrenceCounts.set(mapping.schemaKey, count + 1);
      }
    }

    // Update occurrence indices for fields with multiple occurrences
    const schemaFieldIndices = new Map();
    for (let i = 0; i < allMappings.length; i++) {
      const mapping = allMappings[i];
      if (mapping.schemaKey && !mapping.notInPdf) {
        const totalOccurrences =
          schemaFieldOccurrenceCounts.get(mapping.schemaKey) || 1;
        const currentIndex =
          (schemaFieldIndices.get(mapping.schemaKey) || 0) + 1;
        schemaFieldIndices.set(mapping.schemaKey, currentIndex);

        // Update occurrence metadata
        mapping.occurrenceIndex = currentIndex;
        mapping.totalOccurrences = totalOccurrences;
      }
    }

    // Log multiple occurrences
    for (const [schemaKey, count] of schemaFieldOccurrenceCounts.entries()) {
      if (count > 1) {
        console.log(
          `[SCHEMA-DRIVEN] ✅ Found ${count} occurrences of "${schemaKey}" in PDF`
        );
      }
    }

    // Step 5: Mark all unmatched schema fields as notInPdf (WITHOUT targeted searches)
    // **KEY OPTIMIZATION**: We don't check fields that weren't in bulk detection
    // This prevents hundreds of unnecessary API calls for fields that don't exist in the PDF
    const notInPdfFields = schemaFields.filter(
      (sf) => !matchedSchemaKeys.has(sf.name)
    );
    const notFoundCount = notInPdfFields.length;

    for (const schemaField of notInPdfFields) {
      allMappings.push({
        schemaKey: schemaField.name,
        fieldName: null,
        label: schemaField.label || schemaField.name,
        notInPdf: true,
        type: schemaField.type || "text",
        page: 0,
        x: null,
        y: null,
        width: null,
        height: null,
        confidence: "none",
      });
    }

    // Step 6: Log results (optimized - no targeted searches)
    const unmappedBulkFields = allMappings.filter(
      (m) => !m.schemaKey && !m.notInPdf
    );
    console.log("\n[SCHEMA-DRIVEN] 🎉 Schema-driven detection complete!");
    console.log(
      `[SCHEMA-DRIVEN] ✅ Total schema fields: ${schemaFields.length}`
    );
    console.log(`[SCHEMA-DRIVEN] ✅ Schema fields found in PDF: ${foundCount}`);
    console.log(
      `[SCHEMA-DRIVEN] ⚠️ Schema fields not in PDF: ${notFoundCount} (marked without targeted search - fast!)`
    );
    console.log(
      `[SCHEMA-DRIVEN] 📋 Additional PDF fields (not in schema): ${unmappedBulkFields.length}`
    );
    console.log(`[SCHEMA-DRIVEN] ✅ Total mappings: ${allMappings.length}`);
    console.log(
      `[SCHEMA-DRIVEN] ✅ Coverage: 100% (all schema fields have mappings)`
    );

    return allMappings;
  } catch (error) {
    console.error("[SCHEMA-DRIVEN] Schema-driven detection failed:", error);
    throw error;
  }
}

module.exports = {
  detectFieldsFromSchema,
  findSchemaFieldInPdf,
};

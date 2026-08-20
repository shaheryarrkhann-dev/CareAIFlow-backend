const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { pdfPageToImage } = require("../ai/aiFieldDetection.service");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract text from PDF
 * @param {Buffer} pdfBuffer - PDF buffer
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPdf(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text || "";
  } catch (error) {
    console.error("[Resident-PDF] Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

/**
 * Load resident_fields.json schema
 * @returns {Object} Fields schema
 */
function loadFieldsSchema() {
  try {
    const fieldsJsonPath = path.join(
      __dirname,
      "../../../resident_fields.json",
    );
    const fieldsJson = JSON.parse(fs.readFileSync(fieldsJsonPath, "utf8"));
    return fieldsJson;
  } catch (error) {
    console.error("[Resident-PDF] Error loading resident_fields.json:", error);
    throw new Error("Failed to load fields schema");
  }
}

/**
 * Normalize field names from OpenAI response to match exact resident_fields.json field names
 * Maps common variations to exact field names
 * @param {string} fieldName - Field name from OpenAI response
 * @param {Object} fieldsSchema - Fields schema from resident_fields.json
 * @returns {string|null} Normalized field name or null if no match
 */
function normalizeFieldName(fieldName, fieldsSchema) {
  if (!fieldName) return null;

  // If it's already an exact match, return it
  if (fieldsSchema[fieldName]) {
    return fieldName;
  }

  const lowerFieldName = fieldName.toLowerCase().trim();
  const fieldNames = Object.keys(fieldsSchema);

  // Map PDF labels / common variations to EXACT schema field names (resident_fields.json)
  // PDF forms often use "Resident Name", "Full Name", "DOB" etc. - we map to schema keys
  const fieldVariations = {
    // Resident Identification
    "resident name": "resident_identification_full_legal_name",
    "resident full name": "resident_identification_full_legal_name",
    "full name": "resident_identification_full_legal_name",
    "legal name": "resident_identification_full_legal_name",
    "patient name": "resident_identification_full_legal_name",
    "client name": "resident_identification_full_legal_name",
    "preferred name": "resident_identification_preferred_name",
    nickname: "resident_identification_preferred_name",
    "resident preferred name": "resident_identification_preferred_name",
    dob: "resident_identification_date_of_birth",
    "date of birth": "resident_identification_date_of_birth",
    "birth date": "resident_identification_date_of_birth",
    birthdate: "resident_identification_date_of_birth",
    ssn: "resident_identification_ssn",
    "social security number": "resident_identification_ssn",
    "social security": "resident_identification_ssn",
    "ss#": "resident_identification_ssn",
    gender: "resident_identification_gender",
    sex: "resident_identification_gender",
    "m/f": "resident_identification_gender",
    "admission date": "resident_identification_admission_date",
    "admit date": "resident_identification_admission_date",
    "date of admission": "resident_identification_admission_date",
    "plan effective date": "resident_identification_admission_date",
    "effective date": "resident_identification_admission_date",
    "room number": "resident_identification_room_number",
    "room #": "resident_identification_room_number",
    "resident status": "resident_identification_resident_status",
    status: "resident_identification_resident_status",

    // Emergency / Legal Contacts
    "primary contact name": "emergency_legal_contacts_primary_contact_name",
    "primary emergency contact name":
      "emergency_legal_contacts_primary_contact_name",
    "primary contact": "emergency_legal_contacts_primary_contact_name",
    "emergency contact": "emergency_legal_contacts_primary_contact_name",
    "emergency contact name": "emergency_legal_contacts_primary_contact_name",
    "primary contact relationship":
      "emergency_legal_contacts_primary_contact_relationship",
    relationship: "emergency_legal_contacts_primary_contact_relationship",
    "primary contact phone": "emergency_legal_contacts_primary_contact_phone",
    "secondary contact name": "emergency_legal_contacts_secondary_contact_name",
    "secondary emergency contact name":
      "emergency_legal_contacts_secondary_contact_name",
    "secondary contact": "emergency_legal_contacts_secondary_contact_name",
    "secondary contact phone":
      "emergency_legal_contacts_secondary_contact_phone",
    "legal guardian poa exists":
      "emergency_legal_contacts_legal_guardian_poa_exists",
    "guardian poa": "emergency_legal_contacts_legal_guardian_poa_exists",
    "guardian poa name": "emergency_legal_contacts_legal_guardian_poa_name",
    "guardian poa contact":
      "emergency_legal_contacts_legal_guardian_poa_contact_info",
    "guardianship poa on file":
      "emergency_legal_contacts_legal_guardian_poa_copy_on_file",
    "copy of guardianship poa":
      "emergency_legal_contacts_legal_guardian_poa_copy_on_file",

    // Medical Providers / Health Coverage
    "primary care provider name":
      "medical_providers_health_coverage_primary_care_provider_name",
    "primary care provider phone":
      "medical_providers_health_coverage_primary_care_provider_phone",
    "primary care provider name phone":
      "medical_providers_health_coverage_primary_care_provider_name",
    "primary care provider":
      "medical_providers_health_coverage_primary_care_provider_name",
    pcp: "medical_providers_health_coverage_primary_care_provider_name",
    "mental health provider":
      "medical_providers_health_coverage_mental_health_provider",
    "preferred hospital er":
      "medical_providers_health_coverage_preferred_hospital_er",
    "pharmacy name": "medical_providers_health_coverage_pharmacy_name",
    "pharmacy phone": "medical_providers_health_coverage_pharmacy_phone",
    "pharmacy name phone": "medical_providers_health_coverage_pharmacy_name",
    "health insurance payor type":
      "medical_providers_health_coverage_health_insurance_payor_type",
    "payor type":
      "medical_providers_health_coverage_health_insurance_payor_type",
    "medicaid id":
      "medical_providers_health_coverage_health_insurance_medicaid_client_id",
    "medicaid number":
      "medical_providers_health_coverage_health_insurance_medicaid_client_id",
    "client id":
      "medical_providers_health_coverage_health_insurance_medicaid_client_id",
    "authorized tier":
      "medical_providers_health_coverage_health_insurance_authorized_tier",

    // Diagnoses / Health Conditions
    "primary diagnosis": "diagnoses_health_conditions_diagnoses",
    diagnosis: "diagnoses_health_conditions_diagnoses",
    diagnoses: "diagnoses_health_conditions_diagnoses",
    "communicable diseases":
      "diagnoses_health_conditions_communicable_diseases",
    "allergies food medication environmental":
      "diagnoses_health_conditions_allergies",
    allergies: "diagnoses_health_conditions_allergies",
    "medication allergies": "diagnoses_health_conditions_allergies",
    "food allergies diagnosis": "diagnoses_health_conditions_allergies",

    // Functional Status / ADLs
    "mobility status": "functional_status_adls_mobility_status",
    "bathing assistance": "functional_status_adls_bathing_assistance",
    "dressing assistance": "functional_status_adls_dressing_assistance",
    "toileting continence": "functional_status_adls_toileting_status",
    "toileting status": "functional_status_adls_toileting_status",
    "eating feeding assistance":
      "functional_status_adls_eating_feeding_assistance",
    "communication ability": "functional_status_adls_communication_ability",
    "cognitive status": "functional_status_adls_cognitive_status",
    "requires cueing for adls":
      "functional_status_adls_requires_cueing_for_adls",

    // Service Plan / NCP
    "treatment orders other notes":
      "medications_treatments_treatment_orders_other_notes",
    "ncp service plan on file": "service_plan_ncp_on_file",
    "ncp on file": "service_plan_ncp_on_file",
    "date of most recent ncp": "service_plan_ncp_most_recent_date",
    "services authorized": "service_plan_ncp_services_authorized",

    // Behavioral / Safety Risks
    "behavioral concerns": "behavioral_safety_risks_behavioral_concerns",
    "behavioral concerns other notes":
      "behavioral_safety_risks_behavioral_concerns_other_notes",
    "known triggers": "behavioral_safety_risks_known_triggers",
    "known triggers other notes":
      "behavioral_safety_risks_known_triggers_other_notes",
    "de-escalation techniques":
      "behavioral_safety_risks_de_escalation_techniques",
    "de-escalation other notes":
      "behavioral_safety_risks_de_escalation_other_notes",
    "fall risk": "behavioral_safety_risks_fall_risk",
    "elopement risk": "behavioral_safety_risks_elopement_risk",

    // Diet / Nutrition
    "prescribed diet type": "diet_nutrition_prescribed_diet_type",
    "prescribed diet other notes": "diet_nutrition_prescribed_diet_other_notes",
    "diet type": "diet_nutrition_prescribed_diet_type",
    "fluid restrictions": "diet_nutrition_fluid_restrictions",
    "fluid restrictions other notes":
      "diet_nutrition_fluid_restrictions_other_notes",
    "food allergies diet": "diet_nutrition_food_allergies",
    "food allergies other notes": "diet_nutrition_food_allergies_other_notes",
    "weight monitoring": "diet_nutrition_weight_monitoring_required",

    // Code Status / Advance Directives
    "code status": "code_status_advance_directives_code_status",
    "polst on file": "code_status_advance_directives_polst_on_file",
    "advance directive on file":
      "code_status_advance_directives_advance_directive_on_file",

    // Financial / Case Management
    "case manager name": "financial_case_management_case_manager_name",
    "case manager": "financial_case_management_case_manager_name",
    "case manager phone": "financial_case_management_case_manager_phone",
    "case manager email": "financial_case_management_case_manager_email",
    "case manager phone email": "financial_case_management_case_manager_phone",
    "authorization start date":
      "financial_case_management_authorization_start_date",
    "authorization end date":
      "financial_case_management_authorization_end_date",

    // Code status / healthcare shorthand (common on forms)
    dnr: "code_status_advance_directives_code_status",
    "full code": "code_status_advance_directives_code_status",
    polst: "code_status_advance_directives_polst_on_file",
    "medicaid #":
      "medical_providers_health_coverage_health_insurance_medicaid_client_id",
    "responsible party": "emergency_legal_contacts_primary_contact_name",
    poa: "emergency_legal_contacts_legal_guardian_poa_name",
  };

  // Try exact match in variations
  if (fieldVariations[lowerFieldName]) {
    return fieldVariations[lowerFieldName];
  }

  // Try partial matching - check if field name contains key phrases
  for (const [variation, exactField] of Object.entries(fieldVariations)) {
    if (
      lowerFieldName.includes(variation) ||
      variation.includes(lowerFieldName)
    ) {
      return exactField;
    }
  }

  // Try fuzzy matching - check if any field name contains key parts
  const fieldNameParts = lowerFieldName
    .split(/[\s_-]+/)
    .filter((p) => p.length > 2);
  for (const exactField of fieldNames) {
    const exactFieldLower = exactField.toLowerCase();
    // Check if all significant parts of the field name match
    const matches = fieldNameParts.every((part) =>
      exactFieldLower.includes(part),
    );
    if (matches && fieldNameParts.length > 0) {
      return exactField;
    }
  }

  // Try reverse matching - check if exact field name contains parts of the input
  for (const exactField of fieldNames) {
    const exactFieldLower = exactField.toLowerCase();
    const exactFieldParts = exactFieldLower
      .split("_")
      .filter((p) => p.length > 2);
    const matches = exactFieldParts.some((part) =>
      lowerFieldName.includes(part),
    );
    if (matches && exactFieldParts.length > 0) {
      return exactField;
    }
  }

  return null;
}

/**
 * Create comprehensive prompt for OpenAI Vision API to extract resident data
 * @param {Object} fieldsSchema - Fields schema from resident_fields.json
 * @param {boolean} useVision - Whether using Vision API (images) or text
 * @returns {string} Formatted prompt
 */
function createExtractionPrompt(fieldsSchema, useVision = true) {
  const fieldNames = Object.keys(fieldsSchema);

  // Group fields by category for better context (using new schema categories)
  const fieldCategories = {
    resident: [],
    admission: [],
    emergency: [],
    payer: [],
    allergies: [],
    care_needs: [],
    care_provider: [],
    pharmacy: [],
    external_facility: [],
    diagnosis: [],
    other: [], // Fallback for any uncategorized fields
  };

  const categorizedFields = new Set();

  fieldNames.forEach((fieldName) => {
    if (
      fieldName.startsWith("resident_identification_") ||
      fieldName.startsWith("resident_")
    ) {
      fieldCategories.resident.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (fieldName.startsWith("emergency_legal_contacts_")) {
      fieldCategories.emergency.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (fieldName.startsWith("medical_providers_")) {
      fieldCategories.care_provider.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (
      fieldName.startsWith("diagnoses_health_conditions_") ||
      fieldName.startsWith("diagnosis_")
    ) {
      fieldCategories.diagnosis.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (
      fieldName.startsWith("functional_status_adls_") ||
      fieldName.startsWith("care_needs_")
    ) {
      fieldCategories.care_needs.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (
      fieldName.startsWith("service_plan_ncp_") ||
      fieldName.startsWith("medications_treatments_")
    ) {
      fieldCategories.other.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (fieldName.startsWith("behavioral_safety_risks_")) {
      fieldCategories.care_needs.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (fieldName.startsWith("diet_nutrition_")) {
      fieldCategories.allergies.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (fieldName.startsWith("code_status_advance_directives_")) {
      fieldCategories.emergency.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (fieldName.startsWith("financial_case_management_")) {
      fieldCategories.payer.push(fieldName);
      categorizedFields.add(fieldName);
    } else if (
      fieldName.startsWith("admission_") ||
      fieldName.startsWith("payer_") ||
      fieldName.startsWith("allergies_") ||
      fieldName.startsWith("care_provider_") ||
      fieldName.startsWith("pharmacy_") ||
      fieldName.startsWith("external_facility_")
    ) {
      const cat = fieldName.startsWith("admission_")
        ? "admission"
        : fieldName.startsWith("payer_")
          ? "payer"
          : fieldName.startsWith("allergies_")
            ? "allergies"
            : fieldName.startsWith("care_provider_")
              ? "care_provider"
              : fieldName.startsWith("pharmacy_")
                ? "pharmacy"
                : "external_facility";
      fieldCategories[cat].push(fieldName);
      categorizedFields.add(fieldName);
    } else {
      fieldCategories.other.push(fieldName);
      categorizedFields.add(fieldName);
    }
  });

  // Verify all fields are included
  const totalCategorized = categorizedFields.size;
  if (totalCategorized !== fieldNames.length) {
    const missing = fieldNames.filter((f) => !categorizedFields.has(f));
    console.error(
      `[Resident-PDF] WARNING: ${missing.length} fields not categorized:`,
      missing,
    );
    // Add missing fields to "other" category
    missing.forEach((fieldName) => {
      fieldCategories.other.push(fieldName);
    });
  }

  console.log(
    `[Resident-PDF] Categorized ${totalCategorized} fields into ${
      Object.keys(fieldCategories).filter(
        (cat) => fieldCategories[cat].length > 0,
      ).length
    } categories`,
  );

  // Build detailed field descriptions with examples
  const buildFieldDescription = (fieldName, fieldType) => {
    let description = `"${fieldName}"`;

    // Add type and format information
    if (typeof fieldType === "string") {
      if (fieldType.includes("|")) {
        // Enum field - show options
        const options = fieldType.split("|").map((o) => o.trim());
        description += ` - Enum: One of [${options.join(", ")}]`;
      } else if (fieldType.includes("YYYY-MM-DD")) {
        description += ` - Date: Format YYYY-MM-DD (e.g., "2024-01-15")`;
      } else if (fieldType === "string") {
        description += ` - Text string`;
      } else {
        description += ` - ${fieldType}`;
      }
    } else if (typeof fieldType === "boolean") {
      description += ` - Boolean: true or false (not "true"/"false" strings)`;
    } else if (typeof fieldType === "number") {
      description += ` - Number: Integer or decimal`;
    } else if (Array.isArray(fieldType)) {
      if (fieldType.length > 0 && typeof fieldType[0] === "object") {
        description += ` - Array of objects: ${JSON.stringify(
          fieldType[0],
          null,
          2,
        )}`;
      } else {
        description += ` - Array of ${typeof fieldType[0]}s: ["item1", "item2"]`;
      }
    }

    // Add common variations/aliases
    const variations = getFieldVariations(fieldName);
    if (variations.length > 0) {
      description += ` (Also look for: ${variations.join(", ")})`;
    }

    return description;
  };

  // Get common PDF label variations for each schema field (helps AI map PDF labels → schema)
  const getFieldVariations = (fieldName) => {
    const variations = [];
    const lower = fieldName.toLowerCase();

    if (
      lower.includes("full_legal_name") ||
      lower.includes("identification_full")
    ) {
      variations.push(
        "Resident Name",
        "Full Name",
        "Legal Name",
        "Patient Name",
        "Client Name",
        "Name",
      );
    }
    if (
      lower.includes("preferred_name") ||
      lower.includes("identification_preferred")
    ) {
      variations.push("Preferred Name", "Nickname", "Goes By", "Also Known As");
    }
    if (
      lower.includes("date_of_birth") ||
      lower.includes("identification_date")
    ) {
      variations.push("DOB", "Date of Birth", "Birth Date", "Birthdate");
    }
    if (lower.includes("identification_ssn") || lower.includes("ssn")) {
      variations.push(
        "SSN",
        "Social Security Number",
        "SS#",
        "Social Security #",
      );
    }
    if (lower.includes("identification_gender") || lower.includes("gender")) {
      variations.push("Gender", "Sex", "M/F");
    }
    if (
      lower.includes("admission_date") ||
      lower.includes("identification_admission")
    ) {
      variations.push(
        "Admission Date",
        "Admit Date",
        "Date of Admission",
        "Plan Effective Date",
        "Effective Date",
        "Move-in",
        "Move-in Date",
      );
    }
    if (lower.includes("room_number")) {
      variations.push("Room Number", "Room #", "Room No");
    }
    if (lower.includes("resident_status")) {
      variations.push("Status", "Resident Status", "Active", "Discharged");
    }
    if (lower.includes("primary_contact_name")) {
      variations.push(
        "Primary Contact Name",
        "Emergency Contact",
        "Primary Contact",
        "Primary Emergency Contact",
        "Responsible Party",
      );
    }
    if (lower.includes("primary_contact_relationship")) {
      variations.push("Relationship", "Primary Contact Relationship");
    }
    if (lower.includes("primary_contact_phone")) {
      variations.push("Primary Contact Phone", "Emergency Contact Phone");
    }
    if (lower.includes("secondary_contact")) {
      variations.push(
        "Secondary Contact Name",
        "Secondary Contact",
        "Secondary Emergency Contact",
      );
    }
    if (lower.includes("diagnoses") || lower.includes("health_conditions")) {
      variations.push(
        "Diagnosis",
        "Diagnoses",
        "Primary Diagnosis",
        "Medical Conditions",
      );
    }
    if (lower.includes("allergies")) {
      variations.push(
        "Allergies",
        "Medication Allergies",
        "Food Allergies",
        "Environmental Allergies",
      );
    }
    if (lower.includes("medicaid") || lower.includes("client_id")) {
      variations.push("Medicaid ID", "Medicaid #", "Client ID", "DSHS ID");
    }
    if (lower.includes("fall_risk")) {
      variations.push("Fall Risk", "Fall Risk Level");
    }
    if (lower.includes("code_status") || lower.includes("advance_directives")) {
      variations.push(
        "Code Status",
        "POLST",
        "Advance Directive",
        "DNR",
        "DNI",
      );
    }
    if (lower.includes("case_manager")) {
      variations.push("Case Manager", "Case Manager Name", "CM Name");
    }
    if (
      lower.includes("authorization_start") ||
      lower.includes("authorization_end")
    ) {
      variations.push(
        "Authorization Start Date",
        "Authorization End Date",
        "Auth Start",
        "Auth End",
      );
    }

    return variations;
  };

  // Build categorized field list
  let fieldDescriptions = "";
  let totalFieldsInPrompt = 0;

  Object.keys(fieldCategories).forEach((category) => {
    if (fieldCategories[category].length > 0) {
      fieldDescriptions += `\n**${category
        .toUpperCase()
        .replaceAll("_", " ")} FIELDS:**\n`;
      fieldCategories[category].forEach((fieldName) => {
        fieldDescriptions += `  ${buildFieldDescription(
          fieldName,
          fieldsSchema[fieldName],
        )}\n`;
        totalFieldsInPrompt++;
      });
    }
  });

  // Verify all fields are included in prompt
  if (totalFieldsInPrompt !== fieldNames.length) {
    console.warn(
      `[Resident-PDF] WARNING: Prompt includes ${totalFieldsInPrompt} fields but resident_fields.json has ${fieldNames.length} fields`,
    );
  } else {
    console.log(
      `[Resident-PDF] ✅ All ${totalFieldsInPrompt} fields from resident_fields.json included in prompt`,
    );
  }

  // Schema embedding: compact JSON structure for better model comprehension
  const schemaDefinition = Object.keys(fieldsSchema)
    .map((key) => {
      const val = fieldsSchema[key];
      const typeStr = Array.isArray(val)
        ? "Array"
        : typeof val === "boolean"
          ? "boolean"
          : typeof val === "number"
            ? "number"
            : "string";
      return `"${key}": ${typeStr}`;
    })
    .join(",\n  ");

  const prompt = `You are an expert healthcare data extraction specialist. You are looking at a healthcare/resident onboarding form PDF. Your task is to extract structured resident information by analyzing BOTH the form images AND the raw text (if provided).

**INPUT DATA:** You receive (1) visual images of form pages and (2) raw text extracted from the PDF. Use BOTH sources—if the image is blurry but the text has the value, use the text. Triangulate between image and text for accuracy.

**CRITICAL EXTRACTION RULES:**

1. **JSON FORMAT ONLY**: Return ONLY a valid JSON object. No markdown, no code blocks, no explanations, no additional text.

2. **EXACT FIELD NAMES**: Use the EXACT field names from the Target Schema below (case-sensitive, with underscores). Do not modify or abbreviate field names.

3. **VISUAL MARKERS & CHECKBOXES:** Pay close attention to common form patterns:
   - **Checked boxes**: Look for [x], [✓], filled squares, or handwritten checkmarks. Extract as true/false.
   - **Circled text**: If "Male", "DNR", or an option is circled, extract that value.
   - **Handwritten notes**: Pay attention to handwriting in margins, "Other" lines, or addendum sections.
   - **Lines/arrows**: Lines connecting a label to a value indicate which value belongs to which field.

4. **VISUAL ANALYSIS**: Use form layout, tables, and structure:
   - Identify field labels even if formatted differently
   - Read values from tables and structured sections
   - Understand relationships between fields based on visual grouping

5. **BEST GUESS MAPPING - CRITICAL**: PDF forms use different labels than our schema. You MUST map PDF labels to the EXACT schema field names below. Examples:
   - "Resident Name", "Patient Name", "Full Name", "Legal Name", "Name" → resident_identification_full_legal_name
   - "Preferred Name", "Nickname", "Goes By" → resident_identification_preferred_name
   - "DOB", "Date of Birth", "Birth Date", "Birthdate" → resident_identification_date_of_birth
   - "SSN", "Social Security #", "Social Security Number" → resident_identification_ssn
   - "Gender", "Sex", "M/F" → resident_identification_gender
   - "Admission Date", "Admit Date", "Date of Admission", "Plan Effective Date", "Move-in" → resident_identification_admission_date
   - "Room Number", "Room #" → resident_identification_room_number
   - "Primary Contact Name", "Emergency Contact", "Primary Contact", "Responsible Party" → emergency_legal_contacts_primary_contact_name
   - "Primary Contact Phone" → emergency_legal_contacts_primary_contact_phone
   - "Primary Contact Relationship" → emergency_legal_contacts_primary_contact_relationship
   - "Secondary Contact Name" → emergency_legal_contacts_secondary_contact_name
   - "Primary Diagnosis", "Diagnosis", "Diagnoses" → diagnoses_health_conditions_diagnoses
   - "Allergies", "Medication Allergies" → diagnoses_health_conditions_allergies
   - "Primary Care Provider", "PCP" → medical_providers_health_coverage_primary_care_provider_name
   - "Medicaid ID", "Client ID" → medical_providers_health_coverage_health_insurance_medicaid_client_id
   - "Code Status", "POLST", "DNR", "Full Code" → code_status_advance_directives_code_status
   - "Case Manager" → financial_case_management_case_manager_name
   - Use context: "Personal Information" section → resident_identification_* ; "Emergency Contacts" → emergency_legal_contacts_* ; "Medical" → diagnoses_* or medical_providers_*
   - **ALWAYS use the EXACT field name from the schema below**, never invent or abbreviate

6. **OMIT MISSING FIELDS**: If a field is truly not found in the PDF, DO NOT include it. Only include fields where you found actual data.

7. **DATE FORMATTING**: All dates must be YYYY-MM-DD (e.g., "2024-01-15", not "01/15/2024" or "January 15, 2024")

8. **BOOLEAN VALUES**: Return actual boolean values (true/false), NOT strings. For checkboxes: true if checked, false if unchecked.

9. **ENUM MATCHING**: For dropdown fields, match the EXACT value from the options provided, or use closest match.

10. **ARRAYS**: Return proper JSON arrays for multiselect fields: ["Item 1", "Item 2"]

11. **LABEL-TO-SCHEMA MAPPING**: PDF labels vary widely. Map them to schema:
   - "Resident Name", "Full Name", "Name" → resident_identification_full_legal_name
   - "DOB", "Date of Birth" → resident_identification_date_of_birth
   - "SSN", "Social Security #" → resident_identification_ssn
   - "Admission Date", "Admit Date" → resident_identification_admission_date
   - "Primary Contact", "Emergency Contact" → emergency_legal_contacts_primary_contact_name

12. **PARTIAL EXTRACTION**: Extract whatever information is available, even if the form is incomplete. Use best guess for any field that seems related.

13. **NUMBER FORMATTING**: For numeric fields, return actual numbers (not strings)

14. **TEXT CLEANING**: Remove extra whitespace, normalize text, but preserve original meaning

**TARGET SCHEMA KEYS (You MUST use these exact keys - map PDF labels to the closest matching key):**
{
  ${schemaDefinition}
}

**FIELD DESCRIPTIONS (Extract these fields if found - use best guess mapping if field labels don't match exactly):**
${fieldDescriptions}

**RESPONSE:**
Return a JSON object with ONLY the fields you successfully extracted. CRITICAL: Use the EXACT field names from the schema above. PDF labels like "Resident Name", "DOB", "Primary Contact" must be mapped to schema names.

Example: If PDF says "Resident Name" or "Patient Name", you MUST use "resident_identification_full_legal_name".

Example response format (use EXACT schema field names):
{
  "resident_identification_full_legal_name": "John Doe",
  "resident_identification_preferred_name": "Johnny",
  "resident_identification_date_of_birth": "1950-05-15",
  "resident_identification_gender": "Male",
  "resident_identification_ssn": "123-45-6789",
  "resident_identification_admission_date": "2024-01-15",
  "resident_identification_room_number": "101",
  "emergency_legal_contacts_primary_contact_name": "Jane Doe",
  "emergency_legal_contacts_primary_contact_phone": "555-1234",
  "diagnoses_health_conditions_diagnoses": "Dementia",
  "diagnoses_health_conditions_allergies": "Penicillin",
  "medical_providers_health_coverage_pharmacy_name": "CVS Pharmacy"
}

**REMEMBER**: PDF labels ≠ schema names. Map them: "Resident Name" → resident_identification_full_legal_name | "DOB" → resident_identification_date_of_birth | "Primary Contact" → emergency_legal_contacts_primary_contact_name | "Diagnosis" → diagnoses_health_conditions_diagnoses.

Now visually analyze the PDF form image and extract all available information using EXACT field names from the schema:`;

  return prompt;
}

/**
 * Get or create resident form schema based on resident_fields.json
 * @param {string} tenantId - Tenant ID
 * @param {Object} fieldsSchema - Fields schema from resident_fields.json
 * @returns {Promise<Object>} Form schema
 */
async function getOrCreateResidentFormSchema(tenantId, fieldsSchema) {
  // Try to find existing resident form schema
  let schema = await prisma.formSchema.findFirst({
    where: {
      tenantId,
      formName: "Resident Questionnaire",
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // If schema exists, return it
  if (schema) {
    console.log(
      `[Resident-PDF] Found existing resident form schema (ID: ${schema.id})`,
    );
    return schema;
  }

  // Schema doesn't exist - create new one with all fields from fields.json
  console.log(
    `[Resident-PDF] No existing resident form schema found, creating new schema for tenant ${tenantId}`,
  );

  // Build schema fields from fields.json
  const schemaFields = Object.keys(fieldsSchema).map((fieldName) => {
    const fieldTypeDefinition = fieldsSchema[fieldName];
    let fieldType = "text";
    let required = false;
    let options = [];
    let isArray = false;
    let isObjectArray = false;
    let objectArrayStructure = null;

    // Determine field type based on resident_fields.json definition
    if (typeof fieldTypeDefinition === "string") {
      if (fieldTypeDefinition.includes("YYYY-MM-DD")) {
        fieldType = "date";
      } else if (fieldTypeDefinition.includes("|")) {
        fieldType = "dropdown";
        options = fieldTypeDefinition.split("|").map((o) => o.trim());
      } else if (fieldName.includes("email")) {
        fieldType = "email";
      } else if (fieldName.includes("phone")) {
        fieldType = "tel";
      } else if (
        fieldName.includes("ssn") ||
        fieldName.includes("number") ||
        fieldName.includes("rate")
      ) {
        fieldType = "number";
      }
    } else if (typeof fieldTypeDefinition === "boolean") {
      fieldType = "checkbox";
    } else if (typeof fieldTypeDefinition === "number") {
      fieldType = "number";
    } else if (Array.isArray(fieldTypeDefinition)) {
      isArray = true;
      if (
        fieldTypeDefinition.length > 0 &&
        typeof fieldTypeDefinition[0] === "object"
      ) {
        isObjectArray = true;
        objectArrayStructure = fieldTypeDefinition[0];
        fieldType = "json";
      } else {
        fieldType = "text";
      }
    }

    // Determine required status for key fields
    if (
      [
        "resident_full_legal_name",
        "resident_date_of_birth",
        "admission_date",
      ].includes(fieldName)
    ) {
      required = true;
    }

    return {
      label: fieldName
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      name: fieldName,
      type: fieldType,
      required: required,
      placeholder: `Enter ${fieldName.replace(/_/g, " ")}`,
      options: options.length > 0 ? options : undefined,
      isArray: isArray,
      isObjectArray: isObjectArray,
      objectArrayStructure: objectArrayStructure,
    };
  });

  // Create schema JSON
  const schemaJson = {
    fields: schemaFields,
  };

  // Create new form schema
  schema = await prisma.formSchema.create({
    data: {
      tenantId,
      formName: "Resident Questionnaire",
      description: "Resident onboarding questionnaire form",
      schemaJson,
      isActive: true,
      isWacRcwCompliant: false,
    },
  });

  console.log(
    `[Resident-PDF] ✅ Created new resident form schema (ID: ${schema.id}) with ${schemaFields.length} fields`,
  );

  return schema;
}

/**
 * Extract resident data from PDF using OpenAI Vision API
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} fileName - Original file name
 * @returns {Promise<Object>} Extracted resident data matching fields.json structure
 */
async function extractResidentDataFromPdf(pdfBuffer, fileName) {
  try {
    console.log(
      "[Resident-PDF] Starting PDF extraction with Vision API for:",
      fileName,
    );

    // Step 1: Extract raw text (hybrid context - helps when image is blurry or text is tiny)
    const rawPdfText = await extractTextFromPdf(pdfBuffer);
    const textContext =
      rawPdfText.length > 0
        ? rawPdfText.substring(0, 15000)
        : ""; // Cap to avoid token limits
    if (textContext) {
      console.log(
        `[Resident-PDF] Extracted ${rawPdfText.length} chars of raw text for hybrid context`,
      );
    }

    // Step 2: Get PDF page count
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    console.log(`[Resident-PDF] PDF has ${totalPages} page(s)`);

    // Step 3: Load fields schema
    const fieldsSchema = loadFieldsSchema();

    // Step 4: Create extraction prompt (for Vision API)
    const prompt = createExtractionPrompt(fieldsSchema, true);

    // Step 5: Process PDF pages in batches and extract data
    // Process 3 pages per batch for better resolution/attention (fewer images = more focus per page)
    const pagesPerBatch = 3;
    const totalBatches = Math.ceil(totalPages / pagesPerBatch);
    console.log(
      `[Resident-PDF] Processing ${totalPages} pages in ${totalBatches} batch(es) of ${pagesPerBatch} pages each...`,
    );

    const model = "gpt-4.1-2025-04-14";
    const allExtractedData = {};

    // Process each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startPage = batchIndex * pagesPerBatch;
      const endPage = Math.min(startPage + pagesPerBatch, totalPages);
      const batchImageMessages = [];

      console.log(
        `[Resident-PDF] Processing batch ${
          batchIndex + 1
        }/${totalBatches} (pages ${startPage + 1}-${endPage})...`,
      );

      // Convert pages in this batch to images
      for (let pageIndex = startPage; pageIndex < endPage; pageIndex++) {
        try {
          const imageData = await pdfPageToImage(pdfBuffer, pageIndex, 2);
          if (imageData?.base64) {
            batchImageMessages.push({
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageData.base64}`,
              },
            });
            console.log(
              `[Resident-PDF] ✅ Converted page ${
                pageIndex + 1
              }/${totalPages} to image (${imageData.width}x${imageData.height})`,
            );
          }
        } catch (imageError) {
          console.warn(
            `[Resident-PDF] Failed to convert page ${pageIndex + 1} to image:`,
            imageError.message,
          );
        }
      }

      if (batchImageMessages.length === 0) {
        console.warn(
          `[Resident-PDF] No images converted for batch ${
            batchIndex + 1
          }, skipping...`,
        );
        continue;
      }

      // Add batch context to prompt
      const batchPrompt = `${prompt}\n\n**BATCH CONTEXT:** You are processing pages ${
        startPage + 1
      }-${endPage} of ${totalPages} total pages. Extract all relevant information from these pages. If you see information that was already extracted in previous batches, merge it intelligently (e.g., combine medication lists, update dates if more recent, etc.).`;

      console.log(
        `[Resident-PDF] Sending batch ${batchIndex + 1} (${
          batchImageMessages.length
        } images) to OpenAI Vision API...`,
      );

      // Build messages: hybrid context = prompt + raw text (if available) + images
      const userContent = [
        { type: "text", text: batchPrompt },
        ...batchImageMessages,
      ];
      if (textContext) {
        userContent.splice(1, 0, {
          type: "text",
          text: `**RAW PDF TEXT** (use this to assist with hard-to-read or tiny text in the images):\n\n${textContext}`,
        });
      }

      const messages = [
        {
          role: "system",
          content:
            "You are an expert at extracting structured healthcare data from form images and text. Always return valid JSON only, no markdown or explanations. Use both image and text context when available. Merge data intelligently if processing multiple batches.",
        },
        {
          role: "user",
          content: userContent,
        },
      ];

      try {
        const completion = await openai.chat.completions.create({
          model: model,
          messages: messages,
          response_format: { type: "json_object" }, // Force JSON response
        });

        const responseText = completion.choices[0]?.message?.content;

        if (responseText) {
          // Parse batch results
          try {
            const cleanedText = responseText
              .replaceAll(/```json\n?/g, "")
              .replaceAll(/```\n?/g, "")
              .trim();

            const batchData = JSON.parse(cleanedText);

            // Merge batch data into all extracted data
            Object.keys(batchData).forEach((fieldName) => {
              const value = batchData[fieldName];

              if (value !== null && value !== undefined && value !== "") {
                if (Array.isArray(value)) {
                  // Merge arrays (e.g., medications, allergies) with deduplication
                  if (!allExtractedData[fieldName]) {
                    allExtractedData[fieldName] = [];
                  }
                  allExtractedData[fieldName] = [
                    ...new Set([
                      ...allExtractedData[fieldName],
                      ...value,
                    ]),
                  ];
                } else {
                  // Use the latest value (or merge intelligently for strings)
                  if (
                    allExtractedData[fieldName] &&
                    typeof value === "string" &&
                    typeof allExtractedData[fieldName] === "string"
                  ) {
                    // If both are strings, prefer the longer/more complete one
                    allExtractedData[fieldName] =
                      value.length > allExtractedData[fieldName].length
                        ? value
                        : allExtractedData[fieldName];
                  } else {
                    allExtractedData[fieldName] = value;
                  }
                }
              }
            });

            console.log(
              `[Resident-PDF] ✅ Batch ${batchIndex + 1} extracted ${
                Object.keys(batchData).length
              } fields`,
            );
          } catch (parseError) {
            console.error(
              `[Resident-PDF] Failed to parse batch ${
                batchIndex + 1
              } response:`,
              parseError.message,
            );
          }
        }
      } catch (apiError) {
        console.error(
          `[Resident-PDF] Error processing batch ${batchIndex + 1}:`,
          apiError.message,
        );
        // Continue with next batch instead of failing completely
      }
    }

    if (Object.keys(allExtractedData).length === 0) {
      throw new Error("No data extracted from any batch");
    }

    console.log(
      `[Resident-PDF] ✅ Processed all ${totalPages} pages, extracted ${
        Object.keys(allExtractedData).length
      } unique fields`,
    );

    // Use the merged extracted data from all batches
    const extractedData = allExtractedData;

    // Step 6: Normalize and validate extracted data with resident_fields.json schema
    const validatedData = {};
    const fieldNames = Object.keys(fieldsSchema);
    const unmatchedFields = [];
    const matchedFields = [];
    const normalizedFields = {}; // Track normalized field names

    // First pass: Normalize field names from OpenAI response
    const normalizedData = {};
    Object.keys(extractedData).forEach((fieldName) => {
      const normalizedName = normalizeFieldName(fieldName, fieldsSchema);
      const value = extractedData[fieldName];

      if (normalizedName) {
        // Field was successfully normalized
        if (!normalizedData[normalizedName]) {
          normalizedData[normalizedName] = value;
          normalizedFields[fieldName] = normalizedName;
        } else {
          // Field already exists - merge intelligently
          if (
            Array.isArray(value) &&
            Array.isArray(normalizedData[normalizedName])
          ) {
            // Merge arrays with deduplication
            normalizedData[normalizedName] = [
              ...new Set([...normalizedData[normalizedName], ...value]),
            ];
          } else if (
            typeof value === "string" &&
            typeof normalizedData[normalizedName] === "string"
          ) {
            // Prefer longer/more complete string
            normalizedData[normalizedName] =
              value.length > normalizedData[normalizedName].length
                ? value
                : normalizedData[normalizedName];
          } else {
            // Use the new value
            normalizedData[normalizedName] = value;
          }
        }
      } else {
        // Could not normalize - will be logged as unmatched
        unmatchedFields.push(fieldName);
      }
    });

    // Log normalization results
    if (Object.keys(normalizedFields).length > 0) {
      console.log(
        `[Resident-PDF] ✅ Normalized ${
          Object.keys(normalizedFields).length
        } field names:`,
        Object.entries(normalizedFields)
          .slice(0, 5)
          .map(([orig, norm]) => `${orig} → ${norm}`)
          .join(", "),
      );
    }

    // Second pass: Validate normalized data against fields.json schema
    Object.keys(normalizedData).forEach((fieldName) => {
      if (fieldNames.includes(fieldName)) {
        // Field exists in fields.json - validate and include
        const value = normalizedData[fieldName];

        // Skip null, undefined, or empty values
        if (value !== null && value !== undefined && value !== "") {
          // Type validation and conversion based on resident_fields.json schema
          const expectedType = fieldsSchema[fieldName];

          if (typeof expectedType === "boolean" && typeof value !== "boolean") {
            // Convert string booleans to actual booleans
            // If it's a long text string (not a boolean), skip it or convert to false
            if (typeof value === "string" && value.length > 50) {
              // Long text string for boolean field - likely wrong extraction, skip it
              console.warn(
                `[Resident-PDF] Field "${fieldName}" is boolean but got long text string (${
                  value.length
                } chars), skipping: ${value.substring(0, 50)}...`,
              );
              return; // Skip this field
            }

            // Try to convert common boolean representations
            const lowerValue = String(value).toLowerCase().trim();
            if (
              lowerValue === "true" ||
              lowerValue === "yes" ||
              lowerValue === "1" ||
              lowerValue === "checked" ||
              value === true
            ) {
              validatedData[fieldName] = true;
              matchedFields.push(fieldName);
            } else if (
              lowerValue === "false" ||
              lowerValue === "no" ||
              lowerValue === "0" ||
              lowerValue === "unchecked" ||
              value === false
            ) {
              validatedData[fieldName] = false;
              matchedFields.push(fieldName);
            } else {
              // Unknown value for boolean field - skip it
              console.warn(
                `[Resident-PDF] Field "${fieldName}" is boolean but got unrecognized value: "${value}", skipping`,
              );
            }
          } else if (
            typeof expectedType === "number" &&
            typeof value !== "number"
          ) {
            // Try to convert to number
            const numValue = Number(value);
            if (!Number.isNaN(numValue)) {
              validatedData[fieldName] = numValue;
              matchedFields.push(fieldName);
            }
          } else if (Array.isArray(expectedType) && !Array.isArray(value)) {
            // Skip if expected array but got non-array
            console.warn(
              `[Resident-PDF] Field "${fieldName}" expected array but got ${typeof value}, skipping`,
            );
          } else {
            // Direct assignment for matching types
            validatedData[fieldName] = value;
            matchedFields.push(fieldName);
          }
        }
      } else {
        // Normalized field doesn't exist in fields.json - this shouldn't happen, but log it
        console.warn(
          `[Resident-PDF] Normalized field "${fieldName}" not found in fields.json schema (this is unexpected)`,
        );
      }
    });

    // Log matching results
    console.log(
      `[Resident-PDF] ✅ Matched ${
        matchedFields.length
      } fields with resident_fields.json schema (${
        Object.keys(normalizedFields).length
      } were normalized)`,
    );
    if (unmatchedFields.length > 0) {
      console.log(
        `[Resident-PDF] ⚠️  Could not normalize ${unmatchedFields.length} fields (not in schema or unmappable):`,
        unmatchedFields.slice(0, 10), // Show first 10
      );
    }

    // Ensure response only contains fields from resident_fields.json
    // Double-check: remove any fields that somehow don't match
    const finalData = {};
    Object.keys(validatedData).forEach((fieldName) => {
      if (fieldNames.includes(fieldName)) {
        finalData[fieldName] = validatedData[fieldName];
      }
    });

    console.log(
      `[Resident-PDF] ✅ Returning ${
        Object.keys(finalData).length
      } validated fields matching resident_fields.json structure`,
    );

    // Return extracted fields to frontend (do NOT create resident here)
    // Frontend will send this data to POST /api/residents to create the resident
    return finalData;
  } catch (error) {
    console.error("[Resident-PDF] Error extracting resident data:", error);
    throw error;
  }
}

module.exports = {
  extractResidentDataFromPdf,
  extractTextFromPdf,
};

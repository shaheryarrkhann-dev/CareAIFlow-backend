const OpenAI = require("openai");
const prisma = require("../../lib/prisma");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Sort form fields in a logical order
 * Priority order:
 * 1. Personal identification (name fields)
 * 2. Contact information (email, phone)
 * 3. Address fields
 * 4. Date fields
 * 5. Dropdown/select fields
 * 6. Text fields
 * 7. Textarea fields
 * 8. Checkbox fields
 * 9. Signature fields
 */
function sortFieldsLogically(fields) {
  const hasOrderProperty = fields.some(
    (f) => f.order !== undefined && f.order !== null
  );
  if (hasOrderProperty) {
    return fields.sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return getFieldPriority(a) - getFieldPriority(b);
    });
  }

  return fields.sort(compareFieldsWithLayoutAndGroups);
}

/**
 * Get priority score for a field based on its label and type
 * Lower score = higher priority (appears first)
 */
function getFieldPriority(field) {
  const label = (field.label || field.name || "").toLowerCase();
  const type = (field.type || "text").toLowerCase();

  // 1. Personal identification fields (priority 0-99)
  if (label.includes("full name") || label === "name") return 1;
  if (label.includes("first name") || label.includes("firstname")) return 2;
  if (label.includes("middle name") || label.includes("middlename")) return 3;
  if (
    label.includes("last name") ||
    label.includes("lastname") ||
    label.includes("surname")
  )
    return 4;
  if (label.includes("title") || label.includes("prefix")) return 5;
  if (label.includes("suffix")) return 6;

  // 2. Contact information (priority 100-199)
  if (type === "email" || label.includes("email")) return 100;
  if (
    label.includes("phone") ||
    label.includes("mobile") ||
    label.includes("telephone") ||
    label.includes("cell")
  )
    return 101;
  if (label.includes("fax")) return 102;

  // 3. Address fields (priority 200-299)
  if (
    label.includes("street") ||
    label.includes("address line 1") ||
    (label.includes("address") && !label.includes("email"))
  )
    return 200;
  if (
    label.includes("address line 2") ||
    label.includes("apt") ||
    label.includes("suite") ||
    label.includes("unit")
  )
    return 201;
  if (label.includes("city")) return 202;
  if (
    label.includes("state") ||
    label.includes("province") ||
    label.includes("region")
  )
    return 203;
  if (
    label.includes("zip") ||
    label.includes("postal") ||
    label.includes("postcode")
  )
    return 204;
  if (label.includes("country")) return 205;

  // 4. Date fields (priority 300-399)
  if (type === "date") {
    if (label.includes("birth") || label.includes("dob")) return 300;
    if (label.includes("start")) return 301;
    if (label.includes("end")) return 302;
    return 310; // Other dates
  }

  // 5. Identification numbers (priority 400-499)
  if (label.includes("ssn") || label.includes("social security")) return 400;
  if (label.includes("id number") || label.includes("identification"))
    return 401;
  if (label.includes("license") || label.includes("passport")) return 402;

  // 6. Dropdown/select fields (priority 500-599)
  if (type === "dropdown" || type === "select") {
    if (label.includes("gender") || label.includes("sex")) return 500;
    if (label.includes("status") || label.includes("marital")) return 501;
    if (label.includes("category") || label.includes("type")) return 502;
    return 510; // Other dropdowns
  }

  // 7. Number fields (priority 600-699)
  if (type === "number") {
    if (label.includes("age")) return 600;
    if (label.includes("income") || label.includes("salary")) return 601;
    return 610; // Other numbers
  }

  // 8. Text fields (priority 700-799)
  if (type === "text") return 700;

  // 9. Textarea fields (priority 800-899)
  if (type === "textarea") {
    if (label.includes("comment") || label.includes("note")) return 800;
    if (label.includes("description") || label.includes("details")) return 801;
    return 810; // Other textareas
  }

  // 10. Checkbox fields (priority 900-999)
  if (type === "checkbox") {
    if (
      label.includes("agree") ||
      label.includes("consent") ||
      label.includes("terms")
    )
      return 900;
    if (label.includes("confirm")) return 901;
    return 910; // Other checkboxes
  }

  // 11. Signature fields (priority 1000-1099)
  if (label.includes("signature") || label.includes("sign")) return 1000;

  // Default: unknown fields go to the end
  return 9999;
}

/**
 * Compare fields by PDF layout (page → y → x)
 */
function compareFieldsWithLayoutAndGroups(a, b) {
  const pageA = Number.isFinite(a?.page) ? a.page : Number.MAX_SAFE_INTEGER;
  const pageB = Number.isFinite(b?.page) ? b.page : Number.MAX_SAFE_INTEGER;
  if (pageA !== pageB) {
    return pageA - pageB;
  }

  const groupA = getGroupPriority(a);
  const groupB = getGroupPriority(b);
  if (groupA !== groupB) {
    return groupA - groupB;
  }

  const yA = Number.isFinite(a?.y) ? a.y : Number.MAX_SAFE_INTEGER;
  const yB = Number.isFinite(b?.y) ? b.y : Number.MAX_SAFE_INTEGER;
  if (Math.abs(yA - yB) > 3) {
    return yA - yB;
  }

  const xA = Number.isFinite(a?.x) ? a.x : Number.MAX_SAFE_INTEGER;
  const xB = Number.isFinite(b?.x) ? b.x : Number.MAX_SAFE_INTEGER;
  if (xA !== xB) {
    return xA - xB;
  }

  const heuristicA = getHeuristicOffset(a);
  const heuristicB = getHeuristicOffset(b);
  if (heuristicA !== heuristicB) {
    return heuristicA - heuristicB;
  }

  const priorityA = getFieldPriority(a);
  const priorityB = getFieldPriority(b);
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  return 0;
}

function getHeuristicOffset(field) {
  const label = (field.label || field.name || "").toLowerCase();
  const type = (field.type || "text").toLowerCase();

  // Push signature/initial blocks to the end of their page
  if (
    label.includes("signature") ||
    label.includes("initial") ||
    type === "signature"
  ) {
    return 0.45;
  }

  // Dates should trail contact/name blocks but stay near their layout position
  if (type === "date" || label.includes("date")) {
    return 0.25;
  }

  // Keep resident/personal names near the front of the section
  if (
    label.includes("resident") ||
    label.includes("authorized") ||
    label.includes("guardian") ||
    (label.includes("name") && !label.includes("facility"))
  ) {
    return -0.3;
  }

  // Addresses should follow names but before dates
  if (label.includes("address")) {
    return -0.15;
  }

  // Phone/email right after primary identifiers
  if (label.includes("phone") || label.includes("email")) {
    return -0.1;
  }

  return 0;
}

function getGroupPriority(field) {
  const label = (field.label || field.name || "").toLowerCase();
  const type = (field.type || "text").toLowerCase();

  // Signatures and initials should trail near the end
  if (
    label.includes("signature") ||
    label.includes("initial") ||
    type === "signature"
  ) {
    return 8;
  }

  if (type === "checkbox") {
    return 6;
  }

  if (label.includes("date") || type === "date") {
    return 4;
  }

  if (
    label.includes("ssn") ||
    label.includes("social security") ||
    label.includes("id number") ||
    label.includes("license")
  ) {
    return 5;
  }

  if (label.includes("address")) {
    return 2;
  }

  if (
    label.includes("phone") ||
    label.includes("email") ||
    label.includes("contact")
  ) {
    return 1.5;
  }

  if (
    label.includes("resident") ||
    label.includes("authorized") ||
    label.includes("guardian") ||
    label.includes("name") ||
    label.includes("person")
  ) {
    return 1;
  }

  if (label.includes("facility")) {
    return 2.5;
  }

  return 3;
}

/**
 * Retrieve relevant embeddings for a tenant using similarity search
 */
async function retrieveRelevantContext(tenantId, limit = 10) {
  // Get recent embeddings for the tenant
  const embeddings = await prisma.$queryRaw`
    SELECT id, "fileName", content, "createdAt"
    FROM pdf_embeddings
    WHERE "tenantId" = ${tenantId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;

  return embeddings.map((e) => e.content).join("\n\n");
}

/**
 * Process a single text chunk to extract fields with WAC/RCW compliance
 */
async function generateSchemaFromChunk(
  chunkText,
  chunkIndex,
  totalChunks,
  existingFields,
  relevantRegulations = [],
  detectedFieldsFromTemplates = []
) {
  // Build regulation context for AI
  let regulationContext = "";
  if (relevantRegulations.length > 0) {
    regulationContext =
      "\n\nRELEVANT WASHINGTON STATE REGULATIONS (WAC/RCW):\n";
    for (const reg of relevantRegulations.slice(0, 10)) {
      regulationContext += `\n${reg.citation}: ${
        reg.title
      }\n${reg.content.substring(0, 500)}...\n`;
    }
  }

  const systemPrompt = `You are an AI assistant that analyzes Adult Family Home (AFH) documents and generates structured form schemas with FULL WAC/RCW COMPLIANCE.

Given a PORTION of a large document and relevant Washington State regulations, identify form fields in THIS section only.

CRITICAL - WAC/RCW COMPLIANCE:
- You are generating forms for Adult Family Homes in Washington State
- EVERY field must comply with WAC (Washington Administrative Code) and RCW (Revised Code of Washington)
- Attach the MOST RELEVANT regulation citation to each field
- If multiple regulations apply, choose the most specific one
- Common AFH regulations: WAC 388-76-10600 (Resident Rights), RCW 70.129.030 (Medication Consent), etc.

Return ONLY a valid JSON object in this exact format:
{
  "fields": [
    {
      "label": "Field Label",
      "name": "field_name",
      "type": "text|number|email|date|dropdown|checkbox|textarea|signature",
      "required": true|false,
      "placeholder": "MANDATORY - provide helpful placeholder text for ALL fields",
      "options": ["Option 1", "Option 2"]  // REQUIRED for dropdown fields
    }
  ]
}

🚨 **CRITICAL - DROPDOWN FIELDS WITH OPTIONS**:
- **Sex/Gender fields**: MUST be type "dropdown" with options: ["Male", "Female", "Other"]
  * Field names: "resident_sex", "sex", "gender", "resident_gender" → type: "dropdown", options: ["Male", "Female", "Other"]
- **Marital Status**: type "dropdown", options: ["Single", "Married", "Divorced", "Widowed", "Separated"]
- **Relationship**: type "dropdown", options: ["Parent", "Guardian", "Spouse", "Child", "Sibling", "Other"]
- **Any field with limited choices** → use type "dropdown" with appropriate options

🚨 **CRITICAL - PLACEHOLDERS**:
- **ALL fields MUST have placeholders** - never leave placeholder empty
- Text fields: "Enter [field label]" (e.g., "Enter resident's full name")
- Date fields: "Select date" or "MM/DD/YYYY"
- Number fields: "Enter [field label]" (e.g., "Enter age")
- Email fields: "Enter email address"
- Phone fields: "Enter phone number"
- Address fields: "Enter address"

FIELD CITATION RULES:
1. Resident information fields → WAC 388-76-10650 (Resident records)
2. Rights acknowledgment → WAC 388-76-10600 (Resident rights)
3. Medication consent → RCW 70.129.030 (Medication consent)
4. Healthcare decisions → RCW 70.129.040 (Healthcare decisions)
5. Resident agreements → WAC 388-76-10620 or RCW 70.129.090
6. Emergency contacts → WAC 388-76-10800 (Emergency preparedness)
7. Funds management → WAC 388-76-10630 or RCW 70.129.110

IMPORTANT:
- Return ONLY the JSON object, no markdown, no explanations
- **CRITICAL - CHECK EXISTING FIELDS**: Before creating a field, check if it already exists in the existingFields list provided
- **If field already exists** (by name or semantic similarity), SKIP IT - do not create a duplicate
- **Only create NEW fields** that don't exist in existingFields yet
- **CRITICAL - FOCUS ON UNIQUE FIELD TYPES**: Extract only UNIQUE field types from THIS section
- **DO NOT create duplicate fields**: If "Resident Name" appears multiple times, create ONE field: "resident_name"
- **DO NOT create fields for every occurrence**: Focus on field types, not locations
- **CONSOLIDATE SIMILAR FIELDS** (apply these patterns to ANY fields):
  * Number variations: "Party One" = "Party 1", "Party Two" = "Party 2" → use numbers
  * Plural/singular: "Belonging" = "Belongings", "Item" = "Items" → use singular
  * Formatting: "Initial" = "Initial*" (asterisk is just formatting) → remove asterisk
  * Exact duplicates: Same field name appearing multiple times → create only ONE
  * Person names: "John Doe Phone" and "John Doe Cell Phone" → same person, consolidate
- **DATE FIELD CONSOLIDATION**: "Admission Start Date" and "Admission Date" are THE SAME → use "admission_date". "Date*" without context → DO NOT CREATE (too generic)
- **NUMBER VARIATIONS**: "One" = "1", "Two" = "2", "First" = "1", "Second" = "2" - consolidate these
- **PLURAL/SINGULAR**: "Belonging" and "Belongings" are the SAME - consolidate to one
- **GENERIC FIELDS**: DO NOT CREATE fields like "phone :", "address:", "name:" (too generic, no context)
- Use snake_case for field names
- Each field must have a unique name
- Include citations from provided regulations when applicable
- If no specific regulation applies, omit the citation fields
- **EXTRACT ALL ACTUAL FILLABLE FIELDS**: Extract every field that has dashes, underlines, or checkboxes
- **Extract ALL actual fillable fields for 100% coverage - field count doesn't matter**
- **ONLY CREATE FIELDS FOR ACTUAL FILLABLE AREAS**:
  ✅ CREATE if you see: "Name: _______" (has dashes), "Date: ______" (has dashes), "☐ History & Physical" (has checkbox)
  ❌ DO NOT CREATE if you see: "The facility will provide..." (just text, no fillable area), "Residents have the right to..." (just text, no fillable area), "Section 1: Resident Information" (just heading, no fillable area)
- The goal is to extract ALL fields that residents will fill in, so forms can prefill PDFs correctly

🚨 **CHECKBOX CONSOLIDATION**:
- If you see "Records include:" followed by a list, create ONE checkbox field per unique item TYPE
- Common items: "History & Physical" → "history_physical", "Service or Care Plan" → "service_care_plan", etc.
- **DO NOT create multiple fields for the same checkbox type appearing in different locations**
- Each unique checkbox type = 1 field with type: "checkbox"`;

  // Build existing fields context for AI
  let existingFieldsContext = "";
  if (existingFields && existingFields.length > 0) {
    existingFieldsContext = `\n\n🚨 **EXISTING FIELDS** (already found - DO NOT recreate these):\n${existingFields
      .map((f) => `- ${f.name || f.fieldName || f.label} (${f.type || "text"})`)
      .slice(0, 50)
      .join(
        "\n"
      )}\n\n**IMPORTANT**: If you see any of these fields in the text above, SKIP them - they already exist. Only create NEW fields that are NOT in this list.`;
  }

  // Build detected fields context for AI (from PDF templates)
  let detectedFieldsContext = "";
  if (detectedFieldsFromTemplates && detectedFieldsFromTemplates.length > 0) {
    detectedFieldsContext = `\n\n🚨 **DETECTED FIELDS FROM PDFs** (PRIMARY SOURCE - use these fields):\n${detectedFieldsFromTemplates
      .map(
        (f) =>
          `- ${f.fieldName || f.name} (${f.type || "text"}) - ${
            f.label || f.fieldName || f.name
          }`
      )
      .slice(0, 100)
      .join(
        "\n"
      )}\n\n**CRITICAL**: These are ACTUAL fillable fields detected from PDFs with coordinates. Your task is to:\n1. Use these detected fields as the PRIMARY source\n2. Consolidate duplicates (e.g., if "admission_agreement_initial" appears 26 times, create only ONE field)\n3. Only add NEW fields if you find actual fillable areas (dashes/underlines/checkboxes) that were NOT detected\n4. DO NOT create fields from descriptive text - only actual fillable areas!`;
  }

  const userPrompt = `Document Section ${chunkIndex + 1} of ${totalChunks}:
${chunkText.substring(0, 8000)}
${regulationContext}${detectedFieldsContext}${existingFieldsContext}

🚨 **CRITICAL TASK**: ${
    detectedFieldsFromTemplates.length > 0
      ? "Use the detected fields above as PRIMARY source. Consolidate duplicates. Only add new fields if you find actual fillable areas (dashes/underlines/checkboxes) that were NOT in the detected fields list."
      : "Identify ALL form fields in the above text section with WAC/RCW compliance citations."
  }

**SPECIAL ATTENTION - CHECKBOX DETECTION**:
- Look for checkbox lists (sections like "Records include:" or "Records include (but is not limited to):" followed by a list)
- If you find a checkbox list, detect EVERY item in the list as a separate checkbox field
- Common medical record checkboxes:
  * "History & Physical" → name: "history_physical", type: "checkbox"
  * "Service or Care Plan" → name: "service_care_plan", type: "checkbox"
  * "Current Assessment" → name: "current_assessment", type: "checkbox"
  * "Current Diagnosis" → name: "current_diagnosis", type: "checkbox"
  * "Complete list of current Medications" → name: "current_medications", type: "checkbox"
  * "Any other records..." → name: "other_important_records", type: "checkbox"
- **EACH CHECKBOX = SEPARATE FIELD**: If you see 6 items, create 6 separate checkbox fields
- **DON'T STOP AFTER 1-2 CHECKBOXES**: Continue scanning until ALL items are detected
- **VERIFY COUNT**: If list has 6 items, you MUST create 6 checkbox fields

**OTHER FIELDS - CONSOLIDATION RULES**:
- **DO NOT create duplicate fields**: If "resident_name" appears 5 times, create ONE field
- **DO NOT create fields for every occurrence**: Focus on unique field types, not locations
- **CONSOLIDATE NUMBER VARIATIONS**: "Party One" = "Party 1", "Party Two" = "Party 2" - use numbers
- **CONSOLIDATE PLURAL/SINGULAR**: "Belonging" = "Belongings" - use singular form
- **CONSOLIDATE FORMATTING**: "Initial" = "Initial*" (asterisk is just formatting) - use without asterisk
- **CONSOLIDATE EXACT DUPLICATES**: If you see the exact same field name twice, create only ONE
- **REMOVE GENERIC FIELDS**: Do NOT create "phone :", "address:", "name:" (too generic, no context)
- Detect inline fields within sentences ONLY if not already detected
- Detect all text fields, date fields, signatures, relationships, etc. - but consolidate duplicates
- **EXTRACT ALL ACTUAL FILLABLE FIELDS**: Extract every field that has dashes, underlines, or checkboxes
- **Extract ALL actual fillable fields for 100% coverage - field count doesn't matter**
- **CONSOLIDATE DUPLICATES**: If the same field type appears multiple times, create only ONE field
- **CHECK EXISTING FIELDS**: Before creating any field, verify it's not already in the existingFields list
- The goal is to extract ALL fields that residents will fill in, so forms can prefill PDFs correctly`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2, // Lower temperature for consistent compliance
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  const responseText = completion.choices[0].message.content.trim();
  const parsed = JSON.parse(responseText);
  return Array.isArray(parsed.fields)
    ? parsed.fields
    : parsed.fields?.fields || [];
}

/**
 * Generate form schema from PDF embeddings using OpenAI (CHUNKED APPROACH)
 * Now supports merging: if schema exists for tenant, merge new fields
 * WITH WAC/RCW COMPLIANCE
 */
async function generateFormSchema({ tenantId, formName, description, userId }) {
  console.log(
    "[SCHEMA-GEN] 🏛️ Starting WAC/RCW compliant schema generation..."
  );

  // Retrieve relevant context from embeddings - increase to get more content
  const context = await retrieveRelevantContext(tenantId, 50);

  if (!context || context.trim().length === 0) {
    throw new Error(
      "No embedded data found for this tenant. Please upload PDFs first."
    );
  }

  console.log(
    `[SCHEMA-GEN] Context length: ${context.length} chars - will split into chunks if needed`
  );

  // **CRITICAL**: Get detected fields from PDF templates - these are the ACTUAL fillable fields
  // The text-based generation should primarily use these, not generate new fields from descriptions
  let detectedFieldsFromTemplates = [];
  try {
    const { getTenantPdfTemplates } = require("../pdf/pdf.service");
    const templates = await getTenantPdfTemplates(tenantId);
    console.log(
      `[SCHEMA-GEN] 📋 Found ${templates.length} PDF templates - extracting detected fields...`
    );

    // Extract all fields from all templates (preserve original names for AI)
    // NOTE: We do NOT deduplicate here - let AI see all original field names
    // Deduplication happens AFTER schema generation
    const allTemplateFields = [];
    const seenFieldNames = new Set(); // Simple deduplication by exact name only (not semantic)

    for (const template of templates) {
      if (template.fieldMapping && Array.isArray(template.fieldMapping)) {
        for (const field of template.fieldMapping) {
          if (field.fieldName && !field.notInPdf) {
            // Simple deduplication: only skip if exact same fieldName already seen
            // This prevents exact duplicates but preserves variations for AI to see
            const fieldKey = (field.fieldName || "").toLowerCase().trim();
            if (!seenFieldNames.has(fieldKey)) {
              seenFieldNames.add(fieldKey);
              allTemplateFields.push({
                fieldName: field.fieldName,
                name: field.fieldName, // Add name for compatibility
                label: field.label || field.fieldName,
                type: field.type || "text",
                detectedFrom: template.fileName,
              });
            }
          }
        }
      }
    }

    // Pass original field names to AI (no semantic deduplication yet)
    // AI will see "Admission Start Date*" and "Admission Date*" as separate fields
    // Then we deduplicate AFTER AI generates schema
    detectedFieldsFromTemplates = allTemplateFields;

    console.log(
      `[SCHEMA-GEN] 📋 Extracted ${detectedFieldsFromTemplates.length} detected fields from templates (preserving original names for AI)`
    );
    if (detectedFieldsFromTemplates.length > 0) {
      console.log(
        `[SCHEMA-GEN] 📋 Detected fields: ${detectedFieldsFromTemplates
          .map((f) => f.fieldName || f.name)
          .join(", ")}`
      );
    }
  } catch (error) {
    console.warn(
      `[SCHEMA-GEN] ⚠️ Could not extract fields from templates: ${error.message}`
    );
  }

  // **CRITICAL**: If we have detected fields from coordinate detection, use those as PRIMARY source
  // Only use text-based generation to add missing fields or validate detected fields
  const USE_DETECTED_FIELDS_AS_PRIMARY = detectedFieldsFromTemplates.length > 0;

  // Fetch relevant WAC/RCW regulations based on form name and context
  const {
    findRelevantRegulations,
  } = require("../compliance/wacRcwCompliance.service");
  let relevantRegulations = [];

  try {
    console.log("[SCHEMA-GEN] 🔍 Finding relevant WAC/RCW regulations...");
    const formContext = `Adult Family Home form: ${
      formName || "Master Form"
    }. Description: ${description || ""}. Context preview: ${context.substring(
      0,
      1000
    )}`;
    relevantRegulations = await findRelevantRegulations(
      formName || "master_form",
      formName || "Master Form",
      "form",
      formContext
    );
    console.log(
      `[SCHEMA-GEN] ✅ Found ${relevantRegulations.length} relevant regulations`
    );
    if (relevantRegulations.length > 0) {
      relevantRegulations.forEach((reg) => {
        console.log(
          `  - ${reg.citation}: ${reg.title} (relevance: ${(
            reg.relevanceScore * 100
          ).toFixed(1)}%)`
        );
      });
    }
  } catch (error) {
    console.warn(
      "[SCHEMA-GEN] ⚠️ Could not fetch regulations, continuing without compliance data:",
      error.message
    );
  }

  // Check if a form schema already exists for this tenant
  const existingSchema = await prisma.formSchema.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  try {
    // Decide: chunk or single call based on context size
    // If context is small (<30k chars), use single call. Otherwise chunk.
    const MAX_SINGLE_CALL_CHARS = 30000;

    let allFields = [];

    if (context.length < MAX_SINGLE_CALL_CHARS) {
      // Single call for smaller documents
      console.log(
        `[SCHEMA-GEN] Using single API call (${context.length} chars)`
      );

      // Build regulation context for AI
      let regulationContext = "";
      if (relevantRegulations.length > 0) {
        regulationContext =
          "\n\nRELEVANT WASHINGTON STATE REGULATIONS (WAC/RCW):\n";
        for (const reg of relevantRegulations.slice(0, 10)) {
          regulationContext += `\n${reg.citation}: ${
            reg.title
          }\n${reg.content.substring(0, 500)}...\n`;
        }
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant that analyzes Adult Family Home (AFH) documents and generates structured form schemas with FULL WAC/RCW COMPLIANCE.

CRITICAL - WAC/RCW COMPLIANCE:
- You are generating forms for Adult Family Homes in Washington State
- EVERY field must comply with WAC (Washington Administrative Code) and RCW (Revised Code of Washington)
- Attach the MOST RELEVANT regulation citation to each field
- Common AFH regulations: WAC 388-76-10600 (Resident Rights), RCW 70.129.030 (Medication Consent), etc.

🚨 **CRITICAL - ONLY ACTUAL FILLABLE FIELDS**:
- **ONLY detect fields that have ACTUAL fillable areas**: dashes (_____), underlines (______), or checkboxes (☐, □, [ ])
- **DO NOT create fields from descriptive text** - if text just describes something without a fillable area, skip it
- **DO NOT create fields from policy statements** - only detect where users actually write/check something
- **EXAMPLES - CREATE IF**:
  * ✅ "Name: _______" → YES, detect this (has dashes)
  * ✅ "Date: ______" → YES, detect this (has dashes)
  * ✅ "☐ History & Physical" → YES, detect this (has checkbox)
  * ✅ "agreement between _____ and _____" → YES, detect both (has dashes)
  * ✅ Table cell with "_______" → YES, detect this (has dashes)
- **EXAMPLES - DO NOT CREATE IF**:
  * ❌ "The facility will provide..." → NO, skip this (just descriptive text, no fillable area)
  * ❌ "Residents have the right to..." → NO, skip this (just descriptive text, no fillable area)
  * ❌ "Section 1: Resident Information" → NO, skip this (just a heading, no fillable area)
  * ❌ "Name:" (no dashes) → NO, skip this (just label, no fillable area)
  * ❌ Table header "|Name|Address|" (no dashes) → NO, skip this (just header, no fillable area)
- **CONSOLIDATE DUPLICATES**: If the same field appears multiple times (e.g., "admission_agreement_initial" appears 26 times), create ONE field
- **FOCUS ON ACTUAL FILLABLE AREAS ONLY** - skip all descriptive text, policy statements, and informational content

🚨 **CRITICAL - DATE FIELD CONSOLIDATION**:
- **"Admission Start Date" and "Admission Date" are THE SAME** → use "admission_date" (consolidate into one field)
- **"Date*" without context** (e.g., just "Date:") → DO NOT CREATE (too generic, no context)
- **"Date of Agreement" and "Date of Signature" are DIFFERENT** → keep both (unique fields)
- **Extract semantic meaning**: "start date" = "date", "end date" = separate field only if truly different
- **Date field naming**: Use base category + type: "admission_date" (not "admission_start_date")
- **Only add qualifiers if truly different**: "start_date" vs "end_date" (different fields), but "admission_start_date" = "admission_date"

Return ONLY a valid JSON object:
{
  "fields": [
    {
      "label": "Field Label",
      "name": "field_name",
      "type": "text|number|email|date|dropdown|checkbox|textarea|signature",
      "required": true|false,
      "placeholder": "MANDATORY - provide helpful placeholder text for ALL fields",
      "options": ["Option 1", "Option 2"]  // REQUIRED for dropdown fields
    }
  ]
}

🚨 **CRITICAL - DROPDOWN FIELDS WITH OPTIONS**:
- **Sex/Gender fields**: MUST be type "dropdown" with options: ["Male", "Female", "Other"]
  * Field names: "resident_sex", "sex", "gender", "resident_gender" → type: "dropdown", options: ["Male", "Female", "Other"]
- **Marital Status**: type "dropdown", options: ["Single", "Married", "Divorced", "Widowed", "Separated"]
- **Relationship**: type "dropdown", options: ["Parent", "Guardian", "Spouse", "Child", "Sibling", "Other"]
- **Any field with limited choices** → use type "dropdown" with appropriate options

🚨 **CRITICAL - PLACEHOLDERS**:
- **ALL fields MUST have placeholders** - never leave placeholder empty
- Text fields: "Enter [field label]" (e.g., "Enter resident's full name")
- Date fields: "Select date" or "MM/DD/YYYY"
- Number fields: "Enter [field label]" (e.g., "Enter age")
- Email fields: "Enter email address"
- Phone fields: "Enter phone number"
- Address fields: "Enter address"

FIELD CITATION RULES:
1. Resident information → WAC 388-76-10650
2. Rights acknowledgment → WAC 388-76-10600
3. Medication consent → RCW 70.129.030
4. Healthcare decisions → RCW 70.129.040
5. Resident agreements → WAC 388-76-10620 or RCW 70.129.090
6. Emergency contacts → WAC 388-76-10800
7. Funds management → WAC 388-76-10630 or RCW 70.129.110

Extract ALL form fields from the document. Return ONLY JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Form Name: ${
              formName || "Master Form"
            }\n\nDocument Content:\n${context}\n${regulationContext}${
              detectedFieldsFromTemplates.length > 0
                ? `\n\n🚨 **DETECTED FIELDS FROM PDFs** (PRIMARY SOURCE - use these fields):\n${detectedFieldsFromTemplates
                    .map(
                      (f) =>
                        `- ${f.fieldName} (${f.type}) - ${
                          f.label || f.fieldName
                        }`
                    )
                    .join(
                      "\n"
                    )}\n\n**CRITICAL**: These are ACTUAL fillable fields detected from PDFs with coordinates. Your task is to:\n1. Use these detected fields as the PRIMARY source\n2. Consolidate duplicates (e.g., if "admission_agreement_initial" appears 26 times, create only ONE field)\n3. Only add NEW fields if you find actual fillable areas (dashes/underlines/checkboxes) that were NOT detected\n4. DO NOT create fields from descriptive text - only actual fillable areas!`
                : ""
            }\n\n🚨 **CRITICAL TASK**: ${
              detectedFieldsFromTemplates.length > 0
                ? "Use the detected fields above as PRIMARY source. Consolidate duplicates. Only add new fields if you find actual fillable areas (dashes/underlines) that were NOT in the detected fields list."
                : "Identify ONLY actual fillable fields (with dashes/underlines/checkboxes) in this document. DO NOT create fields from descriptive text."
            }

**SPECIAL ATTENTION - CHECKBOX DETECTION**:
- Look for checkbox lists (sections like "Records include:" or "Records include (but is not limited to):" followed by a list)
- Create ONE checkbox field per unique item type (do NOT create duplicates for the same checkbox appearing in different locations)
- Common medical record checkboxes (create ONE field per type):
  * "History & Physical" → name: "history_physical", type: "checkbox"
  * "Service or Care Plan" → name: "service_care_plan", type: "checkbox"
  * "Current Assessment" → name: "current_assessment", type: "checkbox"
  * "Current Diagnosis" → name: "current_diagnosis", type: "checkbox"
  * "Complete list of current Medications" → name: "current_medications", type: "checkbox"
  * "Any other records..." → name: "other_important_records", type: "checkbox"
- **CONSOLIDATE DUPLICATES**: If the same checkbox type appears multiple times, create only ONE field
- **IF DETECTED FIELDS INCLUDE CHECKBOXES**: Use the detected fields list above, but consolidate duplicates - if "history_physical" appears multiple times, create only ONE field

**OTHER FIELDS - CONSOLIDATION RULES**:
- **DO NOT create duplicate fields**: If "resident_name" appears 5 times in the PDF, create ONE field
- **DO NOT create fields for every occurrence**: Focus on unique field types, not locations
- **CONSOLIDATE NUMBER VARIATIONS** (pattern): "One" = "1", "Two" = "2", "First" = "1" → use numbers
- **CONSOLIDATE PLURAL/SINGULAR** (pattern): "Belonging" = "Belongings", "Item" = "Items" → use singular
- **CONSOLIDATE FORMATTING** (pattern): "Field*" = "Field" (asterisk is formatting) → remove asterisk
- **CONSOLIDATE EXACT DUPLICATES** (pattern): Same field name appearing multiple times → create only ONE
- **REMOVE GENERIC FIELDS** (pattern): Do NOT create "phone :", "address:", "name:" (too generic, no context)
- Detect inline fields within sentences (e.g., "_______ is seeking residency" → resident_name) ONLY if not already detected
- Detect all text fields, date fields, signatures, relationships, etc. - but consolidate duplicates
- **Extract ALL actual fillable fields for 100% coverage - field count doesn't matter**
- **Schema should have unique field types only (consolidate duplicates)**
- **USE DETECTED FIELDS**: If detected fields are provided above, consolidate them - ensure each unique field type appears only ONCE in the schema!

**DATE FIELD CONSOLIDATION EXAMPLES**:
- ✅ CONSOLIDATE: "Admission Start Date*" + "Admission Date*" → ONE field: "admission_date"
- ✅ CONSOLIDATE: "Date of Birth" + "Birth Date" → ONE field: "date_of_birth"
- ✅ REMOVE: "Date*" (generic, no context) → DO NOT CREATE (too vague)
- ✅ KEEP SEPARATE: "Date of Agreement*" + "Date of Signature*" → TWO fields: "date_of_agreement" + "date_of_signature"
- ✅ KEEP SEPARATE: "Admission Date" + "Discharge Date" → TWO fields: "admission_date" + "discharge_date"
- ✅ KEEP SEPARATE: "Start Date" + "End Date" → TWO fields: "start_date" + "end_date"
- ❌ DO NOT create separate fields for "start date" and "date" if they refer to the same thing`,
          },
        ],
        temperature: 0.2, // Lower for consistent compliance
        max_tokens: 16000,
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0].message.content.trim();
      const parsed = JSON.parse(responseText);
      allFields = Array.isArray(parsed.fields)
        ? parsed.fields
        : parsed.fields?.fields || [];
    } else {
      // Chunk for larger documents
      console.log(
        `[SCHEMA-GEN] Using chunked approach (${context.length} chars too large)`
      );

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 8000,
        chunkOverlap: 800,
      });
      const docs = await splitter.createDocuments([context]);
      const chunks = docs.map((d) => d.pageContent);

      console.log(`[SCHEMA-GEN] Split into ${chunks.length} chunks`);

      // Start with detected fields from templates as existing fields
      // This prevents chunks from regenerating fields that were already detected
      const initialExistingFields =
        detectedFieldsFromTemplates.length > 0
          ? detectedFieldsFromTemplates.map((f) => ({
              name: f.fieldName || f.name,
              fieldName: f.fieldName || f.name,
              label: f.label || f.fieldName,
              type: f.type || "text",
            }))
          : [];

      // Process each chunk in parallel (with concurrency limit)
      // Pass initialExistingFields and detectedFieldsFromTemplates so chunks know what's already detected
      const chunkPromises = chunks.map((chunk, index) =>
        generateSchemaFromChunk(
          chunk,
          index,
          chunks.length,
          initialExistingFields, // Pass detected fields as existing fields
          relevantRegulations,
          detectedFieldsFromTemplates // Pass detected fields for prompt context
        )
      );
      const chunkResults = await Promise.all(chunkPromises);
      allFields = chunkResults.flat();

      // Use enhanced deduplication utility (same as single-call approach)
      const {
        shouldIncludeFieldInSchema,
        performFinalDeduplicationPass,
      } = require("../../utils/fieldNormalization.util");

      // Filter out problematic fields first
      const filteredFields = allFields.filter((field) =>
        shouldIncludeFieldInSchema(field)
      );
      const filteredCount = allFields.length - filteredFields.length;
      if (filteredCount > 0) {
        console.log(
          `[SCHEMA-GEN] 🔍 Filtered out ${filteredCount} generic/problematic fields from chunks`
        );
      }

      // Comprehensive final deduplication pass (multi-strategy)
      allFields = performFinalDeduplicationPass(filteredFields);

      console.log(
        `[SCHEMA-GEN] After comprehensive deduplication: ${allFields.length} unique fields`
      );

      // **CRITICAL**: If we have detected fields from coordinate detection, use those as PRIMARY source
      // Text-based generation should only validate/consolidate, not create new fields from descriptions
      if (detectedFieldsFromTemplates.length > 0) {
        console.log(
          `[SCHEMA-GEN] 🎯 Using ${detectedFieldsFromTemplates.length} detected fields as PRIMARY source...`
        );
        console.log(
          `[SCHEMA-GEN] 📋 Text-based generation found ${allFields.length} fields, but detected fields are PRIMARY`
        );

        // Use detected fields as primary, merge with text-based only if they match
        // Use semantic normalization for better matching
        const {
          normalizeFieldNameSemantic,
        } = require("../../utils/fieldNormalization.util");

        const detectedFieldMap = new Map();
        for (const detectedField of detectedFieldsFromTemplates) {
          // Use semantic normalization for key (handles word order variations)
          const normalized =
            normalizeFieldNameSemantic(detectedField.fieldName || "") ||
            (detectedField.fieldName || "").toLowerCase();
          const key = normalized.replace(/[^a-z0-9]/g, "");
          if (!detectedFieldMap.has(key)) {
            detectedFieldMap.set(key, detectedField);
          }
        }

        // Start with detected fields (PRIMARY)
        const primaryFields = [];
        const textBasedFieldMap = new Map();

        // Index text-based fields for matching (using semantic normalization)
        for (const field of allFields) {
          const normalized =
            normalizeFieldNameSemantic(field.name || "") ||
            (field.name || "").toLowerCase();
          const key = normalized.replace(/[^a-z0-9]/g, "");
          if (!textBasedFieldMap.has(key)) {
            textBasedFieldMap.set(key, field);
          }
        }

        // Use detected fields as primary, enhance with text-based metadata if available
        for (const [key, detectedField] of detectedFieldMap.entries()) {
          const textField = textBasedFieldMap.get(key);
          primaryFields.push({
            name: detectedField.fieldName,
            label:
              textField?.label ||
              detectedField.label ||
              detectedField.fieldName,
            type: detectedField.type || textField?.type || "text",
            required: textField?.required || false,
            placeholder:
              textField?.placeholder ||
              `Enter ${detectedField.label || detectedField.fieldName}`,
            options:
              textField?.options ||
              (detectedField.type === "dropdown" ? [] : undefined),
            detectedFrom: detectedField.detectedFrom,
          });
        }

        // Only add text-based fields that weren't detected (rare - only if coordinate detection missed something)
        let addedFromText = 0;
        for (const [key, textField] of textBasedFieldMap.entries()) {
          if (!detectedFieldMap.has(key)) {
            // Only add if it looks like an actual fillable field (has common field patterns)
            const fieldName = (textField.name || "").toLowerCase();
            const isLikelyFillable =
              fieldName.includes("signature") ||
              fieldName.includes("date") ||
              fieldName.includes("initial") ||
              fieldName.includes("name") ||
              fieldName.includes("phone") ||
              fieldName.includes("address");

            if (isLikelyFillable) {
              primaryFields.push(textField);
              addedFromText++;
              console.log(
                `[SCHEMA-GEN] ➕ Added text-based field "${textField.name}" (not in detected fields)`
              );
            }
          }
        }

        allFields = primaryFields;
        console.log(
          `[SCHEMA-GEN] ✅ Using ${detectedFieldsFromTemplates.length} detected fields + ${addedFromText} additional text-based fields = ${allFields.length} total (before final deduplication)`
        );

        // **CRITICAL**: Comprehensive final deduplication pass on merged result
        // This consolidates "Admission Start Date*" and "Admission Date*" into one field
        const {
          performFinalDeduplicationPass,
        } = require("../../utils/fieldNormalization.util");
        allFields = performFinalDeduplicationPass(allFields);
        console.log(
          `[SCHEMA-GEN] ✅ After comprehensive final deduplication: ${allFields.length} unique fields`
        );
      }
    }

    // Normalize field names and analyze compliance
    let fieldsWithCitations = 0;
    let wacCitations = [];
    let rcwCitations = [];

    allFields.forEach((field) => {
      if (!field.name) {
        field.name = field.label.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
      }
      if (!field.type) {
        field.type = "text";
      }

      // Track compliance data
      if (field.wacCitation || field.rcwCitation) {
        fieldsWithCitations++;
        if (field.wacCitation && !wacCitations.includes(field.wacCitation)) {
          wacCitations.push(field.wacCitation);
        }
        if (field.rcwCitation && !rcwCitations.includes(field.rcwCitation)) {
          rcwCitations.push(field.rcwCitation);
        }
      }
    });

    // **COMPREHENSIVE FINAL PASS**: Consolidate duplicate and similar fields using multi-strategy approach
    const fieldsBeforeConsolidation = allFields.length;
    console.log(
      `[SCHEMA-GEN] 🔄 Starting comprehensive final deduplication pass (before: ${fieldsBeforeConsolidation} fields)...`
    );

    // Use comprehensive final deduplication utility
    const {
      shouldIncludeFieldInSchema,
      performFinalDeduplicationPass,
    } = require("../../utils/fieldNormalization.util");

    // First, filter out problematic fields
    const filteredFields = allFields.filter((field) =>
      shouldIncludeFieldInSchema(field)
    );
    const filteredCount = allFields.length - filteredFields.length;
    if (filteredCount > 0) {
      console.log(
        `[SCHEMA-GEN] 🔍 Filtered out ${filteredCount} generic/problematic fields`
      );
    }

    // Comprehensive final deduplication pass (multi-strategy: exact, semantic, fuzzy, word-level)
    allFields = performFinalDeduplicationPass(filteredFields);
    const duplicatesRemoved = fieldsBeforeConsolidation - allFields.length;
    console.log(
      `[SCHEMA-GEN] ✅ After comprehensive final deduplication: ${allFields.length} unique fields (removed ${duplicatesRemoved} duplicates/similar fields)`
    );

    // **NO ARTIFICIAL LIMIT**: Extract ALL actual fillable fields
    // Forms can have 100+ fields if they have that many fillable areas
    // The consolidation above already removed duplicates - keep all remaining unique fields
    console.log(
      `[SCHEMA-GEN] ✅ Consolidated to ${allFields.length} unique fillable fields (no artificial limit)`
    );

    // **POST-PROCESSING**: Ensure placeholders and dropdown options
    console.log(
      `[SCHEMA-GEN] 🔧 Post-processing fields: ensuring placeholders and dropdown options...`
    );
    for (const field of allFields) {
      // Ensure placeholder exists
      if (!field.placeholder || field.placeholder.trim() === "") {
        const fieldLabel = (field.label || field.name || "").toLowerCase();
        if (field.type === "date") {
          field.placeholder = "Select date";
        } else if (field.type === "email") {
          field.placeholder = "Enter email address";
        } else if (field.type === "number") {
          field.placeholder = `Enter ${field.label || field.name}`;
        } else if (fieldLabel.includes("phone")) {
          field.placeholder = "Enter phone number";
        } else if (fieldLabel.includes("address")) {
          field.placeholder = "Enter address";
        } else if (field.type === "textarea") {
          field.placeholder = `Enter ${field.label || field.name}`;
        } else {
          field.placeholder = `Enter ${field.label || field.name}`;
        }
      }

      // Set dropdown options for sex/gender fields
      const fieldName = (field.name || "").toLowerCase();
      const fieldLabel = (field.label || "").toLowerCase();
      if (
        (fieldName.includes("sex") ||
          fieldName.includes("gender") ||
          fieldLabel.includes("sex") ||
          fieldLabel.includes("gender")) &&
        field.type !== "dropdown"
      ) {
        field.type = "dropdown";
        field.options = ["Male", "Female", "Other"];
        console.log(
          `[SCHEMA-GEN] ✅ Set "${field.name}" as dropdown with options: Male, Female, Other`
        );
      }

      // Set dropdown options for marital status
      if (
        (fieldName.includes("marital") || fieldLabel.includes("marital")) &&
        field.type !== "dropdown"
      ) {
        field.type = "dropdown";
        field.options = [
          "Single",
          "Married",
          "Divorced",
          "Widowed",
          "Separated",
        ];
      }

      // Set dropdown options for relationship
      if (
        (fieldName.includes("relationship") ||
          fieldLabel.includes("relationship")) &&
        field.type !== "dropdown"
      ) {
        field.type = "dropdown";
        field.options = [
          "Parent",
          "Guardian",
          "Spouse",
          "Child",
          "Sibling",
          "Other",
        ];
      }
    }
    console.log(`[SCHEMA-GEN] ✅ Post-processing complete`);

    // Log compliance summary
    console.log(`[COMPLIANCE] 🏛️ WAC/RCW Compliance Summary:`);
    console.log(`  - Total fields: ${allFields.length}`);
    console.log(
      `  - Fields with citations: ${fieldsWithCitations} (${(
        (fieldsWithCitations / allFields.length) *
        100
      ).toFixed(1)}%)`
    );
    console.log(`  - Unique WAC citations: ${wacCitations.length}`);
    console.log(`  - Unique RCW citations: ${rcwCitations.length}`);
    if (wacCitations.length > 0) {
      console.log(`  - WAC: ${wacCitations.join(", ")}`);
    }
    if (rcwCitations.length > 0) {
      console.log(`  - RCW: ${rcwCitations.join(", ")}`);
    }

    // Create schema object with compliance metadata
    const schema = {
      form_name: formName || "Master Form",
      description:
        description || "Consolidated form from all uploaded documents",
      fields: allFields,
      compliance: {
        isCompliant: fieldsWithCitations > 0,
        totalFields: allFields.length,
        fieldsWithCitations,
        compliancePercentage: (
          (fieldsWithCitations / allFields.length) *
          100
        ).toFixed(1),
        wacCitations,
        rcwCitations,
        generatedAt: new Date().toISOString(),
        complianceVersion: "2025-01",
      },
    };

    // Apply intelligent field ordering
    console.log(
      "📋 Field ordering BEFORE sorting:",
      schema.fields.map((f) => f.label).join(", ")
    );
    schema.fields = sortFieldsLogically(schema.fields);
    console.log(
      "✅ Field ordering AFTER sorting:",
      schema.fields.map((f) => f.label).join(", ")
    );

    // If schema exists, MERGE fields (avoid duplicates by field name)
    if (existingSchema) {
      console.log(
        `[MERGE] Found existing schema for tenant ${tenantId}, merging fields...`
      );

      const existingFields = existingSchema.schemaJson.fields || [];
      const existingFieldNames = new Set(
        existingFields.map((f) => f.name.toLowerCase())
      );

      // Add only new fields that don't exist
      const newFields = schema.fields.filter(
        (field) => !existingFieldNames.has(field.name.toLowerCase())
      );

      console.log(
        `[MERGE] Existing fields: ${existingFields.length}, New unique fields: ${newFields.length}`
      );

      // Merge: existing fields + new fields, then re-sort to maintain logical order
      const mergedFields = [...existingFields, ...newFields];
      const sortedMergedFields = sortFieldsLogically(mergedFields);

      console.log(
        `[MERGE] ✅ Merged and sorted ${sortedMergedFields.length} total fields`
      );

      // Update existing schema with merged fields and compliance data
      const updatedSchema = await prisma.formSchema.update({
        where: { id: existingSchema.id },
        data: {
          schemaJson: {
            ...existingSchema.schemaJson,
            fields: sortedMergedFields,
            compliance: schema.compliance,
          },
          isWacRcwCompliant: schema.compliance.isCompliant,
          complianceVersion: schema.compliance.complianceVersion,
          lastComplianceCheck: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        id: updatedSchema.id,
        schema: updatedSchema.schemaJson,
        createdAt: updatedSchema.createdAt,
        merged: true,
        newFieldsAdded: newFields.length,
      };
    }

    // No existing schema - create new one
    console.log(
      `[CREATE] No existing schema for tenant ${tenantId}, creating new one...`
    );
    const formSchema = await prisma.formSchema.create({
      data: {
        tenantId,
        formName: formName || "Master Form",
        description:
          schema.description ||
          description ||
          "Consolidated form from all uploaded documents",
        schemaJson: schema,
        createdBy: userId,
        isActive: true,
        isWacRcwCompliant: schema.compliance.isCompliant,
        complianceVersion: schema.compliance.complianceVersion,
        lastComplianceCheck: new Date(),
        adminApproved: false, // Requires HITL approval
      },
    });

    return {
      id: formSchema.id,
      schema: formSchema.schemaJson,
      createdAt: formSchema.createdAt,
      merged: false,
      newFieldsAdded: schema.fields.length,
    };
  } catch (error) {
    console.error("AI schema generation error:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse AI response as JSON. Please try again.");
    }
    throw error;
  }
}

/**
 * Get all form schemas for a tenant (or all tenants if tenantId is null)
 */
async function getFormSchemas(tenantId, activeOnly = true) {
  const where = {};

  // If tenantId is provided, filter by it; otherwise fetch all (SUPER_ADMIN)
  if (tenantId !== null && tenantId !== undefined) {
    where.tenantId = tenantId;
  }

  if (activeOnly) {
    where.isActive = true;
  }

  const schemas = await prisma.formSchema.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      formName: true,
      description: true,
      schemaJson: true,
      isActive: true,
      tenantId: true, // Include tenantId so SUPER_ADMIN can see which tenant each schema belongs to
      createdAt: true,
      updatedAt: true,
    },
  });

  return schemas;
}

/**
 * Get a single form schema by ID (optionally filtered by tenantId)
 */
async function getFormSchemaById(tenantId, schemaId) {
  const where = { id: schemaId };

  // If tenantId is provided, filter by it; otherwise search all tenants (SUPER_ADMIN)
  if (tenantId !== null && tenantId !== undefined) {
    where.tenantId = tenantId;
  }

  const schema = await prisma.formSchema.findFirst({
    where,
  });

  if (!schema) {
    throw new Error("Form schema not found or access denied");
  }

  return schema;
}

module.exports = {
  generateFormSchema,
  getFormSchemas,
  getFormSchemaById,
  retrieveRelevantContext,
};

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const fs = require("node:fs");
const path = require("node:path");

/** Claude model used for all NCP extraction (good at long documents and structured extraction) */
const CLAUDE_MODEL =
  process.env.ANTHROPIC_NCP_MODEL?.trim() || "claude-sonnet-4-6";

/** OpenAI model used for Layer-3 fill-empty only when OPENAI_API_KEY is set (faster, no 10k tokens/min limit) */
const OPENAI_LAYER3_MODEL = "gpt-4o-mini";

/** Get Anthropic client; uses ANTHROPIC_API_KEY from env */
function getClaudeClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof key !== "string" || key.trim() === "") {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env for NCP extraction.");
  }
  return new Anthropic({ apiKey: key.trim() });
}

/** Default request timeout for Claude (ms). Layer 1 chunk can take 2–5 min for large PDFs. */
const CLAUDE_REQUEST_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes

/** Wait for next minute window when rate limited (10k input tokens/min). */
const RATE_LIMIT_BACKOFF_MS = 65 * 1000; // 65 seconds

function isRateLimitError(err) {
  const msg = (err && err.message) ? String(err.message) : "";
  const status = err && err.status;
  return status === 429 || /rate_limit|rate limit/i.test(msg) || /exceed your organization's rate limit/i.test(msg);
}

/**
 * Call Claude and return the first text block content.
 * @param {Object} opts - { system, user, maxTokens, temperature, timeoutMs }
 * @returns {Promise<string>} Raw text response
 */
async function callClaude(opts) {
  const { system, user, maxTokens = 8192, temperature = 0.2, timeoutMs = CLAUDE_REQUEST_TIMEOUT_MS } = opts;
  const client = getClaudeClient();

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Claude request timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  });

  const requestPromise = (async () => {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: system || "",
      messages: [{ role: "user", content: user }],
      temperature,
    });
    const textBlock = message.content && message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude did not return text content");
    }
    return textBlock.text;
  })();

  try {
    const rawText = await Promise.race([requestPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return rawText;
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Call Claude with retry on 429 rate limit. Waits RATE_LIMIT_BACKOFF_MS then retries (max 3 attempts).
 * Use for Layer-3 fill-empty passes so extraction completes even when near org rate limit.
 */
async function callClaudeWithRetry(opts, retryCount = 0) {
  const maxRetries = 3;
  try {
    return await callClaude(opts);
  } catch (err) {
    if (isRateLimitError(err) && retryCount < maxRetries) {
      console.log(`[NCP-AI] Rate limit (429), waiting ${RATE_LIMIT_BACKOFF_MS / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
      return callClaudeWithRetry(opts, retryCount + 1);
    }
    throw err;
  }
}

/** Whether to use OpenAI for Layer-3 (fill-empty) only. When set, avoids Claude rate limits and long delays. */
function useOpenAIForLayer3() {
  const key = process.env.OPENAI_API_KEY;
  return !!(key && typeof key === "string" && key.trim() !== "");
}

function getOpenAIClient() {
  if (!useOpenAIForLayer3()) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
}

/**
 * Call OpenAI for Layer-3 fill-empty. Same opts shape as callClaude: { system, user, maxTokens, temperature }.
 * @returns {Promise<string>} Raw text response
 */
async function callOpenAILayer3(opts) {
  const { system, user, maxTokens = 4000, temperature = 0.25 } = opts;
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_LAYER3_MODEL || OPENAI_LAYER3_MODEL,
    messages: [
      { role: "system", content: system || "" },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  const text = completion.choices[0]?.message?.content;
  if (text == null) throw new Error("OpenAI did not return text content");
  return text;
}

/**
 * Parse JSON from model response (may be wrapped in ```json ... ```).
 * @param {string} text - Raw response text
 * @returns {Object} Parsed object
 */
function parseJsonFromClaude(text) {
  if (!text || typeof text !== "string") throw new Error("Empty response");
  let raw = text.trim();
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) raw = jsonMatch[1].trim();
  return JSON.parse(raw);
}

/**
 * Load NCP schema from afh_ncp_schema_flat.json
 * @returns {Object} Schema object with properties
 */
function loadNcpSchema() {
  try {
    const schemaPath = path.join(
      __dirname,
      "../../../afh_ncp_schema_flat.json",
    );
    const schemaContent = fs.readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(schemaContent);
    return schema.properties || schema; // Handle both formats
  } catch (error) {
    console.error("[NCP-AI] Error loading NCP schema:", error);
    throw new Error(`Failed to load NCP schema: ${error.message}`);
  }
}

/**
 * Convert schema to JSON Schema format (used for reference; Claude returns JSON via prompt)
 * @param {Object} schema - NCP schema object with field definitions
 * @returns {Object} JSON Schema compatible object
 */
function convertSchemaToJsonSchema(schema) {
  const jsonSchema = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  };

  // Convert each field to JSON Schema format
  Object.entries(schema).forEach(([fieldName, fieldDef]) => {
    const jsonSchemaField = {
      type: fieldDef.type || "string",
    };

    // Add description if available
    if (fieldDef.description) {
      jsonSchemaField.description = fieldDef.description;
    }

    // Handle enum fields
    if (fieldDef.enum && Array.isArray(fieldDef.enum)) {
      jsonSchemaField.enum = fieldDef.enum;
    }

    jsonSchema.properties[fieldName] = jsonSchemaField;
    jsonSchema.required.push(fieldName); // All fields are required (will be null if not found)
  });

  return jsonSchema;
}

/**
 * Create system prompt for Claude
 * @returns {string} System prompt
 */
function createSystemPrompt() {
  return `You are a strict Healthcare Data Extraction Auditor. Your ONLY goal is to extract data that is EXPLICITLY stated or clearly present in the PDF text into the schema's JSON format. Do not invent or infer in this pass — extract what is there. A second pass (Layer 2) will later fill remaining gaps by inference.

PRIORITY 1 — SUMMARY / HEADER FIELDS (extract from document header, cover page, or "Demographics"/"Client Information"/"Overview" section):
- **provider_name:** From "Provider Name", "AFH Provider", "AFH Name", "Adult Family Home Provider:", "Name of AFH:", "Facility Name:", "Provider:" in the document header. This is the name of the ADULT FAMILY HOME (facility), not the resident, not the case manager, not the agency. Example: "Green Acres Adult Family Home". Do NOT use the resident's name, case manager name, or agency name here.
- **date_ncp_started:** From a labeled field: "Assessment Date", "Date of Assessment", "Date Assessed", "NCP Start Date", "Date Started". This is the date the NCP/assessment was conducted — it appears in the form header near the top. Do NOT use page print dates, document headers with a date range, or footer dates. Format MM/DD/YYYY.
- **date_completed:** From "Date Completed", "Completed Date", "NCP Completed", or the same "Assessment Date" field if only one date is listed. Format MM/DD/YYYY. Do NOT use page print/footer dates.
- **resident_name:** From "Client Name", "Resident Name", "Consumer Name", "Name:", "Client:". If the PDF shows "Last, First" (e.g. "Pershin, Richard L."), output as "First Last" (e.g. "Richard L Pershin"). If it already shows "First Last", use as-is.
- **date_of_birth:** From a labeled field: "DOB", "Date of Birth", "Birth Date", "DOB:". This is a RESIDENT DEMOGRAPHIC — it appears near the resident name, NOT in the page header or print date line. Format MM/DD/YYYY.
- **age:** From "Assessed Age", "Age", "Client Age". Use the number as a string (e.g. "61").
- **resident_pronouns:** From "Gender", "Sex", or "Pronouns". Map: Male → "He/Him", Female → "She/Her", or use exact pronouns if given.
- **primary_language:** From "Primary Spoken Language", "Primary language", "Language".
- **speaks_english:** From "Speaks English", "English". Use "Yes" or "No".
- **interpreter_needed:** From "Interpreter Required", "Interpreter needed". Use "Yes" or "No".
- **moved_in_date:** From a labeled field: "Move-in date", "Admission date", "Date of admission", "Admitted:", "Admission:". This is when the RESIDENT MOVED INTO the AFH — near demographics. Format MM/DD/YYYY.
- **date_discharged:** From "Discharge date". Format MM/DD/YYYY or "N/A".
- **all_allergies:** From "Allergies", "Allergy", "Known allergies". Use exact phrase from document or "No severe or life threatening allergies" / "None" if stated.

DATE EXTRACTION — CRITICAL RULES:
- ALWAYS use labeled fields (e.g. "Assessment Date:", "DOB:", "Admission Date:") to identify the correct date.
- PDF documents commonly contain page print dates in headers/footers (e.g. "Printed on 03/15/2024" or a date in the top-right corner of each page) — these are NOT assessment dates or DOBs. IGNORE page header/footer dates entirely.
- "date_ncp_started" and "date_completed" come from the NCP form itself, not from page headers.
- "date_of_birth" comes from the resident's demographic field (labeled "DOB" or "Date of Birth"), NOT from any date near the provider or header.
- "moved_in_date" comes from labeled "Admission date" or "Move-in date" near the resident's demographic block.

PRIORITY 1b — MEDICATIONS (Section 4 — from "Medication Management", "Medications", "MAR" sections):
- **med_administration:** "X" if resident needs FULL caregiver medication administration (cannot self-administer). "X" if resident has dementia/cognitive impairment preventing self-medication.
- **med_self_administration:** "X" if resident self-administers medications independently.
- **med_self_admin_with_assist:** "X" if resident self-administers with caregiver assistance.
- **med_type_oral / med_type_topical / med_type_eye_drops / med_type_inhalers / med_type_sprays / med_injection:** Check these based on what the medication section says about medication forms/routes. "X" for each type present.
- **med_equipment:** ONLY medication administration equipment — e.g., "pill crusher", "medication cups", "G-tube supplies", "feeding tube", "oral syringe". Do NOT put oxygen concentrators, nebulizers, or other medical devices here — those belong in the treatment section.
- **med_ordered_by:** Actual PCP/prescriber name from "Ordered by", "Provider", "PCP" in medication section. If not found, leave blank.
- **med_delivered_by:** Actual pharmacy name from "Pharmacy", "Delivered by" in medication section. If not found, leave blank.

PRIORITY 1c — MEDICATIONS (Section 5 — HEALTH INDICATORS checkboxes):
- **health_pain / health_weight_loss_gain / health_vital_signs / health_hospitalization:** From the "Health Indicators" section. Check each based on what is documented. At least one should be X for most residents.

PRIORITY 1d — ADL PERFORMANCE LEVELS (Sections 10 — one per group MUST be X):
For each ADL, check the "Self Performance" or "Level of Independence" level:
- Mobility (room/outside): mobility_room_independent/supervision/assistance/dependent, mobility_outside_independent/supervision/assistance/dependent
- Bed mobility: bed_mobility_independent/supervision/assistance/dependent
- Eating: eating_independent/supervision/assistance/dependent
- Toileting: toileting_independent/supervision/assistance/dependent
- Dressing: dressing_independent/supervision/assistance/dependent
- Bathing: bathing_independent/supervision/assistance/dependent
- For each group, EXACTLY ONE must be X based on the ADL self-performance level documented.

PRIORITY 2 — LEGAL DOCUMENTS & SPECIALTY NEEDS (Section 1 checkboxes):
- **legal_docs_none / legal_docs_advanced_directives / legal_docs_polst / legal_docs_other_checkbox:** From the "Legal Documents" section. Look for a checklist with items like "None", "Advanced Directives", "POLST Form", "Other". Use "X" for checked, "" for unchecked. If the section says "POLST: Yes" or "Advanced Directive on file" → mark the corresponding checkbox "X".
- **specialty_needs_none / specialty_needs_dementia / specialty_needs_mental_health / specialty_needs_developmental_disability / specialty_needs_other_checkbox:** From "Specialty Needs" or "Special Needs" section. Look for checkboxes listing "None", "Dementia", "Mental Health", "Developmental Disability", "Other". Use "X" for checked, "" for unchecked. Also infer: if diagnoses explicitly include "Dementia" or "Alzheimer's" → specialty_needs_dementia = "X"; if diagnoses include a mental health condition (depression, anxiety, schizophrenia, bipolar) and there is a mental health specialty needs checkbox → specialty_needs_mental_health = "X"; if diagnoses include "Developmental Disability", "Intellectual Disability", "Down Syndrome", "Autism" → specialty_needs_developmental_disability = "X".
- **evacuation_none_independent / evacuation_assistance_required:** From "Evacuation", "AFH Evacuation Level", or "Emergency Evacuation" section. If it says resident needs assistance, or evacuation level is greater than 1 → evacuation_assistance_required = "X"; if fully independent → evacuation_none_independent = "X".

PRIORITY 3 — RESPONSIBLE PARTIES / CONTACTS (ONLY from designated contact sections; never from narrative or "sources of information"):
- **ONLY** fill contact_1 through contact_6 from explicit section headings or clearly labeled contact blocks in the document. Look for: "Client Representative (NSA)", "Client Representative", "Representative", "Worker Information", "Primary Case Manager", "Case Manager", "Emergency Contact", "Emergency Contact 1/2", "Guardian", "DPOA", "Power of Attorney", "Responsible Party", "Contact Person", or any block that lists a person with Name, Relationship, Phone, Address, or Email. Use the exact Name, Relation to client/Relationship, Phone, Address, Fax, E-mail from those sections only.
- **contact_1:** From "Client Representative (NSA)", "Client Representative", "Representative", "Emergency Contact 1", or the first such contact block. Map: Name → contact_1_name (e.g. "Carter, Alexis"); Relation to client → contact_1_relationship (e.g. "Not related"); Phone → contact_1_home_phone; Address → contact_1_address_email; Fax → contact_1_cell_fax if present. If no such section in this segment, leave contact_1_* null/empty.
- **contact_2:** From "Worker Information", "Primary Case Manager", or "Case Manager" section. Map: Name → contact_2_name (e.g. "Brosseau, Jane A"); Relationship → contact_2_relationship (e.g. "Case Manager"); Phone → contact_2_home_phone; Address/Email → contact_2_address_email. If not present, leave contact_2_* null/empty.
- **contact_3 through contact_6:** From other explicitly labeled contact/guardian/DPOA/emergency contact sections if present. Do NOT use names from narrative text, "Other sources of information", "family", "Mom", or "Guardian" when it's just a role mention. If the document has only one contact section, only contact_1 has data; leave contact_2 through contact_6 null/empty.

EXTRACTION SOURCES FOR ALL OTHER SECTIONS — use ONLY the designated document sections below. Do NOT pull from narrative paragraphs, "Reason For Assessment", "My Goals and Plans", or free-text descriptions to fill section-specific fields. Extract exact values from labeled fields/sections only.
- **comm_* (Communication):** From "Communication", "Speech/Hearing", "Vision", "Modes of expression", "Hearing", "Vision", "Equipment" under the COMMUNICATION section ONLY. Vision fields (comm_vision_*) must contain EYESIGHT information only — visual acuity, glasses, eye conditions. Do NOT put skin care, wound care, or non-vision content in vision fields. Hearing fields (comm_hearing_*) must contain HEARING information only.
- **med_* (Medications):** From "Medications", "Medication Management", "Routes", "Self Administration", "Caregiver Instructions", "Provider" under medications. Do not invent medication names or doses from narrative.
- **health_* / allergy_* / current_medical_diagnoses:** From "Health Indicators", "Mental/Physical Health", "Diagnosis", "Allergy", "Health and Welfare", "Medical acuity". Use listed diagnoses and allergy text exactly.
- **treatment_*:** From "Treatments/Programs/Therapies", "Type:", "Name:", "Provider", "Frequency" in that section. Map each treatment type/name to the corresponding schema checkbox or description field.
- **psych_* / cognitive_* (Psychosocial & Cognitive):** From "Sleep", "Memory", "Cognitive Performance", "Behavior", "Current Behaviors", "DDA Sleep", "Decisions", "Plan of Care Supervision" — use labeled fields and checkboxes, not narrative summaries.
- **left_alone_*:** From sections about "Left alone", "Supervision", "Summon help", "Monitoring" if explicitly present.
- **universal_precautions_*:** From "Universal Precautions" or infection-control labeled content.
- **mobility_* / bed_mobility_* / eating_* / toileting_* / dressing_* / hygiene_* / bathing_* / foot_care_* / skin_* (ADL):** From the corresponding ADL section headings (e.g. "Walk in Room", "Bed Mobility", "Eating", "Toilet Use", "Dressing", "Personal Hygiene", "Bathing", "Foot Care", "Skin Care") and their "Self Performance", "Caregiver Instructions", "Equipment", "Client Limitations" — use exact phrases from those blocks.
- **iadl_*:** From "IADL", "Meal Preparation", "Ordinary Housework", "Essential Shopping", "Transportation", "Social", "Employment" or similar labeled IADL subsections.
- **evacuation_* / caregiver_evacuation_*:** From "AFH Evacuation Level", "Evacuation", or safety/evacuation labeled content.

CRITICAL EXTRACTION PROTOCOLS:
1. **Exhaustive Extraction:** Check the document against EVERY field in the schema. For each section (demographics, contacts, communication, medications, health, treatments, psych, ADL, IADL), use only the designated document sections listed above.
2. **Document-only:** Section-specific fields (comm_*, med_*, health_*, treatment_*, psych_*, cognitive_*, mobility_*, eating_*, toileting_*, dressing_*, hygiene_*, bathing_*, foot_care_*, skin_*, iadl_*) must be filled ONLY from the corresponding labeled document sections. Do not use narrative paragraphs, "Reason For Assessment", "My Goals and Plans", or unlabeled prose for these fields.
3. **PDF Artifact Handling:** Ignore artifacts like "" or page headers; extract the data surrounding them.
4. **Checkbox Logic:** "[X]", "[x]", "☑", or explicit choice (e.g. "Gender: Male") → use "X" for checked, "" for unchecked when schema expects "X"/"".
5. **Verbatim Fidelity:** Do not summarize. Copy values as written (except date format and "Last, First" → "First Last" for resident_name).
6. **Date Normalization:** All dates as MM/DD/YYYY. NEVER extract a page print date or document header date as an assessment, admission, or birth date.
7. **Required Fields:** Provide a value (or null/"") for every schema field. Prefer explicit PDF values; use null/"" only when the document does not contain that information in the right section.
8. **Full document:** The PDF may be 40+ pages. Every segment of the document will be processed. In your segment, extract every value that appears in the relevant labeled sections — exact same wording/numbers as in the document. Do not skip fields; be exhaustive.

The schema is enforced at the API level — you must provide a value for every field defined in the schema.`;
}

/**
 * Create user prompt with text chunk. For Claude we include instruction to return full JSON with all schema keys.
 */
function createUserPrompt(textChunk, chunkIndex = 0, totalChunks = 1, schemaKeys = []) {
  const chunkContext =
    totalChunks > 1
      ? `\n\n**CONTEXT:** This is segment ${chunkIndex + 1} of ${totalChunks} from a multi-page document (e.g. 40+ pages). Extract EVERY value that appears in THIS segment and maps to any schema field. The full document is processed segment by segment — be exhaustive so nothing is missed.`
      : "\n\n**CONTEXT:** This is the full document. Extract every value that appears in the text and maps to a schema field. Be exhaustive.";

  const keysNote =
    schemaKeys.length > 0
      ? `\n\nYou MUST return a JSON object with every one of these keys (use null or "" for missing): ${schemaKeys.slice(0, 50).join(", ")}${schemaKeys.length > 50 ? ` ... and ${schemaKeys.length - 50} more keys.` : ""}`
      : "";

  return `Extract healthcare data from this NCP assessment text.${chunkContext}

SOURCE TEXT:
------------------------------------------------------------------
${textChunk}
------------------------------------------------------------------

EXTRACTION INSTRUCTIONS:
1. **Summary fields (if present in this segment):**
   - provider_name → The NAME OF THE ADULT FAMILY HOME (the facility/house). Look for "Provider Name:", "AFH Name:", "Adult Family Home:", "Facility Name:" in the document HEADER or title block. This is NEVER the case manager, nurse, or resident name. Example: "Green Acres Adult Family Home". If you are not certain it is the AFH name, leave blank.
   - date_ncp_started → from "Assessment Date:", "Date of Assessment:", "NCP Start Date:" (a labeled field in the form header). Do NOT use page print/footer dates.
   - date_completed → from "Date Completed:", "Completed Date:". Do NOT use page print/footer dates.
   - resident_name → from "Client Name:", "Name:", "Consumer Name:" — if "Last, First" format, output as "First Last".
   - date_of_birth → from labeled "DOB:", "Date of Birth:". COPY THE EXACT DATE including the correct 4-digit year. A resident born in 1961 has DOB year 19xx, not 20xx. NEVER use a recent year for an elderly resident's DOB. Format MM/DD/YYYY.
   - age → The resident's AGE as a full number (e.g. "61"). Do NOT truncate — if the text says "61 years" copy "61", not "6".
   - moved_in_date → from labeled "Move-in date:", "Admission date:", "Date of admission:". Format MM/DD/YYYY.
   - resident_pronouns (Male→He/Him, Female→She/Her), primary_language, speaks_english (Yes/No), interpreter_needed (Yes/No), all_allergies, date_discharged.
2. **Legal Documents & Specialty Needs (Section 1 checkboxes — if present):**
   - legal_docs_advanced_directives → "X" if "Advanced Directive", "AD", "Living Will", or "Advanced Care Plan" is checked or listed.
   - legal_docs_polst → "X" if "POLST" is checked or listed.
   - legal_docs_none → "X" ONLY if the document explicitly says "None" for legal docs.
   - specialty_needs_dementia → "X" if Alzheimer's, Dementia, or memory disorder is in the diagnoses.
   - specialty_needs_mental_health → "X" if any mental health condition (depression, anxiety, schizophrenia, bipolar) is documented.
   - specialty_needs_developmental_disability → "X" if Developmental Disability, Intellectual Disability, Down Syndrome, or Autism is documented.
   - specialty_needs_none → "X" ONLY if no specialty needs at all.
   - evacuation_* → from "Evacuation" or "AFH Evacuation Level". Assistance needed → evacuation_assistance_required = "X"; independent → evacuation_none_independent = "X".
3. **Communication checkboxes:**
   - comm_expression_yes → "X" if resident has ANY speech/expression problems (limited vocabulary, verbal difficulties, aphasia, etc.)
   - comm_expression_no → "X" ONLY if resident has NO expression problems.
   - comm_problems_hearing_yes → "X" if resident has ANY hearing loss or hearing problems (bilateral hearing loss, hard of hearing, deafness, etc.)
   - comm_problems_hearing_no → "X" ONLY if resident has NO hearing problems.
   - comm_problems_vision_yes → "X" if resident has ANY vision problems (needs glasses, vision impairment, cataracts, etc.)
   - comm_problems_vision_no → "X" ONLY if resident has NO vision problems.
   - comm_hearing_equipment → HEARING AIDS or devices. If only glasses mentioned, leave blank.
   - comm_vision_equipment → GLASSES, contact lenses, or vision devices only.
4. **Behavioral checkboxes (psych_*):** Actively infer from narrative and documented behaviors. Set "X" for each that applies:
   - psych_resistive_to_care → resists, fights, refuses care, combative, non-compliant with care
   - psych_disruptive_behavior → disruptive episodes, agitation, disturbing behavior
   - psych_assaultive → assaultive, attacks staff or others
   - psych_verbally_aggressive → verbal aggression, verbal threats, screaming, yelling, cursing
   - psych_physically_aggressive → physical aggression, hitting, kicking, punching, slapping, scratching, biting, grabbing
   - psych_wandering → wandering, pacing
   - psych_exit_seeking → exit seeking, elopement risk, tries to leave
   - psych_depression → depression, depressed mood
   - psych_anxiety → anxiety, anxious, panic
   - psych_irritability → irritability, easily upset, short-tempered
   - psych_disorientation → disorientation, disoriented
   - psych_hallucinations → hallucinations, hears voices, sees things
   - psych_delusions → delusions, paranoia, false beliefs
   - psych_inappropriate_behavior → inappropriate or unsafe behavior
   - psych_suicidal_ideation → suicidal ideation, self-harm, thoughts of suicide
   - psych_difficulty_unfamiliar → difficulty with unfamiliar people or environments
   - psych_disrobing → disrobing, undressing inappropriately
   - psych_weeping_crying → weeping, crying episodes
   - psych_unaware_consequences → unaware of consequences, no safety awareness
   - psych_unrealistic_fears → unrealistic or irrational fears
   - psych_inappropriate_spitting → spitting
   - psych_breaks_throws → breaks or throws objects
   - psych_sleep_disturbance → sleep disturbance, insomnia, disrupted sleep
   - psych_nighttime_assistance → needs nighttime assistance, wakes at night
5. **Contacts:** Extract ONLY from explicitly labeled contact sections. Do not use "Other sources of information" or narrative.
6. **All other sections:** Extract each section ONLY from its matching document block. Do NOT mix content between sections — eating/feeding content belongs ONLY in eating_* fields; bed mobility content belongs ONLY in bed_mobility_* fields; IADL content belongs ONLY in iadl_* fields.
7. **Empty fields:** If a field is not found, use null or "". NEVER use placeholder phrases like "Not indicated in assessment", "No known X per assessment", "Routine monitoring as documented". Leave blank.
8. DATE RULE: NEVER extract a page print date, footer date, or document header date as assessment/NCP/admission/birth dates.
9. NUMBER INTEGRITY: Copy numeric values exactly and completely. "61" stays "61", never truncated to "6".
10. Respond with ONLY a single JSON object. No markdown, no explanation. Every schema key must appear.${keysNote}`;
}

/**
 * Get list of field names that are missing or empty in extracted data.
 * For checkbox fields (enum: ["X", ""]), "" is a valid "unchecked" value — normally skip them.
 * Exception: checkbox groups where ALL members are "" are forced into Layer 2 for re-inference
 * (e.g. specialty_needs_*, legal_docs_*, evacuation_* where at least one should always be X).
 */
/** Checkbox groups that must have at least one "X" — if all are "", re-infer in Layer 2 */
const REQUIRED_CHECKBOX_GROUPS = [
  // specialty needs (at least one should be X)
  ["specialty_needs_none", "specialty_needs_dementia", "specialty_needs_mental_health", "specialty_needs_developmental_disability", "specialty_needs_other_checkbox"],
  // legal docs (at least one should be X)
  ["legal_docs_none", "legal_docs_advanced_directives", "legal_docs_polst", "legal_docs_other_checkbox"],
  // evacuation (at least one should be X)
  ["evacuation_none_independent", "evacuation_assistance_required"],
  // communication expression Yes/No (one must be X)
  ["comm_expression_yes", "comm_expression_no"],
  // communication hearing Yes/No (one must be X)
  ["comm_problems_hearing_yes", "comm_problems_hearing_no"],
  // communication vision Yes/No (one must be X)
  ["comm_problems_vision_yes", "comm_problems_vision_no"],
  // medication administration — at least one must be X (self, with assist, or full admin)
  ["med_self_administration", "med_self_admin_with_assist", "med_administration"],
  // medication types — at least one must be X (oral, topical, eye drops, inhalers, sprays, injection, other)
  ["med_type_oral", "med_type_topical", "med_type_eye_drops", "med_type_inhalers", "med_type_sprays", "med_injection", "med_type_other"],
  // health indicators — at least one must be X
  ["health_pain", "health_weight_loss_gain", "health_vital_signs", "health_hospitalization"],
  // room locomotion — at least one must be X
  ["mobility_room_independent", "mobility_room_supervision", "mobility_room_assistance", "mobility_room_dependent"],
  // outside locomotion — at least one must be X
  ["mobility_outside_independent", "mobility_outside_supervision", "mobility_outside_assistance", "mobility_outside_dependent"],
  // bed mobility — at least one must be X
  ["bed_mobility_independent", "bed_mobility_supervision", "bed_mobility_assistance", "bed_mobility_dependent"],
  // eating — at least one must be X
  ["eating_independent", "eating_supervision", "eating_assistance", "eating_dependent"],
  // toileting — at least one must be X
  ["toileting_independent", "toileting_supervision", "toileting_assistance", "toileting_dependent"],
  // dressing — at least one must be X
  ["dressing_independent", "dressing_supervision", "dressing_assistance", "dressing_dependent"],
  // bathing — at least one must be X
  ["bathing_independent", "bathing_supervision", "bathing_assistance", "bathing_dependent"],
];

function getMissingFields(extractedData, schema) {
  const missing = [];
  const forcedCheckboxes = new Set();

  // Detect checkbox groups where none is "X" — all blank means the group was not processed
  for (const group of REQUIRED_CHECKBOX_GROUPS) {
    const anyChecked = group.some((name) => extractedData[name] === "X");
    if (!anyChecked) {
      // All blank/null — force the whole group into Layer 2 for re-inference
      for (const name of group) {
        if (schema[name]) {
          forcedCheckboxes.add(name);
          missing.push(name);
        }
      }
    }
  }

  for (const fieldName of Object.keys(schema)) {
    if (forcedCheckboxes.has(fieldName)) continue; // already added above

    const fieldDef = schema[fieldName];
    const value = extractedData[fieldName];

    // For checkbox fields, "" is a valid "unchecked" value — not missing
    const isCheckbox = fieldDef?.enum &&
      JSON.stringify(fieldDef.enum) === JSON.stringify(["X", ""]);
    if (isCheckbox && (value === "" || value === "X")) {
      continue;
    }

    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "");
    if (isEmpty) {
      missing.push(fieldName);
    }
  }
  return missing;
}

/** Max missing fields per Layer-2 request so the model can focus and actually infer */
const LAYER2_BATCH_SIZE = 45;

/** High-value summary/demographics fields to fill in the first Layer-2 batch if still missing after Layer 1 */
const LAYER2_PRIORITY_FIELDS = [
  "resident_name",
  "resident_pronouns",
  "date_of_birth",
  "age",
  "primary_language",
  "speaks_english",
  "interpreter_needed",
  "moved_in_date",
  "date_discharged",
  "all_allergies",
  "provider_name",
  "date_ncp_started",
  "date_completed",
  "current_medical_diagnoses",
  // Specialty needs checkboxes — derived from diagnoses
  "specialty_needs_none",
  "specialty_needs_dementia",
  "specialty_needs_mental_health",
  "specialty_needs_developmental_disability",
  "specialty_needs_other_checkbox",
  // Legal documents checkboxes
  "legal_docs_none",
  "legal_docs_advanced_directives",
  "legal_docs_polst",
  "legal_docs_other_checkbox",
  // Evacuation checkboxes
  "evacuation_none_independent",
  "evacuation_assistance_required",
  // Communication Yes/No checkboxes
  "comm_expression_yes",
  "comm_expression_no",
  "comm_problems_hearing_yes",
  "comm_problems_hearing_no",
  "comm_problems_vision_yes",
  "comm_problems_vision_no",
  // Medication administration checkboxes
  "med_self_administration",
  "med_self_admin_with_assist",
  "med_administration",
  // Medication types
  "med_type_oral",
  "med_type_topical",
  "med_type_eye_drops",
  "med_type_inhalers",
  "med_type_sprays",
  "med_injection",
  // Health indicators
  "health_pain",
  "health_weight_loss_gain",
  "health_vital_signs",
  // ADL performance levels
  "mobility_room_independent", "mobility_room_supervision", "mobility_room_assistance", "mobility_room_dependent",
  "bed_mobility_independent", "bed_mobility_supervision", "bed_mobility_assistance", "bed_mobility_dependent",
  "eating_independent", "eating_supervision", "eating_assistance", "eating_dependent",
  "toileting_independent", "toileting_supervision", "toileting_assistance", "toileting_dependent",
  "dressing_independent", "dressing_supervision", "dressing_assistance", "dressing_dependent",
  "bathing_independent", "bathing_supervision", "bathing_assistance", "bathing_dependent",
];

/**
 * Create system prompt for layer-2: ANALYZE document and GENERATE values (not extract verbatim)
 */
function createSecondLayerSystemPrompt() {
  return `You are an expert healthcare documentation specialist filling in missing fields for an NCP (Negotiated Care Plan) for an Adult Family Home resident in Washington State.

The first extraction pass already pulled verbatim values from the PDF. You are given the fields that are STILL EMPTY. For those fields, you have two jobs:

**JOB 1 — FIND MISSED DATA:** Some values ARE in the document but were missed. Scan every part of the document — demographics block, header, narrative sections, tables, checkboxes — and extract them. Key examples:
- "DOB: 11/24/1961" → date_of_birth: "11/24/1961"
- "Assessed Age: 61" → age: "61"
- "Gender: Male" → resident_pronouns: "He/Him"
- "Provider Name: Green Acres AFH" → provider_name: "Green Acres AFH"
- "Assessment Date: 02/14/2024" → date_ncp_started: "02/14/2024"
- "Admission date: 01/15/2023" → moved_in_date: "01/15/2023"
- "Speaks English: Yes" → speaks_english: "Yes"
- "POLST: Yes" → legal_docs_polst: "X"
- diagnoses include "Dementia" → specialty_needs_dementia: "X"
- diagnoses include a mental health diagnosis → specialty_needs_mental_health: "X"
- diagnoses include "Developmental Disability" → specialty_needs_developmental_disability: "X"
- evacuation level > 1, or "needs assistance" → evacuation_assistance_required: "X"
- no assistance stated for evacuation → evacuation_none_independent: "X"
- resident has dementia/cognitive impairment → med_administration: "X" (cannot self-administer)
- resident self-administers → med_self_administration: "X"; with help → med_self_admin_with_assist: "X"
- medication section mentions oral meds → med_type_oral: "X"; topical creams/patches → med_type_topical: "X"
- "pain" documented → health_pain: "X"; weight monitoring → health_weight_loss_gain: "X"; vitals monitored → health_vital_signs: "X"
- ADL self-performance: look for "Extensive Assistance", "Total Dependence", "Limited Assistance", "Supervision", "Independent" levels for each ADL (mobility, eating, toileting, dressing, bathing) and set the corresponding checkbox
- med_equipment: ONLY medication equipment (pill crusher, cups, G-tube) — NOT oxygen, nebulizers, etc.

DATE RULES: Use labeled fields only (e.g. "Assessment Date:", "DOB:", "Admission Date:"). NEVER use page print dates, footer dates, or document header dates as assessment/birth/admission dates.

**JOB 2 — GENERATE CLINICAL CONTENT for narrative/paragraph fields:** Many NCP fields describe HOW the caregiver assists the resident. These cannot always be copied verbatim from a source assessment document — they need to be WRITTEN based on the resident's condition. For any empty narrative field (caregiver_actions, strengths_abilities, limitations, assistance_instructions, etc.), use the resident's diagnoses, ADL assessments, functional status, cognitive status, and overall assessment context to write appropriate, specific clinical content. This is standard NCP documentation practice.

NARRATIVE GENERATION RULES:
- Use the resident's actual name and accurate pronouns (He/Him, She/Her, etc.) throughout — do not use "the resident" generically when you know the name.
- Keep content specific to this resident's actual condition and needs as described in the assessment.
- Write in a factual, clinical, person-centered tone (e.g. "Richard requires full physical assistance with bathing due to limited upper extremity strength secondary to his diagnoses of...").
- For *_caregiver_actions fields: describe what the caregiver will DO (active verbs: "assist", "monitor", "provide", "ensure", "position").
- For *_strengths_abilities fields: describe what the resident CAN do independently or with minimal cues.
- For *_limitations fields: describe functional limitations matter-of-factly.
- For *_assistance_instructions fields: write step-by-step or descriptive care instructions.
- Do not write generic placeholder text. Draw on the specific details in this assessment.
- For fields where no relevant context exists in the document at all, use null/"".

Checkboxes (enum: ["X", ""]): Use "X" if condition applies, "" if not. All dates: MM/DD/YYYY.`;
}

/**
 * Create user prompt for layer-2 extraction (missing fields only)
 * @param {string} fullText - Full PDF text
 * @param {string[]} missingFieldNames - Field names to fill
 * @param {Object} schemaSubset - Schema definitions for missing fields only
 * @param {number} batchIndex - 1-based batch number (for logging)
 * @param {number} totalBatches - Total batches
 * @returns {string} User prompt
 */
function createSecondLayerUserPrompt(
  fullText,
  missingFieldNames,
  schemaSubset,
  batchIndex = 1,
  totalBatches = 1
) {
  const fieldList = missingFieldNames
    .map((name) => {
      const def = schemaSubset[name];
      const desc = def?.description || "";
      const typeInfo = def?.enum ? ` (one of: ${def.enum.join(", ")})` : "";
      return `- ${name}: ${desc}${typeInfo}`;
    })
    .join("\n");

  const batchNote =
    totalBatches > 1
      ? `\n(This is batch ${batchIndex} of ${totalBatches} — generate values for only these ${missingFieldNames.length} fields.)\n`
      : "";

  return `Fill in these ${missingFieldNames.length} missing NCP fields using the assessment document below.${batchNote}

TWO TYPES OF FIELDS TO FILL:
1. FACTUAL fields (dates, names, checkboxes, Yes/No): Scan the entire document for labeled values. NEVER use page header/footer dates — only use labeled fields like "Assessment Date:", "DOB:", "Admission Date:", "Provider Name:", "Specialty Needs:", "Legal Documents:", etc.
2. NARRATIVE fields (*_caregiver_actions, *_strengths_abilities, *_limitations, *_assistance_instructions, *_caregiver_actions, narrative descriptions): WRITE appropriate clinical content based on the resident's diagnoses, ADL status, cognitive status, and overall care needs as described in the assessment. Use the resident's actual name and condition. This is NCP care plan writing — generate real, specific content.

FIELDS TO FILL (use these exact keys in your JSON):
${fieldList}

ASSESSMENT DOCUMENT:
------------------------------------------------------------------
${fullText}
------------------------------------------------------------------

Return a JSON object with ONLY the fields you filled (non-empty values). Omit fields you cannot fill. Dates: MM/DD/YYYY. Checkboxes: "X" or "". For narrative fields, write complete, clinically appropriate sentences.`;
}

/**
 * Split missing fields into batches; first batch includes priority fields when possible
 */
function batchMissingFields(missingFieldNames) {
  const prioritySet = new Set(LAYER2_PRIORITY_FIELDS);
  const priority = missingFieldNames.filter((n) => prioritySet.has(n));
  const rest = missingFieldNames.filter((n) => !prioritySet.has(n));
  const firstBatch = [...priority];
  const remaining = [...rest];

  while (firstBatch.length < LAYER2_BATCH_SIZE && remaining.length > 0) {
    firstBatch.push(remaining.shift());
  }
  const batches = firstBatch.length > 0 ? [firstBatch] : [];
  while (remaining.length > 0) {
    batches.push(remaining.splice(0, LAYER2_BATCH_SIZE));
  }
  return batches;
}

/** Single Layer-2 API call for one batch of fields. Uses Claude. */
async function extractMissingFieldsBatch(
  fullText,
  batchFieldNames,
  schema,
  batchIndex,
  totalBatches
) {
  const schemaSubset = {};
  batchFieldNames.forEach((name) => {
    if (schema[name]) schemaSubset[name] = schema[name];
  });
  const systemPrompt = createSecondLayerSystemPrompt();
  const userPrompt = createSecondLayerUserPrompt(
    fullText,
    batchFieldNames,
    schemaSubset,
    batchIndex,
    totalBatches
  );

  const rawText = await callClaude({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 8000,
    temperature: 0.35,
  });

  let data;
  try {
    data = parseJsonFromClaude(rawText);
  } catch (e) {
    return {};
  }
  if (!data || typeof data !== "object") return {};
  const allowed = new Set(batchFieldNames);
  const filtered = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k) && v != null && (typeof v !== "string" || v.trim() !== "")) {
      filtered[k] = v;
    }
  }
  return filtered;
}

/**
 * Layer-2 extraction: analyze full document to fill only missing fields (inference/generation).
 * Processes fields in batches so the model can focus and actually infer values.
 * @param {string} fullText - Full PDF text (combined chunks)
 * @param {string[]} missingFieldNames - Field names that are still empty
 * @param {Object} schema - Full NCP schema
 * @param {Object} options - Options (retryCount)
 * @returns {Promise<Object>} Object with only the missing fields filled (may still have null/"")
 */
async function extractMissingFieldsFromText(
  fullText,
  missingFieldNames,
  schema,
  options = {}
) {
  if (missingFieldNames.length === 0) {
    return {};
  }

  const batches = batchMissingFields(missingFieldNames);
  const totalBatches = batches.length;

  console.log(
    `[NCP-AI] Layer-2: Filling ${missingFieldNames.length} missing fields in ${totalBatches} batch(es)`
  );

  const merged = {};

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;

    try {
      const batchResult = await extractMissingFieldsBatch(
        fullText,
        batch,
        schema,
        batchNum,
        totalBatches
      );

      if (batchResult && typeof batchResult === "object") {
        Object.assign(merged, batchResult);
        const filledInBatch = Object.entries(batchResult).filter(
          ([, v]) =>
            v != null && (typeof v !== "string" || String(v).trim() !== "")
        ).length;
        console.log(
          `[NCP-AI] Layer-2 batch ${batchNum}/${totalBatches}: filled ${filledInBatch}/${batch.length} fields`
        );
      }

      if (i < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(
        `[NCP-AI] Layer-2 batch ${batchNum}/${totalBatches} failed:`,
        err.message
      );
    }
  }

  const totalFilled = Object.entries(merged).filter(
    ([, v]) => v != null && (typeof v !== "string" || String(v).trim() !== "")
  ).length;
  console.log(
    `[NCP-AI] Layer-2 total: filled ${totalFilled}/${missingFieldNames.length} previously missing fields`
  );

  return merged;
}
/**
 * Extract NCP data from text chunk using Claude
 * @param {string} textChunk - Text chunk to extract from
 * @param {Object} schema - NCP schema
 * @param {Object} options - Extraction options
 * @param {number} options.chunkIndex - Current chunk index
 * @param {number} options.totalChunks - Total number of chunks
 * @param {number} options.retryCount - Current retry attempt
 * @returns {Promise<Object>} Extracted data object
 */
async function extractNcpDataFromChunk(textChunk, schema, options = {}) {
  const { chunkIndex = 0, totalChunks = 1, retryCount = 0 } = options;
  const schemaKeys = Object.keys(schema);
  const maxRetries = 3;

  try {
    console.log(
      `[NCP-AI] Claude: Extracting data from chunk ${chunkIndex + 1}/${totalChunks} (${textChunk.length} chars, attempt ${retryCount + 1})`,
    );

    const systemPrompt = createSystemPrompt();
    const userPrompt = createUserPrompt(textChunk, chunkIndex, totalChunks, schemaKeys);

    console.log(`[NCP-AI] Claude: Sending chunk ${chunkIndex + 1} to API (this may take 2–5 min for large chunks)...`);
    const rawText = await callClaude({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 32000,
      temperature: 0.1,
      timeoutMs: 6 * 60 * 1000, // 6 min for full-schema chunk
    });

    let extractedData;
    try {
      extractedData = parseJsonFromClaude(rawText);
    } catch (parseError) {
      console.error("[NCP-AI] Claude JSON parse error:", parseError.message);
      if (retryCount < maxRetries) {
        console.log(`[NCP-AI] Retrying extraction (attempt ${retryCount + 2}/${maxRetries + 1})...`);
        return extractNcpDataFromChunk(textChunk, schema, { ...options, retryCount: retryCount + 1 });
      }
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }

    // Ensure every schema key exists (Claude may omit some)
    const result = { ...extractedData };
    for (const key of schemaKeys) {
      if (result[key] === undefined) result[key] = null;
    }

    console.log(
      `[NCP-AI] ✅ Claude extracted ${Object.keys(extractedData).length} fields from chunk ${chunkIndex + 1}`,
    );
    return result;
  } catch (error) {
    console.error(`[NCP-AI] Claude error extracting chunk ${chunkIndex + 1}:`, error.message);
    if (
      (error.message.includes("rate limit") || error.message.includes("overloaded") || error.status === 429) &&
      retryCount < maxRetries
    ) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`[NCP-AI] Rate limit, retrying after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return extractNcpDataFromChunk(textChunk, schema, { ...options, retryCount: retryCount + 1 });
    }
    throw error;
  }
}
// ----------------------------- Contact Extraction -----------------------------
/** Contact field names (contact_1_* through contact_6_*) for dedicated contact extraction */
const CONTACT_FIELD_NAMES = [
  "contact_1_name", "contact_1_relationship", "contact_1_home_phone", "contact_1_cell_fax", "contact_1_address_email",
  "contact_2_name", "contact_2_relationship", "contact_2_home_phone", "contact_2_cell_fax", "contact_2_address_email",
  "contact_3_name", "contact_3_relationship", "contact_3_home_phone", "contact_3_cell_fax", "contact_3_address_email",
  "contact_4_name", "contact_4_relationship", "contact_4_home_phone", "contact_4_cell_fax", "contact_4_address_email",
  "contact_5_name", "contact_5_relationship", "contact_5_home_phone", "contact_5_cell_fax", "contact_5_address_email",
  "contact_6_name", "contact_6_relationship", "contact_6_home_phone", "contact_6_cell_fax", "contact_6_address_email",
];

/**
 * Dedicated contact extraction from full document text.
 * Runs when chunk-based extraction left all contact names empty, so we are not dependent on chunk boundaries.
 * Only fills contact_* fields that are still empty. Does not invent contacts from narrative.
 * @param {string} fullText - Full PDF text
 * @param {Object} schema - Full NCP schema (for field definitions)
 * @returns {Promise<Object>} Object with contact_* keys that have values (merge into normalizedData only for empty slots)
 */
async function extractContactsFromFullText(fullText, schema) {
  const contactSchema = {};
  CONTACT_FIELD_NAMES.forEach((name) => {
    if (schema[name]) contactSchema[name] = schema[name];
  });
  if (Object.keys(contactSchema).length === 0) return {};

  const systemPrompt = `You extract contact/representative information from assessment PDF text into JSON. Use ONLY explicitly labeled contact sections — never narrative or "Other sources of information".

SECTION PATTERNS TO FIND (exact or similar headings):
1) "Client Representative (NSA)" or "Client Representative" or "Representative" — usually has:
   Name: Last, First  → contact_1_name (output as "Last, First" or "First Last")
   Relation to client: ... → contact_1_relationship
   Phone: ... → contact_1_home_phone
   Address: (lines below) → contact_1_address_email (can include city, state, ZIP)
   Fax/Cell if present → contact_1_cell_fax

2) "Worker Information" — usually has:
   Primary Case Manager: Name → contact_2_name
   (or "Case Manager", "Name:") → contact_2_name
   Relationship/Office → contact_2_relationship (e.g. "Case Manager")
   Phone Number: → contact_2_home_phone
   E-mail: → contact_2_address_email (or put address here if no email)
   Address: → contact_2_address_email if not already used for email

3) contact_3 through contact_6: any other labeled blocks (Emergency Contact 2, Guardian, DPOA, etc.). Same mapping.

EXAMPLE — if you see:
  Client Representative (NSA)
  Name: Carter, Alexis
  Relation to client: Not related
  Phone: (718) 986-9454
  Address: PO Box 7202, Tacoma, WA 98417-0202

Then output: contact_1_name: "Carter, Alexis", contact_1_relationship: "Not related", contact_1_home_phone: "(718) 986-9454", contact_1_address_email: "PO Box 7202, Tacoma, WA 98417-0202", and contact_1_cell_fax: "" or null.

If you see:
  Worker Information
  Primary Case Manager: Brosseau, Jane A (Brossja)
  Phone Number: (253) 278-7971
  E-mail: jane.brosseau@dshs.wa.gov
  Address: 1305 Tacoma Ave S. Suite 300, Tacoma, WA 98402

Then output: contact_2_name: "Brosseau, Jane A", contact_2_relationship: "Case Manager", contact_2_home_phone: "(253) 278-7971", contact_2_address_email: "jane.brosseau@dshs.wa.gov" or the address.

Return a JSON object with keys: ${CONTACT_FIELD_NAMES.join(", ")}. Use null or "" for any field not found. Do not invent names from narrative text.`;

  const textForContact = fullText.length > 300000 ? fullText.slice(0, 300000) + "\n\n[... document truncated ...]" : fullText;
  const userPrompt = `Extract contact information from the assessment document below. Look for the sections "Client Representative (NSA)" and "Worker Information" (or "Primary Case Manager") and fill contact_1 and contact_2 from them. Fill contact_3–6 only if there are other clearly labeled contact blocks. Return JSON with these keys only: ${CONTACT_FIELD_NAMES.join(", ")}. Use exact text from the document. Use null or "" for missing fields.

DOCUMENT:
------------------------------------------------------------------
${textForContact}
------------------------------------------------------------------`;

  try {
    const rawText = await callClaude({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 4000,
      temperature: 0.1,
    });
    const data = parseJsonFromClaude(rawText);
    if (!data || typeof data !== "object") return {};

    const out = {};
    CONTACT_FIELD_NAMES.forEach((name) => {
      const v = data[name];
      if (v !== null && v !== undefined && (typeof v !== "string" || v.trim() !== "")) {
        out[name] = typeof v === "string" ? v.trim() : v;
      }
    });
    if (Object.keys(out).length > 0) {
      console.log(`[NCP-AI] Contact pass: extracted ${Object.keys(out).length} contact fields from full document`);
    }
    return out;
  } catch (err) {
    console.warn("[NCP-AI] Contact-only extraction failed:", err.message);
    return {};
  }
}

/**
 * Merge extracted data from multiple chunks
 * Strategy: Later chunks override earlier chunks for the same field
 * @param {Array<Object>} chunkResults - Array of extracted data from each chunk
 * @returns {Object} Merged data object
 */
function mergeExtractedChunks(chunkResults) {
  console.log(`[NCP-AI] Merging data from ${chunkResults.length} chunks...`);

  const merged = {};
  const fieldSources = {}; // Track which chunk provided each field

  // Process chunks in order (later chunks override earlier ones)
  chunkResults.forEach((chunkData, chunkIndex) => {
    if (!chunkData || typeof chunkData !== "object") {
      console.warn(
        `[NCP-AI] Warning: Chunk ${chunkIndex} returned invalid data, skipping`,
      );
      return;
    }

    Object.entries(chunkData).forEach(([fieldName, fieldValue]) => {
      // Only override if new value is not empty/null and old value is empty/null
      // OR if new value exists (prefer later chunks)
      if (
        fieldValue !== null &&
        fieldValue !== "" &&
        fieldValue !== undefined
      ) {
        // Check if we should override
        const existingValue = merged[fieldName];
        if (!existingValue || existingValue === "" || existingValue === null) {
          merged[fieldName] = fieldValue;
          fieldSources[fieldName] = chunkIndex;
        } else {
          // Both have values - prefer the more complete one
          // For strings, prefer longer/more detailed
          if (
            typeof fieldValue === "string" &&
            fieldValue.length > (existingValue?.length || 0)
          ) {
            merged[fieldName] = fieldValue;
            fieldSources[fieldName] = chunkIndex;
          }
          // Otherwise keep existing (from earlier chunk)
        }
      } else if (!(fieldName in merged)) {
        // Field doesn't exist yet, add it even if empty
        merged[fieldName] = fieldValue;
        fieldSources[fieldName] = chunkIndex;
      }
    });
  });

  console.log(
    `[NCP-AI] ✅ Merged ${Object.keys(merged).length} unique fields from ${chunkResults.length} chunks`,
  );

  return merged;
}

/**
 * Validate extracted data against schema
 * @param {Object} extractedData - Extracted data object
 * @param {Object} schema - NCP schema
 * @returns {Object} Validation result with errors and warnings
 */
function validateExtractedData(extractedData, schema) {
  const errors = [];
  const warnings = [];
  const fieldStats = {
    total: Object.keys(schema).length,
    extracted: Object.keys(extractedData).length,
    valid: 0,
    invalid: 0,
  };

  // Check each extracted field
  Object.entries(extractedData).forEach(([fieldName, fieldValue]) => {
    const fieldDef = schema[fieldName];

    if (!fieldDef) {
      warnings.push(`Field "${fieldName}" not in schema - will be ignored`);
      return;
    }

    // Skip enum validation - AI can extract semantically correct values that may not match exact enum
    // Enum values in schema are for reference only, not strict validation
    // This allows AI to extract natural language values like "Extensive assistance" instead of forcing exact matches

    // Validate checkbox fields (should be "X" or "")
    if (
      fieldDef.enum &&
      fieldDef.enum.includes("X") &&
      fieldDef.enum.includes("")
    ) {
      if (fieldValue !== "X" && fieldValue !== "" && fieldValue !== null) {
        warnings.push(
          `Field "${fieldName}": checkbox value should be "X" or "", got "${fieldValue}"`,
        );
      }
    }

    // Validate date format (basic check)
    if (fieldDef.description && fieldDef.description.includes("MM/DD/YYYY")) {
      if (fieldValue && fieldValue !== "" && typeof fieldValue === "string") {
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!datePattern.test(fieldValue)) {
          warnings.push(
            `Field "${fieldName}": date format should be MM/DD/YYYY, got "${fieldValue}"`,
          );
        }
      }
    }

    fieldStats.valid++;
  });

  // Check for missing important fields
  const importantFields = [
    "resident_name",
    "provider_name",
    "date_ncp_started",
  ];

  importantFields.forEach((fieldName) => {
    if (!extractedData[fieldName] || extractedData[fieldName] === "") {
      warnings.push(`Important field "${fieldName}" is missing or empty`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fieldStats,
  };
}

/**
 * Normalize field values according to schema rules
 * @param {Object} extractedData - Extracted data object
 * @param {Object} schema - NCP schema
 * @returns {Object} Normalized data object
 */
function normalizeFieldValues(extractedData, schema) {
  const normalized = { ...extractedData };

  Object.entries(normalized).forEach(([fieldName, fieldValue]) => {
    const fieldDef = schema[fieldName];
    if (!fieldDef) return;

    // Normalize checkbox fields
    if (
      fieldDef.enum &&
      fieldDef.enum.includes("X") &&
      fieldDef.enum.includes("")
    ) {
      if (
        fieldValue === true ||
        fieldValue === "true" ||
        fieldValue === "True" ||
        fieldValue === "✓" ||
        fieldValue === "☑"
      ) {
        normalized[fieldName] = "X";
      } else if (
        fieldValue === false ||
        fieldValue === "false" ||
        fieldValue === "False" ||
        fieldValue === null ||
        fieldValue === undefined
      ) {
        normalized[fieldName] = "";
      }
      // Keep "X" and "" as-is
    }

    // Normalize enum values (case-insensitive matching)
    if (fieldDef.enum && fieldValue && typeof fieldValue === "string") {
      const lowerValue = fieldValue.toLowerCase().trim();
      const matchingEnum = fieldDef.enum.find(
        (enumVal) => enumVal.toLowerCase() === lowerValue,
      );
      if (matchingEnum) {
        normalized[fieldName] = matchingEnum; // Use exact enum value
      }
    }

    // Normalize dates (try to convert various formats to MM/DD/YYYY)
    if (fieldDef.description && fieldDef.description.includes("MM/DD/YYYY")) {
      if (
        fieldValue &&
        typeof fieldValue === "string" &&
        fieldValue.trim() !== ""
      ) {
        // Try to parse and reformat date
        try {
          const date = new Date(fieldValue);
          if (!isNaN(date.getTime())) {
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const year = date.getFullYear();
            normalized[fieldName] = `${month}/${day}/${year}`;
          }
        } catch (e) {
          // Keep original if parsing fails
        }
      }
    }

    // Trim string values
    if (typeof fieldValue === "string") {
      normalized[fieldName] = fieldValue.trim();
    }
  });

  return normalized;
}

/** Placeholder phrases that should be treated as empty values */
const PLACEHOLDER_PHRASES = [
  "not indicated in assessment",
  "no known",
  "not specified in assessment",
  "routine monitoring as documented",
  "per care plan",
  "as documented in assessment",
  "no additional details documented",
  "not available",
  "not applicable",
  // AI using schema field descriptions as values (e.g. "Description of smoking safety concerns.")
  "description of smoking safety concerns",
  "caregiver actions for smoking safety",
  "strengths/abilities regarding safe smoking",
  "where cigarettes/lighter are stored",
  "description of",
  "caregiver actions for",
  "strengths/abilities regarding",
  "who orders the medications",
  "who delivers the medications",
];

/**
 * Strip out placeholder phrases from text fields — replace with "".
 * These are generated by AI passes and should not be stored as real values.
 */
function cleanPlaceholderValues(data) {
  const cleaned = { ...data };
  for (const [key, val] of Object.entries(cleaned)) {
    if (typeof val !== "string") continue;
    const lower = val.trim().toLowerCase();
    // Exact matches or starts-with matches for known placeholder phrases
    const isPlaceholder = PLACEHOLDER_PHRASES.some((p) => lower === p || lower.startsWith(p + " ") || lower.startsWith(p + "."));
    // Also clear "No known X per assessment" pattern
    const isNoKnown = /^no known .+ per assessment\.?$/.test(lower);
    if (isPlaceholder || isNoKnown) {
      cleaned[key] = "";
    }
  }
  return cleaned;
}

/**
 * Apply deterministic logical consistency corrections after AI extraction passes.
 * Fixes known inversion patterns (e.g. hearing_no=X when hearing loss documented).
 */
/**
 * Map of known wrong field key names → correct schema key names.
 * The AI sometimes uses key names derived from the source PDF labels instead of NCP schema keys.
 */
const WRONG_KEY_MAP = {
  // skin care — AI drops the _care_ prefix
  skin_independent: "skin_care_independent",
  skin_supervision: "skin_care_supervision",
  skin_assistance: "skin_care_assistance",
  skin_dependent: "skin_care_dependent",
  skin_description: "skin_care_status_desc",
  skin_equipment: "skin_care_routine", // best available target
  // medication management — AI uses medication_management_* instead of med_*
  medication_management_full: "med_administration",
  medication_management_self: "med_self_administration",
  medication_management_assistance: "med_self_admin_with_assist",
  medication_management_description: "med_assistance_reason",
  // transport — AI uses iadl_transportation_ instead of iadl_transport_
  iadl_transportation_dependent: "iadl_transport_dependent",
  iadl_transportation_independent: "iadl_transport_independent",
  iadl_transportation_assistance: "iadl_transport_assistance",
  // treatment specialties — AI uses separate keys; NCP combines into pt_ot_st
  treatment_physical_therapy: "treatment_pt_ot_st",
  treatment_occupational_therapy: "treatment_pt_ot_st",
  treatment_speech_therapy: "treatment_pt_ot_st",
  treatment_wound_care: "treatment_other",
  treatment_wound_care_description: "treatment_other",
  treatment_iv_therapy: "treatment_other",
  treatment_iv_therapy_description: "treatment_other",
  // cognitive — AI uses slightly different key names
  cognitive_orientation: "cognitive_oriented_person",
  cognitive_memory_problems: "cognitive_memory_short_term",
  cognitive_other: "cognitive_decision_making",
  // sleep — AI uses sleep_* keys; NCP uses psych_sleep_*
  sleep_problems_yes: "psych_sleep_disturbance",
  sleep_description: "psych_sleep_assistance",
  // behavior — AI uses behavior_* keys; NCP uses psych_behavioral_*
  behavior_description: "psych_past_behaviors",
  // IADL housework — not in NCP template; map narrative to comments
  iadl_housework_description: "iadl_finances_caregiver_actions", // discard silently (below)
  iadl_meal_prep_description: "iadl_finances_caregiver_actions", // discard silently
};

/**
 * Keys that AI generates from source PDF structure that have no NCP schema equivalent.
 * Values will be dropped (source PDF checkboxes that don't map to NCP form).
 */
const DISCARD_KEYS = new Set([
  "summon_help_yes", "summon_help_no", "summon_help_description",
  "left_alone_never", "left_alone_less_than_hour", "left_alone_more_than_hour", "left_alone_overnight",
  "behavior_problems_yes", "behavior_problems_no",
  "safety_awareness_yes", "safety_awareness_no", "safety_awareness_description",
  "supervision_awake_yes", "supervision_awake_no", "supervision_awake_description",
  "supervision_asleep_yes", "supervision_asleep_no", "supervision_asleep_description",
  "left_alone_description",
  "iadl_housework_dependent", "iadl_housework_independent", "iadl_housework_assistance", "iadl_housework_description",
  "iadl_meal_prep_dependent", "iadl_meal_prep_independent", "iadl_meal_prep_assistance", "iadl_meal_prep_description",
  "iadl_phone_dependent", "iadl_phone_independent", "iadl_phone_assistance", "iadl_phone_description",
  "iadl_medication_dependent", "iadl_medication_independent", "iadl_medication_assistance", "iadl_medication_description",
  "iadl_transportation_dependent", "iadl_transportation_independent", "iadl_transportation_assistance", "iadl_transportation_description",
  "iadl_finances_description",
  "iadl_housework_independent", "iadl_housework_description",
  "psych_other_behaviors", "psych_behavioral_description", "psych_behavioral_symptoms",
  "comm_hearing_description", "comm_vision_description", "comm_expression_description",
  "mobility_room_description", "mobility_outside_description", "mobility_room_equipment", "mobility_outside_equipment",
  "medication_management_full", "medication_management_self", "medication_management_assistance", "medication_management_description",
  "bathing_description", "dressing_description", "eating_description", "toileting_description", "hygiene_description",
  "foot_care_description", "bed_mobility_description", "iadl_phone_description", "iadl_shopping_description",
  "iadl_finances_description", "iadl_transportation_description",
  "treatment_speech_therapy_description", "treatment_physical_therapy_description", "treatment_occupational_therapy_description",
  "treatment_other_description", "treatment_dialysis_description", "treatment_iv_therapy_description",
  "allergy_food", "allergy_other", "allergy_medication", "allergy_environmental",
]);

/**
 * Normalize field keys: remap known wrong keys to correct schema keys, discard unmappable source-PDF keys.
 * Must be called before schema validation so correct keys get populated.
 */
function normalizeExtractedKeys(data, schema) {
  const schemaKeys = new Set(Object.keys(schema));
  const result = {};

  for (const [key, val] of Object.entries(data)) {
    if (DISCARD_KEYS.has(key)) continue; // discard silently
    if (schemaKeys.has(key)) {
      // Valid schema key — keep as-is (but don't overwrite a non-empty value)
      if (result[key] === undefined || result[key] === "" || result[key] === null) {
        result[key] = val;
      } else if (val && val !== "") {
        // Both have values — prefer the existing one (already set from correct key)
      }
    } else if (WRONG_KEY_MAP[key]) {
      const targetKey = WRONG_KEY_MAP[key];
      // Only copy if target is empty or unset, and source has a value
      if (val && val !== "" && (result[targetKey] === undefined || result[targetKey] === "" || result[targetKey] === null)) {
        result[targetKey] = val;
      }
    }
    // else: unknown non-schema key with no mapping — silently discard
  }

  return result;
}

function applyLogicalCorrections(data) {
  const d = { ...data };

  // PROVIDER NAME: if it looks like a person's name (e.g. "Last, First" format), clear it
  // The AFH facility name is never in "Last, First" format
  if (d.provider_name && /^[A-Z][a-z]+,\s+[A-Z]/.test(d.provider_name)) {
    d.provider_name = "";
  }

  // HEARING: if hearing_describe or hearing_equipment mentions hearing loss/aids → hearing_yes should be X
  const hearingDesc = (d.comm_hearing_describe || "").toLowerCase();
  const hearingEquip = (d.comm_hearing_equipment || "").toLowerCase();
  if (/hearing loss|hard of hearing|deaf|bilateral|hearing aid|hearing impair/.test(hearingDesc + " " + hearingEquip)) {
    d.comm_problems_hearing_yes = "X";
    d.comm_problems_hearing_no = "";
  }

  // VISION: if vision_equipment has glasses/contacts, or describe mentions glasses → vision_yes must be X
  const visionDesc = (d.comm_vision_describe || "").toLowerCase();
  const visionEquip = (d.comm_vision_equipment || "").toLowerCase();
  const hasVisionAid = /glasses|contact lens|magnif|bifocal|reading glass/.test(visionEquip);
  const visionDescPositive = /glasses|impair|blind|cataract|glaucoma|macular|corrective|low vision/.test(visionDesc);
  const visionDescNegative = /does not have|no documented|no vision|no known vision|no problems/.test(visionDesc);
  if ((hasVisionAid || visionDescPositive) && !visionDescNegative) {
    d.comm_problems_vision_yes = "X";
    d.comm_problems_vision_no = "";
  }
  // If describe is a negative/wrong statement but equipment says glasses → clear the wrong describe
  if (hasVisionAid && visionDescNegative) {
    d.comm_vision_describe = "";
    d.comm_problems_vision_yes = "X";
    d.comm_problems_vision_no = "";
  }

  // EXPRESSION: if expression_describe mentions limited speech, few words, verbal difficulties → expression_yes
  const exprDesc = (d.comm_expression_describe || "").toLowerCase();
  const commDesc = (d.comm_comments || "").toLowerCase();
  if (/limited|few word|verbal diff|cannot speak|speech problem|unclear|limited vocab|aphasia/.test(exprDesc + " " + commDesc)) {
    d.comm_expression_yes = "X";
    d.comm_expression_no = "";
  }

  // HEARING EQUIPMENT: if it contains vision/glasses content, clear it
  if (/glasses|vision|eyesight|contacts/.test(hearingEquip) && !/hearing aid|amplif/.test(hearingEquip)) {
    d.comm_hearing_equipment = "";
  }
  // HEARING EQUIPMENT: if hearing_yes is X but equipment is empty and describe confirms hearing loss → infer "hearing aids"
  const updatedHearingEquip = (d.comm_hearing_equipment || "").toLowerCase();
  if (d.comm_problems_hearing_yes === "X" && !updatedHearingEquip &&
      /hearing loss|bilateral|hard of hearing|hearing aid/.test((d.comm_hearing_describe || "").toLowerCase())) {
    d.comm_hearing_equipment = "hearing aids";
  }

  // PSYCH BEHAVIORS: infer all behavior checkboxes from actual schema narrative fields.
  // Note: psych_behavioral_symptoms / psych_behavioral_description do NOT exist in the schema.
  // The real narrative sources are psych_past_behaviors, psych_other_behavior_desc, etc.
  const allBehaviorText = [
    d.psych_past_behaviors || "",
    d.psych_other_behavior_desc || "",
    d.psych_typical_day_narrative || "",
    d.psych_interventions_strengths || "",
    d.psych_interventions_assistance || "",
    d.psych_dshs_programs_strengths || "",
    d.psych_dshs_programs_assistance || "",
  ].join(" ").toLowerCase();

  if (allBehaviorText.length > 10) {
    const b = allBehaviorText;
    if (!d.psych_resistive_to_care && /resist|combative|fight|refuses? care|non-compliant|refuses? (assist|help)/.test(b)) d.psych_resistive_to_care = "X";
    if (!d.psych_disruptive_behavior && /disruptive|disrupt|agitat|disturb(?:ing|ance)/.test(b)) d.psych_disruptive_behavior = "X";
    if (!d.psych_assaultive && /assaultive|assault/.test(b)) d.psych_assaultive = "X";
    if (!d.psych_verbally_aggressive && /verbal(ly)? aggressiv|verbal threat|yell|scream|curse|swear|profanity/.test(b)) d.psych_verbally_aggressive = "X";
    if (!d.psych_physically_aggressive && /physical(ly)? aggressiv|hit|punch|slap|scratch|bite|kick|push(?:es|ing)|grab/.test(b)) d.psych_physically_aggressive = "X";
    if (!d.psych_wandering && /wander|pac(?:e|ing|ed)/.test(b)) d.psych_wandering = "X";
    if (!d.psych_exit_seeking && /exit.?seek|elope(?:ment)?|tries? to leave|attempts? to leave/.test(b)) d.psych_exit_seeking = "X";
    if (!d.psych_depression && /depress/.test(b)) d.psych_depression = "X";
    if (!d.psych_anxiety && /anxiet|anxious|panic|worry|worries/.test(b)) d.psych_anxiety = "X";
    if (!d.psych_irritability && /irritab|easily upset|short temper/.test(b)) d.psych_irritability = "X";
    if (!d.psych_disorientation && /disorient/.test(b)) d.psych_disorientation = "X";
    if (!d.psych_hallucinations && /hallucinat|hears? (?:voices|things)|sees? (?:things|shadow)|visual hallucin/.test(b)) d.psych_hallucinations = "X";
    if (!d.psych_delusions && /delusion|paranoi|false belief/.test(b)) d.psych_delusions = "X";
    if (!d.psych_inappropriate_behavior && /inappropriate (?:behavior|behaviour|sexual|touching)/.test(b)) d.psych_inappropriate_behavior = "X";
    if (!d.psych_suicidal_ideation && /suicid|self.?harm|kill(?:ing)? (?:self|himself|herself)/.test(b)) d.psych_suicidal_ideation = "X";
    if (!d.psych_difficulty_unfamiliar && /unfamiliar|new people|strangers|new environ/.test(b)) d.psych_difficulty_unfamiliar = "X";
    if (!d.psych_disrobing && /disrob|undress|removes? cloth/.test(b)) d.psych_disrobing = "X";
    if (!d.psych_weeping_crying && /weep|cr(?:y|ying)|sob(?:bing)?/.test(b)) d.psych_weeping_crying = "X";
    if (!d.psych_unaware_consequences && /unaware.{0,15}conseq|no insight|safety.?unaware|danger.?unaware/.test(b)) d.psych_unaware_consequences = "X";
    if (!d.psych_unrealistic_fears && /unrealistic fear|irrational fear/.test(b)) d.psych_unrealistic_fears = "X";
    if (!d.psych_inappropriate_spitting && /spit(?:ting)?/.test(b)) d.psych_inappropriate_spitting = "X";
    if (!d.psych_breaks_throws && /break|throw|smash|destroy|fling|break.{0,10}object|throw.{0,10}object/.test(b)) d.psych_breaks_throws = "X";
  }

  // SLEEP: infer from sleep narrative fields
  const sleepText = [
    d.psych_sleep_strengths || "",
    d.psych_sleep_assistance || "",
    d.psych_past_behaviors || "",
  ].join(" ").toLowerCase();
  if (!d.psych_sleep_disturbance && /sleep disturbance|insomnia|wakes? at night|disrupt.{0,10}sleep|nighttime waking|poor sleep/.test(sleepText)) {
    d.psych_sleep_disturbance = "X";
  }
  if (!d.psych_nighttime_assistance && /nighttime assist|needs.{0,10}night|up at night|awake at night|wakes? staff/.test(sleepText)) {
    d.psych_nighttime_assistance = "X";
  }

  // AGE: if age looks truncated (single digit but resident is elderly based on DOB), try to fix
  const dob = d.date_of_birth || "";
  const yearMatch = dob.match(/\d{4}$/);
  if (yearMatch && d.age) {
    const birthYear = parseInt(yearMatch[0]);
    const assessmentYear = 2023; // approximate
    const expectedAge = assessmentYear - birthYear;
    const extractedAge = parseInt(d.age);
    // If extracted age looks like a truncation of expected age (e.g. "6" when expected is "61")
    if (!isNaN(expectedAge) && !isNaN(extractedAge) && extractedAge < 10 && expectedAge > 10) {
      d.age = String(expectedAge);
    }
  }

  // PAIN: if skin_care_status_desc or health_pain_impact mentions pain/discomfort → health_pain = X
  const painText = (d.health_pain_impact || d.skin_care_status_desc || "").toLowerCase();
  if (/pain|discomfort|painful|ache|hurts/.test(painText) && !d.health_pain) {
    d.health_pain = "X";
  }

  // HEALTH VITAL SIGNS: medically complex resident (has oxygen/heart disease/COPD) → vitals monitored
  const diagnoses = (d.current_medical_diagnoses || "").toLowerCase();
  if (/heart|copd|oxygen|pneumonia|diabetes/.test(diagnoses) && !d.health_vital_signs) {
    d.health_vital_signs = "X";
  }

  // TREATMENT OXYGEN: if vendor is set or caregiver actions mention oxygen, checkbox must be X
  const oxygenText = (d.treatment_oxygen_vendor || d.treatment_caregiver_actions_1 || d.treatment_caregiver_actions_2 || "").toLowerCase();
  if (/oxygen|inogen|o2|concentrat|saturation/.test(oxygenText) && !d.treatment_oxygen) {
    d.treatment_oxygen = "X";
  }

  // IADL TRANSPORT: if limitations/equipment set or outside mobility is dependent → transport dependent
  if (!d.iadl_transport_dependent && !d.iadl_transport_assistance && !d.iadl_transport_independent) {
    if (d.mobility_outside_dependent === "X" || (d.iadl_transport_limitations || "").length > 5) {
      d.iadl_transport_dependent = "X";
    }
  }

  // IADL FINANCES: if finances caregiver actions or description mentions managing/payee → dependent
  const financeText = (d.iadl_finances_caregiver_actions || d.iadl_who_manages_finances || "").toLowerCase();
  if (!d.iadl_finances_dependent && !d.iadl_finances_assistance && !d.iadl_finances_independent) {
    if (/manage|payee|bill|bank|financial decision/.test(financeText)) {
      d.iadl_finances_dependent = "X";
    }
  }

  // SKIN CHECKBOXES: if description field has content, parent checkbox should be X
  if ((d.skin_problems_describe || d.skin_problems_status_desc || "").trim().length > 5 && !d.skin_problems) {
    d.skin_problems = "X";
  }
  if ((d.skin_pressure_injuries_describe || "").trim().length > 5 && !d.skin_pressure_injuries) {
    d.skin_pressure_injuries = "X";
  }
  if ((d.skin_care_status_desc || "").trim().length > 5 && !d.skin_care_status) {
    d.skin_care_status = "X";
  }
  if ((d.skin_dressing_changes || d.skin_dressing_how_often || "").trim().length > 0 && !d.skin_dressing_changes) {
    // skin_dressing_changes is a checkbox — if how_often is set, dressing changes are happening
    d.skin_dressing_changes = "X";
  }

  // EATING LEVEL: if description says "physically feed" or "feed" → dependent, not just assistance
  const eatingDesc = (d.eating_caregiver_actions || d.adl_functional_limitations || "").toLowerCase();
  if (/physically feed|staff.*feed|feed.*resident|staff feeds/.test(eatingDesc)) {
    d.eating_dependent = "X";
    d.eating_assistance = "";
    d.eating_supervision = "";
    d.eating_independent = "";
  }

  // PSYCH MEMORY: if memory impairment checkboxes are checked but memory strengths/assistance are empty, infer content
  const anyMemoryChecked = d.cognitive_memory_short_term === "X" || d.cognitive_memory_long_term === "X" || d.cognitive_oriented_person === "X" || d.cognitive_decision_making === "X";
  if (anyMemoryChecked && !d.psych_memory_strengths) {
    const parts = [];
    if (d.cognitive_memory_short_term === "X") parts.push("Retains long-term memories and responds to familiar faces and routines");
    if (d.cognitive_oriented_person === "X") parts.push("Benefits from familiar environmental cues and consistent daily schedule");
    if (d.cognitive_decision_making === "X") parts.push("Able to make simple choices with support and responds to clear, direct communication");
    if (parts.length === 0) parts.push("Responds to familiar caregivers and structured routines");
    d.psych_memory_strengths = parts.join(". ") + ".";
  }
  if (anyMemoryChecked && !d.psych_memory_assistance) {
    const parts = ["Staff will use simple, one-step directions and allow extra time for processing"];
    if (d.cognitive_memory_short_term === "X" || d.cognitive_memory_long_term === "X") {
      parts.push("will provide frequent verbal and visual reminders for daily tasks");
    }
    if (d.cognitive_oriented_person === "X") {
      parts.push("will provide gentle reorientation using familiar objects, photos, and consistent routine");
    }
    if (d.cognitive_decision_making === "X") {
      parts.push("will offer simple binary choices and assist with decision-making to ensure safety");
    }
    d.psych_memory_assistance = parts.join("; ") + ".";
  }

  // PSYCH INTERVENTIONS: if behaviors are checked but strengths/assistance fields are empty, infer clinical content
  const checkedBehaviors = {
    assaultive: d.psych_assaultive === "X",
    physically_aggressive: d.psych_physically_aggressive === "X",
    verbally_aggressive: d.psych_verbally_aggressive === "X",
    resistive_to_care: d.psych_resistive_to_care === "X",
    disruptive_behavior: d.psych_disruptive_behavior === "X",
    wandering: d.psych_wandering === "X",
    exit_seeking: d.psych_exit_seeking === "X",
    anxiety: d.psych_anxiety === "X",
    depression: d.psych_depression === "X",
    irritability: d.psych_irritability === "X",
    disorientation: d.psych_disorientation === "X",
    hallucinations: d.psych_hallucinations === "X",
    delusions: d.psych_delusions === "X",
    impaired_decision_making: d.cognitive_decision_making === "X",
  };
  const anyBehaviorChecked = Object.values(checkedBehaviors).some(Boolean);

  if (anyBehaviorChecked && !d.psych_interventions_strengths) {
    const strengthParts = [];
    if (checkedBehaviors.anxiety || checkedBehaviors.irritability) {
      strengthParts.push("Calms with verbal reassurance and familiar routines");
    }
    if (checkedBehaviors.wandering) {
      strengthParts.push("Redirects with supervised walking activities and structured engagement");
    }
    if (checkedBehaviors.exit_seeking) {
      strengthParts.push("Responds to distraction and preferred activities");
    }
    if (checkedBehaviors.assaultive || checkedBehaviors.physically_aggressive) {
      strengthParts.push("Responds best to non-confrontational approach and maintained personal space");
    }
    if (checkedBehaviors.verbally_aggressive) {
      strengthParts.push("De-escalates with calm, low-stimulation environment and patient communication");
    }
    if (checkedBehaviors.disorientation) {
      strengthParts.push("Benefits from familiar cues, consistent routine, and simple clear instructions");
    }
    if (checkedBehaviors.hallucinations || checkedBehaviors.delusions) {
      strengthParts.push("Can be redirected with gentle grounding and non-confrontational engagement");
    }
    if (checkedBehaviors.depression) {
      strengthParts.push("Engages with preferred activities and one-on-one attention");
    }
    if (checkedBehaviors.resistive_to_care || checkedBehaviors.disruptive_behavior) {
      strengthParts.push("Cooperates better when approached with patience and given time to respond");
    }
    if (strengthParts.length === 0) {
      strengthParts.push("Responds to consistent routine and patient, supportive caregiver approach");
    }
    d.psych_interventions_strengths = strengthParts.join(". ") + ".";
  }

  if (anyBehaviorChecked && !d.psych_interventions_assistance) {
    const assistanceParts = ["Staff will use calm voice, maintain consistent daily routine, and monitor for behavioral triggers"];
    if (checkedBehaviors.assaultive || checkedBehaviors.physically_aggressive) {
      assistanceParts.push("will maintain safe distance during agitation and use de-escalation techniques to ensure safety of resident and others");
    }
    if (checkedBehaviors.verbally_aggressive) {
      assistanceParts.push("will remain calm, avoid arguing, and redirect to preferred topic or activity");
    }
    if (checkedBehaviors.resistive_to_care) {
      assistanceParts.push("will approach care tasks with patience, offer choices, and allow resident time to process before proceeding");
    }
    if (checkedBehaviors.wandering || checkedBehaviors.exit_seeking) {
      assistanceParts.push("will provide supervised walking opportunities, monitor for exit-seeking, and use environmental cues and door alarms as appropriate");
    }
    if (checkedBehaviors.anxiety) {
      assistanceParts.push("will provide verbal reassurance, minimize environmental stressors, and maintain predictable schedule");
    }
    if (checkedBehaviors.depression) {
      assistanceParts.push("will encourage participation in preferred activities, provide social engagement, and monitor mood changes");
    }
    if (checkedBehaviors.disorientation) {
      assistanceParts.push("will provide frequent reorientation using simple language and familiar objects");
    }
    if (checkedBehaviors.hallucinations || checkedBehaviors.delusions) {
      assistanceParts.push("will not argue about perceptions or beliefs; will use distraction and gentle redirection");
    }
    if (checkedBehaviors.impaired_decision_making) {
      assistanceParts.push("will support decision-making with simple choices and step-by-step guidance");
    }
    d.psych_interventions_assistance = assistanceParts.join("; ") + ".";
  }

  // COMM HEARING: if hearing problems noted, infer strengths/assistance
  if (d.comm_problems_hearing_yes === "X") {
    if (!d.comm_hearing_strengths) {
      const parts = [];
      if (d.comm_hearing_equipment) parts.push("Uses hearing equipment (" + d.comm_hearing_equipment + ") to improve communication");
      else parts.push("Benefits from face-to-face communication and visual cues");
      parts.push("responds well to clear, slow speech in a quiet environment");
      d.comm_hearing_strengths = parts.join("; ") + ".";
    }
    if (!d.comm_hearing_assistance) {
      const parts = ["Staff will speak clearly, facing the resident, at a moderate pace"];
      parts.push("will minimize background noise during conversations");
      if (d.comm_hearing_equipment) parts.push("will ensure hearing equipment is in place and functioning");
      parts.push("will use written notes or gestures when verbal communication is unclear");
      d.comm_hearing_assistance = parts.join("; ") + ".";
    }
  }

  // COMM VISION: if vision problems noted, infer strengths/assistance
  if (d.comm_problems_vision_yes === "X") {
    if (!d.comm_vision_strengths) {
      const parts = [];
      if (d.comm_vision_equipment) parts.push("Uses vision aids (" + d.comm_vision_equipment + ") effectively");
      else parts.push("Retains some functional vision and recognizes familiar faces and surroundings");
      parts.push("benefits from consistent placement of familiar objects and good lighting");
      d.comm_vision_strengths = parts.join("; ") + ".";
    }
    if (!d.comm_vision_assistance) {
      const parts = ["Staff will ensure adequate lighting in all areas of the home"];
      parts.push("will announce presence and identify themselves before approaching");
      if (d.comm_vision_equipment) parts.push("will ensure vision aids are clean and available");
      parts.push("will keep pathways clear and maintain consistent furniture placement for safety");
      d.comm_vision_assistance = parts.join("; ") + ".";
    }
  }

  // COMM PHONE: infer phone strengths/assistance based on ability level
  if (!d.comm_phone_strengths) {
    if (d.comm_phone_independent === "X") {
      d.comm_phone_strengths = "Resident is able to use the telephone independently to make and receive calls.";
    } else if (d.comm_phone_assistance === "X") {
      d.comm_phone_strengths = "Resident can participate in phone conversations with setup assistance; understands phone communication when calls are initiated.";
    } else if (d.comm_phone_dependent === "X") {
      d.comm_phone_strengths = "Resident benefits from caregiver-facilitated phone contact with family and support persons.";
    }
  }
  if (!d.comm_phone_assistance) {
    if (d.comm_phone_independent === "X") {
      d.comm_phone_assistance = "No caregiver assistance needed for phone use. Resident manages independently.";
    } else if (d.comm_phone_assistance === "X") {
      d.comm_phone_assistance = "Staff will dial numbers for the resident as requested, ensure phone is accessible and charged, and assist with hearing the conversation if needed.";
    } else if (d.comm_phone_dependent === "X") {
      d.comm_phone_assistance = "Staff will facilitate all phone calls on resident's behalf, inform resident of calls from family/support persons, and assist with communication needs.";
    }
  }

  // COMM LANGUAGE: if non-English preferred language, infer language strengths/assistance
  if (d.comm_preferred_language && d.comm_preferred_language.toLowerCase() !== "english" && !d.comm_language_strengths) {
    d.comm_language_strengths = "Resident communicates most effectively in " + d.comm_preferred_language + "; understands familiar routines and responds to consistent verbal and non-verbal cues.";
  }
  if (d.comm_preferred_language && d.comm_preferred_language.toLowerCase() !== "english" && !d.comm_language_assistance) {
    d.comm_language_assistance = "Staff will use interpreter services or translation resources when needed; will learn key phrases in " + d.comm_preferred_language + " for daily care; will use picture boards or gesture-based communication to supplement verbal instructions.";
  }

  // PSYCH PSYCHOPHARM: if psychopharm required, infer strengths/assistance
  if (d.psych_requires_psychopharm === "X") {
    if (!d.psych_psychopharm_strengths) {
      d.psych_psychopharm_strengths = "Resident accepts and takes psychopharmacological medications as prescribed; current medication regimen supports behavioral stability and quality of life.";
    }
    if (!d.psych_psychopharm_assistance) {
      d.psych_psychopharm_assistance = "Staff will administer psychopharmacological medications as prescribed per MAR; will monitor for and document side effects or behavioral changes; will report significant changes to prescribing provider promptly; will see current MAR for medication details.";
    }
  }

  // CASE MANAGEMENT: if case management checked, infer strengths
  if (d.case_management === "X" && !d.case_management_strengths) {
    const parts = ["Resident benefits from consistent case management support and is engaged in care planning"];
    if (d.case_management_name) parts.push("works cooperatively with case manager " + d.case_management_name);
    d.case_management_strengths = parts.join("; ") + ".";
  }

  // AMBULATION/MOBILITY: infer strengths and caregiver actions from independence level
  if (!d.mobility_strengths_abilities) {
    if (d.mobility_room_independent === "X" && d.mobility_outside_independent === "X") {
      d.mobility_strengths_abilities = "Resident is independent with ambulation and mobility both indoors and outdoors; maintains balance and safe gait without assistance.";
    } else if (d.mobility_room_independent === "X") {
      d.mobility_strengths_abilities = "Resident ambulates independently within the room and immediate living environment; demonstrates awareness of surroundings and maintains safe gait.";
    } else if (d.mobility_room_supervision === "X" || d.mobility_outside_supervision === "X") {
      const equip = d.mobility_equipment_vendor ? ` with equipment (${d.mobility_equipment_vendor})` : "";
      d.mobility_strengths_abilities = `Resident is motivated to maintain mobility${equip} and participates cooperatively in supervised ambulation; demonstrates effort to maintain independence.`;
    } else if (d.mobility_room_assistance === "X" || d.mobility_outside_assistance === "X") {
      const equip = d.mobility_equipment_vendor ? ` using ${d.mobility_equipment_vendor}` : "";
      d.mobility_strengths_abilities = `Resident cooperates with caregiver assistance for ambulation${equip}; accepts direction and support to move safely within and outside the home.`;
    } else if (d.mobility_room_dependent === "X") {
      d.mobility_strengths_abilities = "Resident is cooperative with full assist for mobility and transfers; communicates needs to caregiver and tolerates repositioning safely.";
    }
  }
  if (!d.mobility_caregiver_actions) {
    if (d.mobility_room_independent === "X" && d.mobility_outside_independent === "X") {
      const actions = ["Staff will monitor environment for fall hazards and maintain clear pathways"];
      if (d.mobility_fall_risk === "X") actions.push("implement fall prevention plan as documented");
      d.mobility_caregiver_actions = actions.join("; ") + ".";
    } else if (d.mobility_room_supervision === "X" || d.mobility_outside_supervision === "X") {
      const actions = ["Staff will provide supervision and verbal cueing during ambulation"];
      if (d.mobility_equipment_vendor) actions.push(`ensure ${d.mobility_equipment_vendor} is available and properly maintained`);
      if (d.mobility_fall_risk === "X") actions.push("implement fall prevention strategies per care plan");
      d.mobility_caregiver_actions = actions.join("; ") + ".";
    } else if (d.mobility_room_assistance === "X" || d.mobility_outside_assistance === "X") {
      const actions = ["Staff will provide hands-on assistance for ambulation as needed"];
      if (d.mobility_equipment_vendor) actions.push(`use prescribed equipment (${d.mobility_equipment_vendor})`);
      if (d.mobility_fall_risk === "X") actions.push("monitor for fall risk and follow prevention plan");
      d.mobility_caregiver_actions = actions.join("; ") + ".";
    } else if (d.mobility_room_dependent === "X") {
      d.mobility_caregiver_actions = "Staff will provide full assistance with all mobility and transfers; use proper body mechanics and assistive devices to ensure resident and caregiver safety; follow turning/repositioning schedule as ordered.";
    }
  }

  // BED MOBILITY/TRANSFER: infer strengths and caregiver actions
  if (!d.bed_mobility_strengths_abilities) {
    if (d.bed_mobility_independent === "X") {
      d.bed_mobility_strengths_abilities = "Resident is independent with bed mobility and transfers; positions self safely and moves between surfaces without assistance.";
    } else if (d.bed_mobility_supervision === "X") {
      d.bed_mobility_strengths_abilities = "Resident participates actively in bed mobility and transfers with supervision; follows caregiver directions and demonstrates cooperative behavior during repositioning.";
    } else if (d.bed_mobility_assistance === "X") {
      const equip = d.bed_mobility_equipment ? ` using ${d.bed_mobility_equipment}` : "";
      d.bed_mobility_strengths_abilities = `Resident cooperates with assisted transfers and bed mobility${equip}; communicates comfort level and accepts caregiver support during repositioning.`;
    } else if (d.bed_mobility_dependent === "X") {
      d.bed_mobility_strengths_abilities = "Resident tolerates full caregiver assistance with all bed mobility and transfers; accepts repositioning without resistance and communicates discomfort appropriately.";
    }
  }
  if (!d.bed_mobility_caregiver_actions) {
    if (d.bed_mobility_independent === "X") {
      d.bed_mobility_caregiver_actions = "Staff will monitor bed environment for safety hazards and ensure bed rails/assistive equipment are in proper position; check in regularly for any change in mobility status.";
    } else if (d.bed_mobility_supervision === "X") {
      d.bed_mobility_caregiver_actions = "Staff will provide close supervision during bed mobility and transfers; offer verbal cues and stand-by assistance; document any changes in transfer ability.";
    } else if (d.bed_mobility_assistance === "X") {
      const parts = ["Staff will assist with all bed mobility and transfers using safe techniques"];
      if (d.bed_mobility_equipment) parts.push(`use ${d.bed_mobility_equipment} as prescribed`);
      if (d.bed_mobility_turning === "X") parts.push(`perform turning and repositioning per schedule (${d.bed_mobility_turning_frequency || "as ordered"})`);
      if (d.bed_mobility_skin_care === "X") parts.push("monitor skin integrity during repositioning and report breakdown immediately");
      d.bed_mobility_caregiver_actions = parts.join("; ") + ".";
    } else if (d.bed_mobility_dependent === "X") {
      const parts = ["Staff will provide full assistance with all bed mobility and transfers using proper body mechanics and assistive equipment"];
      if (d.bed_mobility_turning === "X") parts.push(`reposition resident every ${d.bed_mobility_turning_frequency || "2 hours"} or per care plan`);
      if (d.bed_mobility_skin_care === "X") parts.push("perform skin assessment with each repositioning and document findings");
      d.bed_mobility_caregiver_actions = parts.join("; ") + ".";
    }
  }

  // TREATMENT SECTION: infer treatment strengths/caregiver actions from checked treatments.
  // _1 = group above "Strengths and Abilities" header: oxygen, dialysis, blood thinners, INR/LAB
  // _2 = group below header: anticoagulation, blood glucose, injections, CPAP, nebulizer, ROM, nurse delegation
  if (!d.treatment_strengths_abilities_1) {
    const s1 = [];
    if (d.treatment_oxygen === "X") {
      const vendor = d.treatment_oxygen_vendor ? ` (${d.treatment_oxygen_vendor})` : "";
      s1.push(`Resident tolerates supplemental oxygen use${vendor} and cooperates with equipment maintenance`);
    }
    if (d.treatment_dialysis === "X") {
      const provider = d.treatment_dialysis_provider ? ` through ${d.treatment_dialysis_provider}` : "";
      s1.push(`Resident is compliant with dialysis treatment schedule${provider} and understands the importance of dialysis for health maintenance`);
    }
    if (d.treatment_blood_thinners === "X") {
      const bParts = ["Resident takes blood thinner medications as prescribed"];
      if (d.treatment_inr_lab === "X") bParts.push("participates in INR/LAB monitoring as required");
      s1.push(bParts.join("; "));
    }
    if (s1.length > 0) d.treatment_strengths_abilities_1 = s1.join("; ") + ".";
  }

  if (!d.treatment_strengths_abilities_2) {
    const s2 = [];
    if (d.treatment_anticoagulation === "X") {
      s2.push("Resident is aware of anticoagulation therapy precautions and cooperates with monitoring");
    }
    if (d.treatment_blood_glucose === "X") {
      s2.push("Resident cooperates with blood glucose monitoring and understands its importance for health management");
    }
    if (d.treatment_injection === "X") {
      s2.push("Resident cooperates with injection administration as required per care plan");
    }
    if (d.treatment_cpap_bipap === "X") {
      s2.push("Resident tolerates and uses CPAP/BIPAP equipment as prescribed to support respiratory health");
    }
    if (d.treatment_nebulizer === "X") {
      s2.push("Resident cooperates with nebulizer treatments and respiratory therapy as prescribed");
    }
    if (d.treatment_range_of_motion === "X") {
      const roType = d.treatment_pt_ot_st ? ` with ${d.treatment_pt_ot_st}` : "";
      s2.push(`Resident participates in range of motion exercises${roType} and demonstrates willingness to engage in therapeutic activities`);
    }
    if (d.treatment_nurse_delegation === "X") {
      s2.push("Resident accepts nurse-delegated care tasks and cooperates with delegated caregiving procedures");
    }
    if (s2.length > 0) d.treatment_strengths_abilities_2 = s2.join("; ") + ".";
  }

  if (!d.treatment_caregiver_actions_1) {
    const a1 = [];
    if (d.treatment_oxygen === "X") {
      const vendor = d.treatment_oxygen_vendor ? ` from ${d.treatment_oxygen_vendor}` : "";
      a1.push(`ensure oxygen equipment${vendor} is available, functioning, and properly used per physician orders`);
    }
    if (d.treatment_dialysis === "X") {
      const provider = d.treatment_dialysis_provider ? ` with ${d.treatment_dialysis_provider}` : "";
      a1.push(`coordinate dialysis transport and appointments${provider}, monitor for post-dialysis symptoms, and communicate any concerns to the health provider`);
    }
    if (d.treatment_blood_thinners === "X") {
      const bParts = ["administer blood thinner medications per MAR"];
      if (d.treatment_inr_lab === "X") {
        const labProv = d.treatment_inr_lab_provider ? ` through ${d.treatment_inr_lab_provider}` : "";
        bParts.push(`ensure INR/LAB monitoring appointments are kept${labProv}`);
      }
      a1.push(bParts.join("; "));
    }
    if (a1.length > 0) d.treatment_caregiver_actions_1 = "Staff will " + a1.join("; ") + ".";
  }

  if (!d.treatment_caregiver_actions_2) {
    const a2 = [];
    if (d.treatment_anticoagulation === "X") {
      a2.push("monitor for signs of unusual bruising, bleeding, or anticoagulation-related concerns and report to provider promptly");
    }
    if (d.treatment_blood_glucose === "X") {
      a2.push("perform blood glucose monitoring as prescribed, record readings, and report abnormal levels to the healthcare provider promptly");
    }
    if (d.treatment_injection === "X") {
      a2.push("administer injections as prescribed per MAR and nurse delegation protocols, documenting administration and monitoring for reactions");
    }
    if (d.treatment_cpap_bipap === "X") {
      a2.push("ensure CPAP/BIPAP equipment is cleaned, maintained, and properly set up each night per physician orders");
    }
    if (d.treatment_nebulizer === "X") {
      a2.push("administer nebulizer treatments as prescribed, maintain clean equipment, and monitor respiratory response");
    }
    if (d.treatment_range_of_motion === "X") {
      const roType = d.treatment_pt_ot_st ? ` in coordination with ${d.treatment_pt_ot_st}` : "";
      a2.push(`perform range of motion exercises${roType} per therapy orders, reporting any pain or decreased mobility to the therapist`);
    }
    if (d.treatment_nurse_delegation === "X") {
      const tasks = d.treatment_nurse_delegation_tasks ? ` (${d.treatment_nurse_delegation_tasks})` : "";
      a2.push(`perform nurse-delegated tasks${tasks} as trained and authorized by delegating nurse per WAC regulations`);
    }
    if (a2.length > 0) d.treatment_caregiver_actions_2 = "Staff will " + a2.join("; ") + ".";
  }

  return d;
}

/**
 * Extract NCP data from text (handles single or multiple chunks)
 * @param {string|Array<string>} textOrChunks - Full text or array of text chunks
 * @param {Object} options - Extraction options
 * @param {Function} [options.onProgress] - Optional async (message, percent) for progress (e.g. for BullMQ)
 * @returns {Promise<Object>} Extracted and normalized data
 */
/** Section labels for progress (order matches NCP form sections 1–11) */
const NCP_SECTION_LABELS = [
  "Summary",
  "Responsible Parties",
  "Communication",
  "Medications",
  "Health",
  "Treatments",
  "Psychosocial & Cognitive",
  "Left Alone",
  "Universal Precautions",
  "Activities of Daily Living",
  "Instrumental ADL",
];

async function extractNcpDataFromText(textOrChunks, options = {}) {
  const { onProgress } = options;

  async function report(message, percent) {
    if (typeof onProgress === "function") {
      try {
        await onProgress(message, percent);
      } catch (e) {
        console.warn("[NCP-AI] onProgress error:", e.message);
      }
    }
  }

  try {
    console.log("[NCP-AI] Starting NCP data extraction...");
    await report("Extracting: Summary", 10);

    // Load schema
    const schema = loadNcpSchema();
    console.log(
      `[NCP-AI] Loaded schema with ${Object.keys(schema).length} fields`,
    );

    // Determine if we have chunks or single text
    const isChunks = Array.isArray(textOrChunks);
    const chunks = isChunks ? textOrChunks : [textOrChunks];

    console.log(`[NCP-AI] Processing ${chunks.length} chunk(s)...`);

    // Extract data from each chunk; report section-by-section progress
    const chunkResults = [];
    const totalChunks = chunks.filter((c) => c && c.trim().length > 0).length;
    let processed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.trim().length === 0) {
        console.warn(`[NCP-AI] Warning: Chunk ${i + 1} is empty, skipping`);
        continue;
      }
      const sectionIndex = Math.min(processed, NCP_SECTION_LABELS.length - 1);
      const sectionLabel = NCP_SECTION_LABELS[sectionIndex];
        await report(
        `Extracting: ${sectionLabel}`,
        12 + Math.floor((35 * (processed + 1)) / Math.max(1, totalChunks))
        );

      const extracted = await extractNcpDataFromChunk(chunk, schema, {
        chunkIndex: i,
        totalChunks: chunks.length,
      });
      chunkResults.push(extracted);
      processed++;
    }

    await report("Merging results...", 48);
    const mergedData = mergeExtractedChunks(chunkResults);

    // Remap wrong key names to correct schema keys (AI sometimes uses source PDF key names)
    const remappedData = normalizeExtractedKeys(mergedData, schema);

    // Normalize field values
    let normalizedData = normalizeFieldValues(remappedData, schema);

    // Contact pass: run dedicated extraction on full text for any empty contact fields
    // (chunk extraction often misses "Client Representative" / "Worker Information" when they're in a large chunk)
    const contactNameKeys = ["contact_1_name", "contact_2_name", "contact_3_name", "contact_4_name", "contact_5_name", "contact_6_name"];
    const missingContactNames = contactNameKeys.filter(
      (k) => !normalizedData[k] || (typeof normalizedData[k] === "string" && normalizedData[k].trim() === "")
    );
    if (missingContactNames.length > 0 && chunks.length > 0) {
      await report("Extracting: Responsible Parties", 50);
      const fullText = chunks.filter(Boolean).join("\n\n");
      if (fullText.trim().length > 0) {
        const contactData = await extractContactsFromFullText(fullText, schema);
        CONTACT_FIELD_NAMES.forEach((name) => {
          const current = normalizedData[name];
          const isEmpty = current == null || (typeof current === "string" && current.trim() === "");
          if (isEmpty && contactData[name] != null && String(contactData[name]).trim() !== "") {
            normalizedData[name] = contactData[name];
          }
        });
        normalizedData = normalizeFieldValues(normalizedData, schema);
      }
    }

    // Layer 2: fill missing fields by re-analyzing full document (inference)
    // Do NOT fill contact_* in Layer 2 — they must come only from designated document sections (Layer 1)
    const missingFieldNames = getMissingFields(normalizedData, schema);
    const missingNonContact = missingFieldNames.filter(
      (n) => !/^contact_\d+_/.test(n)
    );
    if (missingNonContact.length > 0) {
      await report("Filling missing fields from document...", 55);
      const fullText = chunks.filter(Boolean).join("\n\n");
      if (fullText.trim().length > 0) {
        const layer2Data = await extractMissingFieldsFromText(
          fullText,
          missingNonContact,
          schema
        );
        // Remap any wrong key names from Layer 2 before merging
        const remappedLayer2 = normalizeExtractedKeys(layer2Data, schema);
        // Merge layer-2 only into fields that are still empty
        Object.entries(remappedLayer2).forEach(([fieldName, value]) => {
          if (!(fieldName in normalizedData) || normalizedData[fieldName] === null ||
              normalizedData[fieldName] === "" ||
              (typeof normalizedData[fieldName] === "string" && normalizedData[fieldName].trim() === "")) {
            const v = value;
            if (v !== undefined) {
              normalizedData[fieldName] = v;
            }
          }
        });
        normalizedData = normalizeFieldValues(normalizedData, schema);
      }
      await report("Missing fields filled.", 70);
    }

    // Validate extracted data
    await report("Validating data...", 72);
    const validation = validateExtractedData(normalizedData, schema);

    if (validation.errors.length > 0) {
      console.warn(
        `[NCP-AI] Validation found ${validation.errors.length} errors:`,
        validation.errors,
      );
    }
    if (validation.warnings.length > 0) {
      console.warn(
        `[NCP-AI] Validation found ${validation.warnings.length} warnings:`,
        validation.warnings,
      );
    }

    // Logical consistency correction — fix known inversion patterns before Layer 3
    normalizedData = applyLogicalCorrections(normalizedData);

    // Layer 3: Generate document-based values for remaining empty fields (uses full document text)
    const fullTextForLayer3 = chunks.filter(Boolean).join("\n\n");
    if (fullTextForLayer3.trim().length > 0) {
      await report("Generating contextual values for empty fields...", 73);
      normalizedData = await fillEmptyFieldsWithAI(normalizedData, schema, {
        fullDocumentText: fullTextForLayer3,
      });
    }

    // Final cleanup — strip all placeholder phrases that should be empty
    normalizedData = cleanPlaceholderValues(normalizedData);

    // Run logical corrections AGAIN after Layer 3 — Layer 3 can overwrite comm/vision fields with wrong content
    normalizedData = applyLogicalCorrections(normalizedData);

    console.log(
      `[NCP-AI] ✅ Extraction complete: ${validation.fieldStats.extracted}/${validation.fieldStats.total} fields extracted, ${validation.fieldStats.valid} valid`,
    );

    return {
      data: normalizedData,
      validation,
      metadata: {
        chunksProcessed: chunks.length,
        fieldsExtracted: validation.fieldStats.extracted,
        fieldsValid: validation.fieldStats.valid,
        extractionTimestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[NCP-AI] Error in extractNcpDataFromText:", error);
    throw new Error(`Failed to extract NCP data: ${error.message}`);
  }
}

/**
 * Layer 3: AI-powered contextual fill for remaining empty fields.
 * Uses the full assessment document text so the AI can infer values from narrative, health, behavior, communication, etc.
 * Prefers document-based inferences over "Not indicated in assessment" for all sections.
 * @param {Object} extractedData - Current extracted data (with filled + empty fields)
 * @param {Object} schema - Full NCP schema
 * @param {Object} [options] - { fullDocumentText: string } optional full assessment text for inference
 * @returns {Promise<Object>} Updated data with all fields populated
 */
async function fillEmptyFieldsWithAI(extractedData, schema, options = {}) {
  const { fullDocumentText } = options;

  // Treat as empty so we try to fill from document
  const PLACEHOLDER = "Not indicated in assessment";

  /** Return true if value is acceptable as AI-generated content (not empty, not N/A or placeholder) */
  function isAcceptableGeneratedValue(v) {
    if (v == null) return false;
    const str = String(v).trim();
    if (str === "") return false;
    const lower = str.toLowerCase();
    if (lower === "n/a" || lower === "na" || lower === "none" || lower === "not available" || lower === "not indicated in assessment") return false;
    if (lower.includes("no additional details documented")) return false;
    if (lower === "not specified in assessment." || lower === "not specified in assessment") return false;
    if (lower.startsWith("no known")) return false; // "No known X per assessment" pattern
    if (lower === "routine monitoring as documented" || lower === "per care plan") return false;
    return true;
  }

  const FALLBACK_PHRASE = "No additional details documented in assessment.";

  // Values we treat as "empty" so Layer 3 will replace with real AI-generated content (no N/A)
  function isEmptyValue(val) {
    if (val === null || val === undefined) return true;
    const trimmed = typeof val === "string" ? val.trim() : "";
    if (trimmed === "") return true;
    const lower = trimmed.toLowerCase();
    if (lower === PLACEHOLDER.toLowerCase()) return true;
    if (lower.includes("no additional details documented")) return true;
    if (lower === "n/a" || lower === "na" || lower === "none" || lower === "not available" || lower === "none documented" || lower === "not specified" || lower === "not specified in assessment") return true;
    return false;
  }

  // "Other description" fields that are conditional on their parent checkbox being checked.
  // If the checkbox is unchecked (""), the description field should stay empty — don't generate.
  const CONDITIONAL_DESCRIPTION_FIELDS = {
    legal_docs_other: "legal_docs_other_checkbox",
    specialty_needs_other: "specialty_needs_other_checkbox",
    treatment_hospice_other_desc: "treatment_hospice_other",
    treatment_oxygen_vendor: "treatment_oxygen",
    treatment_dialysis_provider: "treatment_dialysis",
    treatment_inr_lab_provider: "treatment_inr_lab",
    med_type_other_desc: "med_type_other",
    psych_other_behavior_desc: "psych_other_behavior",
    activities_other_desc: "activities_other",
    health_other_desc: "health_other",
  };

  // Identify remaining empty non-checkbox fields (include N/A and placeholders so we replace with contextual sentences)
  const emptyFields = [];
  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    const value = extractedData[fieldName];
    if (!isEmptyValue(value)) continue;

    const isCheckbox = fieldDef?.enum &&
      JSON.stringify(fieldDef.enum) === JSON.stringify(["X", ""]);
    if (isCheckbox) continue;

    // Do NOT AI-generate contact fields — they must come only from designated document sections.
    if (fieldName.startsWith("contact_") && /^contact_\d+_/.test(fieldName)) continue;

    // Do NOT AI-generate date fields — they must come from labeled document fields, not be invented.
    if (fieldDef?.description?.includes("MM/DD/YYYY")) continue;

    // Do NOT AI-generate conditional "Other" description fields when their parent checkbox is unchecked.
    const parentCheckbox = CONDITIONAL_DESCRIPTION_FIELDS[fieldName];
    if (parentCheckbox && extractedData[parentCheckbox] !== "X") continue;

    emptyFields.push(fieldName);
  }

  if (emptyFields.length === 0) return extractedData;

  console.log(`[NCP-AI] Layer-3: Generating document-based values for ${emptyFields.length} empty fields${fullDocumentText ? " (with full document)" : ""}`);

  // Build a summary of already-extracted data for context
  const contextSummary = {};
  for (const [key, val] of Object.entries(extractedData)) {
    if (val && typeof val === "string" && val.trim() !== "") {
      contextSummary[key] = val;
    }
  }

  const filled = { ...extractedData };

  /**
   * Interview-style Layer-3: fill fields section-by-section using a focused excerpt of the assessment.
   * This reduces hallucinations and improves relevance vs using a single giant document slice.
   */
  const SECTION_CONFIGS = [
    {
      id: "summary",
      label: "Summary section",
      include: (k) =>
        k.startsWith("provider_") ||
        k.startsWith("date_") ||
        k === "moved_in_date" ||
        k.startsWith("resident_") ||
        k === "primary_language" ||
        k === "speaks_english" ||
        k.startsWith("interpreter_") ||
        k === "age" ||
        k.startsWith("legal_docs_") ||
        k.startsWith("specialty_needs_") ||
        k.startsWith("evacuation_") ||
        k.startsWith("caregiver_evacuation_"),
      keywords: [
        "provider",
        "assessment date",
        "ncp started",
        "ncp completed",
        "resident",
        "client",
        "consumer",
        "dob",
        "date of birth",
        "age",
        "gender",
        "pronoun",
        "language",
        "speaks english",
        "interpreter",
        "move-in",
        "admission",
        "discharge",
        "legal",
        "polst",
        "advanced directive",
        "special needs",
        "evacuation",
      ],
    },
    {
      id: "communication",
      label: "Communication Speech, Hearing & Vision section",
      include: (k) => k.startsWith("comm_"),
      keywords: [
        "communication",
        "speech",
        "mode of expression",
        "hearing",
        "vision",
        "glasses",
        "hearing aids",
        "equipment",
        "phone",
      ],
    },
    {
      id: "medications",
      label: "Medication management section",
      include: (k) => k.startsWith("med_") || k.startsWith("rn_delegator_"),
      keywords: [
        "medication",
        "medications",
        "medication management",
        "self administration",
        "route",
        "delegation",
        "rn delegator",
        "pharmacy",
      ],
    },
    {
      id: "health",
      label: "Health indicators section",
      include: (k) =>
        k.startsWith("health_") ||
        k.startsWith("allergy_") ||
        k === "all_allergies" ||
        k === "current_medical_diagnoses",
      keywords: [
        "health",
        "health indicators",
        "diagnosis",
        "diagnoses",
        "medical",
        "pain",
        "weight",
        "vital",
        "hospital",
        "er",
        "allergy",
        "allergies",
      ],
    },
    {
      id: "treatments",
      label: "Treatment programs & therapies section",
      include: (k) => k.startsWith("treatment_"),
      keywords: ["treatment", "therapy", "therapies", "program", "frequency"],
    },
    {
      id: "psych",
      label: "Psychosocial & cognitive section",
      include: (k) => k.startsWith("psych_") || k.startsWith("cognitive_"),
      keywords: [
        "psychosocial",
        "cognitive",
        "sleep",
        "memory",
        "behavior",
        "behaviour",
        "wandering",
        "depression",
        "anxiety",
      ],
    },
    {
      id: "left_alone",
      label: "Left alone status section",
      include: (k) => k.startsWith("left_alone_"),
      keywords: ["left alone", "supervision", "monitor", "summon help"],
    },
    {
      id: "universal_precautions",
      label: "Universal precautions section",
      include: (k) => k.startsWith("universal_precautions_"),
      keywords: ["universal precautions", "infection", "hand hygiene", "ppe"],
    },
    {
      id: "adl",
      label: "Activities of daily living section",
      include: (k) =>
        k.startsWith("mobility_") ||
        k.startsWith("bed_mobility_") ||
        k.startsWith("adl_") ||
        k.startsWith("eating_") ||
        k.startsWith("toileting_") ||
        k.startsWith("dressing_") ||
        k.startsWith("hygiene_") ||
        k.startsWith("bathing_") ||
        k.startsWith("foot_care_") ||
        k.startsWith("skin_"),
      keywords: [
        "adl",
        "activities of daily living",
        "mobility",
        "ambulation",
        "bed mobility",
        "transfer",
        "eating",
        "toileting",
        "incontinence",
        "dressing",
        "hygiene",
        "grooming",
        "bathing",
        "oral care",
        "foot care",
        "skin care",
      ],
    },
    {
      id: "iadl",
      label: "Instrumental activities of daily living section",
      include: (k) =>
        k.startsWith("iadl_") ||
        k.startsWith("activities_") ||
        k.startsWith("safety_") ||
        k === "case_management" ||
        k.startsWith("case_management_") ||
        k === "activity_narrative" ||
        k.startsWith("sig_"),
      keywords: [
        "iadl",
        "instrumental",
        "shopping",
        "transportation",
        "finances",
        "cooking",
        "case management",
        "smoking",
        "safety",
        "activities",
      ],
    },
  ];

  function getSectionConfigForField(fieldName) {
    for (const cfg of SECTION_CONFIGS) {
      if (cfg.include(fieldName)) return cfg;
    }
    return { id: "other", label: "Other section", keywords: [], include: () => false };
  }

  function buildSectionSnippet(text, keywords, maxChars = 45000) {
    if (!text || typeof text !== "string") return "";
    const lines = text.split(/\r?\n/);
    const loweredKeywords = (keywords || [])
      .map((k) => String(k).toLowerCase())
      .filter(Boolean);

    if (loweredKeywords.length === 0) {
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    }

    const hitIdxs = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (loweredKeywords.some((k) => lower.includes(k))) hitIdxs.push(i);
    }

    if (hitIdxs.length === 0) {
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    }

    const keep = new Set();
    for (const idx of hitIdxs) {
      const start = Math.max(0, idx - 6);
      const end = Math.min(lines.length - 1, idx + 6);
      for (let j = start; j <= end; j++) keep.add(j);
    }

    const ordered = Array.from(keep).sort((a, b) => a - b);
    let out = "";
    let last = -999;
    for (const i of ordered) {
      if (i - last > 15 && out.length > 0) out += "\n...\n";
      out += lines[i] + "\n";
      last = i;
      if (out.length >= maxChars) break;
    }
    return out.slice(0, maxChars);
  }

  // Layer-3 provider: OpenAI (fast, no rate limit) when OPENAI_API_KEY is set; otherwise Claude with retry and pacing
  const useOpenAI = useOpenAIForLayer3();
  const layer3DelayMs = useOpenAI ? 1500 : 62000;
  const callLayer3 = (opts) => useOpenAI ? callOpenAILayer3(opts) : callClaudeWithRetry(opts);
  console.log(`[NCP-AI] Layer-3 using ${useOpenAI ? "OpenAI (fast)" : "Claude (with rate-limit pacing)"}`);

  // Keep a general snippet available for later fallback passes
  const docSnippet =
    fullDocumentText && fullDocumentText.trim().length > 0
      ? fullDocumentText.length > 120000
        ? fullDocumentText.slice(0, 120000) + "\n\n[... document truncated ...]"
        : fullDocumentText
      : "";

  // Interview-style first pass (section-based retrieval)
  const bySection = new Map();
  for (const f of emptyFields) {
    const cfg = getSectionConfigForField(f);
    const key = cfg.id || "other";
    const arr = bySection.get(key) || [];
    arr.push(f);
    bySection.set(key, arr);
  }

  const SECTION_ORDER = [
    "summary",
    "communication",
    "medications",
    "health",
    "treatments",
    "psych",
    "left_alone",
    "universal_precautions",
    "adl",
    "iadl",
    "other",
  ];
  const sectionKeys = SECTION_ORDER.filter((k) => bySection.has(k)).concat(
    Array.from(bySection.keys()).filter((k) => !SECTION_ORDER.includes(k))
  );

  const batchSize = 18;
  const maxDocCharsFirstPass = 45000;
  let sectionBatchCounter = 0;
  const totalSectionBatches = sectionKeys.reduce((sum, k) => {
    const count = (bySection.get(k) || []).length;
    return sum + Math.ceil(count / batchSize);
  }, 0);

  for (const sectionKey of sectionKeys) {
    const sectionFields = bySection.get(sectionKey) || [];
    if (sectionFields.length === 0) continue;
    const cfg =
      SECTION_CONFIGS.find((c) => c.id === sectionKey) ||
      getSectionConfigForField(sectionFields[0]);

    const sectionSnippet =
      fullDocumentText && fullDocumentText.trim().length > 0
        ? buildSectionSnippet(fullDocumentText, cfg.keywords, maxDocCharsFirstPass)
        : "";

    for (let start = 0; start < sectionFields.length; start += batchSize) {
      const batch = sectionFields.slice(start, start + batchSize);
      sectionBatchCounter++;
      const batchNum = sectionBatchCounter;

    try {
      const fieldList = batch.map((name) => {
        const def = schema[name];
        const desc = def?.description || "";
        return `- ${name}: ${desc}`;
      }).join("\n");

      const contextStr = JSON.stringify(contextSummary);
      const maxContextLen = 30000;
      const trimmedContext = contextStr.length > maxContextLen
        ? contextStr.slice(0, maxContextLen) + "...(truncated)"
        : contextStr;

      const systemPrompt = `You are a healthcare documentation specialist for Adult Family Home (AFH) Negotiated Care Plans (NCP) in Washington State.

You will complete ONE NCP form section using an interview-style approach.

You are given:
1) A focused excerpt of the uploaded assessment document (ground truth).
2) Already-extracted NCP data for context.
3) A list of fields to fill for this section.

GROUNDING RULES (STRICT)
1) Use information from the assessment excerpt and already-extracted context. When the document doesn't have verbatim content for a field, write appropriate clinical content inferred from the resident's diagnoses, functional status, and care needs.
2) Do NOT invent facts, diagnoses, names, medications, or specific capabilities not described in the assessment.
3) If you truly cannot infer anything for a field, return empty string "" — do NOT return placeholder phrases.
4) NEVER output: "N/A", "None", "Not available", "Not indicated in assessment", "Not specified in assessment", "No known X per assessment", "Routine monitoring as documented", "Per care plan". These are forbidden.
5) Output MUST be valid JSON only. No markdown. No extra keys.

FIELD TYPE GUIDANCE:
- *_caregiver_actions: Describe what the CAREGIVER WILL DO (active verbs: "will assist", "will monitor", "will provide"). Write complete care instructions.
- *_strengths_abilities: Describe what the RESIDENT CAN DO independently or with minimal cues.
- *_limitations: Describe the resident's functional limitations matter-of-factly.
- psych_*_strengths (psych_interventions_strengths, psych_sleep_strengths, psych_dshs_programs_strengths): Describe the RESIDENT'S behavioral/psychological strengths — positive coping skills, what de-escalation approaches work, how the resident responds to redirection, positive behavioral patterns, and any self-regulation abilities observed.
- psych_*_assistance (psych_interventions_assistance, psych_sleep_assistance, psych_dshs_programs_assistance): Describe CAREGIVER BEHAVIORAL SUPPORT ACTIONS — specific intervention strategies, de-escalation techniques, calming approaches, monitoring steps, and how caregiver will respond to and manage behavioral needs.
- evacuation_safety_instructions / caregiver_evacuation_actions: Describe the PHYSICAL EVACUATION PROCEDURE — how the caregiver will physically assist the resident out of the building during an emergency. This is NOT about behavioral responses or agitation. Example: "Staff will provide hands-on assistance to guide Richard to the nearest exit. Richard requires physical assistance due to limited mobility."
- Do NOT use behavioral agitation content for evacuation fields.
- comm_vision_describe / comm_vision_equipment: This field is ONLY about the resident's EYESIGHT — visual acuity, eye conditions (cataracts, glaucoma, macular degeneration), glasses, or blindness. Do NOT put skin conditions, dry skin, or wound care content here.
- comm_hearing_describe / comm_hearing_equipment: This field is ONLY about the resident's HEARING — hearing loss, hearing aids, deafness. Do NOT put unrelated health content here.
- comm_expression_describe / comm_expression_equipment: This field is ONLY about how the resident COMMUNICATES — speech, language, augmentative communication devices. Do NOT put other health content here.
- med_equipment: ONLY medication administration equipment (pill crusher, medication cups, G-tube supplies, oral syringe). NEVER put oxygen concentrators, nebulizers, wheelchairs, or non-medication equipment here.
- med_ordered_by: The name of the prescribing physician (PCP). Example: "Dr. John Smith, MD". Generic phrase "primary care physician" is NOT acceptable — use the actual name if found in the document.
- med_delivered_by: The actual pharmacy name (e.g., "Walgreens Pharmacy", "Rite Aid"). Generic "the pharmacy" is NOT acceptable — use the actual name if found.
- ADL caregiver_actions fields: Be specific about what assistance is needed for that specific activity — describe the level of physical assistance, equipment used, and frequency.
- psych_* behavior checkboxes: Infer ALL behavior checkboxes from narrative. Set "X" for each documented behavior:
  resistive/combative/refuses care → psych_resistive_to_care; disruptive/agitation → psych_disruptive_behavior; assaultive/attacks → psych_assaultive; verbal threats/yelling/screaming → psych_verbally_aggressive; hitting/kicking/physical aggression → psych_physically_aggressive; wandering/pacing → psych_wandering; exit seeking/elopement → psych_exit_seeking; depression → psych_depression; anxiety/panic → psych_anxiety; irritability → psych_irritability; disorientation → psych_disorientation; hallucinations → psych_hallucinations; delusions/paranoia → psych_delusions; inappropriate behavior → psych_inappropriate_behavior; suicidal ideation → psych_suicidal_ideation; difficulty with unfamiliar → psych_difficulty_unfamiliar; disrobing → psych_disrobing; weeping/crying → psych_weeping_crying; unaware of consequences → psych_unaware_consequences; unrealistic fears → psych_unrealistic_fears; spitting → psych_inappropriate_spitting; breaks/throws objects → psych_breaks_throws; sleep disturbance/insomnia → psych_sleep_disturbance; needs night assistance → psych_nighttime_assistance.

STYLE
- Short, audit-ready sentences.
- Person-centered, using the resident's name when known.
- Neutral clinical phrasing appropriate for DSHS reviews.`;

      const docForRequest = sectionSnippet ? sectionSnippet.slice(0, maxDocCharsFirstPass) : "";
      const userPrompt = `NCP SECTION: ${cfg.label || "Section"}
SECTION BATCH: ${batchNum}/${totalSectionBatches}

ASSESSMENT EXCERPT:
------------------------------------------------------------------
${docForRequest}
------------------------------------------------------------------

ALREADY-EXTRACTED NCP DATA (context):
${trimmedContext}

FIELDS TO FILL (return JSON with EXACTLY these keys):
${fieldList}

Return only a JSON object. Every key above MUST appear.`;

      const rawText = await callLayer3({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 8000,
        temperature: 0.3,
      });
      let data = parseJsonFromClaude(rawText);

      if (data && typeof data === "object") {
        const allowed = new Set(batch);
        let filledCount = 0;
        for (const [k, v] of Object.entries(data)) {
          if (!allowed.has(k)) continue;
          if (isAcceptableGeneratedValue(v)) {
            filled[k] = v;
            filledCount++;
          }
        }
        console.log(`[NCP-AI] Layer-3 section-batch ${batchNum}/${totalSectionBatches}: generated ${filledCount}/${batch.length} values`);
      }

      if (batchNum < totalSectionBatches) {
        await new Promise((r) => setTimeout(r, layer3DelayMs));
      }
    } catch (err) {
      console.warn(`[NCP-AI] Layer-3 section-batch ${batchNum}/${totalSectionBatches} failed:`, err.message);
      for (const fieldName of batch) {
        if (!isAcceptableGeneratedValue(filled[fieldName])) {
          filled[fieldName] = FALLBACK_PHRASE;
        }
      }
    }
    }
  }

  // Second pass: any field still without acceptable content (including fallback phrase) — force AI to generate from document
  const stillEmpty = emptyFields.filter((f) => !isAcceptableGeneratedValue(filled[f]));
  if (stillEmpty.length > 0 && docSnippet) {
    const secondPassBatchSize = 15;
    console.log(`[NCP-AI] Layer-3 second pass: forcing AI-generated values for ${stillEmpty.length} remaining fields`);
    const filledSummary = {};
    for (const [k, v] of Object.entries(filled)) {
      if (isAcceptableGeneratedValue(v)) filledSummary[k] = v;
    }
    for (let start = 0; start < stillEmpty.length; start += secondPassBatchSize) {
      const batch = stillEmpty.slice(start, start + secondPassBatchSize);
      try {
        const fieldList = batch.map((name) => {
          const def = schema[name];
          return `- ${name}: ${def?.description || ""}`;
        }).join("\n");
        const contextStr = JSON.stringify(filledSummary);
        const trimmedContext = contextStr.length > 25000 ? contextStr.slice(0, 25000) + "..." : contextStr;
        const docSecond = docSnippet.slice(0, 40000);
        const forcePrompt = `ASSESSMENT DOCUMENT:
------------------------------------------------------------------
${docSecond}
------------------------------------------------------------------

EXTRACTED CONTEXT: ${trimmedContext}

These ${batch.length} fields still need a value. Write a brief clinical sentence from the document for each. Rules:
- Use ONLY information from the document or context above.
- If you cannot infer anything for a field, return empty string "" — never use placeholder phrases.
- FORBIDDEN phrases: "No known X per assessment", "Per care plan", "Routine monitoring", "Not specified in assessment", "N/A", "None".

FIELDS (return JSON with these exact keys — use "" for any field you cannot infer):
${fieldList}`;
        const rawText = await callLayer3({
          system: "You are an NCP documentation specialist. Write one clinical sentence per field using document content. If nothing can be inferred, return empty string \"\". NEVER use placeholder phrases like 'No known X per assessment', 'Per care plan', 'N/A', 'None', 'Not specified'.",
          user: forcePrompt,
          maxTokens: 6000,
          temperature: 0.25,
        });
        const data = parseJsonFromClaude(rawText);
        if (data && typeof data === "object") {
          for (const k of batch) {
            const v = data[k];
            if (isAcceptableGeneratedValue(v)) filled[k] = v;
          }
        }
      } catch (err) {
        console.warn("[NCP-AI] Layer-3 second pass batch failed:", err.message);
      }
      if (start + secondPassBatchSize < stillEmpty.length) {
        await new Promise((r) => setTimeout(r, layer3DelayMs));
      }
    }
  }

  // Third pass: any field still N/A or empty — one more try with "must write a sentence" prompt (so we show AI-generated text, not N/A)
  const stillNa = emptyFields.filter((f) => !isAcceptableGeneratedValue(filled[f]));
  if (stillNa.length > 0 && docSnippet) {
    console.log(`[NCP-AI] Layer-3 third pass: generating content for ${stillNa.length} fields (no N/A allowed)`);
    const batchSize = 12;
    const docThird = docSnippet.slice(0, 35000);
    for (let start = 0; start < stillNa.length; start += batchSize) {
      const batch = stillNa.slice(start, start + batchSize);
      try {
        const fieldList = batch.map((n) => `- ${n}: ${schema[n]?.description || ""}`).join("\n");
        const sys = "You fill NCP assessment fields using document content. For each key, write one clinical sentence from the document. If nothing can be inferred, return empty string \"\". NEVER use placeholder phrases ('No known X per assessment', 'Per care plan', 'Routine monitoring', 'Not specified in assessment', 'N/A', 'None').";
        const usr = `DOCUMENT:\n${docThird}\n\nFIELDS (return JSON — use "" for anything you cannot infer from the document):\n${fieldList}`;
        const rawText = await callLayer3({ system: sys, user: usr, maxTokens: 4000, temperature: 0.2 });
        const data = parseJsonFromClaude(rawText);
        if (data && typeof data === "object") {
          for (const k of batch) {
            if (isAcceptableGeneratedValue(data[k])) filled[k] = data[k];
          }
        }
      } catch (err) {
        console.warn("[NCP-AI] Layer-3 third pass batch failed:", err.message);
      }
      if (start + batchSize < stillNa.length) await new Promise((r) => setTimeout(r, layer3DelayMs));
    }
  }

  // Fourth pass: fields that still have fallback/placeholder — one unique sentence per field from document (no generic phrase)
  const stillFallback = emptyFields.filter((f) => !isAcceptableGeneratedValue(filled[f]));
  if (stillFallback.length > 0 && docSnippet) {
    const fourthPassBatchSize = 8;
    const docFourth = docSnippet.slice(0, 30000);
    console.log(`[NCP-AI] Layer-3 fourth pass: unique sentences for ${stillFallback.length} fields still showing placeholder`);
    for (let start = 0; start < stillFallback.length; start += fourthPassBatchSize) {
      const batch = stillFallback.slice(start, start + fourthPassBatchSize);
      try {
        const fieldList = batch.map((n) => `- ${n}: ${schema[n]?.description || ""}`).join("\n");
        const sys = "You fill NCP assessment fields using document content only. Write one specific clinical sentence per field from what is in the document. If nothing can be inferred, return empty string \"\". NEVER use placeholders ('No known X', 'Per care plan', 'Routine monitoring', 'N/A', 'None', 'Not specified').";
        const usr = `DOCUMENT:\n${docFourth}\n\nFIELDS (return JSON — use "" for anything you cannot infer):\n${fieldList}`;
        const rawText = await callLayer3({ system: sys, user: usr, maxTokens: 4000, temperature: 0.3 });
        const data = parseJsonFromClaude(rawText);
        if (data && typeof data === "object") {
          for (const k of batch) {
            if (isAcceptableGeneratedValue(data[k])) filled[k] = data[k];
          }
        }
      } catch (err) {
        console.warn("[NCP-AI] Layer-3 fourth pass batch failed:", err.message);
      }
      if (start + fourthPassBatchSize < stillFallback.length) await new Promise((r) => setTimeout(r, layer3DelayMs));
    }
  }

  // Final fallback: leave as empty string — better to show nothing than a generic placeholder
  for (const fieldName of emptyFields) {
    const val = filled[fieldName];
    if (!isAcceptableGeneratedValue(val)) {
      filled[fieldName] = "";
    }
  }

  const totalFilled = emptyFields.filter((f) => isAcceptableGeneratedValue(filled[f])).length;
  console.log(`[NCP-AI] Layer-3 total: AI-generated ${totalFilled}/${emptyFields.length} document-based values`);

  return filled;
}

module.exports = {
  CLAUDE_MODEL,
  callClaude,
  parseJsonFromClaude,
  extractNcpDataFromText,
  extractNcpDataFromChunk,
  mergeExtractedChunks,
  validateExtractedData,
  normalizeFieldValues,
  loadNcpSchema,
  convertSchemaToJsonSchema,
  getMissingFields,
  extractMissingFieldsFromText,
  fillEmptyFieldsWithAI,
};

/**
 * NCP DSHS Draft Generation Service
 *
 * Enhances an already-extracted NcpExtraction with clinical-quality language:
 *
 * Layer 1 — DSHS Draft
 *   Takes extractedData (raw values pulled from PDF) and rewrites all text/narrative
 *   fields into proper DSHS-compliant clinical language as required by WAC 388-76.
 *   Checkboxes, dates, names, and structured data are passed through unchanged.
 *   Output stored in layer1Draft.
 *
 * Layer 2 — DSHS Refinement + Conditional CBHS
 *   Reviews the Layer 1 draft for consistency, completeness, and language quality.
 *   If requiresCbhs = true, also applies CBHS language standards on behavioural,
 *   psychosocial, and mental health fields.
 *   Output stored in layer2Final.
 *
 * The layer2Final (or layer1Draft as fallback) is what gets populated into the DOCX.
 */

const prisma = require("../../lib/prisma");
const { callClaude, loadNcpSchema, parseJsonFromClaude } = require("./ncp-ai-extraction.service");
const { logUserAction } = require("../compliance/audit.service");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fields that should NEVER be rewritten by Layer 1/2.
 * These are factual, structured, or checkbox fields — pass through as-is.
 */
const PASSTHROUGH_FIELD_PREFIXES = [
  "contact_",       // responsible party names/phones/addresses
  "sig_",           // signatures
  "date_",          // dates
  "moved_in_date",
  "date_of_birth",
];

const PASSTHROUGH_EXACT_FIELDS = new Set([
  "resident_name",
  "resident_pronouns",
  "date_of_birth",
  "age",
  "primary_language",
  "speaks_english",
  "interpreter_needed",
  "moved_in_date",
  "date_ncp_started",
  "date_completed",
  "date_discharged",
  "provider_name",
  "all_allergies",
  "allergy_substance_1",
  "allergy_reaction_1",
  "current_medical_diagnoses",
  "rn_delegator_name",
  "rn_delegator_phone",
  "rn_delegator_fax",
  "rn_delegator_email",
  "case_management_name",
  "case_management_agency",
  "case_management_phone",
  "health_current_height",
  "health_current_weight",
  "comm_resident_phone_number",
  "iadl_care_manager_name",
  "iadl_care_manager_phone",
  "iadl_care_manager_agency",
]);

/** Max fields per AI batch — keeps prompts focused and within token limits */
const DSHS_BATCH_SIZE = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a field should be passed through unchanged (not rewritten).
 * Checkboxes, dates, contact fields, signatures, and key demographics are excluded.
 */
function isPassthrough(fieldName, fieldDef) {
  // Checkboxes
  if (
    fieldDef?.enum &&
    JSON.stringify(fieldDef.enum) === JSON.stringify(["X", ""])
  ) return true;

  // Exact match
  if (PASSTHROUGH_EXACT_FIELDS.has(fieldName)) return true;

  // Prefix match
  for (const prefix of PASSTHROUGH_FIELD_PREFIXES) {
    if (fieldName.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Split text fields that need rewriting into batches.
 * Groups related fields together (same prefix = same section) so AI has context.
 */
function batchTextFields(fieldNames, schema) {
  // Group by section prefix so related fields go into the same batch
  const groups = {};
  for (const name of fieldNames) {
    const prefix = name.split("_")[0] + "_" + (name.split("_")[1] || "");
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(name);
  }

  const batches = [];
  let current = [];

  for (const group of Object.values(groups)) {
    for (const name of group) {
      current.push(name);
      if (current.length >= DSHS_BATCH_SIZE) {
        batches.push([...current]);
        current = [];
      }
    }
  }
  if (current.length > 0) batches.push(current);

  return batches;
}

/**
 * Update extraction progress in DB.
 */
async function updateProgress(extractionId, message, percent) {
  try {
    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        errorMessage: `PROGRESS:${message}`,
        progressPercent: percent,
      },
    });
  } catch (e) {
    console.warn("[NCP-DSHS] Failed to update progress:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — DSHS Draft Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a field-type label for a field name based on its suffix.
 * Used to give the AI specific rewriting instructions per field type.
 */
function getFieldTypeHint(name) {
  if (name.endsWith("_caregiver_actions")) return "CAREGIVER ACTION — must begin with 'Caregiver to...' or 'Caregiver will...' and describe a specific, observable task";
  if (name.endsWith("_strengths_abilities")) return "STRENGTHS — describe what the resident CAN do independently or with minimal cues, using positive capability language";
  if (name.endsWith("_limitations")) return "LIMITATIONS — describe functional deficits clearly using clinical language; what the resident cannot safely do alone";
  if (name.endsWith("_how_often")) return "FREQUENCY — express as measurable clinical frequency (e.g. 'Daily', 'Twice per week', 'As needed per care plan')";
  if (name.endsWith("_equipment")) return "EQUIPMENT — list adaptive aids and assistive devices by proper name (e.g. '4-wheeled walker; grab bars; non-slip bath mat')";
  return null;
}

/**
 * Builds a brief resident profile from extracted/draft data for cross-section context.
 */
function buildResidentContext(data) {
  const parts = [];
  if (data.resident_name) parts.push(`Name: ${data.resident_name}`);
  if (data.age) parts.push(`Age: ${data.age}`);
  if (data.primary_language) parts.push(`Primary language: ${data.primary_language}`);
  if (data.current_medical_diagnoses) parts.push(`Medical diagnoses: ${String(data.current_medical_diagnoses).slice(0, 300)}`);
  if (data.health_general_narrative) parts.push(`General health: ${String(data.health_general_narrative).slice(0, 200)}`);
  if (data.cognitive_general || data.cognitive_narrative) parts.push(`Cognitive status: ${String(data.cognitive_general || data.cognitive_narrative).slice(0, 200)}`);
  if (data.mobility_general || data.mobility_narrative) parts.push(`Mobility: ${String(data.mobility_general || data.mobility_narrative).slice(0, 200)}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

function createLayer1SystemPrompt() {
  return `You are a certified DSHS NCP writer for Adult Family Homes (AFH) in Washington State.

MISSION: Convert raw values extracted from a resident assessment PDF into professional, DSHS-compliant clinical language for a Negotiated Care Plan (NCP) under WAC 388-76.

━━━ CORE LANGUAGE RULES ━━━
1. VOICE: Third person only — "Resident", "Caregiver". Never "I", "you", "he", "she", or "they" as a substitute for the resident's name
2. TENSE: Present tense — "Resident ambulates...", "Caregiver provides..."
3. VOCABULARY: Use clinical terms — ambulates/transfers/demonstrates/requires/utilizes — not walks/shows/needs/uses
4. SPECIFICITY: Always be measurable — "twice daily", "with standby assist of one", "using a 4-wheeled walker"
5. LENGTH: 1–3 substantive sentences per field. Never fragments. Never single words unless it is a list (equipment)
6. ACCURACY: Do not invent or embellish. Every clinical detail must come from the raw value

━━━ FIELD-TYPE RULES ━━━

CAREGIVER ACTION fields (ending in _caregiver_actions):
  → MUST begin with "Caregiver to..." or "Caregiver will..."
  → Describe specific, observable tasks — not general statements
  → BAD:  "Caregiver will help resident."
  → GOOD: "Caregiver to provide hands-on assistance with lower body dressing, including donning compression stockings and securing adaptive footwear, per established morning care routine."

STRENGTHS/ABILITIES fields (ending in _strengths_abilities):
  → What the resident CAN do independently or with minimal cues — positive, capability-focused
  → BAD:  "Resident needs some help."
  → GOOD: "Resident demonstrates ability to direct own care, communicate personal preferences clearly, and initiate upper body dressing independently."

LIMITATIONS fields (ending in _limitations):
  → What the resident CANNOT safely do alone — specific functional deficits
  → BAD:  "Has trouble walking."
  → GOOD: "Resident demonstrates impaired lower extremity strength and balance, unable to ambulate safely without physical assistance and use of mobility aid."

HOW OFTEN fields (ending in _how_often):
  → Clinical frequency language
  → BAD:  "Every day" / "Sometimes"
  → GOOD: "Daily, as part of established morning care routine." / "As clinically indicated, per care plan."

EQUIPMENT fields (ending in _equipment):
  → Proper names for adaptive aids, listed clearly
  → BAD:  "Walker and stuff in bathroom"
  → GOOD: "4-wheeled walker with hand brakes; grab bars (toilet and shower); non-slip bath mat; shower chair."

HEALTH / NARRATIVE / BEHAVIORAL fields (all other text fields):
  → Use diagnostic and clinical language consistent with professional care documentation
  → Behavioral fields: objective and observable — "Resident may exhibit increased verbal repetition and agitation when daily routine is disrupted"
  → Cognitive fields: functional impact focus — "Resident demonstrates moderate short-term memory impairment affecting ability to follow multi-step instructions and recall recent events independently"

━━━ SKIP THESE — RETURN UNCHANGED ━━━
• Empty fields, null, or fields containing only "Not indicated in assessment"
• Yes/No checkbox values
• Names, dates, phone numbers, diagnoses lists, medication names
(These are handled separately and must not be altered)

Return ONLY a valid JSON object. Keys = exact field names from the prompt. Values = rewritten strings. No explanation or commentary.`;
}

function createLayer1UserPrompt(fieldBatch, extractedData, schema) {
  const fieldDetails = fieldBatch
    .map((name) => {
      const def = schema[name] || {};
      const rawValue = extractedData[name] || "";
      const label = def.description || name;
      const typeHint = getFieldTypeHint(name);
      return [
        `Field: ${name}`,
        `Label: ${label}`,
        typeHint ? `Type: ${typeHint}` : null,
        `Raw value: "${rawValue}"`,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return `Rewrite each field below into DSHS-compliant clinical language following the rules in your instructions.
If "Raw value" is empty, null, or "Not indicated in assessment" — return it as an empty string "".
Return ONLY a JSON object. Keys = exact field names. Values = rewritten strings. No extra text.

FIELDS:
${fieldDetails}`;
}

/**
 * Run Layer 1 — rewrite text fields in DSHS clinical language.
 * Processes in batches. Passthrough fields are copied unchanged.
 *
 * @param {Object} extractedData - Raw extracted data from PDF
 * @param {Object} schema - Full NCP schema
 * @param {string} extractionId - For progress updates
 * @returns {Promise<Object>} layer1Draft — full 513-field object with rewritten text
 */
async function generateLayer1Draft(extractedData, schema, extractionId) {
  console.log("[NCP-DSHS] Starting Layer 1 — DSHS draft generation...");

  // Start with a copy of all extracted data (passthrough fields included)
  const draft = { ...extractedData };

  // Identify which fields need rewriting
  const fieldsToRewrite = Object.keys(schema).filter((name) => {
    const fieldDef = schema[name];
    if (isPassthrough(name, fieldDef)) return false;

    const value = extractedData[name];
    // Skip empty/not-indicated fields
    if (
      !value ||
      String(value).trim() === "" ||
      String(value).trim() === "Not indicated in assessment"
    ) return false;

    return true;
  });

  console.log(`[NCP-DSHS] Layer 1: ${fieldsToRewrite.length} text fields to rewrite`);

  if (fieldsToRewrite.length === 0) {
    console.log("[NCP-DSHS] Layer 1: No text fields to rewrite, returning extractedData as-is");
    return draft;
  }

  const batches = batchTextFields(fieldsToRewrite, schema);
  console.log(`[NCP-DSHS] Layer 1: Processing ${batches.length} batch(es)`);

  const systemPrompt = createLayer1SystemPrompt();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const percent = Math.round(10 + (i / batches.length) * 45); // 10–55%
    await updateProgress(
      extractionId,
      `Generating DSHS language (batch ${i + 1}/${batches.length})...`,
      percent
    );

    try {
      const userPrompt = createLayer1UserPrompt(batch, extractedData, schema);
      const rawText = await callClaude({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 8000,
        temperature: 0.3,
      });

      let result;
      try {
        result = parseJsonFromClaude(rawText);
      } catch (e) {
        console.warn(`[NCP-DSHS] Layer 1 batch ${i + 1} parse error:`, e.message);
        continue;
      }

      // Merge rewritten fields back into draft (only allowed keys)
      const allowed = new Set(batch);
      for (const [key, value] of Object.entries(result)) {
        if (allowed.has(key) && value != null && String(value).trim() !== "") {
          draft[key] = value;
        }
      }

      const filled = batch.filter(
        (k) => result[k] != null && String(result[k]).trim() !== ""
      ).length;
      console.log(`[NCP-DSHS] Layer 1 batch ${i + 1}/${batches.length}: rewrote ${filled}/${batch.length} fields`);

      // Small delay between batches to avoid rate limits
      if (i < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(`[NCP-DSHS] Layer 1 batch ${i + 1} failed:`, err.message);
      // Continue with remaining batches — partial output is better than nothing
    }
  }

  console.log("[NCP-DSHS] Layer 1 complete");
  return draft;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — DSHS Refinement + Conditional CBHS
// ─────────────────────────────────────────────────────────────────────────────

function createLayer2SystemPrompt(requiresCbhs, cbhsNotes) {
  let prompt = `You are a senior DSHS compliance reviewer for Adult Family Home Negotiated Care Plans (NCP) in Washington State.

MISSION: Perform final quality review of a DSHS NCP draft. Correct any language that falls short of clinical submission standards. Ensure the document reads as a coherent, professional, and legally defensible care plan throughout.

━━━ DSHS QUALITY STANDARDS (always apply) ━━━

1. VOICE & TENSE: All narrative fields in third person, present tense ("Resident demonstrates...", "Caregiver provides..."). Flag and fix any first-person, second-person, or past-tense language.

2. CAREGIVER ACTIONS: Every _caregiver_actions field must begin with "Caregiver to..." or "Caregiver will..." and describe a specific, observable task — not a vague promise. Fix any that do not meet this standard.

3. STRENGTHS: Every _strengths_abilities field must describe resident capabilities positively and specifically. Must never describe deficits. Fix if field describes what the resident cannot do.

4. FREQUENCY: Every _how_often field must use measurable, clinical frequency. Replace vague terms:
   - "sometimes" → specify context and approximate frequency
   - "as needed" → add the condition ("as needed when confusion increases")
   - "every day" → "Daily, per established care routine"

5. SPECIFICITY: Eliminate all vague or informal language:
   - "helps with" → specify the exact task
   - "monitors" → specify what is monitored and how often
   - "as tolerated" → acceptable only if no better information is available
   - "etc." → remove; list specifically

6. CROSS-SECTION CONSISTENCY: Use the RESIDENT CONTEXT block (provided in each prompt) to check for consistency. If one section establishes a condition (wheelchair use, dementia, vision impairment), other sections must reflect it accurately. Fix inconsistencies.

7. COMPLETENESS: Fields with actual content should have 1–3 substantive sentences minimum. Fix single-word or fragment answers.

8. CLINICAL VOCABULARY: Replace informal with clinical:
   - walks → ambulates
   - uses → utilizes
   - needs → requires
   - shows → demonstrates
   - helps → assists / provides assistance

9. NO FABRICATION: Do not add clinical details not present in the draft. If information is insufficient, preserve the existing content rather than inventing details.

10. PRESERVE FACTS: Keep all names, dates, diagnoses, medication names, frequencies, and phone numbers exactly as they appear.`;

  if (requiresCbhs) {
    prompt += `

━━━ CBHS LANGUAGE STANDARDS (apply for this resident in addition to DSHS) ━━━
${cbhsNotes ? `\nClinical context provided: ${cbhsNotes}\n` : ""}
This resident receives Community Behavioral Health Services (CBHS). Apply all of the following additional standards to behavioral health, psychological, and cognitive fields:

1. PERSON-FIRST LANGUAGE (mandatory):
   - "Resident living with schizophrenia" — NOT "schizophrenic resident"
   - "Resident experiencing symptoms of depression" — NOT "depressed resident"
   - "Resident who demonstrates elopement risk" — NOT "wandering resident"

2. RECOVERY-ORIENTED FRAMING:
   - Frame content around the resident's strengths, goals, and progress — not deficits alone
   - Include coping strategies and support systems where referenced in the draft
   - Example: "Resident demonstrates insight into symptoms and actively participates in de-escalation strategies identified in behavioral support plan."

3. OBSERVABLE BEHAVIORAL DESCRIPTIONS (mandatory for any behavioral field):
   - Describe behaviors in objective, observable terms — no clinical labels without description
   - REPLACE: "combative" → "exhibits defensive physical behaviors (pushing, swatting) when approached from behind or touched without warning"
   - REPLACE: "aggressive" → "exhibits verbal escalation (raised voice, repetitive demands) when needs are unmet"
   - REPLACE: "manipulative" → "demonstrates persistent help-seeking behaviors, including repeated requests for attention"
   - REPLACE: "non-compliant" → "declines offered interventions at times; responds better to choice-based approaches"
   - REPLACE: "wandering" → "demonstrates elopement risk behaviors; attempts to exit facility independently"

4. CRISIS PROTOCOL FIELDS: Any field describing crisis response must include all four components:
   (a) Known triggers — specific situations that precipitate crisis
   (b) Early warning signs — observable behavioral indicators
   (c) De-escalation approaches — specific caregiver interventions that are effective
   (d) Escalation contacts — who to notify and when (use existing names/contacts from document)

5. PSYCHOPHARMACOLOGICAL REFERENCES: Any mental health medication reference must:
   - Note the medication's purpose in observable functional terms
   - Reference monitoring requirements (side effects to observe, vitals to check)
   - Note the prescribing provider role (psychiatrist, ARNP)

6. CBHS PROGRAM PARTICIPATION: Describe participation in measurable terms:
   - BAD: "Resident attends day program."
   - GOOD: "Resident participates in CBHS day program three times per week, engaging in structured social and skill-building activities. Resident demonstrates cooperative participation with group activities and responds positively to structured routine."

7. INTEGRATED CARE: Behavioral health language must integrate with physical care. Cross-reference mobility, ADL, and health sections for consistency. For example, if resident uses a wheelchair, behavioral interventions should account for positioning and transfer approaches.

8. MENTAL HEALTH SUPPORT FIELDS: Reference both the resident's challenges AND their demonstrated coping strengths. Both must appear — this is a CBHS requirement.`;
  }

  return prompt;
}

function createLayer2UserPrompt(fieldBatch, layer1Draft, schema, requiresCbhs, residentContext) {
  const contextBlock = residentContext
    ? `RESIDENT CONTEXT (use to ensure cross-section consistency):\n${residentContext}\n\n`
    : "";

  const cbhsFlag = requiresCbhs
    ? "⚠ CBHS ACTIVE: Apply all CBHS language standards (person-first, recovery-oriented, observable behavioral descriptions) to all behavioral, psychological, and cognitive fields in this batch.\n\n"
    : "";

  const fieldDetails = fieldBatch
    .map((name) => {
      const def = schema[name] || {};
      const currentValue = layer1Draft[name] || "";
      const label = def.description || name;
      const typeHint = getFieldTypeHint(name);
      return [
        `Field: ${name}`,
        `Label: ${label}`,
        typeHint ? `Type: ${typeHint}` : null,
        `Current draft: "${currentValue}"`,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return `${contextBlock}${cbhsFlag}Review and refine each field below for final DSHS submission quality. Apply all rules from your instructions.
If the field already meets standards exactly — return it unchanged.
If "Current draft" is empty or "Not indicated in assessment" — return empty string "".
Return ONLY a JSON object. Keys = exact field names. Values = refined strings. No extra text.

FIELDS TO REVIEW:
${fieldDetails}`;
}

/**
 * Run Layer 2 — refine Layer 1 draft for DSHS compliance + optional CBHS.
 *
 * @param {Object} layer1Draft - Output from generateLayer1Draft
 * @param {Object} schema - Full NCP schema
 * @param {boolean} requiresCbhs - Whether to apply CBHS standards
 * @param {string|null} cbhsNotes - Optional CBHS context notes
 * @param {string} extractionId - For progress updates
 * @returns {Promise<Object>} layer2Final — final polished 513-field object
 */
async function generateLayer2Final(layer1Draft, schema, requiresCbhs, cbhsNotes, extractionId) {
  console.log(`[NCP-DSHS] Starting Layer 2 — DSHS refinement (CBHS: ${requiresCbhs})...`);

  const final = { ...layer1Draft };

  // Only refine fields that have actual content
  const fieldsToRefine = Object.keys(schema).filter((name) => {
    const fieldDef = schema[name];
    if (isPassthrough(name, fieldDef)) return false;

    const value = layer1Draft[name];
    if (
      !value ||
      String(value).trim() === "" ||
      String(value).trim() === "Not indicated in assessment"
    ) return false;

    return true;
  });

  // For CBHS: prioritise psychosocial/behavioral fields in the first batches
  let orderedFields = fieldsToRefine;
  if (requiresCbhs) {
    const cbhsPriority = fieldsToRefine.filter(
      (n) => n.startsWith("psych_") || n.startsWith("cognitive_")
    );
    const rest = fieldsToRefine.filter(
      (n) => !n.startsWith("psych_") && !n.startsWith("cognitive_")
    );
    orderedFields = [...cbhsPriority, ...rest];
  }

  console.log(`[NCP-DSHS] Layer 2: ${orderedFields.length} fields to refine`);

  if (orderedFields.length === 0) {
    console.log("[NCP-DSHS] Layer 2: No fields to refine");
    return final;
  }

  const batches = batchTextFields(orderedFields, schema);
  console.log(`[NCP-DSHS] Layer 2: Processing ${batches.length} batch(es)`);

  const systemPrompt = createLayer2SystemPrompt(requiresCbhs, cbhsNotes);

  // Build resident context once — passed to every batch for cross-section consistency
  const residentContext = buildResidentContext(layer1Draft);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const percent = Math.round(60 + (i / batches.length) * 35); // 60–95%
    await updateProgress(
      extractionId,
      `Refining DSHS language${requiresCbhs ? " + CBHS" : ""} (batch ${i + 1}/${batches.length})...`,
      percent
    );

    try {
      const userPrompt = createLayer2UserPrompt(batch, layer1Draft, schema, requiresCbhs, residentContext);
      const rawText = await callClaude({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 8000,
        temperature: 0.2, // More conservative — refinement should be consistent
      });

      let result;
      try {
        result = parseJsonFromClaude(rawText);
      } catch (e) {
        console.warn(`[NCP-DSHS] Layer 2 batch ${i + 1} parse error:`, e.message);
        continue;
      }

      const allowed = new Set(batch);
      for (const [key, value] of Object.entries(result)) {
        if (allowed.has(key) && value != null && String(value).trim() !== "") {
          final[key] = value;
        }
      }

      console.log(`[NCP-DSHS] Layer 2 batch ${i + 1}/${batches.length}: refined ${batch.length} fields`);

      if (i < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(`[NCP-DSHS] Layer 2 batch ${i + 1} failed:`, err.message);
    }
  }

  console.log("[NCP-DSHS] Layer 2 complete");
  return final;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Orchestrator — called by controller/queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate DSHS draft (Layer 1 + Layer 2) for an existing NcpExtraction.
 *
 * Flow:
 *   1. Load extraction + verify status
 *   2. Layer 1: rewrite extractedData → layer1Draft (DSHS language)
 *   3. Layer 2: refine layer1Draft → layer2Final (+ CBHS if required)
 *   4. Save both to DB
 *   5. Log audit trail
 *
 * @param {string} extractionId
 * @param {Object} user - { id, tenantId, role }
 * @param {Object} [options]
 * @param {boolean} [options.requiresCbhs] - Override CBHS flag (uses DB value if not provided)
 * @param {string}  [options.cbhsNotes]    - Override CBHS notes
 * @returns {Promise<Object>} Updated extraction with layer1Draft + layer2Final
 */
async function generateDshsDraft(extractionId, user, options = {}) {
  const tenantId = user.tenantId;

  // 1. Load extraction
  const extraction = await prisma.ncpExtraction.findFirst({
    where: { id: extractionId, tenantId },
  });

  if (!extraction) {
    const err = new Error("NCP extraction not found");
    err.statusCode = 404;
    throw err;
  }

  const allowedStatuses = ["EXTRACTED", "REVIEWED", "POPULATED"];
  if (!allowedStatuses.includes(extraction.status)) {
    const err = new Error(
      `DSHS draft can only be generated after extraction is complete (status: ${extraction.status})`
    );
    err.statusCode = 400;
    throw err;
  }

  if (!extraction.extractedData || Object.keys(extraction.extractedData).length === 0) {
    const err = new Error("No extracted data available to generate DSHS draft");
    err.statusCode = 400;
    throw err;
  }

  const requiresCbhs =
    options.requiresCbhs !== undefined ? options.requiresCbhs : extraction.requiresCbhs;
  const cbhsNotes =
    options.cbhsNotes !== undefined ? options.cbhsNotes : extraction.cbhsNotes;

  // Update CBHS flag in DB if changed
  if (
    options.requiresCbhs !== undefined &&
    options.requiresCbhs !== extraction.requiresCbhs
  ) {
    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        requiresCbhs,
        cbhsNotes: cbhsNotes || null,
      },
    });
  }

  // Mark as processing
  await prisma.ncpExtraction.update({
    where: { id: extractionId },
    data: {
      errorMessage: "PROGRESS:Starting DSHS draft generation...",
      progressPercent: 5,
    },
  });

  try {
    const schema = loadNcpSchema();

    // 2. Layer 1
    await updateProgress(extractionId, "Running Layer 1: DSHS language generation...", 10);
    const layer1Draft = await generateLayer1Draft(
      extraction.extractedData,
      schema,
      extractionId
    );

    // Save Layer 1 result immediately (safety checkpoint)
    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        layer1Draft,
        errorMessage: "PROGRESS:Layer 1 complete. Running Layer 2 refinement...",
        progressPercent: 58,
      },
    });

    // 3. Layer 2
    await updateProgress(extractionId, "Running Layer 2: DSHS refinement...", 60);
    const layer2Final = await generateLayer2Final(
      layer1Draft,
      schema,
      requiresCbhs,
      cbhsNotes,
      extractionId
    );

    // 4. Save final result
    const updated = await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        layer1Draft,
        layer2Final,
        requiresCbhs,
        cbhsNotes: cbhsNotes || null,
        errorMessage: null,
        progressPercent: 100,
      },
    });

    // 5. Audit
    await logUserAction({
      userId: user.id,
      tenantId,
      action: "PHI_GENERATE_NCP_DSHS_DRAFT",
      resourceId: extractionId,
      req: null,
      metadata: {
        requiresCbhs,
        layer1FieldCount: Object.keys(layer1Draft).length,
        layer2FieldCount: Object.keys(layer2Final).length,
      },
    });

    console.log(
      `[NCP-DSHS] ✅ Draft complete for ${extractionId} (CBHS: ${requiresCbhs})`
    );
    return updated;

  } catch (error) {
    // Save error state but preserve any layer1Draft that was saved
    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        errorMessage: `DSHS draft generation failed: ${error.message}`,
        progressPercent: null,
      },
    }).catch(() => {});

    console.error("[NCP-DSHS] Error generating DSHS draft:", error);
    throw error;
  }
}

/**
 * Get DSHS draft progress for polling.
 * @param {string} extractionId
 * @param {string} tenantId
 * @returns {Promise<Object>} { status, progressPercent, step, hasLayer1, hasLayer2 }
 */
async function getDshsDraftProgress(extractionId, tenantId) {
  const extraction = await prisma.ncpExtraction.findFirst({
    where: { id: extractionId, tenantId },
    select: {
      status: true,
      progressPercent: true,
      errorMessage: true,
      layer1Draft: true,
      layer2Final: true,
      requiresCbhs: true,
    },
  });

  if (!extraction) {
    const err = new Error("NCP extraction not found");
    err.statusCode = 404;
    throw err;
  }

  let step = extraction.errorMessage || "";
  const isDshsError = step.startsWith("DSHS draft generation failed:");
  if (step.startsWith("PROGRESS:")) step = step.replace("PROGRESS:", "").trim();

  return {
    status: extraction.status,
    progressPercent: extraction.progressPercent ?? 0,
    step,
    hasLayer1: !!extraction.layer1Draft,
    hasLayer2: !!extraction.layer2Final,
    requiresCbhs: extraction.requiresCbhs,
    error: isDshsError ? extraction.errorMessage : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Background-safe helpers (used by BullMQ worker + in-memory queue)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Background-safe wrapper that runs the full DSHS draft pipeline (Layer 1 + Layer 2).
 * Called automatically after extraction completes. Never throws — logs errors instead
 * so the parent extraction job is not marked failed.
 *
 * @param {string} extractionId
 * @param {string} tenantId
 * @param {string} userId
 */
async function runDshsDraftBackground(extractionId, tenantId, userId) {
  try {
    console.log(`[NCP-DSHS] Starting background DSHS draft for ${extractionId}...`);
    const syntheticUser = { id: userId, tenantId };
    await generateDshsDraft(extractionId, syntheticUser);
    console.log(`[NCP-DSHS] ✅ Background DSHS draft complete for ${extractionId}`);
  } catch (error) {
    console.error(
      `[NCP-DSHS] ❌ Background DSHS draft failed for ${extractionId}:`,
      error.message
    );
    // Extraction data is still valid — do not rethrow
  }
}

/**
 * Re-runs only Layer 2 using the existing layer1Draft.
 * Called when the requiresCbhs flag changes so the output reflects updated CBHS settings.
 * Never throws.
 *
 * @param {string} extractionId
 * @param {string} tenantId
 * @param {string} userId
 */
async function rerunLayer2Background(extractionId, tenantId, userId) {
  try {
    const extraction = await prisma.ncpExtraction.findFirst({
      where: { id: extractionId, tenantId },
      select: { layer1Draft: true, requiresCbhs: true, cbhsNotes: true },
    });

    if (!extraction?.layer1Draft) {
      console.log(`[NCP-DSHS] No layer1Draft for ${extractionId} — skipping Layer 2 re-run`);
      return;
    }

    console.log(`[NCP-DSHS] Re-running Layer 2 for ${extractionId} (CBHS: ${extraction.requiresCbhs})...`);

    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        errorMessage: "PROGRESS:Re-running Layer 2 with updated CBHS settings...",
        progressPercent: 60,
      },
    });

    const schema = loadNcpSchema();
    const layer2Final = await generateLayer2Final(
      extraction.layer1Draft,
      schema,
      extraction.requiresCbhs,
      extraction.cbhsNotes,
      extractionId
    );

    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: { layer2Final, errorMessage: null, progressPercent: 100 },
    });

    await logUserAction({
      userId,
      tenantId,
      action: "PHI_GENERATE_NCP_DSHS_DRAFT",
      resourceId: extractionId,
      req: null,
      metadata: {
        requiresCbhs: extraction.requiresCbhs,
        layer2Only: true,
        layer2FieldCount: Object.keys(layer2Final).length,
      },
    });

    console.log(`[NCP-DSHS] ✅ Layer 2 re-run complete for ${extractionId}`);
  } catch (error) {
    console.error(`[NCP-DSHS] ❌ Layer 2 re-run failed for ${extractionId}:`, error.message);
    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: { errorMessage: `DSHS Layer 2 re-run failed: ${error.message}` },
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  generateDshsDraft,
  getDshsDraftProgress,
  runDshsDraftBackground,
  rerunLayer2Background,
  // Exported for testing / direct use
  generateLayer1Draft,
  generateLayer2Final,
};

const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INCIDENT_TYPES = [
  "Accident",
  "MedicationError",
  "Behavioral",
  "Complaint",
  "SuspectedAbuseOrNeglect",
  "Other",
];
const SEVERITIES = ["Low", "Medium", "High"];

const SYSTEM_PROMPT = `You are a professional incident documentation specialist for Adult Family Homes (AFH) in Washington State. Your task is to analyze raw staff-written incident notes and extract structured, compliance-ready data for an incident report.

You work within a regulated healthcare setting. Your output will be used to pre-fill an incident report form that staff will review, edit, and approve before submission. Nothing you produce is submitted automatically.

PRIMARY OBJECTIVE
Analyze the provided raw text and return a single valid JSON object containing all extractable incident report fields. Do not return anything outside the JSON object.

CORE RULES

1. Grounding
   Extract only facts that are clearly supported by the input text. Do not invent, assume, infer, or speculate. If a field cannot be determined from the text, set it to null.

2. HIPAA-conscious language
   In the description narrative, use "Resident" instead of any person's name unless the name is required for clinical accuracy (e.g., a witness or staff member name). Never expose unnecessary identifiers.

3. Professional clinical tone
   The description field must be a polished, professional clinical paragraph written in third person, past tense, and objective voice — suitable for regulatory audit, DSHS review, or inspection. No bullet points. No first-person language.

4. CRITICAL — description vs followUpPlan are COMPLETELY SEPARATE fields:
   - payload.description = what HAPPENED (the incident narrative). Derived only from the input text. Describes events, actions, observations. NEVER contains follow-up plans or future actions.
   - payload.followUpPlan = what will be DONE NEXT (follow-up actions). This is generated from templates or extracted from text if staff wrote a plan. NEVER put follow-up plan content inside description.
   If the input text is too brief to write a clinical narrative, set description to a concise restatement of the input text in clinical language.

5. JSON only
   Return only the JSON object. No markdown, no explanation, no wrapping text.

6. Null discipline
   Any field that is not clearly supported by the input text must be null. Never fabricate plausible-sounding details.

INCIDENT TYPE CLASSIFICATION
Choose exactly one from: Accident, MedicationError, Behavioral, Complaint, SuspectedAbuseOrNeglect, Other.

Rules:
- Accident: falls, physical injuries, slips, trips, environmental hazards
- MedicationError: wrong dose, missed dose, wrong medication, medication administered to wrong person
- Behavioral: aggression, agitation, self-harm, elopement, disruptive behavior
- Complaint: formal or informal complaints from resident, family, or staff
- SuspectedAbuseOrNeglect: any indication of abuse, neglect, or exploitation — physical, emotional, financial, sexual
- Other: does not fit any of the above; requires a custom description

SEVERITY CLASSIFICATION
Choose exactly one from: Low, Medium, High.

Rules:
- High: life-threatening, hospitalization, 911 called, fracture, unconsciousness, head injury with bleeding, suspected abuse/neglect (always High)
- Medium: medication error, visible injury (bruise, cut, minor wound), fall without serious injury, significant behavioral episode
- Low: minor complaint, no physical injury, resolved quickly, no escalation

NOTIFICATION SUGGESTIONS
Always suggest provider and family. Apply additional rules:
- caseManager: suggest true if severity is High, OR incidentType is MedicationError or SuspectedAbuseOrNeglect
- authorities: suggest true if incidentType is SuspectedAbuseOrNeglect OR severity is High
- police: suggest true only if there is explicit mention of criminal activity, theft, or assault
- mentalHealthProfessional: suggest true if incidentType is Behavioral with significant escalation

DATE/TIME EXTRACTION
- If a specific time is mentioned (e.g., "9am", "around 3pm"), construct an ISO 8601 datetime using today's date and that time
- If only a date is mentioned, use that date with time 00:00:00
- If no date or time is mentioned, set occurredAt to null
- Today's date for reference: ${new Date().toISOString().split("T")[0]}

FOLLOW-UP PLAN GENERATION
followUpPlan must ALWAYS be populated — never null. Apply this logic:
- If the staff explicitly wrote a follow-up plan in the text, extract and use it.
- If no follow-up plan is mentioned, generate a professional, standard follow-up plan appropriate for the incident type and severity. This is a suggested starting point for staff to review and edit.

Standard follow-up templates by incident type:
- Accident (High severity): "Monitor resident closely for signs of worsening injury, neurological changes, or pain. Arrange physician follow-up within 24 hours. Document any changes in condition. Review environmental safety to prevent recurrence. Notify family and case manager of current status and planned follow-up."
- Accident (Medium severity): "Monitor resident for pain and mobility changes. Arrange physician follow-up if symptoms persist or worsen. Review environment for fall/injury hazards. Document all observations."
- Accident (Low severity): "Continue monitoring resident. Document any changes. Review environmental safety measures."
- MedicationError: "Notify pharmacy and prescribing physician immediately. Monitor resident for adverse effects or reactions. Review and correct medication administration records. Conduct medication administration process review with involved staff. Document all monitoring outcomes."
- Behavioral: "Continue behavioral monitoring per care plan. Debrief with staff involved. Review triggers and adjust behavioral support strategies as needed. Notify case manager and mental health provider if escalation continues."
- SuspectedAbuseOrNeglect: "Ensure resident safety and separate from alleged perpetrator if applicable. Report to DSHS as required. Cooperate fully with any investigation. Document all observations and actions taken."
- Complaint: "Acknowledge and document complaint. Meet with resident and/or family to address concerns. Implement corrective actions as appropriate. Follow up to confirm resolution."
- Other: "Monitor resident condition. Follow up with appropriate clinical staff. Document all observations and actions taken."

MISSING FIELDS
Identify which important fields could not be extracted from the text and list them by name in missingFields.
Common important fields: description, injuriesDescription, staffActions, witnessDetails, location, occurredAt
Do NOT include followUpPlan in missingFields — it is always generated.
Do not list guidedResponses keys in missingFields unless the value would be null when the prompt clearly applied.

GUIDED PROMPTS (payload.guidedResponses)
The form shows extra required prompts based on incident type, severity, and whether the event was witnessed. Always return payload.guidedResponses as an object with exactly these keys (string or null each):
- medicationContext: When incidentType is MedicationError — what medication or process failed and what immediate correction was taken. Extract from text; null if type is not MedicationError.
- behaviorTrigger: When incidentType is Behavioral — observed trigger and de-escalation strategy used. Extract from text; null if type is not Behavioral.
- highSeverityEscalation: When severity is High — document emergency escalation: 911, EMS, ER, transport, provider callback, and timeline if stated in the notes. Use third person, past tense. If severity is not High, null.
- unwitnessedIncident: When witnessed is false — how the incident was discovered and what immediate assessment staff performed. Extract from text; if witnessed is true or null, set null.

Grounding: prefer facts from the raw notes. If severity is High but the notes do not state EMS/ER details, still provide a concise sentence summarizing any emergency response mentioned in the narrative and note briefly what remains for staff to complete (no fabricated times or facility names).

REQUIRED OUTPUT STRUCTURE
REMINDER: payload.description = incident narrative (what happened). payload.followUpPlan = follow-up actions (what to do next). These are two different fields — never mix them.
Return exactly this JSON structure:

{
  "incidentType": "string from enum or null",
  "incidentTypeOtherText": "string or null — required only if incidentType is Other",
  "severity": "Low | Medium | High",
  "severityReason": "one sentence explaining the severity classification",
  "occurredAt": "ISO 8601 datetime string or null",
  "location": "extracted location string or null",
  "payload": {
    "description": "professional clinical paragraph — third person, past tense, objective",
    "injuriesDescription": "string or null",
    "staffActions": "string or null",
    "otherResidentsInvolved": "string or null — names/descriptions of other residents present or involved",
    "witnessed": true | false | null,
    "witnessedBy": "string or null",
    "witnessDetails": "string | null",
    "followUpPlan": "always a non-null string — extracted from text or generated from standard template",
    "abuseReportedToLocalOfficeDate": "string or null — only for SuspectedAbuseOrNeglect",
    "guidedResponses": {
      "medicationContext": "string or null",
      "behaviorTrigger": "string or null",
      "highSeverityEscalation": "string or null",
      "unwitnessedIncident": "string or null"
    },
    "notifications": {
      "provider": { "suggested": true, "reason": "Required for all incidents" },
      "family": { "suggested": true, "reason": "Required for all incidents" },
      "caseManager": { "suggested": true | false, "reason": "string or null" },
      "authorities": { "suggested": true | false, "reason": "string or null" },
      "police": { "suggested": true | false, "reason": "string or null" },
      "mentalHealthProfessional": { "suggested": true | false, "reason": "string or null" }
    }
  },
  "confidence": {
    "incidentType": "high | medium | low",
    "severity": "high | medium | low"
  },
  "missingFields": ["array of field names that could not be extracted"]
}`;

function buildUserPrompt(combinedText, residentCondition) {
  let prompt = `RAW INCIDENT NOTES:\n${combinedText}`;
  if (residentCondition && String(residentCondition).trim()) {
    prompt += `\n\nRESIDENT CONDITION CONTEXT:\n${String(residentCondition).trim()}`;
  }
  return prompt;
}

function validateAiResponse(parsed, sourceText) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI returned invalid response structure");
  }
  if (!INCIDENT_TYPES.includes(parsed.incidentType)) {
    parsed.incidentType = "Other";
    parsed.incidentTypeOtherText =
      parsed.incidentTypeOtherText || "Needs manual classification";
  }
  if (!SEVERITIES.includes(parsed.severity)) {
    parsed.severity = "Low";
  }
  if (!parsed.payload || typeof parsed.payload !== "object") {
    parsed.payload = {};
  }
  // Recover description from alternative locations the AI might have used
  if (typeof parsed.payload.description !== "string" || !parsed.payload.description.trim()) {
    const fallback =
      parsed.description ||
      parsed.payload.narrative ||
      parsed.narrative ||
      parsed.payload.incident_description ||
      parsed.incident_description ||
      null;
    if (fallback && typeof fallback === "string" && fallback.trim()) {
      parsed.payload.description = fallback.trim();
    } else {
      // Last resort: use the original source text so the draft still works
      parsed.payload.description = sourceText || "Incident description — please review and edit.";
    }
  }
  if (!parsed.payload.notifications || typeof parsed.payload.notifications !== "object") {
    parsed.payload.notifications = {};
  }
  parsed.payload.notifications.provider = {
    suggested: true,
    reason: "Required for all incidents",
    ...(parsed.payload.notifications.provider || {}),
  };
  parsed.payload.notifications.family = {
    suggested: true,
    reason: "Required for all incidents",
    ...(parsed.payload.notifications.family || {}),
  };
  // followUpPlan should always be present — never null
  if (!parsed.payload.followUpPlan || !String(parsed.payload.followUpPlan).trim()) {
    parsed.payload.followUpPlan =
      "Monitor resident condition and document any changes. Arrange appropriate follow-up with clinical staff. Review incident factors to prevent recurrence.";
  }
  // Remove followUpPlan from missingFields if AI put it there
  if (!Array.isArray(parsed.missingFields)) {
    parsed.missingFields = [];
  }
  parsed.missingFields = parsed.missingFields.filter((f) => f !== "followUpPlan");
  if (!parsed.confidence || typeof parsed.confidence !== "object") {
    parsed.confidence = { incidentType: "low", severity: "low" };
  }

  const grKeys = ["medicationContext", "behaviorTrigger", "highSeverityEscalation", "unwitnessedIncident"];
  const rawGr =
    parsed.payload.guidedResponses && typeof parsed.payload.guidedResponses === "object"
      ? parsed.payload.guidedResponses
      : {};
  const guidedResponses = {};
  for (const k of grKeys) {
    const v = rawGr[k];
    guidedResponses[k] =
      typeof v === "string" && v.trim() ? String(v).trim().slice(0, 2000) : null;
  }
  if (parsed.payload.witnessed === true || parsed.payload.witnessed === null) {
    guidedResponses.unwitnessedIncident = null;
  }
  if (parsed.incidentType !== "MedicationError") guidedResponses.medicationContext = null;
  if (parsed.incidentType !== "Behavioral") guidedResponses.behaviorTrigger = null;
  if (parsed.severity !== "High") guidedResponses.highSeverityEscalation = null;

  if (parsed.severity === "High" && !guidedResponses.highSeverityEscalation) {
    guidedResponses.highSeverityEscalation =
      "Source notes do not clearly specify emergency escalation (911/EMS/ER or provider contact). Staff must document the full timeline and notifications per facility protocol.";
  }
  if (parsed.payload.witnessed === false && !guidedResponses.unwitnessedIncident) {
    guidedResponses.unwitnessedIncident =
      "Source notes do not describe how the unwitnessed incident was discovered or the immediate assessment performed. Staff must document discovery and assessment.";
  }
  if (parsed.incidentType === "MedicationError" && !guidedResponses.medicationContext) {
    guidedResponses.medicationContext =
      "Medication error context was not fully detailed in the source notes. Staff must document the medication/process involved and immediate corrective actions.";
  }
  if (parsed.incidentType === "Behavioral" && !guidedResponses.behaviorTrigger) {
    guidedResponses.behaviorTrigger =
      "Behavioral trigger and de-escalation were not fully detailed in the source notes. Staff must document observed triggers and interventions used.";
  }

  // Body map helpers: infer likely body-map marker defaults from the narrative.
  // We cannot infer exact body coordinates; we only prefill marker injury metadata.
  const descriptionText = String(parsed.payload.description || "").toLowerCase();
  const injuriesText = String(parsed.payload.injuriesDescription || "").toLowerCase();
  const combinedForMarkers = `${descriptionText} ${injuriesText}`.trim();

  const hasAnyInjurySignals =
    /bruise|cut|laceration|abrasion|fracture|head injury|bleeding|swelling|sprain|discoloration/.test(
      combinedForMarkers,
    );

  const hasInjuriesDescription = injuriesText.trim().length > 0;
  const shouldPrefillMarkers = hasAnyInjurySignals || hasInjuriesDescription || parsed.severity === "High";

  const bodyMapNotesFromNarrative = shouldPrefillMarkers
    ? `Based on the incident narrative, injury mapping should document the stated injuries and any visible details described in the report. Staff should review marker types and notes for completeness and accuracy.`
    : null;

  function pickInjuryType() {
    const injuryTypeOrder = [
      ["fracture", ["fracture", "broken bone"]],
      ["head injury", ["head injury"]],
      ["bleeding", ["bleeding", "bleed"]],
      ["laceration", ["laceration", "cut with laceration"]],
      ["abrasion", ["abrasion"]],
      ["bruise", ["bruise", "bruising"]],
      ["swelling", ["swelling"]],
      ["sprain", ["sprain"]],
      ["cut", ["cut"]],
    ];
    for (const [label, patterns] of injuryTypeOrder) {
      if (patterns.some((p) => combinedForMarkers.includes(p))) return label;
    }
    return null;
  }

  const markerDefaultsInferred =
    shouldPrefillMarkers
      ? {
          injuryType: hasAnyInjurySignals ? pickInjuryType() : null,
          severity: parsed.severity || null,
          notes:
            injuriesText.trim() && injuriesText !== "null"
              ? `Suggested marker notes based on the narrative: ${injuriesText.slice(0, 220)}`
              : "Suggested marker notes: document visible injury characteristics and immediate care provided.",
        }
      : null;

  parsed.payload.bodyMapNotes =
    typeof parsed.payload.bodyMapNotes === "string"
      ? parsed.payload.bodyMapNotes.slice(0, 2000)
      : bodyMapNotesFromNarrative;

  const rawMd =
    parsed.payload.markerDefaults && typeof parsed.payload.markerDefaults === "object"
      ? parsed.payload.markerDefaults
      : null;

  if (rawMd) {
    const injuryType =
      typeof rawMd.injuryType === "string" && rawMd.injuryType.trim()
        ? rawMd.injuryType.trim().slice(0, 120)
        : markerDefaultsInferred?.injuryType ?? null;
    const severity =
      typeof rawMd.severity === "string" && SEVERITIES.includes(rawMd.severity.trim())
        ? rawMd.severity.trim()
        : markerDefaultsInferred?.severity ?? null;
    const notes =
      typeof rawMd.notes === "string" && rawMd.notes.trim()
        ? rawMd.notes.trim().slice(0, 1000)
        : markerDefaultsInferred?.notes ?? null;

    parsed.payload.markerDefaults = {
      injuryType,
      severity,
      notes,
    };
  } else {
    parsed.payload.markerDefaults = markerDefaultsInferred;
  }

  parsed.payload.guidedResponses = guidedResponses;
  return parsed;
}

async function generateAiIncidentDraft(combinedText, residentCondition) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(combinedText, residentCondition) },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content.trim();
  console.log("[INCIDENT-AI] Raw response:", raw);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI returned malformed JSON. Please try again.");
  }

  return validateAiResponse(parsed, combinedText);
}

module.exports = { generateAiIncidentDraft };

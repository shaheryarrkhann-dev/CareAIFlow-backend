const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");
const { getBehavioralLogs } = require("./behavioral.service");
const { logBehavioralAction } = require("../compliance/audit.service");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get resident name from residentId
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string|null>} Resident name or null
 */
async function getResidentName(residentId, tenantId) {
  try {
    const user = { tenantId, role: "ADMIN" };
    const resident = await getResidentById(residentId, user);
    return resident.name || null;
  } catch (error) {
    console.warn(
      `[BEHAVIORAL-AI] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * CBHS (Community Behavioral Health Services) prompt rules for single service-entry summaries.
 * Used for Washington State AFH behavioral-tracking summaries (clinical documentation, compliance).
 * @see CBHS New prompt.md
 */
let CBHS_SERVICE_ENTRY_SUMMARY_SYSTEM_PROMPT = `You are a professional behavioral health documentation specialist for Adult Family Homes (AFH) in Washington State. Your task is to generate clear, concise, accurate, and professional behavioral-tracking summaries for individual service entries that will be included in PDF documents used for clinical documentation, internal review, and regulatory compliance.

Your writing must reflect the standards expected in a Washington State AFH setting. The summary must read like a professional clinical narrative written by trained care staff or a documentation specialist. It must remain objective, factual, and grounded only in the source data provided.

PRIMARY OBJECTIVE
Generate one behavioral-tracking summary for a single service entry using only the information contained in the provided source data.

CORE DOCUMENTATION RULES

1. Professional tone
   Write in a professional, objective, clinical tone appropriate for healthcare documentation, quality assurance review, and regulatory auditing.

2. AFH context
   Assume the setting is an Adult Family Home in Washington State. Use language appropriate for long-term care, behavioral support, supervision, safety monitoring, and staff-resident interactions in that setting.

3. HIPAA-conscious wording
   Do not include unnecessary identifying information. Use "Resident" rather than the person's name unless the source data absolutely requires otherwise.

4. Accuracy and grounding
   Use only the facts provided in the service entry. Do not invent, assume, exaggerate, generalize, diagnose, interpret motives, or fill in missing details.

5. Completeness
   Include all relevant details that are actually present in the source data, especially behavior details, staff interventions, medication-related actions, resident response, safety concerns, and outcome.

6. Clarity
   Use clear, direct, simple language that can be easily understood by clinicians, administrators, licensors, case managers, and auditors.

7. Neutrality
   Do not use judgmental, emotional, vague, or blaming language. Do not editorialize. Do not praise or criticize the resident or staff. Do not speculate.

8. Third-person narrative
   Write in third person. Use phrasing such as "Resident exhibited..." and "Staff provided..." Do not write in first person.

9. Paragraph-only format
   Each required section must be written as a flowing paragraph. Do not use bullet points, numbered items, fragments, or list formatting inside the sections.

10. No extra content
    Return only the required three-section summary. Do not include headings beyond the required labels. Do not add notes, disclaimers, explanations, or introductory text.

SOURCE DATA EXPECTATIONS
The input will be a single service entry object or record. Source data may include any of the following fields when available:
- behavior type
- severity
- trigger
- context
- resident explanation
- intervention type
- intervention details
- monitoring
- redirection
- cueing
- diversion
- de-escalation
- PRN medication information
- outcome
- resident response
- safety concerns
- risk reduction or safety improvement details, etc.

Not every field will be present. Only use what is provided.

HANDLING MISSING INFORMATION
Follow these rules exactly:

- If behavior information is missing, write exactly: "Observed behavior information was not provided."
- If intervention information is missing, write exactly: "Intervention information was not provided."
- If outcome information is missing, write exactly: "Outcome information was not provided."
- If trigger, context, resident explanation, PRN medication information, resident response, or safety details are not provided, do not mention them.
- Never create filler text to compensate for missing data.
- Never state that a field was missing unless the instructions above specifically require that exact fallback sentence.

REQUIRED SECTION ORDER
You must return these three sections in this exact order and using these exact labels:

Observed Behaviors:
Interventions:
Outcome:

SECTION-SPECIFIC INSTRUCTIONS

Observed Behaviors:
Write one paragraph describing the behavior or behaviors exhibited, attempted, escalated, or prevented, based only on the provided data. Integrate the behavior type, severity, relevant trigger or context, and any resident explanation into a natural clinical narrative when available. Keep the wording factual, descriptive, and behavior-focused. Do not add interpretation or diagnosis. If behavior information is missing, write exactly: "Observed behavior information was not provided."

Interventions:
Write one paragraph describing all staff actions and interventions used in response to the behavior or risk. Include intervention types such as monitoring, redirection, cueing, diversion, reassurance, de-escalation, environmental modification, verbal support, prompting, or PRN medication, if those details are present in the source data. Describe what staff did in clear narrative form. Be specific about staff actions without inventing details. If intervention information is missing, write exactly: "Intervention information was not provided."

Outcome:
Write one paragraph describing the result of the interventions using only the information provided. Include any observable change in behavior, emotional state, participation, level of distress, cooperation, or safety status if documented. Include safety concerns or improvements if present. Do not overstate effectiveness. If outcome information is missing, write exactly: "Outcome information was not provided."

STYLE REQUIREMENTS

- Output plain text only.
- Do not use markdown formatting.
- Do not use bullet points, numbered lists, or sub-bullets.
- Use the section labels exactly as written.
- Each section must contain a full paragraph or the exact fallback sentence.
- Keep the writing concise but clinically complete.
- Prefer precise, information-dense sentences over repetitive wording.
- Avoid generic phrases when specific source details are available.
- Maintain a polished, audit-ready documentation style.

PROHIBITED CONTENT
Do not:

- fabricate missing facts
- infer causes that were not documented
- add diagnoses or clinical conclusions not present in the source data
- use stigmatizing or judgmental language
- mention laws, regulations, or compliance language in the output
- include timestamps, names, or identifiers unless they are part of the required source content
- add recommendations, follow-up plans, or commentary unless explicitly included in the service entry data

TARGET LENGTH
When sufficient source data is available, the full summary should typically be 180 to 400 words total.

- Observed Behaviors: typically 60 to 120 words
- Interventions: typically 70 to 140 words
- Outcome: typically 30 to 80 words

If the source data is limited, be appropriately brief and use the required fallback sentence where instructed.

QUALITY CHECK BEFORE FINAL OUTPUT
Before finalizing, verify all of the following:

- The response contains exactly three sections.
- The section order is exactly: Observed Behaviors, Interventions, Outcome.
- The section labels match exactly.
- Every factual statement is supported by the source data.
- Missing sections use the exact required fallback sentence when applicable.
- No extra commentary or formatting has been added.
- The writing is objective, professional, third person, and appropriate for Washington State AFH documentation.

OUTPUT FORMAT
Return only the final summary in this exact structure:

Observed Behaviors:
[one paragraph or exact fallback sentence]

Interventions:
[one paragraph or exact fallback sentence]

Outcome:
[one paragraph or exact fallback sentence]`;

// Override the built-in prompt with the client-provided CBHS supportive-supervision instructions.
// This file is kept external so the system prompt can be updated without editing the JS string.
try {
  CBHS_SERVICE_ENTRY_SUMMARY_SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, "CBHS_SUPPORTIVE_SUPERVISION_PROMPT.txt"),
    "utf8"
  );
} catch (err) {
  console.warn(
    "[BEHAVIORAL-AI] Could not load CBHS supportive supervision prompt file; using built-in fallback prompt.",
    err?.message
  );
}

/**
 * Generate behavioral narrative using AI
 * @param {string} prompt - Context prompt with behavioral log data
 * @returns {Promise<string>} Generated narrative
 */
async function generateBehavioralNarrativeWithAI(prompt) {
  const systemInstructions = `You are a professional behavioral health documentation specialist for assisted living facilities (AFH). Your task is to generate clear, concise, and professional behavioral health narratives based on daily behavioral logs.

IMPORTANT GUIDELINES:
1. Professional Tone: Write in a professional, objective, clinical tone suitable for healthcare documentation and regulatory compliance.
2. HIPAA Compliance: Do not include identifying information beyond what is necessary. Use "Resident" instead of names.
3. Clarity: Use clear, simple language that is easy to understand by clinicians, administrators, and regulatory auditors.
4. Completeness: Include relevant details from the logs, but be concise and focused.
5. Accuracy: Only include information that can be reasonably inferred from the provided logs. Do not fabricate details.
6. Tense & Voice: Use past tense for completed actions. Use third person (e.g., "Resident", "Staff") when applicable.

OUTPUT STRUCTURE:
The narrative should include the following sections (each on its own line with clear labels):

1. SUMMARY:
   - Brief overview of the behavioral period
   - Total number of incidents
   - Overall severity assessment

2. BEHAVIORAL PATTERNS:
   - Most frequent behavior types
   - Time patterns (if any - morning, afternoon, evening)
   - Frequency trends (increasing, decreasing, stable)

3. SEVERITY ANALYSIS:
   - Breakdown by severity level (Low, Moderate, High)
   - Escalation indicators (if any)
   - High-risk periods or patterns

4. TRIGGERS & CONTEXT:
   - Common triggers identified
   - Environmental factors
   - Situational contexts

5. INTERVENTIONS:
   - Interventions applied
   - Effectiveness of interventions (if evident from patterns)
   - Medication interventions (if PRN medications were administered)

6. RECOMMENDATIONS:
   - Suggested care plan adjustments
   - Environmental modifications
   - Additional monitoring needs
   - Follow-up actions

OUTPUT RULES:
- Return ONLY the narrative text with section labels
- No markdown formatting (no #, **, etc.)
- No additional commentary or explanations
- Length: typically 300-800 words, but adjust based on complexity
- Use section labels exactly as shown above (e.g., "SUMMARY:", "BEHAVIORAL PATTERNS:")
- If information is not available, state "Not documented" rather than inventing details
- Focus on patterns, trends, and actionable insights

EXAMPLE FORMAT:
SUMMARY:
During the reporting period, Resident exhibited 12 behavioral incidents across 8 days. The overall pattern shows moderate behavioral concerns with occasional high-severity events requiring immediate intervention.

BEHAVIORAL PATTERNS:
The most frequent behavior type was Aggression (6 incidents), followed by Agitation (4 incidents) and Withdrawal (2 incidents). Incidents were more common during afternoon hours (3-5 PM) and evening hours (7-9 PM). The frequency showed an increasing trend in the second week of the period.

SEVERITY ANALYSIS:
Of the 12 incidents, 3 were High severity, 5 were Moderate severity, and 4 were Low severity. High-severity incidents occurred on three consecutive days in the second week, indicating a potential escalation pattern requiring immediate attention.

TRIGGERS & CONTEXT:
Common triggers included environmental noise (4 incidents), missed meals (3 incidents), and changes in routine (2 incidents). Several incidents occurred during group activities or transitions between activities.

INTERVENTIONS:
Staff applied multiple interventions including redirection (8 incidents), PRN medication administration (3 incidents), environmental modifications (2 incidents), and de-escalation techniques (5 incidents). PRN medication appeared effective in reducing escalation in 2 of 3 cases.

RECOMMENDATIONS:
1. Implement environmental modifications to reduce noise during afternoon hours
2. Ensure consistent meal schedules and monitor for missed meals
3. Consider preemptive PRN medication administration during identified high-risk periods
4. Increase staff presence during transition times
5. Schedule care plan review meeting to discuss escalation pattern
6. Continue monitoring for 48 hours to assess intervention effectiveness`;

  const userPrompt = `Generate a professional behavioral health narrative based on the following daily behavioral logs:

${prompt}

Generate a comprehensive behavioral narrative following the structure and guidelines provided.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7, // Balanced creativity and consistency
      max_tokens: 2000, // Allow for detailed narratives
    });

    const generatedNarrative = completion.choices[0].message.content.trim();

    // Remove any markdown formatting if present
    const cleanedNarrative = generatedNarrative
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```$/g, "")
      .replace(/\*\*/g, "") // Remove bold markdown
      .replace(/#{1,6}\s/g, "") // Remove heading markdown
      .trim();

    return cleanedNarrative;
  } catch (error) {
    console.error("[AI Behavioral Note Generation] Error:", error);
    throw new Error(
      `Failed to generate behavioral narrative: ${
        error.message || "AI service unavailable"
      }`
    );
  }
}

/**
 * Format behavioral logs into prompt for AI
 * @param {Array} logs - Array of behavioral logs
 * @param {string} residentName - Resident name (optional)
 * @returns {string} Formatted prompt
 */
function formatLogsForAI(logs, residentName = null) {
  if (!logs || logs.length === 0) {
    return "No behavioral logs available for this period.";
  }

  let prompt = `Behavioral Logs Summary:\n`;
  prompt += `Total Incidents: ${logs.length}\n`;
  prompt += `Date Range: ${new Date(
    logs[logs.length - 1].dateTime
  ).toLocaleDateString()} to ${new Date(
    logs[0].dateTime
  ).toLocaleDateString()}\n\n`;

  prompt += `Detailed Logs:\n`;
  prompt += `${"=".repeat(60)}\n\n`;

  logs.forEach((log, index) => {
    prompt += `Incident ${index + 1}:\n`;
    prompt += `  Date/Time: ${new Date(log.dateTime).toLocaleString()}\n`;
    prompt += `  Behavior Type: ${log.behaviorType}\n`;
    prompt += `  Severity: ${log.severity}\n`;
    if (log.trigger) {
      prompt += `  Trigger/Context: ${log.trigger}\n`;
    }
    if (log.staffNotes) {
      prompt += `  Staff Notes: ${log.staffNotes}\n`;
    }
    if (log.interventions && Array.isArray(log.interventions)) {
      prompt += `  Interventions: ${log.interventions.join(", ")}\n`;
    }
    if (log.interventionDetails) {
      prompt += `  Intervention Details: ${log.interventionDetails}\n`;
    }
    if (log.prnRecord) {
      prompt += `  PRN Medication: ${
        log.prnRecord.medication?.name || "Unknown"
      } (${log.prnRecord.medication?.dosage || "N/A"}) - Given at ${new Date(
        log.prnRecord.givenAt
      ).toLocaleString()}\n`;
    }
    prompt += `\n`;
  });

  // Add summary statistics
  const behaviorTypeCounts = {};
  const severityCounts = { Low: 0, Moderate: 0, High: 0 };
  const interventionCounts = {};

  logs.forEach((log) => {
    behaviorTypeCounts[log.behaviorType] =
      (behaviorTypeCounts[log.behaviorType] || 0) + 1;
    severityCounts[log.severity] = (severityCounts[log.severity] || 0) + 1;

    if (log.interventions && Array.isArray(log.interventions)) {
      log.interventions.forEach((intervention) => {
        interventionCounts[intervention] =
          (interventionCounts[intervention] || 0) + 1;
      });
    }
  });

  prompt += `\nSummary Statistics:\n`;
  prompt += `  Behavior Types: ${Object.entries(behaviorTypeCounts)
    .map(([type, count]) => `${type} (${count})`)
    .join(", ")}\n`;
  prompt += `  Severity Breakdown: Low (${severityCounts.Low}), Moderate (${severityCounts.Moderate}), High (${severityCounts.High})\n`;
  if (Object.keys(interventionCounts).length > 0) {
    prompt += `  Interventions Used: ${Object.entries(interventionCounts)
      .map(([intervention, count]) => `${intervention} (${count})`)
      .join(", ")}\n`;
  }

  return prompt;
}

/**
 * Generate behavioral note using AI
 * @param {string} residentId - Resident ID
 * @param {Date} startDate - Start date of period
 * @param {Date} endDate - End date of period
 * @param {string} tenantId - Tenant ID
 * @param {Object} requestingUser - User requesting generation
 * @returns {Promise<Object>} Created behavioral note
 */
async function generateBehavioralNote(
  residentId,
  startDate,
  endDate,
  tenantId,
  requestingUser
) {
  // Validate resident
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error(
      "Resident not found or does not belong to your organization"
    );
  }

  // Get resident name
  const residentName = await getResidentName(residentId, tenantId);

  // Get behavioral logs for the period
  const user = { id: requestingUser.id, tenantId, role: requestingUser.role };
  const logsResult = await getBehavioralLogs(user, {
    residentId,
    dateFrom: startDate.toISOString(),
    dateTo: endDate.toISOString(),
    tenantId,
  });

  if (logsResult.logs.length === 0) {
    throw new Error(
      "No behavioral logs found for the specified date range. Cannot generate narrative."
    );
  }

  // Format logs for AI
  const prompt = formatLogsForAI(logsResult.logs, residentName);

  // Generate narrative using AI
  const narrative = await generateBehavioralNarrativeWithAI(prompt);

  // Create behavioral note record
  const behavioralNote = await prisma.behavioralNote.create({
    data: {
      residentId,
      residentName,
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      narrative,
      isAiGenerated: true,
      currentVersion: 0,
      generatedBy: requestingUser.id,
    },
  });

  // Create version 0 (initial version snapshot)
  await prisma.behavioralNoteVersion.create({
    data: {
      noteId: behavioralNote.id,
      version: 0,
      residentId: behavioralNote.residentId,
      residentName: behavioralNote.residentName,
      tenantId: behavioralNote.tenantId,
      startDate: behavioralNote.startDate,
      endDate: behavioralNote.endDate,
      narrative: behavioralNote.narrative,
      isAiGenerated: behavioralNote.isAiGenerated,
      createdBy: requestingUser.id,
    },
  });

  // Log audit event
  logBehavioralAction({
    action: "BEHAVIORAL_NOTE_GENERATED",
    userId: requestingUser.id,
    tenantId,
    resourceId: behavioralNote.id,
    req: null,
    metadata: {
      residentId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      logCount: logsResult.logs.length,
    },
  });

  return behavioralNote;
}

/**
 * Regenerate behavioral note using AI
 * @param {string} noteId - Behavioral note ID
 * @param {Object} requestingUser - User requesting regeneration
 * @returns {Promise<Object>} Updated behavioral note
 */
async function regenerateBehavioralNote(noteId, requestingUser) {
  // Get existing note
  const existingNote = await prisma.behavioralNote.findFirst({
    where: {
      id: noteId,
      deletedAt: null,
      ...(requestingUser.role !== "SUPER_ADMIN" && {
        tenantId: requestingUser.tenantId,
      }),
    },
  });

  if (!existingNote) {
    throw new Error("Behavioral note not found or access denied");
  }

  // Get behavioral logs for the period
  const user = {
    id: requestingUser.id,
    tenantId: existingNote.tenantId,
    role: requestingUser.role,
  };
  const logsResult = await getBehavioralLogs(user, {
    residentId: existingNote.residentId,
    dateFrom: existingNote.startDate.toISOString(),
    dateTo: existingNote.endDate.toISOString(),
    tenantId: existingNote.tenantId,
  });

  if (logsResult.logs.length === 0) {
    throw new Error(
      "No behavioral logs found for the specified date range. Cannot regenerate narrative."
    );
  }

  // Format logs for AI
  const prompt = formatLogsForAI(logsResult.logs, existingNote.residentName);

  // Generate new narrative using AI
  const newNarrative = await generateBehavioralNarrativeWithAI(prompt);

  // Increment version
  const newVersion = existingNote.currentVersion + 1;

  // Update note
  const updatedNote = await prisma.behavioralNote.update({
    where: { id: noteId },
    data: {
      narrative: newNarrative,
      isAiGenerated: true,
      currentVersion: newVersion,
      generatedBy: requestingUser.id,
      updatedAt: new Date(),
    },
  });

  // Create new version snapshot
  await prisma.behavioralNoteVersion.create({
    data: {
      noteId: updatedNote.id,
      version: newVersion,
      residentId: updatedNote.residentId,
      residentName: updatedNote.residentName,
      tenantId: updatedNote.tenantId,
      startDate: updatedNote.startDate,
      endDate: updatedNote.endDate,
      narrative: updatedNote.narrative,
      isAiGenerated: updatedNote.isAiGenerated,
      createdBy: requestingUser.id,
    },
  });

  // Log audit event
  logBehavioralAction({
    action: "BEHAVIORAL_NOTE_GENERATED",
    userId: requestingUser.id,
    tenantId: updatedNote.tenantId,
    resourceId: updatedNote.id,
    req: null,
    metadata: {
      residentId: updatedNote.residentId,
      noteId: updatedNote.id,
      version: newVersion,
      isRegeneration: true,
    },
  });

  return updatedNote;
}

/**
 * Update behavioral note (manual edit)
 * @param {string} noteId - Behavioral note ID
 * @param {string} narrative - Updated narrative text
 * @param {Object} requestingUser - User updating the note
 * @returns {Promise<Object>} Updated behavioral note
 */
async function updateBehavioralNote(noteId, narrative, requestingUser) {
  // Get existing note
  const existingNote = await prisma.behavioralNote.findFirst({
    where: {
      id: noteId,
      deletedAt: null,
      ...(requestingUser.role !== "SUPER_ADMIN" && {
        tenantId: requestingUser.tenantId,
      }),
    },
  });

  if (!existingNote) {
    throw new Error("Behavioral note not found or access denied");
  }

  // Increment version
  const newVersion = existingNote.currentVersion + 1;

  // Update note
  const updatedNote = await prisma.behavioralNote.update({
    where: { id: noteId },
    data: {
      narrative: narrative.trim(),
      isAiGenerated: false, // Mark as manually edited
      currentVersion: newVersion,
      updatedAt: new Date(),
    },
  });

  // Create new version snapshot
  await prisma.behavioralNoteVersion.create({
    data: {
      noteId: updatedNote.id,
      version: newVersion,
      residentId: updatedNote.residentId,
      residentName: updatedNote.residentName,
      tenantId: updatedNote.tenantId,
      startDate: updatedNote.startDate,
      endDate: updatedNote.endDate,
      narrative: updatedNote.narrative,
      isAiGenerated: updatedNote.isAiGenerated,
      createdBy: requestingUser.id,
    },
  });

  // Log audit event
  logBehavioralAction({
    action: "BEHAVIORAL_NOTE_UPDATED",
    userId: requestingUser.id,
    tenantId: updatedNote.tenantId,
    resourceId: updatedNote.id,
    req: null,
    metadata: {
      residentId: updatedNote.residentId,
      noteId: updatedNote.id,
      version: newVersion,
      isManualEdit: true,
    },
  });

  return updatedNote;
}

/**
 * Get behavioral notes with filtering and pagination
 * @param {Object} requestingUser - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Paginated list of behavioral notes
 */
async function getBehavioralNotes(requestingUser, filters = {}) {
  const {
    page = 1,
    limit = 50,
    residentId,
    startDate,
    endDate,
    tenantId, // For SUPER_ADMIN only
  } = filters;

  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    if (tenantId) {
      tenantWhere = { tenantId };
    }
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    ...tenantWhere,
    deletedAt: null,
    ...(residentId && { residentId }),
    ...(startDate &&
      endDate && {
        OR: [
          {
            startDate: {
              lte: new Date(endDate),
            },
            endDate: {
              gte: new Date(startDate),
            },
          },
        ],
      }),
  };

  // Calculate pagination
  const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit);
  const take = Math.min(Number.parseInt(limit) || 50, 100); // Max 100

  // Get total count
  const total = await prisma.behavioralNote.count({ where });

  // Get notes
  const notes = await prisma.behavioralNote.findMany({
    where,
    skip,
    take,
    orderBy: {
      createdAt: "desc", // Newest first
    },
    select: {
      id: true,
      residentId: true,
      residentName: true,
      tenantId: true,
      startDate: true,
      endDate: true,
      narrative: true,
      isAiGenerated: true,
      currentVersion: true,
      generatedBy: true,
      createdAt: true,
      updatedAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return {
    notes,
    pagination: {
      page: Number.parseInt(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

/**
 * Get behavioral note by ID
 * @param {string} noteId - Behavioral note ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Behavioral note with version history
 */
async function getBehavioralNoteById(noteId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role !== "SUPER_ADMIN") {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  const note = await prisma.behavioralNote.findFirst({
    where: {
      id: noteId,
      ...tenantWhere,
      deletedAt: null,
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      versions: {
        orderBy: {
          version: "desc",
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!note) {
    throw new Error("Behavioral note not found or access denied");
  }

  return note;
}

/**
 * Generate behavioral note for PDF inclusion (service-entry format)
 * This generates a note specifically formatted for PDF service entries with date, time, staff, behaviors, and interventions
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - Options for note generation
 * @param {Date} options.dateFrom - Start date for filtering logs (optional)
 * @param {Date} options.dateTo - End date for filtering logs (optional)
 * @param {boolean} options.includeAll - Include all logs if true (default: true)
 * @param {Object} requestingUser - User requesting generation (optional, for validation)
 * @returns {Promise<string>} AI-generated note text (does not save to DB)
 */
async function generateBehavioralNoteForPdf(
  residentId,
  tenantId,
  options = {},
  requestingUser = null
) {
  try {
    // Validate inputs
    if (!residentId) {
      throw new Error("residentId is required");
    }
    if (!tenantId) {
      throw new Error("tenantId is required");
    }

    // Extract options
    const {
      dateFrom = null,
      dateTo = null,
      includeAll = true,
      behaviorType = null,
      severity = null,
    } = options;

    // Create user object for getBehavioralLogs
    const user = requestingUser || {
      tenantId,
      role: "ADMIN",
      id: null,
    };

    // Build filters
    const filters = {
      residentId,
      tenantId,
      page: 1,
      limit: 10000, // Get all logs for the note
    };

    // Add date filters if provided
    if (!includeAll && (dateFrom || dateTo)) {
      if (dateFrom) {
        filters.dateFrom =
          dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
      }
      if (dateTo) {
        filters.dateTo = dateTo instanceof Date ? dateTo : new Date(dateTo);
      }
    }

    // Add behaviorType filter if provided
    if (behaviorType) {
      filters.behaviorType = behaviorType;
    }

    // Add severity filter if provided
    if (severity) {
      filters.severity = severity;
    }

    // Retrieve behavioral logs
    const logsResult = await getBehavioralLogs(user, filters);
    const logs = logsResult.logs || [];

    if (logs.length === 0) {
      return "No behavioral tracking data available for this service period.";
    }

    // Format logs for AI (service-entry format)
    const prompt = formatLogsForServiceEntryAI(logs);

    // Generate note using AI with service-entry format prompt
    const note = await generateBehavioralServiceEntryNoteWithAI(prompt);

    return note;
  } catch (error) {
    console.error(
      "[BEHAVIORAL-AI] Error generating behavioral note for PDF:",
      error
    );
    // Return error message instead of throwing (to not break PDF generation)
    return `Unable to generate behavioral note: ${error.message}`;
  }
}

/**
 * Format behavioral logs into prompt for service-entry format AI generation
 * @param {Array} logs - Array of behavioral logs
 * @returns {string} Formatted prompt
 */
function formatLogsForServiceEntryAI(logs) {
  if (!logs || logs.length === 0) {
    return "No behavioral logs available for this service period.";
  }

  // Sort logs chronologically (oldest first)
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.dateTime) - new Date(b.dateTime)
  );

  let prompt = `Behavioral Tracking Data for Service Entry Note:\n\n`;

  // Service period information
  const firstLog = sortedLogs[0];
  const lastLog = sortedLogs[sortedLogs.length - 1];
  const startDate = new Date(firstLog.dateTime).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const endDate = new Date(lastLog.dateTime).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  prompt += `SERVICE PERIOD INFORMATION:\n`;
  prompt += `Service Period: ${startDate} - ${endDate}\n`;
  prompt += `Total Service Entries: ${sortedLogs.length}\n`;

  // Get unique staff names
  const staffNames = [
    ...new Set(
      sortedLogs
        .map(
          (log) =>
            (log.staff && (log.staff.name || log.staff.email)) ||
            log.staffName ||
            "Unknown Staff"
        )
        .filter(Boolean)
    ),
  ];
  if (staffNames.length > 0) {
    prompt += `Staff Involved: ${staffNames.join(", ")}\n`;
  }
  prompt += `\n`;

  // Individual service entries
  prompt += `DETAILED SERVICE ENTRIES:\n`;
  prompt += `${"=".repeat(60)}\n\n`;

  sortedLogs.forEach((log, index) => {
    const logDate = new Date(log.dateTime).toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const logTime = new Date(log.dateTime).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const staffName =
      (log.staff && (log.staff.name || log.staff.email)) ||
      log.staffName ||
      "Unknown Staff";

    prompt += `Service Entry ${index + 1}:\n`;
    prompt += `  Date: ${logDate}\n`;
    prompt += `  Time: ${logTime}\n`;
    if (log.duration) {
      prompt += `  Duration of Service: ${log.duration}\n`;
    }
    prompt += `  Staff Name: ${staffName}\n`;
    prompt += `\n`;

    // Observed Behaviors
    prompt += `  Observed Behaviors:\n`;
    prompt += `    - Behavior Type: ${log.behaviorType || "Unknown"}\n`;
    prompt += `    - Severity: ${log.severity || "Unknown"}\n`;
    if (log.trigger) {
      prompt += `    - Trigger/Context: ${log.trigger}\n`;
    }
    if (log.residentExplanation) {
      prompt += `    - Resident's Explanation: ${log.residentExplanation}\n`;
    }
    prompt += `\n`;

    // Staff Interventions
    prompt += `  Staff Interventions:\n`;
    if (
      log.interventions &&
      Array.isArray(log.interventions) &&
      log.interventions.length > 0
    ) {
      log.interventions.forEach((intervention) => {
        prompt += `    - ${intervention}\n`;
      });
    } else {
      prompt += `    - No interventions recorded\n`;
    }
    if (log.interventionDetails) {
      prompt += `    - Intervention Details: ${log.interventionDetails}\n`;
    }
    if (log.prnRecord && log.prnRecord.medication) {
      const med = log.prnRecord.medication;
      prompt += `    - PRN Medication: ${med.name || "Unknown Medication"}`;
      if (med.dosage) {
        prompt += ` (${med.dosage})`;
      }
      const prnDate = new Date(log.prnRecord.givenAt).toLocaleDateString(
        "en-US",
        {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        }
      );
      const prnTime = new Date(log.prnRecord.givenAt).toLocaleTimeString(
        "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      );
      prompt += ` - Given at: ${prnDate} ${prnTime}\n`;
    }
    prompt += `\n`;

    // Outcome
    if (log.outcome) {
      prompt += `  Outcome: ${log.outcome}\n`;
      prompt += `\n`;
    }

    // Additional notes
    if (log.staffNotes) {
      prompt += `  Additional Notes: ${log.staffNotes}\n`;
      prompt += `\n`;
    }

    if (index < sortedLogs.length - 1) {
      prompt += `${"-".repeat(60)}\n\n`;
    }
  });

  return prompt;
}

/**
 * Generate behavioral service-entry note using AI
 * Uses Washington State AFH / CBHS documentation standards for each entry's three sections.
 * Applies the same full CBHS prompt rules as single-entry summaries; output is multiple entries in one response.
 * @param {string} prompt - Context prompt with behavioral log data (multiple service entries)
 * @returns {Promise<string>} Generated service-entry note
 */
async function generateBehavioralServiceEntryNoteWithAI(prompt) {
  const batchInstructions = `
MULTIPLE SERVICE ENTRIES:
You will receive multiple service entries below. For EACH entry, apply all the rules above. Output format:
- Start with: "BEHAVIORAL TRACKING NOTES"
- One line: "Service Period: [date range] | Total Service Entries: [count] | Staff: [names]"
- For each service entry, output in this order:
  1. A separator line (e.g. --------------------------------------------------)
  2. "Service Entry [number]:"
  3. "Date: [date]"
  4. "Time: [time]"
  5. "Duration of Service: [duration]" if provided
  6. "Staff: [staff name]"
  7. "Observed Behaviors:" then one paragraph (or exact fallback sentence)
  8. "Interventions:" then one paragraph (or exact fallback sentence)
  9. "Outcome:" then one paragraph (or exact fallback sentence)
- Use the exact section labels and the exact fallback sentences when information is missing for that entry.
- No bullet points or lists inside sections. Plain text only. Typically 180-400 words total per entry when data is sufficient.
`;

  const systemInstructions = CBHS_SERVICE_ENTRY_SUMMARY_SYSTEM_PROMPT + batchInstructions;

  const userPrompt = `Generate a professional behavioral tracking note for PDF inclusion based on the following service entry data. Use Washington State AFH documentation standards. For each service entry, write Observed Behaviors, Interventions, and Outcome as flowing paragraphs (no bullet points). Use the exact fallback sentences when information is missing.

${prompt}`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7, // Balanced creativity and consistency
      max_tokens: 2000, // Allow for detailed notes
    });

    const generatedNote = completion.choices[0].message.content.trim();

    // Remove any markdown formatting if present
    const cleanedNote = generatedNote
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```$/g, "")
      .replace(/\*\*/g, "") // Remove bold markdown
      .replace(/#{1,6}\s/g, "") // Remove heading markdown
      .trim();

    return cleanedNote;
  } catch (error) {
    console.error(
      "[AI Behavioral Service Entry Note Generation] Error:",
      error
    );
    throw new Error(
      `Failed to generate behavioral service-entry note: ${
        error.message || "AI service unavailable"
      }`
    );
  }
}

/**
 * Generate summary for a single service entry
 * Similar to AI notes but for a single service entry
 * @param {Object} serviceData - Service entry data
 * @param {number} serviceIndex - Service index (1-based)
 * @returns {Promise<string>} Generated summary
 */
async function generateSummaryForService(serviceData, serviceIndex) {
  // Build source data block from service entry (only include fields that are present).
  // Align with CBHS prompt: behavior type, severity, trigger, context, resident explanation,
  // intervention type/details, outcome, resident response, safety concerns, PRN info, etc.
  const lines = [`Source data for service entry (use only the information below):`, ""];

  const behaviorType =
    serviceData.behaviorType ||
    serviceData.observedBehavior ||
    (Array.isArray(serviceData.observedBehaviors) && serviceData.observedBehaviors.length > 0
      ? serviceData.observedBehaviors.join(", ")
      : null);
  if (behaviorType) lines.push(`behavior type: ${behaviorType}`);
  if (serviceData.severity) lines.push(`severity: ${serviceData.severity}`);
  if (serviceData.trigger) lines.push(`trigger: ${serviceData.trigger}`);
  if (serviceData.context) lines.push(`context: ${serviceData.context}`);
  if (serviceData.residentExplanation) lines.push(`resident explanation: ${serviceData.residentExplanation}`);
  if (serviceData.residentResponse) lines.push(`resident response: ${serviceData.residentResponse}`);

  const interventionStr =
    Array.isArray(serviceData.interventions)
      ? serviceData.interventions.join(", ")
      : serviceData.interventions;
  if (interventionStr) lines.push(`intervention type: ${interventionStr}`);
  if (serviceData.interventionDetails) lines.push(`intervention details: ${serviceData.interventionDetails}`);
  if (serviceData.monitoring) lines.push(`monitoring: ${serviceData.monitoring}`);
  if (serviceData.redirection) lines.push(`redirection: ${serviceData.redirection}`);
  if (serviceData.cueing) lines.push(`cueing: ${serviceData.cueing}`);
  if (serviceData.diversion) lines.push(`diversion: ${serviceData.diversion}`);
  if (serviceData.deEscalation) lines.push(`de-escalation: ${serviceData.deEscalation}`);
  if (serviceData.prnMedicationInformation || serviceData.prnMedication) lines.push(`PRN medication information: ${serviceData.prnMedicationInformation || serviceData.prnMedication}`);

  if (serviceData.outcome) lines.push(`outcome: ${serviceData.outcome}`);
  if (serviceData.safetyConcerns) lines.push(`safety concerns: ${serviceData.safetyConcerns}`);
  if (serviceData.riskReductionOrSafetyImprovement) lines.push(`risk reduction or safety improvement: ${serviceData.riskReductionOrSafetyImprovement}`);

  const sourceDataText = lines.join("\n");

  const userPrompt = sourceDataText.trim()
    ? `Generate one behavioral-tracking summary for this single service entry using only the source data below. Return exactly three sections with the exact labels: Observed Behaviors:, Interventions:, Outcome:\n\n${sourceDataText}`
    : `No source data was provided for this service entry. Return the three sections with the exact labels and use the required fallback sentences where information is missing:\n\nObserved behavior information was not provided.\nIntervention information was not provided.\nOutcome information was not provided.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: CBHS_SERVICE_ENTRY_SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower for consistent, audit-ready output
      max_tokens: 800,
    });

    const generatedSummary = completion.choices[0].message.content.trim();

    // Remove any markdown formatting if present
    const cleanedSummary = generatedSummary
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```$/g, "")
      .replace(/\*\*/g, "") // Remove bold markdown
      .replace(/#{1,6}\s/g, "") // Remove heading markdown
      .trim();

    return cleanedSummary;
  } catch (error) {
    console.error("[AI Behavioral Summary Generation] Error:", error);
    throw new Error(
      `Failed to generate summary: ${error.message || "AI service unavailable"}`
    );
  }
}

/**
 * Generate outcome paragraph based on observed behaviors (and optional interventions).
 * Used to auto-populate the Outcome field when user selects behaviors in CBHS form.
 * @param {string[]} observedBehaviors - Array of behavior names
 * @param {string} [interventions] - Optional intervention text
 * @returns {Promise<string>} Generated outcome paragraph
 */
async function generateOutcomeForBehaviors(observedBehaviors, interventions) {
  if (!observedBehaviors || !Array.isArray(observedBehaviors) || observedBehaviors.length === 0) {
    return "";
  }

  const behaviorsText = observedBehaviors.join(", ");
  const interventionsText = (interventions && String(interventions).trim()) || "Not specified";

  const systemInstructions = `You are a professional behavioral health documentation specialist for Adult Family Homes (AFH). Your task is to write a brief outcome paragraph for a behavioral service entry.

OUTCOME means: the result of the interventions—observable change in behavior, emotional state, participation, level of distress, cooperation, or safety status. Do not overstate effectiveness. Keep it factual and concise (typically 30–80 words). Return ONLY the outcome paragraph, no labels or headings.`;

  const userPrompt = `Observed behaviors: ${behaviorsText}
Interventions (if any): ${interventionsText}

Write a single short outcome paragraph describing the likely or typical result of these interventions for these behaviors. Use only the information above; do not invent details. Return only the paragraph text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const outcome = (completion.choices[0].message.content || "").trim();
    return outcome
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```$/g, "")
      .replace(/^(Outcome:?\s*)/i, "")
      .trim();
  } catch (error) {
    console.error("[AI Outcome Generation] Error:", error);
    return "";
  }
}

/**
 * Generate interventions for a custom behavior using AI
 * @param {string} behaviorName - Name of the custom behavior
 * @returns {Promise<string>} Generated intervention text
 */
async function generateInterventionsForCustomBehavior(behaviorName) {
  const systemInstructions = `You are a professional behavioral health specialist for assisted living facilities (AFH). Your task is to generate appropriate interventions for behavioral issues.

IMPORTANT GUIDELINES:
1. Professional: Provide evidence-based, professional interventions suitable for healthcare documentation
2. Safety-First: Prioritize safety interventions for all behaviors
3. Format: Return interventions as a single line of text, similar to existing intervention formats
4. Style: Match the style of existing interventions (e.g., "Redirect, monitor, reassure" or "Set limits, ensure safety, report")
5. Comprehensive: Include 2-4 key intervention strategies
6. Concise: Keep it brief but actionable (typically 10-30 words)

OUTPUT FORMAT:
- Return ONLY the intervention text as a single line
- Use comma-separated format like existing interventions
- No bullet points, no numbering, no markdown
- Example format: "Redirect, monitor, reassure, ensure safety"
- Be specific and actionable

EXAMPLES OF EXISTING INTERVENTIONS:
- "Reassure, redirect, document"
- "Set limits, redirect, stay calm"
- "Ensure safety, remove triggers"
- "Redirect, monitor, reassure"
- "Break task, offer choices, provide reassurance"`;

  const userPrompt = `Generate appropriate interventions for the following behavioral issue: "${behaviorName}"

Provide interventions in the same format as the examples above. Return only the intervention text, no additional explanation.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5, // Lower temperature for more consistent, professional output
      max_tokens: 100, // Short interventions don't need many tokens
    });

    const generatedIntervention = completion.choices[0].message.content.trim();

    // Clean up any markdown or extra formatting
    const cleanedIntervention = generatedIntervention
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```$/g, "")
      .replace(/\*\*/g, "")
      .replace(/^[-•*]\s*/g, "") // Remove bullet points
      .replace(/\n/g, ", ") // Replace newlines with commas
      .replace(/^["']|["']$/g, "") // Remove quotes from start and end
      .replace(/["']/g, "") // Remove any remaining quotes
      .trim();

    return cleanedIntervention || "Monitor, assess, document";
  } catch (error) {
    console.error("[AI Intervention Generation] Error:", error);
    // Return a default intervention if AI fails
    return "Monitor, assess, document, ensure safety";
  }
}

module.exports = {
  generateBehavioralNote,
  regenerateBehavioralNote,
  updateBehavioralNote,
  getBehavioralNotes,
  getBehavioralNoteById,
  generateBehavioralNarrativeWithAI,
  generateBehavioralNoteForPdf,
  generateSummaryForService,
  generateOutcomeForBehaviors,
  generateInterventionsForCustomBehavior,
};

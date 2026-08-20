const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");
const { getCarePlanById } = require("./care-plan.service");
const OpenAI = require("openai");

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
      `[CARE_PLAN_AI] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Detect problems from assessment data using AI
 * @param {string} residentId - Resident ID
 * @param {Object} assessmentData - Assessment form data
 * @param {Object} requestingUser - User requesting detection
 * @returns {Promise<Array>} Array of detected problems
 */
async function detectProblemsFromAssessment(
  residentId,
  assessmentData,
  requestingUser
) {
  // Validate resident access
  let tenantId = requestingUser.tenantId;
  if (requestingUser.role === "SUPER_ADMIN") {
    if (!assessmentData.tenantId) {
      throw new Error(
        "tenantId is required when detecting problems as SUPER_ADMIN"
      );
    }
    tenantId = assessmentData.tenantId;
  }

  await validateResidentId(residentId, tenantId);

  // Get resident name
  const residentName = await getResidentName(residentId, tenantId);

  // Format assessment data for AI
  const assessmentText = formatAssessmentDataForAI(assessmentData);

  // AI prompt for problem detection
  const systemPrompt = `You are a clinical assessment specialist for assisted living facilities (AFH). Your task is to analyze assessment data and identify potential care plan problems (medical, behavioral, functional, social, or other).

IMPORTANT GUIDELINES:
1. Identify actual problems that require care plan interventions
2. Use standard medical terminology and diagnosis codes when applicable
3. Categorize problems appropriately (Medical, Behavioral, Functional, Social, Other)
4. Be specific and actionable - problems should lead to measurable goals and interventions
5. Only identify problems that are clearly indicated in the assessment data
6. Do not fabricate problems that are not supported by the data

PROBLEM CATEGORIES:
- Medical: Physical health conditions, diseases, medical diagnoses (e.g., Diabetes, Hypertension, COPD)
- Behavioral: Mental health, behavioral issues (e.g., Anxiety, Depression, Aggression)
- Functional: ADL limitations, mobility issues (e.g., Impaired Mobility, Fall Risk, ADL Dependence)
- Social: Social isolation, family issues, communication problems
- Other: Any other care-related problems

OUTPUT FORMAT (JSON):
Return a JSON object with a "problems" array. Each problem should have:
{
  "problems": [
    {
      "title": "Problem title (e.g., 'Diabetes Mellitus Type II')",
      "category": "Medical|Behavioral|Functional|Social|Other",
      "description": "Detailed description of the problem",
      "diagnosisCode": "ICD-10 code if applicable (optional)",
      "onsetDate": "ISO date string if known (optional)"
    }
  ]
}

EXAMPLES:
- Assessment mentions "diabetes" and "blood sugar monitoring" → Problem: "Diabetes Mellitus Type II" (Medical)
- Assessment mentions "unsteady gait" and "uses walker" → Problem: "Risk for Falls" (Functional)
- Assessment mentions "depression" and "withdrawn behavior" → Problem: "Depression" (Behavioral)
- Assessment mentions "lives alone" and "no family visits" → Problem: "Social Isolation" (Social)

Return ONLY valid JSON, no additional text.`;

  const userPrompt = `Analyze the following assessment data and identify care plan problems:

Resident: ${residentName || "Resident"}
Resident ID: ${residentId}

Assessment Data:
${assessmentText}

Identify all problems that require care plan interventions. Return the problems as a JSON object with a "problems" array.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent, accurate detection
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(aiResponse);

    // Validate and clean problems
    const problems = Array.isArray(parsed.problems) ? parsed.problems : [];
    const validatedProblems = problems
      .filter((p) => p.title && p.category)
      .map((p) => ({
        title: p.title.trim(),
        category: p.category,
        description: p.description?.trim() || null,
        diagnosisCode: p.diagnosisCode?.trim() || null,
        onsetDate: p.onsetDate ? new Date(p.onsetDate) : null,
      }));

    return validatedProblems;
  } catch (error) {
    console.error(
      "[CARE_PLAN_AI] Error detecting problems from assessment:",
      error
    );
    throw new Error(
      `Failed to detect problems: ${error.message || "AI service unavailable"}`
    );
  }
}

/**
 * Detect problems from progress notes using AI
 * @param {string} residentId - Resident ID
 * @param {Array<string>} noteIds - Array of note IDs to analyze
 * @param {Object} requestingUser - User requesting detection
 * @returns {Promise<Array>} Array of detected problems
 */
async function detectProblemsFromProgressNotes(
  residentId,
  noteIds,
  requestingUser
) {
  // Validate resident access
  let tenantId = requestingUser.tenantId;
  if (requestingUser.role === "SUPER_ADMIN") {
    throw new Error(
      "tenantId is required when detecting problems as SUPER_ADMIN"
    );
  }

  await validateResidentId(residentId, tenantId);

  // Get resident name
  const residentName = await getResidentName(residentId, tenantId);

  // Get progress notes
  const notes = await prisma.note.findMany({
    where: {
      id: { in: noteIds },
      residentId: residentId,
      tenantId: tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      type: true,
      description: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (notes.length === 0) {
    throw new Error("No progress notes found or access denied");
  }

  // Format notes for AI
  const notesText = formatNotesForAI(notes);

  // AI prompt for problem detection
  const systemPrompt = `You are a clinical assessment specialist for assisted living facilities (AFH). Your task is to analyze progress notes and identify potential NEW care plan problems or indicators of existing problems that may need attention.

IMPORTANT GUIDELINES:
1. Identify NEW problems that are not already in the care plan
2. Look for indicators of problems (e.g., "unsteady gait" → Fall Risk, "reports dizziness" → Fall Risk)
3. Use standard medical terminology
4. Categorize problems appropriately (Medical, Behavioral, Functional, Social, Other)
5. Only identify problems that are clearly indicated in the notes
6. Focus on actionable problems that require care plan interventions

PROBLEM INDICATORS:
- "unsteady gait", "dizziness", "balance issues" → Risk for Falls (Functional)
- "refused medication", "non-compliant" → Non-Compliance (Behavioral)
- "withdrawn", "isolated", "depressed mood" → Depression/Social Isolation
- "wound", "skin breakdown", "pressure sore" → Impaired Skin Integrity (Medical)
- "weight loss", "poor appetite" → Nutritional Deficiency (Medical)
- "confusion", "memory issues" → Cognitive Impairment (Medical/Functional)

OUTPUT FORMAT (JSON):
Return a JSON object with a "problems" array. Each problem should have:
{
  "problems": [
    {
      "title": "Problem title",
      "category": "Medical|Behavioral|Functional|Social|Other",
      "description": "Description with reference to notes",
      "diagnosisCode": "ICD-10 code if applicable (optional)",
      "onsetDate": "ISO date string if known (optional)"
    }
  ]
}

Return ONLY valid JSON, no additional text.`;

  const userPrompt = `Analyze the following progress notes and identify NEW care plan problems or problem indicators:

Resident: ${residentName || "Resident"}
Resident ID: ${residentId}

Progress Notes:
${notesText}

Identify any NEW problems that should be added to the care plan. Return the problems as a JSON object with a "problems" array.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(aiResponse);

    // Validate and clean problems
    const problems = Array.isArray(parsed.problems) ? parsed.problems : [];
    const validatedProblems = problems
      .filter((p) => p.title && p.category)
      .map((p) => ({
        title: p.title.trim(),
        category: p.category,
        description: p.description?.trim() || null,
        diagnosisCode: p.diagnosisCode?.trim() || null,
        onsetDate: p.onsetDate ? new Date(p.onsetDate) : null,
      }));

    return validatedProblems;
  } catch (error) {
    console.error("[CARE_PLAN_AI] Error detecting problems from notes:", error);
    throw new Error(
      `Failed to detect problems: ${error.message || "AI service unavailable"}`
    );
  }
}

/**
 * Suggest care plan updates based on recent data
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - User requesting suggestions
 * @returns {Promise<Object>} Suggested updates
 */
async function suggestCarePlanUpdates(carePlanId, requestingUser) {
  // Get care plan
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  // Get recent progress notes (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentNotes = await prisma.note.findMany({
    where: {
      residentId: carePlan.residentId,
      tenantId: carePlan.tenantId,
      deletedAt: null,
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      id: true,
      type: true,
      description: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20, // Limit to most recent 20 notes
  });

  // Get current problems
  const currentProblems = carePlan.problems || [];

  // Format data for AI
  const problemsText = formatCarePlanForAI(carePlan);
  const notesText = formatNotesForAI(recentNotes);

  // AI prompt for suggestions
  const systemPrompt = `You are a clinical care plan specialist for assisted living facilities (AFH). Your task is to analyze a care plan and recent progress notes to suggest updates.

IMPORTANT GUIDELINES:
1. Suggest NEW problems that should be added
2. Suggest updates to existing goals (status changes, new goals)
3. Suggest new interventions based on recent notes
4. Identify goals that may need adjustment
5. Be specific and actionable
6. Only suggest changes that are clearly supported by the data

OUTPUT FORMAT (JSON):
Return a JSON object with:
{
  "newProblems": [
    {
      "title": "Problem title",
      "category": "Medical|Behavioral|Functional|Social|Other",
      "description": "Description",
      "diagnosisCode": "ICD-10 code if applicable (optional)"
    }
  ],
  "goalUpdates": [
    {
      "goalId": "goal ID if updating existing goal",
      "problemId": "problem ID",
      "suggestion": "What to update (e.g., 'Mark as Achieved', 'Add new goal')",
      "newGoalDescription": "New goal description if adding new goal"
    }
  ],
  "interventionSuggestions": [
    {
      "goalId": "goal ID",
      "problemId": "problem ID",
      "suggestion": "Intervention description"
    }
  ],
  "summary": "Brief summary of suggested updates"
}

Return ONLY valid JSON, no additional text.`;

  const userPrompt = `Analyze the following care plan and recent progress notes to suggest updates:

Current Care Plan:
${problemsText}

Recent Progress Notes (last 30 days):
${notesText}

Suggest updates to the care plan based on recent data. Return suggestions as a JSON object.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(aiResponse);

    return {
      newProblems: parsed.newProblems || [],
      goalUpdates: parsed.goalUpdates || [],
      interventionSuggestions: parsed.interventionSuggestions || [],
      summary: parsed.summary || "No specific updates suggested.",
    };
  } catch (error) {
    console.error("[CARE_PLAN_AI] Error suggesting updates:", error);
    throw new Error(
      `Failed to suggest updates: ${error.message || "AI service unavailable"}`
    );
  }
}

/**
 * Generate care plan draft from assessment data
 * @param {string} residentId - Resident ID
 * @param {Object} assessmentData - Assessment form data
 * @param {Object} requestingUser - User requesting generation
 * @returns {Promise<Object>} Generated care plan draft structure
 */
async function generateCarePlanDraft(
  residentId,
  assessmentData,
  requestingUser
) {
  // Validate resident access
  let tenantId = requestingUser.tenantId;
  if (requestingUser.role === "SUPER_ADMIN") {
    if (!assessmentData.tenantId) {
      throw new Error(
        "tenantId is required when generating draft as SUPER_ADMIN"
      );
    }
    tenantId = assessmentData.tenantId;
  }

  await validateResidentId(residentId, tenantId);

  // Get resident name
  const residentName = await getResidentName(residentId, tenantId);

  // Format assessment data for AI
  const assessmentText = formatAssessmentDataForAI(assessmentData);

  // AI prompt for care plan generation
  const systemPrompt = `You are a clinical care plan specialist for assisted living facilities (AFH). Your task is to generate a complete care plan draft based on assessment data.

IMPORTANT GUIDELINES:
1. Create a comprehensive care plan with problems, goals, and interventions
2. Each problem should have at least one goal
3. Each goal should have at least one intervention
4. Use standard medical terminology and diagnosis codes
5. Make goals measurable and specific
6. Make interventions actionable and specific
7. Categorize problems appropriately

OUTPUT FORMAT (JSON):
Return a JSON object with:
{
  "title": "Care plan title (optional)",
  "description": "Overall care plan description (optional)",
  "problems": [
    {
      "title": "Problem title",
      "category": "Medical|Behavioral|Functional|Social|Other",
      "description": "Problem description",
      "diagnosisCode": "ICD-10 code if applicable (optional)",
      "goals": [
        {
          "description": "Measurable goal description",
          "status": "InProgress",
          "targetDate": "ISO date string (optional)",
          "interventions": [
            {
              "description": "Specific intervention description",
              "frequency": "Daily|TwiceDaily|Weekly|PRN|AsNeeded|Custom",
              "customFrequency": "Custom frequency if frequency is Custom (optional)",
              "responsibleRole": "Caregiver|Nurse (optional)"
            }
          ]
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no additional text.`;

  const userPrompt = `Generate a complete care plan draft based on the following assessment data:

Resident: ${residentName || "Resident"}
Resident ID: ${residentId}

Assessment Data:
${assessmentText}

Generate a comprehensive care plan with problems, goals, and interventions. Return the care plan as a JSON object.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(aiResponse);

    // Validate and structure the draft
    const draft = {
      title: parsed.title?.trim() || null,
      description: parsed.description?.trim() || null,
      problems: Array.isArray(parsed.problems)
        ? parsed.problems.map((problem) => ({
            title: problem.title?.trim() || "Untitled Problem",
            category: problem.category || "Medical",
            description: problem.description?.trim() || null,
            diagnosisCode: problem.diagnosisCode?.trim() || null,
            goals: Array.isArray(problem.goals)
              ? problem.goals.map((goal) => ({
                  description: goal.description?.trim() || "Untitled Goal",
                  status: goal.status || "InProgress",
                  targetDate: goal.targetDate
                    ? new Date(goal.targetDate)
                    : null,
                  interventions: Array.isArray(goal.interventions)
                    ? goal.interventions.map((intervention) => ({
                        description:
                          intervention.description?.trim() ||
                          "Untitled Intervention",
                        frequency: intervention.frequency || "Daily",
                        customFrequency:
                          intervention.customFrequency?.trim() || null,
                        responsibleRole:
                          intervention.responsibleRole?.trim() || null,
                      }))
                    : [],
                }))
              : [],
          }))
        : [],
    };

    return draft;
  } catch (error) {
    console.error("[CARE_PLAN_AI] Error generating draft:", error);
    throw new Error(
      `Failed to generate care plan draft: ${
        error.message || "AI service unavailable"
      }`
    );
  }
}

/**
 * Format assessment data for AI prompt
 * @param {Object} assessmentData - Assessment form data
 * @returns {string} Formatted text
 */
function formatAssessmentDataForAI(assessmentData) {
  if (!assessmentData || typeof assessmentData !== "object") {
    return "No assessment data provided.";
  }

  // Convert object to readable text
  let text = "";
  for (const [key, value] of Object.entries(assessmentData)) {
    if (value !== null && value !== undefined && value !== "") {
      // Skip metadata fields
      if (
        [
          "id",
          "tenant_id",
          "user_id",
          "form_id",
          "created_at",
          "updated_at",
          "tenantId",
          "userId",
          "formId",
          "createdAt",
          "updatedAt",
        ].includes(key)
      ) {
        continue;
      }

      const keyLabel = key
        .replace(/_/g, " ")
        .replace(/([A-Z])/g, " $1")
        .trim();
      text += `${keyLabel}: ${value}\n`;
    }
  }

  return text || "No assessment data available.";
}

/**
 * Format progress notes for AI prompt
 * @param {Array} notes - Array of note objects
 * @returns {string} Formatted text
 */
function formatNotesForAI(notes) {
  if (!notes || notes.length === 0) {
    return "No progress notes available.";
  }

  let text = `Total Notes: ${notes.length}\n\n`;

  notes.forEach((note, index) => {
    text += `Note ${index + 1}:\n`;
    text += `  Type: ${note.type}\n`;
    text += `  Date: ${new Date(note.createdAt).toLocaleDateString()}\n`;
    text += `  Description: ${note.description}\n\n`;
  });

  return text;
}

/**
 * Format care plan for AI prompt
 * @param {Object} carePlan - Care plan object
 * @returns {string} Formatted text
 */
function formatCarePlanForAI(carePlan) {
  if (!carePlan) {
    return "No care plan data available.";
  }

  let text = `Care Plan: ${carePlan.title || "Untitled"}\n`;
  text += `Status: ${carePlan.status}\n`;
  if (carePlan.description) {
    text += `Description: ${carePlan.description}\n`;
  }
  text += `\nProblems:\n`;

  if (carePlan.problems && carePlan.problems.length > 0) {
    carePlan.problems.forEach((problem, pIndex) => {
      text += `\n${pIndex + 1}. ${problem.title} (${problem.category})\n`;
      if (problem.description) {
        text += `   Description: ${problem.description}\n`;
      }
      if (problem.diagnosisCode) {
        text += `   Diagnosis Code: ${problem.diagnosisCode}\n`;
      }

      if (problem.goals && problem.goals.length > 0) {
        text += `   Goals:\n`;
        problem.goals.forEach((goal, gIndex) => {
          text += `     ${gIndex + 1}. ${goal.description} (Status: ${
            goal.status
          })\n`;
          if (goal.interventions && goal.interventions.length > 0) {
            text += `       Interventions:\n`;
            goal.interventions.forEach((intervention, iIndex) => {
              text += `         ${iIndex + 1}. ${intervention.description} (${
                intervention.frequency
              })\n`;
            });
          }
        });
      }
    });
  } else {
    text += "No problems defined.\n";
  }

  return text;
}

module.exports = {
  detectProblemsFromAssessment,
  detectProblemsFromProgressNotes,
  suggestCarePlanUpdates,
  generateCarePlanDraft,
};

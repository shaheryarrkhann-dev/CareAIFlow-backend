const prisma = require("../../lib/prisma");
const { getCarePlanById } = require("./care-plan.service");
const { logCarePlanAction } = require("../compliance/audit.service");

/**
 * Build problems snapshot from care plan
 * Creates a JSON structure with all problems, goals, and interventions
 * @param {Object} carePlan - Care plan with problems, goals, and interventions
 * @returns {Array} Problems snapshot array
 */
function buildProblemsSnapshot(carePlan) {
  if (!carePlan.problems || carePlan.problems.length === 0) {
    return [];
  }

  return carePlan.problems.map((problem) => ({
    id: problem.id,
    title: problem.title,
    category: problem.category,
    description: problem.description,
    diagnosisCode: problem.diagnosisCode,
    onsetDate: problem.onsetDate,
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    goals: (problem.goals || []).map((goal) => ({
      id: goal.id,
      description: goal.description,
      status: goal.status,
      targetDate: goal.targetDate,
      achievedDate: goal.achievedDate,
      evaluationNotes: goal.evaluationNotes,
      lastEvaluatedAt: goal.lastEvaluatedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      interventions: (goal.interventions || []).map((intervention) => ({
        id: intervention.id,
        description: intervention.description,
        frequency: intervention.frequency,
        customFrequency: intervention.customFrequency,
        timesPerDay: intervention.timesPerDay,
        timeSlots: intervention.timeSlots,
        responsibleRole: intervention.responsibleRole,
        responsibleStaffId: intervention.responsibleStaffId,
        medicationId: intervention.medicationId,
        noteId: intervention.noteId,
        createdAt: intervention.createdAt,
        updatedAt: intervention.updatedAt,
      })),
    })),
  }));
}

/**
 * Create version snapshot for care plan
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - User creating the version
 * @param {string} changeSummary - Optional summary of changes
 * @returns {Promise<Object>} Created version
 */
async function createVersion(carePlanId, requestingUser, changeSummary = null) {
  // Get full care plan with all relations
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  // Calculate new version number
  const newVersion = carePlan.currentVersion + 1;

  // Build problems snapshot
  const problemsSnapshot = buildProblemsSnapshot(carePlan);

  // Get approver name if approvedBy is set
  let approvedByName = carePlan.approvedByName || null;
  if (carePlan.approvedBy && !approvedByName) {
    const approver = await prisma.user.findUnique({
      where: { id: carePlan.approvedBy },
      select: { name: true },
    });
    approvedByName = approver?.name || null;
  }

  // Create version record
  const version = await prisma.carePlanVersion.create({
    data: {
      carePlanId: carePlan.id,
      version: newVersion,
      // Full snapshot of care plan fields
      residentId: carePlan.residentId,
      residentName: carePlan.residentName,
      tenantId: carePlan.tenantId,
      status: carePlan.status,
      title: carePlan.title,
      description: carePlan.description,
      lastReviewedAt: carePlan.lastReviewedAt,
      nextReviewDate: carePlan.nextReviewDate,
      reviewIntervalDays: carePlan.reviewIntervalDays,
      approvedBy: carePlan.approvedBy,
      approvedAt: carePlan.approvedAt,
      approvedByName: approvedByName,
      // Full snapshot of problems, goals, and interventions
      problemsSnapshot: problemsSnapshot,
      // Change summary
      changeSummary: changeSummary || null,
      // Who created this version
      createdBy: requestingUser.id,
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      carePlan: {
        select: {
          id: true,
          residentId: true,
          tenantId: true,
        },
      },
    },
  });

  // Update care plan's currentVersion
  await prisma.carePlan.update({
    where: { id: carePlanId },
    data: {
      currentVersion: newVersion,
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_VERSION_CREATED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      versionId: version.id,
      version: newVersion,
      changeSummary: changeSummary,
      residentId: carePlan.residentId,
    },
  });

  return version;
}

/**
 * Get all versions for a care plan
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Array>} Array of versions
 */
async function getVersions(carePlanId, requestingUser) {
  // Validate care plan access
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  // Get all versions
  const versions = await prisma.carePlanVersion.findMany({
    where: {
      carePlanId: carePlanId,
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
    orderBy: {
      version: "desc", // Latest version first
    },
  });

  return versions;
}

/**
 * Get specific version by ID
 * @param {string} versionId - Version ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Version with full snapshot
 */
async function getVersionById(versionId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role !== "SUPER_ADMIN") {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Get version
  const version = await prisma.carePlanVersion.findFirst({
    where: {
      id: versionId,
      carePlan: {
        ...tenantWhere,
        deletedAt: null,
      },
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      carePlan: {
        select: {
          id: true,
          residentId: true,
          tenantId: true,
          status: true,
        },
      },
    },
  });

  if (!version) {
    throw new Error("Version not found or access denied");
  }

  return version;
}

/**
 * Compare two versions
 * @param {string} versionId1 - First version ID
 * @param {string} versionId2 - Second version ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Comparison result
 */
async function compareVersions(versionId1, versionId2, requestingUser) {
  // Get both versions
  const [version1, version2] = await Promise.all([
    getVersionById(versionId1, requestingUser),
    getVersionById(versionId2, requestingUser),
  ]);

  // Ensure both versions belong to the same care plan
  if (version1.carePlanId !== version2.carePlanId) {
    throw new Error("Cannot compare versions from different care plans");
  }

  // Determine which version is older
  const olderVersion =
    version1.version < version2.version ? version1 : version2;
  const newerVersion =
    version1.version < version2.version ? version2 : version1;

  // Compare care plan fields
  const fieldChanges = {};
  const fieldsToCompare = [
    "status",
    "title",
    "description",
    "lastReviewedAt",
    "nextReviewDate",
    "reviewIntervalDays",
    "approvedBy",
    "approvedAt",
    "approvedByName",
  ];

  fieldsToCompare.forEach((field) => {
    const oldValue = olderVersion[field];
    const newValue = newerVersion[field];

    // Handle date comparison
    if (field.includes("Date") || field.includes("At")) {
      const oldDate = oldValue ? new Date(oldValue).toISOString() : null;
      const newDate = newValue ? new Date(newValue).toISOString() : null;
      if (oldDate !== newDate) {
        fieldChanges[field] = {
          old: oldValue,
          new: newValue,
        };
      }
    } else {
      if (oldValue !== newValue) {
        fieldChanges[field] = {
          old: oldValue,
          new: newValue,
        };
      }
    }
  });

  // Compare problems snapshots
  const problems1 = olderVersion.problemsSnapshot || [];
  const problems2 = newerVersion.problemsSnapshot || [];

  // Find added, removed, and modified problems
  const problemIds1 = new Set(problems1.map((p) => p.id));
  const problemIds2 = new Set(problems2.map((p) => p.id));

  const addedProblems = problems2.filter((p) => !problemIds1.has(p.id));
  const removedProblems = problems1.filter((p) => !problemIds2.has(p.id));

  // Find modified problems
  const modifiedProblems = [];
  problems1.forEach((problem1) => {
    const problem2 = problems2.find((p) => p.id === problem1.id);
    if (problem2) {
      // Compare problem fields
      const problemChanges = {};
      if (problem1.title !== problem2.title) {
        problemChanges.title = { old: problem1.title, new: problem2.title };
      }
      if (problem1.category !== problem2.category) {
        problemChanges.category = {
          old: problem1.category,
          new: problem2.category,
        };
      }
      if (problem1.description !== problem2.description) {
        problemChanges.description = {
          old: problem1.description,
          new: problem2.description,
        };
      }
      if (problem1.diagnosisCode !== problem2.diagnosisCode) {
        problemChanges.diagnosisCode = {
          old: problem1.diagnosisCode,
          new: problem2.diagnosisCode,
        };
      }

      // Compare goals
      const goals1 = problem1.goals || [];
      const goals2 = problem2.goals || [];
      const goalIds1 = new Set(goals1.map((g) => g.id));
      const goalIds2 = new Set(goals2.map((g) => g.id));

      const addedGoals = goals2.filter((g) => !goalIds1.has(g.id));
      const removedGoals = goals1.filter((g) => !goalIds2.has(g.id));

      // Find modified goals
      const modifiedGoals = [];
      goals1.forEach((goal1) => {
        const goal2 = goals2.find((g) => g.id === goal1.id);
        if (goal2) {
          const goalChanges = {};
          if (goal1.description !== goal2.description) {
            goalChanges.description = {
              old: goal1.description,
              new: goal2.description,
            };
          }
          if (goal1.status !== goal2.status) {
            goalChanges.status = { old: goal1.status, new: goal2.status };
          }
          if (goal1.targetDate !== goal2.targetDate) {
            goalChanges.targetDate = {
              old: goal1.targetDate,
              new: goal2.targetDate,
            };
          }

          // Compare interventions
          const interventions1 = goal1.interventions || [];
          const interventions2 = goal2.interventions || [];
          const interventionIds1 = new Set(interventions1.map((i) => i.id));
          const interventionIds2 = new Set(interventions2.map((i) => i.id));

          const addedInterventions = interventions2.filter(
            (i) => !interventionIds1.has(i.id)
          );
          const removedInterventions = interventions1.filter(
            (i) => !interventionIds2.has(i.id)
          );

          if (
            Object.keys(goalChanges).length > 0 ||
            addedInterventions.length > 0 ||
            removedInterventions.length > 0
          ) {
            modifiedGoals.push({
              id: goal1.id,
              changes: goalChanges,
              addedInterventions,
              removedInterventions,
            });
          }
        }
      });

      if (
        Object.keys(problemChanges).length > 0 ||
        addedGoals.length > 0 ||
        removedGoals.length > 0 ||
        modifiedGoals.length > 0
      ) {
        modifiedProblems.push({
          id: problem1.id,
          title: problem1.title,
          changes: problemChanges,
          addedGoals,
          removedGoals,
          modifiedGoals,
        });
      }
    }
  });

  return {
    olderVersion: {
      id: olderVersion.id,
      version: olderVersion.version,
      createdAt: olderVersion.createdAt,
      createdBy: olderVersion.creator,
      changeSummary: olderVersion.changeSummary,
    },
    newerVersion: {
      id: newerVersion.id,
      version: newerVersion.version,
      createdAt: newerVersion.createdAt,
      createdBy: newerVersion.creator,
      changeSummary: newerVersion.changeSummary,
    },
    fieldChanges,
    problems: {
      added: addedProblems,
      removed: removedProblems,
      modified: modifiedProblems,
    },
  };
}

/**
 * Rollback care plan to a specific version
 * @param {string} carePlanId - Care plan ID
 * @param {string} versionId - Version ID to rollback to
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated care plan
 */
async function rollbackToVersion(carePlanId, versionId, requestingUser) {
  // Validate care plan access
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  // Get version to rollback to
  const targetVersion = await getVersionById(versionId, requestingUser);

  // Ensure version belongs to this care plan
  if (targetVersion.carePlanId !== carePlanId) {
    throw new Error("Version does not belong to this care plan");
  }

  // Check permissions - only ADMIN and SUPER_ADMIN can rollback
  if (requestingUser.role === "STAFF" || requestingUser.role === "GUARDIAN") {
    throw new Error("You do not have permission to rollback care plans");
  }

  // Get current problems to soft delete them
  const currentProblems = await prisma.carePlanProblem.findMany({
    where: {
      carePlanId: carePlanId,
      deletedAt: null,
    },
    include: {
      goals: {
        include: {
          interventions: true,
        },
      },
    },
  });

  // Soft delete all current problems, goals, and interventions
  for (const problem of currentProblems) {
    // Soft delete interventions
    if (problem.goals && problem.goals.length > 0) {
      const goalIds = problem.goals.map((g) => g.id);
      await prisma.carePlanIntervention.updateMany({
        where: {
          goalId: { in: goalIds },
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }

    // Soft delete goals
    await prisma.carePlanGoal.updateMany({
      where: {
        problemId: problem.id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // Soft delete problems
  await prisma.carePlanProblem.updateMany({
    where: {
      carePlanId: carePlanId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  // Restore care plan fields from version
  await prisma.carePlan.update({
    where: { id: carePlanId },
    data: {
      status: targetVersion.status,
      title: targetVersion.title,
      description: targetVersion.description,
      lastReviewedAt: targetVersion.lastReviewedAt,
      nextReviewDate: targetVersion.nextReviewDate,
      reviewIntervalDays: targetVersion.reviewIntervalDays,
      approvedBy: targetVersion.approvedBy,
      approvedAt: targetVersion.approvedAt,
      approvedByName: targetVersion.approvedByName,
    },
  });

  // Restore problems, goals, and interventions from snapshot
  const problemsSnapshot = targetVersion.problemsSnapshot || [];
  for (const problemData of problemsSnapshot) {
    // Create problem
    const problem = await prisma.carePlanProblem.create({
      data: {
        carePlanId: carePlanId,
        title: problemData.title,
        category: problemData.category,
        description: problemData.description,
        diagnosisCode: problemData.diagnosisCode,
        onsetDate: problemData.onsetDate
          ? new Date(problemData.onsetDate)
          : null,
      },
    });

    // Create goals for this problem
    const goals = problemData.goals || [];
    for (const goalData of goals) {
      const goal = await prisma.carePlanGoal.create({
        data: {
          problemId: problem.id,
          description: goalData.description,
          status: goalData.status,
          targetDate: goalData.targetDate
            ? new Date(goalData.targetDate)
            : null,
          achievedDate: goalData.achievedDate
            ? new Date(goalData.achievedDate)
            : null,
          evaluationNotes: goalData.evaluationNotes,
          lastEvaluatedAt: goalData.lastEvaluatedAt
            ? new Date(goalData.lastEvaluatedAt)
            : null,
        },
      });

      // Create interventions for this goal
      const interventions = goalData.interventions || [];
      for (const interventionData of interventions) {
        await prisma.carePlanIntervention.create({
          data: {
            goalId: goal.id,
            description: interventionData.description,
            frequency: interventionData.frequency,
            customFrequency: interventionData.customFrequency,
            timesPerDay: interventionData.timesPerDay,
            timeSlots: interventionData.timeSlots,
            responsibleRole: interventionData.responsibleRole,
            responsibleStaffId: interventionData.responsibleStaffId,
            medicationId: interventionData.medicationId,
            noteId: interventionData.noteId,
          },
        });
      }
    }
  }

  // Create a new version for the rollback
  const rollbackVersion = await createVersion(
    carePlanId,
    requestingUser,
    `Rollback to version ${targetVersion.version}`
  );

  // Get updated care plan
  const updatedCarePlan = await getCarePlanById(carePlanId, requestingUser);

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_UPDATED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      action: "rollback",
      rollbackToVersion: targetVersion.version,
      rollbackVersionId: rollbackVersion.id,
      residentId: carePlan.residentId,
    },
  });

  return updatedCarePlan;
}

module.exports = {
  createVersion,
  getVersions,
  getVersionById,
  compareVersions,
  rollbackToVersion,
  buildProblemsSnapshot,
};

const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");
const { logCarePlanAction } = require("../compliance/audit.service");
// Lazy load createVersion to avoid circular dependency
let createVersion;
function getCreateVersion() {
  if (!createVersion) {
    const versionService = require("./care-plan-version.service");
    createVersion = versionService.createVersion;
  }
  return createVersion;
}

/**
 * Get resident name from residentId
 * Fetches from Resident model
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string|null>} Resident name or null if not found
 */
async function getResidentName(residentId, tenantId) {
  try {
    const user = { tenantId, role: "ADMIN" };
    const resident = await getResidentById(residentId, user);
    return resident.name || null;
  } catch (error) {
    console.warn(
      `[CARE_PLAN] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Validate resident access and tenant isolation
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<boolean>} True if access is valid
 */
async function validateResidentAccess(residentId, tenantId, requestingUser) {
  // Validate resident exists and belongs to tenant
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error(
      "Resident not found or does not belong to your organization"
    );
  }

  // Check tenant access
  if (requestingUser.role !== "SUPER_ADMIN") {
    if (requestingUser.tenantId !== tenantId) {
      throw new Error("Access denied. You do not have access to this tenant.");
    }
  }

  return true;
}

/**
 * Create new care plan
 * @param {string} residentId - Resident ID
 * @param {Object} data - Care plan data
 * @param {Object} requestingUser - User creating the care plan
 * @returns {Promise<Object>} Created care plan
 */
async function createCarePlan(residentId, data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when creating care plan as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to create care plans");
    }
  }

  // Validate resident access
  await validateResidentAccess(residentId, tenantId, requestingUser);

  // Get resident name
  const residentName = await getResidentName(residentId, tenantId);

  // Calculate next review date if reviewIntervalDays is provided
  let nextReviewDate = null;
  if (data.reviewIntervalDays) {
    const reviewInterval = parseInt(data.reviewIntervalDays) || 30;
    nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + reviewInterval);
  } else if (data.nextReviewDate) {
    nextReviewDate = new Date(data.nextReviewDate);
  }

  // Create care plan
  const carePlan = await prisma.carePlan.create({
    data: {
      residentId: residentId.trim(),
      residentName: residentName,
      tenantId,
      status: data.status || "Draft",
      title: data.title?.trim() || null,
      description: data.description?.trim() || null,
      lastReviewedAt: data.lastReviewedAt
        ? new Date(data.lastReviewedAt)
        : null,
      nextReviewDate: nextReviewDate,
      reviewIntervalDays: data.reviewIntervalDays
        ? parseInt(data.reviewIntervalDays)
        : 30,
      approvedBy: data.approvedBy || null,
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : null,
      approvedByName: data.approvedByName || null,
      createdBy: requestingUser.id,
      currentVersion: 0,
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      problems: {
        where: {
          deletedAt: null,
        },
        include: {
          goals: {
            where: {
              deletedAt: null,
            },
            include: {
              interventions: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_CREATED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      residentId: carePlan.residentId,
      status: carePlan.status,
      title: carePlan.title,
    },
  });

  // Create version 0 (initial snapshot)
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      "Initial care plan creation"
    );
  } catch (error) {
    console.error("[CARE_PLAN] Failed to create initial version:", error);
    // Don't fail the creation if version creation fails
  }

  // Fetch care plan again to include version info
  return await getCarePlanById(carePlan.id, requestingUser);
}

/**
 * Get care plans with filtering
 * @param {Object} filters - Filter options
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Care plans with pagination
 */
async function getCarePlans(filters, requestingUser) {
  // Determine tenantId
  let tenantId = null;
  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = filters.tenantId || null; // null means all tenants
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      return {
        carePlans: [],
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 50,
          total: 0,
          totalPages: 0,
        },
      };
    }
  }

  // Build tenant filter
  const tenantWhere = tenantId ? { tenantId } : {};

  // Pagination
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 50));
  const skip = (page - 1) * limit;

  // Extract filters
  const { residentId, status, createdBy, dateFrom, dateTo } = filters;

  // Build date filter
  const dateFilter = {};
  if (dateFrom) {
    dateFilter.gte = new Date(dateFrom);
  }
  if (dateTo) {
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);
    dateFilter.lte = endDate;
  }

  // Build where clause
  const where = {
    ...tenantWhere,
    deletedAt: null, // Only non-deleted care plans
    ...(residentId && { residentId }),
    ...(status && { status }),
    ...(createdBy && { createdBy }),
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
  };

  // Execute query with pagination
  const [carePlans, total] = await Promise.all([
    prisma.carePlan.findMany({
      where,
      skip,
      take: limit,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        problems: {
          where: {
            deletedAt: null,
          },
          include: {
            goals: {
              where: {
                deletedAt: null,
              },
              include: {
                interventions: {
                  where: {
                    deletedAt: null,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        _count: {
          select: {
            problems: {
              where: {
                deletedAt: null,
              },
            },
            alerts: {
              where: {
                isDismissed: false,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.carePlan.count({ where }),
  ]);

  // Populate residentName dynamically (don't save to DB)
  const carePlansWithNames = await Promise.all(
    carePlans.map(async (plan) => {
      const residentName = await getResidentName(
        plan.residentId,
        plan.tenantId
      );
      plan.residentName = residentName || plan.residentName;
      return plan;
    })
  );

  return {
    carePlans: carePlansWithNames,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get care plan by ID
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Care plan with all relations
 */
async function getCarePlanById(carePlanId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: carePlanId,
    ...tenantWhere,
    deletedAt: null, // Only non-deleted care plans
  };

  // Debug logging
  console.log("getCarePlanById query:", {
    carePlanId,
    tenantWhere,
    userRole: requestingUser.role,
    userTenantId: requestingUser.tenantId,
  });

  const carePlan = await prisma.carePlan.findFirst({
    where,
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      problems: {
        where: {
          deletedAt: null,
        },
        include: {
          goals: {
            where: {
              deletedAt: null,
            },
            include: {
              interventions: {
                where: {
                  deletedAt: null,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      alerts: {
        where: {
          isDismissed: false,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      _count: {
        select: {
          problems: {
            where: {
              deletedAt: null,
            },
          },
          versions: true,
          alerts: {
            where: {
              isDismissed: false,
            },
          },
        },
      },
    },
  });

  if (!carePlan) {
    // Check if care plan exists but belongs to different tenant or is deleted
    const existsCheck = await prisma.carePlan.findFirst({
      where: { id: carePlanId },
      select: { id: true, tenantId: true, deletedAt: true },
    });

    if (!existsCheck) {
      throw new Error("Care plan not found");
    } else if (existsCheck.deletedAt) {
      throw new Error("Care plan has been archived");
    } else if (
      requestingUser.role !== "SUPER_ADMIN" &&
      existsCheck.tenantId !== requestingUser.tenantId
    ) {
      throw new Error("Care plan not found or access denied");
    } else {
      throw new Error("Care plan not found or access denied");
    }
  }

  // Populate residentName dynamically
  const residentName = await getResidentName(
    carePlan.residentId,
    carePlan.tenantId
  );
  carePlan.residentName = residentName || carePlan.residentName;

  return carePlan;
}

/**
 * Update care plan
 * Note: Version creation will be handled in Phase 4 (Version Control)
 * @param {string} carePlanId - Care plan ID
 * @param {Object} data - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated care plan
 */
async function updateCarePlan(carePlanId, data, requestingUser) {
  // Get existing care plan
  const existingPlan = await getCarePlanById(carePlanId, requestingUser);

  // Check permissions
  // STAFF can edit care plans in their tenant
  // ADMIN can edit any care plan in their tenant
  // SUPER_ADMIN can edit any care plan
  if (
    requestingUser.role === "STAFF" &&
    existingPlan.createdBy !== requestingUser.id
  ) {
    // STAFF can edit care plans created by others in their tenant (per requirements)
    // This is allowed per the requirements table showing all roles can create/edit
  }

  // Prepare update data
  const updateData = {};

  if (data.status !== undefined) {
    updateData.status = data.status;
  }
  if (data.title !== undefined) {
    updateData.title = data.title?.trim() || null;
  }
  if (data.description !== undefined) {
    updateData.description = data.description?.trim() || null;
  }
  if (data.lastReviewedAt !== undefined) {
    updateData.lastReviewedAt = data.lastReviewedAt
      ? new Date(data.lastReviewedAt)
      : null;
  }
  if (data.nextReviewDate !== undefined) {
    updateData.nextReviewDate = data.nextReviewDate
      ? new Date(data.nextReviewDate)
      : null;
  }
  if (data.reviewIntervalDays !== undefined) {
    updateData.reviewIntervalDays = data.reviewIntervalDays
      ? parseInt(data.reviewIntervalDays)
      : null;
  }
  if (data.approvedBy !== undefined) {
    updateData.approvedBy = data.approvedBy || null;
  }
  if (data.approvedAt !== undefined) {
    updateData.approvedAt = data.approvedAt ? new Date(data.approvedAt) : null;
  }
  if (data.approvedByName !== undefined) {
    updateData.approvedByName = data.approvedByName || null;
  }

  // Update care plan
  const updatedPlan = await prisma.carePlan.update({
    where: { id: carePlanId },
    data: updateData,
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      problems: {
        where: {
          deletedAt: null,
        },
        include: {
          goals: {
            where: {
              deletedAt: null,
            },
            include: {
              interventions: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_UPDATED",
    userId: requestingUser.id,
    tenantId: updatedPlan.tenantId,
    resourceId: updatedPlan.id,
    req: null,
    metadata: {
      residentId: updatedPlan.residentId,
      status: updatedPlan.status,
      changes: Object.keys(updateData),
    },
  });

  // Create new version snapshot
  try {
    const changeSummary = `Updated care plan fields: ${Object.keys(
      updateData
    ).join(", ")}`;
    await getCreateVersion()(updatedPlan.id, requestingUser, changeSummary);
  } catch (error) {
    console.error("[CARE_PLAN] Failed to create version after update:", error);
    // Don't fail the update if version creation fails
  }

  // Fetch updated plan again to include latest version info
  return await getCarePlanById(updatedPlan.id, requestingUser);
}

/**
 * Archive care plan (soft delete)
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Archived care plan
 */
async function archiveCarePlan(carePlanId, requestingUser) {
  // Get existing care plan
  const existingPlan = await getCarePlanById(carePlanId, requestingUser);

  // Check permissions - only administrators can archive
  if (requestingUser.role === "STAFF" || requestingUser.role === "GUARDIAN") {
    throw new Error("Only an administrator can delete this.");
  }

  // Archive care plan (soft delete)
  const archivedPlan = await prisma.carePlan.update({
    where: { id: carePlanId },
    data: {
      status: "Archived",
      deletedAt: new Date(),
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_ARCHIVED",
    userId: requestingUser.id,
    tenantId: archivedPlan.tenantId,
    resourceId: archivedPlan.id,
    req: null,
    metadata: {
      residentId: archivedPlan.residentId,
    },
  });

  return archivedPlan;
}

/**
 * Get active care plan for resident
 * @param {string} residentId - Resident ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object|null>} Active care plan or null
 */
async function getActiveCarePlan(residentId, requestingUser) {
  // Determine tenantId
  let tenantId = null;
  if (requestingUser.role === "SUPER_ADMIN") {
    // For SUPER_ADMIN, we need tenantId - try to get from resident
    // This is a limitation - SUPER_ADMIN needs to provide tenantId
    throw new Error(
      "tenantId is required when getting active care plan as SUPER_ADMIN"
    );
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to get care plans");
    }
  }

  // Validate resident access
  await validateResidentAccess(residentId, tenantId, requestingUser);

  // Find active care plan
  const activePlan = await prisma.carePlan.findFirst({
    where: {
      residentId: residentId.trim(),
      tenantId,
      status: "Active",
      deletedAt: null,
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      problems: {
        where: {
          deletedAt: null,
        },
        include: {
          goals: {
            where: {
              deletedAt: null,
            },
            include: {
              interventions: {
                where: {
                  deletedAt: null,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      alerts: {
        where: {
          isDismissed: false,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (activePlan) {
    // Populate residentName dynamically
    const residentName = await getResidentName(
      activePlan.residentId,
      activePlan.tenantId
    );
    activePlan.residentName = residentName || activePlan.residentName;
  }

  return activePlan;
}

// ============================================
// Phase 3: Problem, Goal & Intervention Management
// ============================================

/**
 * Validate that problem belongs to care plan and user has access
 * @param {string} problemId - Problem ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Problem with care plan info
 */
async function validateProblemAccess(problemId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role !== "SUPER_ADMIN") {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  const problem = await prisma.carePlanProblem.findFirst({
    where: {
      id: problemId,
      deletedAt: null,
      carePlan: {
        ...tenantWhere,
        deletedAt: null,
      },
    },
    include: {
      carePlan: {
        select: {
          id: true,
          tenantId: true,
          residentId: true,
          status: true,
        },
      },
    },
  });

  if (!problem) {
    throw new Error("Problem not found or access denied");
  }

  return problem;
}

/**
 * Validate that goal belongs to problem and user has access
 * @param {string} goalId - Goal ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Goal with problem and care plan info
 */
async function validateGoalAccess(goalId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role !== "SUPER_ADMIN") {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  const goal = await prisma.carePlanGoal.findFirst({
    where: {
      id: goalId,
      deletedAt: null,
      problem: {
        deletedAt: null,
        carePlan: {
          ...tenantWhere,
          deletedAt: null,
        },
      },
    },
    include: {
      problem: {
        include: {
          carePlan: {
            select: {
              id: true,
              tenantId: true,
              residentId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!goal) {
    throw new Error("Goal not found or access denied");
  }

  return goal;
}

/**
 * Validate that intervention belongs to goal and user has access
 * @param {string} interventionId - Intervention ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Intervention with goal, problem, and care plan info
 */
async function validateInterventionAccess(interventionId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role !== "SUPER_ADMIN") {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  const intervention = await prisma.carePlanIntervention.findFirst({
    where: {
      id: interventionId,
      deletedAt: null,
      goal: {
        deletedAt: null,
        problem: {
          deletedAt: null,
          carePlan: {
            ...tenantWhere,
            deletedAt: null,
          },
        },
      },
    },
    include: {
      goal: {
        include: {
          problem: {
            include: {
              carePlan: {
                select: {
                  id: true,
                  tenantId: true,
                  residentId: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!intervention) {
    throw new Error("Intervention not found or access denied");
  }

  return intervention;
}

/**
 * Add problem to care plan
 * @param {string} carePlanId - Care plan ID
 * @param {Object} problemData - Problem data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Created problem
 */
async function addProblem(carePlanId, problemData, requestingUser) {
  // Get and validate care plan access
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  // Validate required fields
  if (!problemData.title || !problemData.title.trim()) {
    throw new Error("Problem title is required");
  }

  // Create problem
  const problem = await prisma.carePlanProblem.create({
    data: {
      carePlanId: carePlan.id,
      title: problemData.title.trim(),
      category: problemData.category || "Medical",
      description: problemData.description?.trim() || null,
      diagnosisCode: problemData.diagnosisCode?.trim() || null,
      onsetDate: problemData.onsetDate ? new Date(problemData.onsetDate) : null,
    },
    include: {
      carePlan: {
        select: {
          id: true,
          tenantId: true,
          residentId: true,
        },
      },
      goals: {
        where: {
          deletedAt: null,
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_PROBLEM_ADDED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      problemId: problem.id,
      problemTitle: problem.title,
      category: problem.category,
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      `Added problem: ${problem.title}`
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after adding problem:",
      error
    );
  }

  // Create alert for new diagnosis (if it's a medical problem with diagnosis code)
  if (problem.category === "Medical" && problem.diagnosisCode) {
    try {
      const { createAlert } = require("./care-plan-alert.service");
      await createAlert(
        carePlan.id,
        "NewDiagnosis",
        {
          title: "New Diagnosis Added",
          message: `A new diagnosis (${problem.diagnosisCode}: ${problem.title}) has been added to the care plan. Please review and update interventions if needed.`,
        },
        requestingUser
      );
    } catch (error) {
      console.error(
        "[CARE_PLAN] Failed to create alert for new diagnosis:",
        error
      );
      // Don't fail the operation if alert creation fails
    }
  }

  return problem;
}

/**
 * Update problem
 * @param {string} problemId - Problem ID
 * @param {Object} problemData - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated problem
 */
async function updateProblem(problemId, problemData, requestingUser) {
  // Validate problem access
  const existingProblem = await validateProblemAccess(
    problemId,
    requestingUser
  );
  const carePlan = existingProblem.carePlan;

  // Prepare update data
  const updateData = {};
  if (problemData.title !== undefined) {
    if (!problemData.title || !problemData.title.trim()) {
      throw new Error("Problem title cannot be empty");
    }
    updateData.title = problemData.title.trim();
  }
  if (problemData.category !== undefined) {
    updateData.category = problemData.category;
  }
  if (problemData.description !== undefined) {
    updateData.description = problemData.description?.trim() || null;
  }
  if (problemData.diagnosisCode !== undefined) {
    updateData.diagnosisCode = problemData.diagnosisCode?.trim() || null;
  }
  if (problemData.onsetDate !== undefined) {
    updateData.onsetDate = problemData.onsetDate
      ? new Date(problemData.onsetDate)
      : null;
  }

  // Update problem
  const updatedProblem = await prisma.carePlanProblem.update({
    where: { id: problemId },
    data: updateData,
    include: {
      carePlan: {
        select: {
          id: true,
          tenantId: true,
          residentId: true,
        },
      },
      goals: {
        where: {
          deletedAt: null,
        },
        include: {
          interventions: {
            where: {
              deletedAt: null,
            },
          },
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_PROBLEM_ADDED", // Note: Using ADDED for updates (per plan, we can add UPDATED later if needed)
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      problemId: updatedProblem.id,
      problemTitle: updatedProblem.title,
      changes: Object.keys(updateData),
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      `Updated problem: ${updatedProblem.title}`
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after updating problem:",
      error
    );
  }

  return updatedProblem;
}

/**
 * Remove problem (soft delete with cascading)
 * @param {string} problemId - Problem ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Removed problem
 */
async function removeProblem(problemId, requestingUser) {
  // Validate problem access
  const existingProblem = await validateProblemAccess(
    problemId,
    requestingUser
  );
  const carePlan = existingProblem.carePlan;

  // Get all goals for this problem
  const goals = await prisma.carePlanGoal.findMany({
    where: {
      problemId: problemId,
      deletedAt: null,
    },
    select: { id: true },
  });

  const goalIds = goals.map((g) => g.id);

  // Soft delete all interventions for these goals
  if (goalIds.length > 0) {
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

  // Soft delete all goals for this problem
  await prisma.carePlanGoal.updateMany({
    where: {
      problemId: problemId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  // Soft delete the problem
  const removedProblem = await prisma.carePlanProblem.update({
    where: { id: problemId },
    data: {
      deletedAt: new Date(),
    },
    include: {
      carePlan: {
        select: {
          id: true,
          tenantId: true,
          residentId: true,
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_PROBLEM_REMOVED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      problemId: removedProblem.id,
      problemTitle: removedProblem.title,
      goalsRemoved: goalIds.length,
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      `Removed problem: ${removedProblem.title}`
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after removing problem:",
      error
    );
  }

  return removedProblem;
}

/**
 * Add goal to problem
 * @param {string} problemId - Problem ID
 * @param {Object} goalData - Goal data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Created goal
 */
async function addGoal(problemId, goalData, requestingUser) {
  // Validate problem access
  const existingProblem = await validateProblemAccess(
    problemId,
    requestingUser
  );
  const carePlan = existingProblem.carePlan;

  // Validate required fields
  if (!goalData.description || !goalData.description.trim()) {
    throw new Error("Goal description is required");
  }

  // Create goal
  const goal = await prisma.carePlanGoal.create({
    data: {
      problemId: problemId,
      description: goalData.description.trim(),
      status: goalData.status || "InProgress",
      targetDate: goalData.targetDate ? new Date(goalData.targetDate) : null,
      achievedDate: goalData.achievedDate
        ? new Date(goalData.achievedDate)
        : null,
      evaluationNotes: goalData.evaluationNotes?.trim() || null,
      lastEvaluatedAt: goalData.lastEvaluatedAt
        ? new Date(goalData.lastEvaluatedAt)
        : null,
    },
    include: {
      problem: {
        include: {
          carePlan: {
            select: {
              id: true,
              tenantId: true,
              residentId: true,
            },
          },
        },
      },
      interventions: {
        where: {
          deletedAt: null,
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_GOAL_ADDED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      goalId: goal.id,
      problemId: problemId,
      status: goal.status,
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      "Added goal to problem"
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after adding goal:",
      error
    );
  }

  return goal;
}

/**
 * Update goal
 * @param {string} goalId - Goal ID
 * @param {Object} goalData - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated goal
 */
async function updateGoal(goalId, goalData, requestingUser) {
  // Validate goal access
  const existingGoal = await validateGoalAccess(goalId, requestingUser);
  const carePlan = existingGoal.problem.carePlan;

  // Prepare update data
  const updateData = {};
  if (goalData.description !== undefined) {
    if (!goalData.description || !goalData.description.trim()) {
      throw new Error("Goal description cannot be empty");
    }
    updateData.description = goalData.description.trim();
  }
  if (goalData.status !== undefined) {
    updateData.status = goalData.status;
    // If status is Achieved and achievedDate is not set, set it
    if (
      goalData.status === "Achieved" &&
      !goalData.achievedDate &&
      !existingGoal.achievedDate
    ) {
      updateData.achievedDate = new Date();
    }
    // If status changes from Achieved, clear achievedDate
    if (goalData.status !== "Achieved" && existingGoal.status === "Achieved") {
      updateData.achievedDate = null;
    }
  }
  if (goalData.targetDate !== undefined) {
    updateData.targetDate = goalData.targetDate
      ? new Date(goalData.targetDate)
      : null;
  }
  if (goalData.achievedDate !== undefined) {
    updateData.achievedDate = goalData.achievedDate
      ? new Date(goalData.achievedDate)
      : null;
  }
  if (goalData.evaluationNotes !== undefined) {
    updateData.evaluationNotes = goalData.evaluationNotes?.trim() || null;
    if (goalData.evaluationNotes) {
      updateData.lastEvaluatedAt = new Date();
    }
  }
  if (goalData.lastEvaluatedAt !== undefined) {
    updateData.lastEvaluatedAt = goalData.lastEvaluatedAt
      ? new Date(goalData.lastEvaluatedAt)
      : null;
  }

  // Update goal
  const updatedGoal = await prisma.carePlanGoal.update({
    where: { id: goalId },
    data: updateData,
    include: {
      problem: {
        include: {
          carePlan: {
            select: {
              id: true,
              tenantId: true,
              residentId: true,
            },
          },
        },
      },
      interventions: {
        where: {
          deletedAt: null,
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_GOAL_UPDATED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      goalId: updatedGoal.id,
      problemId: updatedGoal.problemId,
      status: updatedGoal.status,
      changes: Object.keys(updateData),
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    const statusChange = updateData.status
      ? ` (Status: ${updateData.status})`
      : "";
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      `Updated goal${statusChange}`
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after updating goal:",
      error
    );
  }

  return updatedGoal;
}

/**
 * Update goal status
 * @param {string} goalId - Goal ID
 * @param {string} status - New status
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated goal
 */
async function updateGoalStatus(goalId, status, requestingUser) {
  return updateGoal(goalId, { status }, requestingUser);
}

/**
 * Add intervention to goal
 * @param {string} goalId - Goal ID
 * @param {Object} interventionData - Intervention data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Created intervention
 */
async function addIntervention(goalId, interventionData, requestingUser) {
  // Validate goal access
  const existingGoal = await validateGoalAccess(goalId, requestingUser);
  const carePlan = existingGoal.problem.carePlan;

  // Validate required fields
  if (!interventionData.description || !interventionData.description.trim()) {
    throw new Error("Intervention description is required");
  }

  // Validate frequency
  const validFrequencies = [
    "Daily",
    "TwiceDaily",
    "Weekly",
    "PRN",
    "AsNeeded",
    "Custom",
  ];
  const frequency = interventionData.frequency || "Daily";
  if (!validFrequencies.includes(frequency)) {
    throw new Error(
      `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`
    );
  }

  // Validate timeSlots if provided
  let timeSlots = null;
  if (interventionData.timeSlots) {
    if (Array.isArray(interventionData.timeSlots)) {
      timeSlots = interventionData.timeSlots;
    } else {
      throw new Error("timeSlots must be an array");
    }
  }

  // Create intervention
  const intervention = await prisma.carePlanIntervention.create({
    data: {
      goalId: goalId,
      description: interventionData.description.trim(),
      frequency: frequency,
      customFrequency: interventionData.customFrequency?.trim() || null,
      timesPerDay: interventionData.timesPerDay
        ? parseInt(interventionData.timesPerDay)
        : null,
      timeSlots: timeSlots,
      responsibleRole: interventionData.responsibleRole?.trim() || null,
      responsibleStaffId: interventionData.responsibleStaffId || null,
      medicationId: interventionData.medicationId || null,
      noteId: interventionData.noteId || null,
    },
    include: {
      goal: {
        include: {
          problem: {
            include: {
              carePlan: {
                select: {
                  id: true,
                  tenantId: true,
                  residentId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_INTERVENTION_ADDED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      interventionId: intervention.id,
      goalId: goalId,
      frequency: intervention.frequency,
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      "Added intervention to goal"
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after adding intervention:",
      error
    );
  }

  return intervention;
}

/**
 * Update intervention
 * @param {string} interventionId - Intervention ID
 * @param {Object} interventionData - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated intervention
 */
async function updateIntervention(
  interventionId,
  interventionData,
  requestingUser
) {
  // Validate intervention access
  const existingIntervention = await validateInterventionAccess(
    interventionId,
    requestingUser
  );
  const carePlan = existingIntervention.goal.problem.carePlan;

  // Prepare update data
  const updateData = {};
  if (interventionData.description !== undefined) {
    if (!interventionData.description || !interventionData.description.trim()) {
      throw new Error("Intervention description cannot be empty");
    }
    updateData.description = interventionData.description.trim();
  }
  if (interventionData.frequency !== undefined) {
    const validFrequencies = [
      "Daily",
      "TwiceDaily",
      "Weekly",
      "PRN",
      "AsNeeded",
      "Custom",
    ];
    if (!validFrequencies.includes(interventionData.frequency)) {
      throw new Error(
        `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`
      );
    }
    updateData.frequency = interventionData.frequency;
  }
  if (interventionData.customFrequency !== undefined) {
    updateData.customFrequency =
      interventionData.customFrequency?.trim() || null;
  }
  if (interventionData.timesPerDay !== undefined) {
    updateData.timesPerDay = interventionData.timesPerDay
      ? parseInt(interventionData.timesPerDay)
      : null;
  }
  if (interventionData.timeSlots !== undefined) {
    if (interventionData.timeSlots === null) {
      updateData.timeSlots = null;
    } else if (Array.isArray(interventionData.timeSlots)) {
      updateData.timeSlots = interventionData.timeSlots;
    } else {
      throw new Error("timeSlots must be an array or null");
    }
  }
  if (interventionData.responsibleRole !== undefined) {
    updateData.responsibleRole =
      interventionData.responsibleRole?.trim() || null;
  }
  if (interventionData.responsibleStaffId !== undefined) {
    updateData.responsibleStaffId = interventionData.responsibleStaffId || null;
  }
  if (interventionData.medicationId !== undefined) {
    updateData.medicationId = interventionData.medicationId || null;
  }
  if (interventionData.noteId !== undefined) {
    updateData.noteId = interventionData.noteId || null;
  }

  // Update intervention
  const updatedIntervention = await prisma.carePlanIntervention.update({
    where: { id: interventionId },
    data: updateData,
    include: {
      goal: {
        include: {
          problem: {
            include: {
              carePlan: {
                select: {
                  id: true,
                  tenantId: true,
                  residentId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_INTERVENTION_UPDATED",
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      interventionId: updatedIntervention.id,
      goalId: updatedIntervention.goalId,
      changes: Object.keys(updateData),
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      "Updated intervention"
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after updating intervention:",
      error
    );
  }

  return updatedIntervention;
}

/**
 * Remove intervention (soft delete)
 * @param {string} interventionId - Intervention ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Removed intervention
 */
async function removeIntervention(interventionId, requestingUser) {
  // Validate intervention access
  const existingIntervention = await validateInterventionAccess(
    interventionId,
    requestingUser
  );
  const carePlan = existingIntervention.goal.problem.carePlan;

  // Soft delete the intervention
  const removedIntervention = await prisma.carePlanIntervention.update({
    where: { id: interventionId },
    data: {
      deletedAt: new Date(),
    },
    include: {
      goal: {
        include: {
          problem: {
            include: {
              carePlan: {
                select: {
                  id: true,
                  tenantId: true,
                  residentId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_PLAN_INTERVENTION_UPDATED", // Note: Using UPDATED for removal (per plan, we can add REMOVED later if needed)
    userId: requestingUser.id,
    tenantId: carePlan.tenantId,
    resourceId: carePlan.id,
    req: null,
    metadata: {
      interventionId: removedIntervention.id,
      goalId: removedIntervention.goalId,
      action: "removed",
      residentId: carePlan.residentId,
    },
  });

  // Create new version snapshot
  try {
    await getCreateVersion()(
      carePlan.id,
      requestingUser,
      "Removed intervention"
    );
  } catch (error) {
    console.error(
      "[CARE_PLAN] Failed to create version after removing intervention:",
      error
    );
  }

  return removedIntervention;
}

module.exports = {
  createCarePlan,
  getCarePlans,
  getCarePlanById,
  updateCarePlan,
  archiveCarePlan,
  getActiveCarePlan,
  validateResidentAccess,
  getResidentName,
  // Phase 3: Problem, Goal & Intervention Management
  addProblem,
  updateProblem,
  removeProblem,
  addGoal,
  updateGoal,
  updateGoalStatus,
  addIntervention,
  updateIntervention,
  removeIntervention,
};

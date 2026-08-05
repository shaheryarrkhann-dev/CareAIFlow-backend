const prisma = require("../../lib/prisma");
const { logCarePlanAction } = require("../compliance/audit.service");
const { addProblem, addGoal, addIntervention } = require("./care-plan.service");

/**
 * Validate template data structure
 * @param {Object} templateData - Template data to validate
 * @returns {Object} { isValid: boolean, error?: string }
 */
function validateTemplateData(templateData) {
  if (!templateData || typeof templateData !== "object") {
    return { isValid: false, error: "Template data must be an object" };
  }

  // Validate problem
  if (!templateData.problem || typeof templateData.problem !== "object") {
    return { isValid: false, error: "Template must include a problem object" };
  }

  if (!templateData.problem.title || !templateData.problem.title.trim()) {
    return { isValid: false, error: "Problem title is required" };
  }

  // Validate goals (optional but if present must be array)
  if (templateData.goals !== undefined) {
    if (!Array.isArray(templateData.goals)) {
      return { isValid: false, error: "Goals must be an array" };
    }

    // Validate each goal
    for (const goal of templateData.goals) {
      if (!goal.description || !goal.description.trim()) {
        return { isValid: false, error: "Each goal must have a description" };
      }
    }
  }

  // Validate interventions (optional but if present must be array)
  if (templateData.interventions !== undefined) {
    if (!Array.isArray(templateData.interventions)) {
      return { isValid: false, error: "Interventions must be an array" };
    }

    // Validate each intervention
    for (const intervention of templateData.interventions) {
      if (!intervention.description || !intervention.description.trim()) {
        return {
          isValid: false,
          error: "Each intervention must have a description",
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Create library item (template)
 * @param {Object} data - Library item data
 * @param {Object} requestingUser - User creating the item
 * @returns {Promise<Object>} Created library item
 */
async function createLibraryItem(data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when creating library item as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to create library items");
    }
  }

  // Validate required fields
  if (!data.name || !data.name.trim()) {
    throw new Error("Library item name is required");
  }

  // Validate template data
  if (!data.templateData) {
    throw new Error("Template data is required");
  }

  const validation = validateTemplateData(data.templateData);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Create library item
  const libraryItem = await prisma.careLibrary.create({
    data: {
      tenantId,
      name: data.name.trim(),
      category: data.category || "Medical",
      description: data.description?.trim() || null,
      templateData: data.templateData,
      isActive: data.isActive !== undefined ? data.isActive : true,
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
    action: "CARE_LIBRARY_CREATED",
    userId: requestingUser.id,
    tenantId: libraryItem.tenantId,
    resourceId: libraryItem.id,
    req: null,
    metadata: {
      name: libraryItem.name,
      category: libraryItem.category,
    },
  });

  return libraryItem;
}

/**
 * Get library items with filtering
 * @param {Object} filters - Filter options
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Library items with pagination
 */
async function getLibraryItems(filters, requestingUser) {
  // Determine tenantId
  let tenantId = null;
  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = filters.tenantId || null; // null means all tenants
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      return {
        items: [],
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
  const { category, isActive, search } = filters;

  // Build where clause
  const where = {
    ...tenantWhere,
    deletedAt: null, // Only non-deleted items
    ...(category && { category }),
    ...(isActive !== undefined && { isActive }),
  };

  // Search filter (search in name and description)
  if (search && search.trim()) {
    where.OR = [
      { name: { contains: search.trim(), mode: "insensitive" } },
      { description: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  // Execute query with pagination
  const [items, total] = await Promise.all([
    prisma.careLibrary.findMany({
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
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.careLibrary.count({ where }),
  ]);

  return {
    libraryItems: items, // Frontend expects 'libraryItems' not 'items'
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get library item by ID
 * @param {string} itemId - Library item ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Library item
 */
async function getLibraryItemById(itemId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: itemId,
    ...tenantWhere,
    deletedAt: null, // Only non-deleted items
  };

  const item = await prisma.careLibrary.findFirst({
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
    },
  });

  if (!item) {
    throw new Error("Library item not found or access denied");
  }

  return item;
}

/**
 * Update library item
 * @param {string} itemId - Library item ID
 * @param {Object} data - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated library item
 */
async function updateLibraryItem(itemId, data, requestingUser) {
  // Get existing item
  const existingItem = await getLibraryItemById(itemId, requestingUser);

  // Prepare update data
  const updateData = {};

  if (data.name !== undefined) {
    if (!data.name || !data.name.trim()) {
      throw new Error("Library item name cannot be empty");
    }
    updateData.name = data.name.trim();
  }
  if (data.category !== undefined) {
    updateData.category = data.category;
  }
  if (data.description !== undefined) {
    updateData.description = data.description?.trim() || null;
  }
  if (data.templateData !== undefined) {
    // Validate template data
    const validation = validateTemplateData(data.templateData);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    updateData.templateData = data.templateData;
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  // Update library item
  const updatedItem = await prisma.careLibrary.update({
    where: { id: itemId },
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
    },
  });

  // Log audit event
  logCarePlanAction({
    action: "CARE_LIBRARY_UPDATED",
    userId: requestingUser.id,
    tenantId: updatedItem.tenantId,
    resourceId: updatedItem.id,
    req: null,
    metadata: {
      name: updatedItem.name,
      changes: Object.keys(updateData),
    },
  });

  return updatedItem;
}

/**
 * Delete library item (soft delete)
 * @param {string} itemId - Library item ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Deleted library item
 */
async function deleteLibraryItem(itemId, requestingUser) {
  // Get existing item
  const existingItem = await getLibraryItemById(itemId, requestingUser);

  // Soft delete library item
  const deletedItem = await prisma.careLibrary.update({
    where: { id: itemId },
    data: {
      deletedAt: new Date(),
      isActive: false, // Also deactivate
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
    action: "CARE_LIBRARY_DELETED",
    userId: requestingUser.id,
    tenantId: deletedItem.tenantId,
    resourceId: deletedItem.id,
    req: null,
    metadata: {
      name: deletedItem.name,
    },
  });

  return deletedItem;
}

/**
 * Apply library item to care plan
 * @param {string} libraryItemId - Library item ID
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @param {Object} options - Optional customization options
 * @returns {Promise<Object>} Created problem with goals and interventions
 */
async function applyLibraryItemToPlan(
  libraryItemId,
  carePlanId,
  requestingUser,
  options = {}
) {
  // Get library item
  const libraryItem = await getLibraryItemById(libraryItemId, requestingUser);

  // Get care plan (validate access) - lazy load to avoid circular dependency
  const carePlanService = require("./care-plan.service");
  const carePlan = await carePlanService.getCarePlanById(
    carePlanId,
    requestingUser
  );

  // Ensure library item and care plan belong to same tenant
  if (libraryItem.tenantId !== carePlan.tenantId) {
    throw new Error(
      "Library item and care plan must belong to the same tenant"
    );
  }

  const templateData = libraryItem.templateData;

  // Apply problem (with optional customization)
  const problemData = {
    title: options.problemTitle || templateData.problem.title,
    category: options.problemCategory || templateData.problem.category,
    description: options.problemDescription || templateData.problem.description,
    diagnosisCode:
      options.problemDiagnosisCode || templateData.problem.diagnosisCode,
    onsetDate: options.problemOnsetDate || templateData.problem.onsetDate,
  };

  const problem = await addProblem(carePlanId, problemData, requestingUser);

  // Apply goals
  const goals = templateData.goals || [];
  const createdGoals = [];

  for (const goalTemplate of goals) {
    const goalData = {
      description: goalTemplate.description,
      status: goalTemplate.status || "InProgress",
      targetDate: goalTemplate.targetDate,
      evaluationNotes: goalTemplate.evaluationNotes,
    };

    const goal = await addGoal(problem.id, goalData, requestingUser);
    createdGoals.push(goal);

    // Apply interventions for this goal
    const goalInterventions = goalTemplate.interventions || [];
    for (const interventionTemplate of goalInterventions) {
      const interventionData = {
        description: interventionTemplate.description,
        frequency: interventionTemplate.frequency || "Daily",
        customFrequency: interventionTemplate.customFrequency,
        timesPerDay: interventionTemplate.timesPerDay,
        timeSlots: interventionTemplate.timeSlots,
        responsibleRole: interventionTemplate.responsibleRole,
        responsibleStaffId: interventionTemplate.responsibleStaffId,
        medicationId: interventionTemplate.medicationId,
        noteId: interventionTemplate.noteId,
      };

      await addIntervention(goal.id, interventionData, requestingUser);
    }
  }

  // Apply top-level interventions (if any) to the first goal or create a default goal
  const topLevelInterventions = templateData.interventions || [];
  if (topLevelInterventions.length > 0) {
    // Use first goal or create a default goal
    let targetGoal = createdGoals[0];
    if (!targetGoal) {
      const defaultGoal = await addGoal(
        problem.id,
        {
          description: `Goal for ${problem.title}`,
          status: "InProgress",
        },
        requestingUser
      );
      targetGoal = defaultGoal;
      createdGoals.push(defaultGoal);
    }

    // Apply top-level interventions
    for (const interventionTemplate of topLevelInterventions) {
      const interventionData = {
        description: interventionTemplate.description,
        frequency: interventionTemplate.frequency || "Daily",
        customFrequency: interventionTemplate.customFrequency,
        timesPerDay: interventionTemplate.timesPerDay,
        timeSlots: interventionTemplate.timeSlots,
        responsibleRole: interventionTemplate.responsibleRole,
        responsibleStaffId: interventionTemplate.responsibleStaffId,
        medicationId: interventionTemplate.medicationId,
        noteId: interventionTemplate.noteId,
      };

      await addIntervention(targetGoal.id, interventionData, requestingUser);
    }
  }

  // Return problem with all created goals and interventions
  const { getCarePlanById: getPlanById } = require("./care-plan.service");
  const updatedPlan = await getPlanById(carePlanId, requestingUser);
  const createdProblem = updatedPlan.problems.find((p) => p.id === problem.id);

  return {
    problem: createdProblem,
    libraryItem: {
      id: libraryItem.id,
      name: libraryItem.name,
      category: libraryItem.category,
    },
  };
}

/**
 * Duplicate library item
 * @param {string} itemId - Library item ID to duplicate
 * @param {Object} requestingUser - Current user
 * @param {Object} options - Optional customization (name, description)
 * @returns {Promise<Object>} Duplicated library item
 */
async function duplicateLibraryItem(itemId, requestingUser, options = {}) {
  // Get existing item
  const existingItem = await getLibraryItemById(itemId, requestingUser);

  // Create new item with copied data
  const newName = options.name || `${existingItem.name} (Copy)`;

  const duplicatedItem = await prisma.careLibrary.create({
    data: {
      tenantId: existingItem.tenantId,
      name: newName.trim(),
      category: existingItem.category,
      description: options.description || existingItem.description,
      templateData: existingItem.templateData, // Copy template data
      isActive: existingItem.isActive,
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
    action: "CARE_LIBRARY_CREATED",
    userId: requestingUser.id,
    tenantId: duplicatedItem.tenantId,
    resourceId: duplicatedItem.id,
    req: null,
    metadata: {
      name: duplicatedItem.name,
      category: duplicatedItem.category,
      duplicatedFrom: existingItem.id,
    },
  });

  return duplicatedItem;
}

module.exports = {
  createLibraryItem,
  getLibraryItems,
  getLibraryItemById,
  updateLibraryItem,
  deleteLibraryItem,
  applyLibraryItemToPlan,
  duplicateLibraryItem,
  validateTemplateData,
};

const prisma = require("../../lib/prisma");
const { getCarePlanById } = require("./care-plan.service");
const { logCarePlanAction } = require("../compliance/audit.service");

/**
 * Check if care plan is due for review
 * @param {string} carePlanId - Care plan ID
 * @returns {Promise<Object>} Review status
 */
async function checkReviewDue(carePlanId) {
  const carePlan = await prisma.carePlan.findUnique({
    where: { id: carePlanId },
    select: {
      id: true,
      status: true,
      lastReviewedAt: true,
      nextReviewDate: true,
      reviewIntervalDays: true,
      tenantId: true,
    },
  });

  if (!carePlan) {
    throw new Error("Care plan not found");
  }

  // Only check active care plans
  if (carePlan.status !== "Active") {
    return {
      isDue: false,
      reason: "Care plan is not active",
    };
  }

  const now = new Date();
  const nextReviewDate = carePlan.nextReviewDate
    ? new Date(carePlan.nextReviewDate)
    : null;

  // If nextReviewDate is set, check against it
  if (nextReviewDate) {
    const daysUntilReview = Math.ceil(
      (nextReviewDate - now) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilReview <= 0) {
      return {
        isDue: true,
        reason: "Review date has passed",
        daysOverdue: Math.abs(daysUntilReview),
        nextReviewDate: nextReviewDate,
      };
    }

    return {
      isDue: false,
      reason: "Review date not yet reached",
      daysUntilReview: daysUntilReview,
      nextReviewDate: nextReviewDate,
    };
  }

  // If no nextReviewDate, calculate based on lastReviewedAt and reviewIntervalDays
  const lastReviewedAt = carePlan.lastReviewedAt
    ? new Date(carePlan.lastReviewedAt)
    : null;
  const reviewIntervalDays = carePlan.reviewIntervalDays || 30;

  if (!lastReviewedAt) {
    // Never reviewed - check if created more than reviewIntervalDays ago
    const carePlanCreated = await prisma.carePlan.findUnique({
      where: { id: carePlanId },
      select: { createdAt: true },
    });

    if (carePlanCreated) {
      const daysSinceCreation = Math.ceil(
        (now - new Date(carePlanCreated.createdAt)) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceCreation >= reviewIntervalDays) {
        return {
          isDue: true,
          reason:
            "Care plan has never been reviewed and creation date threshold reached",
          daysOverdue: daysSinceCreation - reviewIntervalDays,
          reviewIntervalDays: reviewIntervalDays,
        };
      }
    }

    return {
      isDue: false,
      reason: "Care plan has never been reviewed but within review interval",
      daysUntilReview: reviewIntervalDays,
      reviewIntervalDays: reviewIntervalDays,
    };
  }

  // Calculate days since last review
  const daysSinceReview = Math.ceil(
    (now - lastReviewedAt) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceReview >= reviewIntervalDays) {
    return {
      isDue: true,
      reason: "Review interval has passed",
      daysOverdue: daysSinceReview - reviewIntervalDays,
      lastReviewedAt: lastReviewedAt,
      reviewIntervalDays: reviewIntervalDays,
    };
  }

  return {
    isDue: false,
    reason: "Within review interval",
    daysUntilReview: reviewIntervalDays - daysSinceReview,
    lastReviewedAt: lastReviewedAt,
    reviewIntervalDays: reviewIntervalDays,
  };
}

/**
 * Create alert for care plan
 * @param {string} carePlanId - Care plan ID
 * @param {string} alertType - Alert type (ReviewDue, NewDiagnosis, GoalNotMet, InterventionOverdue)
 * @param {Object} metadata - Alert metadata (title, message, etc.)
 * @param {Object} requestingUser - User creating the alert (optional, for system-generated alerts)
 * @returns {Promise<Object>} Created alert
 */
async function createAlert(
  carePlanId,
  alertType,
  metadata = {},
  requestingUser = null
) {
  // Validate care plan exists
  const carePlan = await prisma.carePlan.findUnique({
    where: { id: carePlanId },
    select: {
      id: true,
      residentId: true,
      residentName: true,
      tenantId: true,
      status: true,
    },
  });

  if (!carePlan) {
    throw new Error("Care plan not found");
  }

  // Only create alerts for active care plans
  if (carePlan.status !== "Active") {
    throw new Error("Alerts can only be created for active care plans");
  }

  // Validate alert type
  const validAlertTypes = [
    "ReviewDue",
    "NewDiagnosis",
    "GoalNotMet",
    "InterventionOverdue",
  ];
  if (!validAlertTypes.includes(alertType)) {
    throw new Error(
      `Invalid alert type. Must be one of: ${validAlertTypes.join(", ")}`
    );
  }

  // Generate default title and message if not provided
  let title = metadata.title;
  let message = metadata.message;

  if (!title) {
    switch (alertType) {
      case "ReviewDue":
        title = "Care Plan Review Due";
        break;
      case "NewDiagnosis":
        title = "New Diagnosis Added";
        break;
      case "GoalNotMet":
        title = "Goal Not Met";
        break;
      case "InterventionOverdue":
        title = "Intervention Overdue";
        break;
      default:
        title = "Care Plan Alert";
    }
  }

  if (!message) {
    const residentName = carePlan.residentName || "Resident";
    switch (alertType) {
      case "ReviewDue":
        message = `Care plan for ${residentName} is due for review. Please review and update the care plan.`;
        break;
      case "NewDiagnosis":
        message = `A new diagnosis has been added to ${residentName}'s care plan. Please review and update interventions if needed.`;
        break;
      case "GoalNotMet":
        message = `One or more goals in ${residentName}'s care plan have not been met. Please review and adjust the care plan.`;
        break;
      case "InterventionOverdue":
        message = `One or more interventions in ${residentName}'s care plan are overdue. Please review and update.`;
        break;
      default:
        message = `Alert for ${residentName}'s care plan.`;
    }
  }

  // Check if similar alert already exists (not dismissed)
  const existingAlert = await prisma.carePlanAlert.findFirst({
    where: {
      carePlanId: carePlanId,
      alertType: alertType,
      isDismissed: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // If alert exists and was created recently (within 24 hours), don't create duplicate
  if (existingAlert) {
    const hoursSinceCreation =
      (new Date() - new Date(existingAlert.createdAt)) / (1000 * 60 * 60);
    if (hoursSinceCreation < 24) {
      return existingAlert; // Return existing alert instead of creating duplicate
    }
  }

  // Create alert
  const alert = await prisma.carePlanAlert.create({
    data: {
      carePlanId: carePlanId,
      alertType: alertType,
      title: title,
      message: message,
      isDismissed: false,
    },
    include: {
      carePlan: {
        select: {
          id: true,
          residentId: true,
          residentName: true,
          tenantId: true,
        },
      },
    },
  });

  // Log audit event (if requestingUser provided)
  if (requestingUser) {
    logCarePlanAction({
      action: "CARE_PLAN_ALERT_CREATED", // Note: This action may need to be added to AuditAction enum
      userId: requestingUser.id,
      tenantId: carePlan.tenantId,
      resourceId: carePlan.id,
      req: null,
      metadata: {
        alertId: alert.id,
        alertType: alertType,
        residentId: carePlan.residentId,
      },
    });
  }

  return alert;
}

/**
 * Get alerts with filtering
 * @param {Object} filters - Filter options
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Alerts with pagination
 */
async function getAlerts(filters, requestingUser) {
  // Determine tenantId
  let tenantId = null;
  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = filters.tenantId || null; // null means all tenants
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      return {
        alerts: [],
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
  const tenantWhere = tenantId
    ? {
        carePlan: {
          tenantId: tenantId,
          deletedAt: null,
        },
      }
    : {
        carePlan: {
          deletedAt: null,
        },
      };

  // Pagination
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 50));
  const skip = (page - 1) * limit;

  // Extract filters
  const { carePlanId, alertType, isDismissed, dateFrom, dateTo } = filters;

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
    ...(carePlanId && { carePlanId }),
    ...(alertType && { alertType }),
    ...(isDismissed !== undefined && { isDismissed }),
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
  };

  // Execute query with pagination
  const [alerts, total] = await Promise.all([
    prisma.carePlanAlert.findMany({
      where,
      skip,
      take: limit,
      include: {
        carePlan: {
          select: {
            id: true,
            residentId: true,
            residentName: true,
            tenantId: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.carePlanAlert.count({ where }),
  ]);

  return {
    alerts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Dismiss alert
 * @param {string} alertId - Alert ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Dismissed alert
 */
async function dismissAlert(alertId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role !== "SUPER_ADMIN") {
    tenantWhere = {
      carePlan: {
        tenantId: requestingUser.tenantId,
        deletedAt: null,
      },
    };
  } else {
    tenantWhere = {
      carePlan: {
        deletedAt: null,
      },
    };
  }

  // Get alert
  const alert = await prisma.carePlanAlert.findFirst({
    where: {
      id: alertId,
      ...tenantWhere,
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

  if (!alert) {
    throw new Error("Alert not found or access denied");
  }

  if (alert.isDismissed) {
    throw new Error("Alert is already dismissed");
  }

  // Dismiss alert
  const dismissedAlert = await prisma.carePlanAlert.update({
    where: { id: alertId },
    data: {
      isDismissed: true,
      dismissedAt: new Date(),
      dismissedBy: requestingUser.id,
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
    action: "CARE_PLAN_ALERT_DISMISSED", // Note: This action may need to be added to AuditAction enum
    userId: requestingUser.id,
    tenantId: alert.carePlan.tenantId,
    resourceId: alert.carePlan.id,
    req: null,
    metadata: {
      alertId: dismissedAlert.id,
      alertType: dismissedAlert.alertType,
      residentId: alert.carePlan.residentId,
    },
  });

  return dismissedAlert;
}

/**
 * Schedule review reminder (update nextReviewDate)
 * @param {string} carePlanId - Care plan ID
 * @param {Date|string} reviewDate - Review date
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated care plan
 */
async function scheduleReviewReminder(carePlanId, reviewDate, requestingUser) {
  // Get care plan
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  // Parse review date
  const reviewDateObj =
    reviewDate instanceof Date ? reviewDate : new Date(reviewDate);

  // Update care plan's nextReviewDate
  const { updateCarePlan } = require("./care-plan.service");
  const updatedPlan = await updateCarePlan(
    carePlanId,
    {
      nextReviewDate: reviewDateObj,
      lastReviewedAt: new Date(), // Also update lastReviewedAt
    },
    requestingUser
  );

  // Check if review is due and create alert if needed
  const reviewStatus = await checkReviewDue(carePlanId);
  if (reviewStatus.isDue) {
    await createAlert(
      carePlanId,
      "ReviewDue",
      {
        title: "Care Plan Review Due",
        message: `Care plan review is due. Scheduled review date: ${reviewDateObj.toLocaleDateString()}`,
      },
      requestingUser
    );
  }

  return updatedPlan;
}

/**
 * Check all active care plans for due reviews and create alerts
 * This function is intended to be called by a cron job
 * @param {Object} options - Options (tenantId for filtering)
 * @returns {Promise<Object>} Summary of checks performed
 */
async function checkAllCarePlansForReview(options = {}) {
  const { tenantId } = options;

  // Build tenant filter
  const tenantWhere = tenantId ? { tenantId } : {};

  // Get all active care plans
  const activeCarePlans = await prisma.carePlan.findMany({
    where: {
      ...tenantWhere,
      status: "Active",
      deletedAt: null,
    },
    select: {
      id: true,
      residentId: true,
      residentName: true,
      tenantId: true,
    },
  });

  const results = {
    totalChecked: activeCarePlans.length,
    alertsCreated: 0,
    alertsSkipped: 0,
    errors: 0,
  };

  // Check each care plan
  for (const carePlan of activeCarePlans) {
    try {
      const reviewStatus = await checkReviewDue(carePlan.id);

      if (reviewStatus.isDue) {
        // Check if alert already exists
        const existingAlert = await prisma.carePlanAlert.findFirst({
          where: {
            carePlanId: carePlan.id,
            alertType: "ReviewDue",
            isDismissed: false,
          },
        });

        if (!existingAlert) {
          // Create alert
          await createAlert(
            carePlan.id,
            "ReviewDue",
            {
              title: "Care Plan Review Due",
              message: `Care plan for ${
                carePlan.residentName || "Resident"
              } is due for review. ${
                reviewStatus.daysOverdue
                  ? `Overdue by ${reviewStatus.daysOverdue} day(s).`
                  : ""
              }`,
            },
            null // System-generated alert
          );
          results.alertsCreated++;
        } else {
          results.alertsSkipped++;
        }
      }
    } catch (error) {
      console.error(
        `[CARE_PLAN_ALERT] Error checking care plan ${carePlan.id}:`,
        error.message
      );
      results.errors++;
    }
  }

  return results;
}

module.exports = {
  checkReviewDue,
  createAlert,
  getAlerts,
  dismissAlert,
  scheduleReviewReminder,
  checkAllCarePlansForReview,
};

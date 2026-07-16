const prisma = require("../../lib/prisma");
const { getActiveCarePlan, getCarePlans } = require("./care-plan.service");
const { getAlerts } = require("./care-plan-alert.service");
const { getVersions } = require("./care-plan-version.service");

/**
 * Get care plan dashboard summary for a resident
 * @param {string} residentId - Resident ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Dashboard summary data
 */
async function getCarePlanDashboard(residentId, requestingUser) {
  // Get active care plan
  let activeCarePlan = null;
  try {
    activeCarePlan = await getActiveCarePlan(residentId, requestingUser);
  } catch (error) {
    // No active care plan is okay
    if (!error.message.includes("not found")) {
      throw error;
    }
  }

  // Get all care plans for the resident (for recent changes)
  const allCarePlansResult = await getCarePlans(
    {
      residentId,
      page: 1,
      limit: 10, // Get recent 10 care plans
    },
    requestingUser
  );

  // Get alerts for the resident
  let alerts = [];
  try {
    const alertsResult = await getAlerts(
      {
        residentId,
        page: 1,
        limit: 10,
        isDismissed: false,
      },
      requestingUser
    );
    alerts = alertsResult.alerts || [];
  } catch (error) {
    console.warn("[CARE_PLAN_DASHBOARD] Error fetching alerts:", error);
  }

  // Get recent versions if active care plan exists
  let recentChanges = [];
  if (activeCarePlan) {
    try {
      const versions = await getVersions(activeCarePlan.id, requestingUser);
      recentChanges = (versions || []).slice(0, 5).map((v) => ({
        version: v.version,
        createdAt: v.createdAt,
        createdBy: v.creatorName || "Unknown",
        changeDescription: v.changeDescription,
      }));
    } catch (error) {
      console.warn("[CARE_PLAN_DASHBOARD] Error fetching versions:", error);
    }
  }

  // Calculate statistics from active care plan
  let statistics = {
    problemsCount: 0,
    goalsCount: 0,
    interventionsCount: 0,
    goalsByStatus: {
      InProgress: 0,
      Achieved: 0,
      NotMet: 0,
      OnHold: 0,
    },
  };

  if (activeCarePlan) {
    const problems = activeCarePlan.problems || [];
    statistics.problemsCount = problems.length;

    problems.forEach((problem) => {
      const goals = problem.goals || [];
      statistics.goalsCount += goals.length;

      goals.forEach((goal) => {
        const status = goal.status || "InProgress";
        if (statistics.goalsByStatus[status] !== undefined) {
          statistics.goalsByStatus[status]++;
        }

        const interventions = goal.interventions || [];
        statistics.interventionsCount += interventions.length;
      });
    });
  }

  // Get upcoming review dates
  const upcomingReviews = [];
  if (activeCarePlan && activeCarePlan.nextReviewDate) {
    const nextReview = new Date(activeCarePlan.nextReviewDate);
    const now = new Date();
    const daysUntilReview = Math.ceil(
      (nextReview - now) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilReview >= 0) {
      upcomingReviews.push({
        carePlanId: activeCarePlan.id,
        carePlanTitle: activeCarePlan.title || "Untitled Care Plan",
        nextReviewDate: activeCarePlan.nextReviewDate,
        daysUntilReview: daysUntilReview,
        isOverdue: false,
      });
    } else {
      upcomingReviews.push({
        carePlanId: activeCarePlan.id,
        carePlanTitle: activeCarePlan.title || "Untitled Care Plan",
        nextReviewDate: activeCarePlan.nextReviewDate,
        daysUntilReview: Math.abs(daysUntilReview),
        isOverdue: true,
      });
    }
  }

  // Get recent care plans (excluding active one)
  const recentCarePlans = (allCarePlansResult.carePlans || [])
    .filter((cp) => !activeCarePlan || cp.id !== activeCarePlan.id)
    .slice(0, 5)
    .map((cp) => ({
      id: cp.id,
      title: cp.title || "Untitled Care Plan",
      status: cp.status,
      createdAt: cp.createdAt,
      lastReviewedAt: cp.lastReviewedAt,
      nextReviewDate: cp.nextReviewDate,
    }));

  return {
    residentId,
    activeCarePlan: activeCarePlan
      ? {
          id: activeCarePlan.id,
          title: activeCarePlan.title,
          status: activeCarePlan.status,
          createdAt: activeCarePlan.createdAt,
          lastReviewedAt: activeCarePlan.lastReviewedAt,
          nextReviewDate: activeCarePlan.nextReviewDate,
        }
      : null,
    statistics,
    upcomingReviews,
    recentChanges,
    recentCarePlans,
    alerts: alerts.map((alert) => ({
      id: alert.id,
      type: alert.alertType,
      message: alert.message,
      severity: alert.severity,
      createdAt: alert.createdAt,
      carePlanId: alert.carePlanId,
    })),
  };
}

/**
 * Get care plan statistics for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} dateRange - Date range filter (optional)
 * @param {Date} dateRange.startDate - Start date
 * @param {Date} dateRange.endDate - End date
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Statistics data
 */
async function getCarePlanStatistics(tenantId, dateRange = {}, requestingUser) {
  // Build where clause
  const where = {
    tenantId,
    deletedAt: null,
  };

  // Add date range filter if provided
  if (dateRange.startDate || dateRange.endDate) {
    const dateFilter = {};
    if (dateRange.startDate) {
      dateFilter.gte = new Date(dateRange.startDate);
    }
    if (dateRange.endDate) {
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }
    where.createdAt = dateFilter;
  }

  // Get all care plans for the tenant
  const carePlans = await prisma.carePlan.findMany({
    where,
    include: {
      problems: {
        where: {
          deletedAt: null,
        },
        include: {
          goals: {
            where: {
              deletedAt: null,
            },
          },
        },
      },
    },
  });

  // Calculate statistics
  const totalCarePlans = carePlans.length;

  // Care plans by status
  const carePlansByStatus = {
    Active: 0,
    Draft: 0,
    Archived: 0,
  };

  // Count problems, goals, interventions
  let totalProblems = 0;
  let totalGoals = 0;
  let totalInterventions = 0;

  // Goals by status
  const goalsByStatus = {
    InProgress: 0,
    Achieved: 0,
    NotMet: 0,
    OnHold: 0,
  };

  // Most common problems (by category)
  const problemCategories = {};

  // Review compliance
  const now = new Date();
  let carePlansWithReviews = 0;
  let carePlansOverdue = 0;
  let totalDaysOverdue = 0;

  carePlans.forEach((cp) => {
    // Count by status
    if (carePlansByStatus[cp.status] !== undefined) {
      carePlansByStatus[cp.status]++;
    }

    // Count problems, goals, interventions
    const problems = cp.problems || [];
    totalProblems += problems.length;

    problems.forEach((problem) => {
      // Count problem categories
      if (problem.category) {
        problemCategories[problem.category] =
          (problemCategories[problem.category] || 0) + 1;
      }

      const goals = problem.goals || [];
      totalGoals += goals.length;

      goals.forEach((goal) => {
        // Count goals by status
        const status = goal.status || "InProgress";
        if (goalsByStatus[status] !== undefined) {
          goalsByStatus[status]++;
        }

        // Count interventions (assuming interventions are stored in goal)
        // Note: This might need adjustment based on actual schema
        const interventions = goal.interventions || [];
        totalInterventions += interventions.length;
      });
    });

    // Review compliance
    if (cp.status === "Active") {
      if (cp.nextReviewDate) {
        const nextReview = new Date(cp.nextReviewDate);
        if (nextReview <= now) {
          carePlansOverdue++;
          const daysOverdue = Math.ceil(
            (now - nextReview) / (1000 * 60 * 60 * 24)
          );
          totalDaysOverdue += daysOverdue;
        } else {
          carePlansWithReviews++;
        }
      } else if (cp.lastReviewedAt) {
        carePlansWithReviews++;
      }
    }
  });

  // Calculate averages
  const averageGoalsPerCarePlan =
    totalCarePlans > 0 ? totalGoals / totalCarePlans : 0;

  // Goal achievement rate
  const totalGoalsWithStatus = Object.values(goalsByStatus).reduce(
    (sum, count) => sum + count,
    0
  );
  const goalAchievementRate =
    totalGoalsWithStatus > 0
      ? (goalsByStatus.Achieved / totalGoalsWithStatus) * 100
      : 0;

  // Review compliance rate
  const activeCarePlans = carePlansByStatus.Active;
  const reviewComplianceRate =
    activeCarePlans > 0
      ? ((activeCarePlans - carePlansOverdue) / activeCarePlans) * 100
      : 0;

  // Most common problems (top 10)
  const mostCommonProblems = Object.entries(problemCategories)
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalProblems > 0 ? (count / totalProblems) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    period: {
      startDate: dateRange.startDate || null,
      endDate: dateRange.endDate || null,
    },
    summary: {
      totalCarePlans,
      carePlansByStatus,
      totalProblems,
      totalGoals,
      totalInterventions,
    },
    averages: {
      averageGoalsPerCarePlan: Math.round(averageGoalsPerCarePlan * 100) / 100,
      averageProblemsPerCarePlan:
        totalCarePlans > 0
          ? Math.round((totalProblems / totalCarePlans) * 100) / 100
          : 0,
      averageInterventionsPerCarePlan:
        totalCarePlans > 0
          ? Math.round((totalInterventions / totalCarePlans) * 100) / 100
          : 0,
    },
    goals: {
      goalsByStatus,
      goalAchievementRate: Math.round(goalAchievementRate * 100) / 100,
    },
    review: {
      activeCarePlans,
      carePlansWithReviews,
      carePlansOverdue,
      averageDaysOverdue:
        carePlansOverdue > 0
          ? Math.round((totalDaysOverdue / carePlansOverdue) * 100) / 100
          : 0,
      reviewComplianceRate: Math.round(reviewComplianceRate * 100) / 100,
    },
    problems: {
      mostCommonProblems,
      totalProblemCategories: Object.keys(problemCategories).length,
    },
  };
}

/**
 * Get goal progress tracking for a care plan
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Goal progress data
 */
async function getGoalProgress(carePlanId, requestingUser) {
  // Get care plan with goals
  const carePlan = await prisma.carePlan.findUnique({
    where: {
      id: carePlanId,
      deletedAt: null,
    },
    include: {
      problems: {
        where: {
          deletedAt: null,
        },
        include: {
          goals: {
            where: {
              deletedAt: null,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
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

  if (!carePlan) {
    throw new Error("Care plan not found");
  }

  // Check tenant access
  if (requestingUser.role !== "SUPER_ADMIN") {
    if (carePlan.tenantId !== requestingUser.tenantId) {
      throw new Error(
        "Access denied. You do not have access to this care plan."
      );
    }
  }

  // Get all goals
  const allGoals = [];
  carePlan.problems.forEach((problem) => {
    problem.goals.forEach((goal) => {
      allGoals.push({
        id: goal.id,
        problemId: problem.id,
        problemTitle: problem.title || "Untitled Problem",
        description: goal.description,
        status: goal.status,
        targetDate: goal.targetDate,
        achievedDate: goal.achievedDate,
        evaluationNotes: goal.evaluationNotes,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
      });
    });
  });

  // Calculate progress statistics
  const goalsByStatus = {
    InProgress: 0,
    Achieved: 0,
    NotMet: 0,
    OnHold: 0,
  };

  const goalsWithTargetDate = [];
  const goalsAchieved = [];
  const goalsOverdue = [];

  const now = new Date();

  allGoals.forEach((goal) => {
    // Count by status
    const status = goal.status || "InProgress";
    if (goalsByStatus[status] !== undefined) {
      goalsByStatus[status]++;
    }

    // Track goals with target dates
    if (goal.targetDate) {
      const targetDate = new Date(goal.targetDate);
      goalsWithTargetDate.push({
        ...goal,
        daysUntilTarget: Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24)),
        isOverdue: targetDate < now && status !== "Achieved",
      });

      if (targetDate < now && status !== "Achieved") {
        goalsOverdue.push(goal);
      }
    }

    // Track achieved goals
    if (status === "Achieved" && goal.achievedDate) {
      goalsAchieved.push({
        ...goal,
        daysToAchieve: Math.ceil(
          (new Date(goal.achievedDate) - new Date(goal.createdAt)) /
            (1000 * 60 * 60 * 24)
        ),
      });
    }
  });

  // Calculate achievement rate
  const totalGoals = allGoals.length;
  const achievementRate =
    totalGoals > 0 ? (goalsByStatus.Achieved / totalGoals) * 100 : 0;

  // Calculate average days to achieve (for achieved goals)
  const averageDaysToAchieve =
    goalsAchieved.length > 0
      ? goalsAchieved.reduce((sum, g) => sum + g.daysToAchieve, 0) /
        goalsAchieved.length
      : 0;

  // Sort goals by target date (upcoming first)
  goalsWithTargetDate.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });

  return {
    carePlanId,
    carePlanTitle: carePlan.title || "Untitled Care Plan",
    totalGoals,
    goalsByStatus,
    achievementRate: Math.round(achievementRate * 100) / 100,
    averageDaysToAchieve: Math.round(averageDaysToAchieve * 100) / 100,
    goalsWithTargetDate: goalsWithTargetDate.slice(0, 10), // Top 10 upcoming/overdue
    goalsOverdue: goalsOverdue.length,
    goalsAchieved: goalsAchieved.length,
    allGoals: allGoals.map((g) => ({
      id: g.id,
      problemTitle: g.problemTitle,
      description: g.description,
      status: g.status,
      targetDate: g.targetDate,
      achievedDate: g.achievedDate,
    })),
  };
}

/**
 * Get intervention compliance for a care plan
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Intervention compliance data
 */
async function getInterventionCompliance(carePlanId, requestingUser) {
  // Get care plan with interventions
  const carePlan = await prisma.carePlan.findUnique({
    where: {
      id: carePlanId,
      deletedAt: null,
    },
    include: {
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
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
          },
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

  if (!carePlan) {
    throw new Error("Care plan not found");
  }

  // Check tenant access
  if (requestingUser.role !== "SUPER_ADMIN") {
    if (carePlan.tenantId !== requestingUser.tenantId) {
      throw new Error(
        "Access denied. You do not have access to this care plan."
      );
    }
  }

  // Get all interventions
  const allInterventions = [];
  carePlan.problems.forEach((problem) => {
    problem.goals.forEach((goal) => {
      goal.interventions.forEach((intervention) => {
        allInterventions.push({
          id: intervention.id,
          goalId: goal.id,
          goalDescription: goal.description || "Untitled Goal",
          problemId: problem.id,
          problemTitle: problem.title || "Untitled Problem",
          description: intervention.description,
          frequency: intervention.frequency,
          responsibleRole: intervention.responsibleRole,
          notes: intervention.notes,
          createdAt: intervention.createdAt,
          updatedAt: intervention.updatedAt,
        });
      });
    });
  });

  // Group by responsible role
  const interventionsByRole = {};
  allInterventions.forEach((intervention) => {
    const role = intervention.responsibleRole || "Unassigned";
    if (!interventionsByRole[role]) {
      interventionsByRole[role] = [];
    }
    interventionsByRole[role].push(intervention);
  });

  // Group by frequency
  const interventionsByFrequency = {};
  allInterventions.forEach((intervention) => {
    const frequency = intervention.frequency || "As Needed";
    if (!interventionsByFrequency[frequency]) {
      interventionsByFrequency[frequency] = [];
    }
    interventionsByFrequency[frequency].push(intervention);
  });

  // Calculate statistics
  const totalInterventions = allInterventions.length;
  const interventionsWithFrequency = allInterventions.filter(
    (i) => i.frequency && i.frequency !== "As Needed"
  ).length;
  const interventionsWithRole = allInterventions.filter(
    (i) => i.responsibleRole
  ).length;

  // Note: Actual compliance tracking would require integration with eMAR or other systems
  // For now, we return the structure that can be extended later
  const complianceRate =
    totalInterventions > 0
      ? (interventionsWithRole / totalInterventions) * 100
      : 0;

  return {
    carePlanId,
    carePlanTitle: carePlan.title || "Untitled Care Plan",
    totalInterventions,
    statistics: {
      interventionsWithFrequency,
      interventionsWithRole,
      complianceRate: Math.round(complianceRate * 100) / 100,
    },
    interventionsByRole: Object.entries(interventionsByRole).map(
      ([role, interventions]) => ({
        role,
        count: interventions.length,
        percentage:
          totalInterventions > 0
            ? Math.round(
                (interventions.length / totalInterventions) * 100 * 100
              ) / 100
            : 0,
        interventions: interventions.map((i) => ({
          id: i.id,
          description: i.description,
          frequency: i.frequency,
        })),
      })
    ),
    interventionsByFrequency: Object.entries(interventionsByFrequency).map(
      ([frequency, interventions]) => ({
        frequency,
        count: interventions.length,
        percentage:
          totalInterventions > 0
            ? Math.round(
                (interventions.length / totalInterventions) * 100 * 100
              ) / 100
            : 0,
      })
    ),
    allInterventions: allInterventions.map((i) => ({
      id: i.id,
      problemTitle: i.problemTitle,
      goalDescription: i.goalDescription,
      description: i.description,
      frequency: i.frequency,
      responsibleRole: i.responsibleRole,
    })),
  };
}

module.exports = {
  getCarePlanDashboard,
  getCarePlanStatistics,
  getGoalProgress,
  getInterventionCompliance,
};

const prisma = require("../../lib/prisma");
const { getBehavioralLogs } = require("./behavioral.service");

/**
 * Calculate comprehensive behavior trends
 * @param {string} residentId - Resident ID (optional, null for all residents)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Comprehensive trend analysis
 */
async function calculateBehaviorTrends(
  residentId,
  startDate,
  endDate,
  tenantId
) {
  // Build where clause
  const where = {
    deletedAt: null,
    tenantId,
    ...(residentId && { residentId }),
    dateTime: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  };

  // Get all logs for the period
  const logs = await prisma.behavioralLog.findMany({
    where,
    select: {
      id: true,
      residentId: true,
      behaviorType: true,
      severity: true,
      dateTime: true,
      trigger: true,
      interventions: true,
    },
    orderBy: {
      dateTime: "asc",
    },
  });

  if (logs.length === 0) {
    return {
      period: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      summary: {
        totalIncidents: 0,
        averagePerDay: 0,
        averagePerWeek: 0,
      },
      trends: {
        behaviorTypeTrends: {},
        severityTrends: {},
        dailyTrends: [],
        weeklyTrends: [],
      },
      patterns: {
        timeOfDay: {},
        dayOfWeek: {},
      },
    };
  }

  // Calculate time span
  const daysDiff =
    (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const weeksDiff = daysDiff / 7;

  // Aggregate by behavior type
  const behaviorTypeTrends = {};
  logs.forEach((log) => {
    if (!behaviorTypeTrends[log.behaviorType]) {
      behaviorTypeTrends[log.behaviorType] = {
        total: 0,
        bySeverity: { Low: 0, Moderate: 0, High: 0 },
        dailyCounts: {},
        weeklyCounts: {},
      };
    }
    behaviorTypeTrends[log.behaviorType].total++;
    behaviorTypeTrends[log.behaviorType].bySeverity[log.severity]++;

    // Daily counts
    const day = new Date(log.dateTime).toISOString().split("T")[0];
    behaviorTypeTrends[log.behaviorType].dailyCounts[day] =
      (behaviorTypeTrends[log.behaviorType].dailyCounts[day] || 0) + 1;

    // Weekly counts
    const logDate = new Date(log.dateTime);
    const weekStart = new Date(logDate);
    weekStart.setDate(logDate.getDate() - logDate.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];
    behaviorTypeTrends[log.behaviorType].weeklyCounts[weekKey] =
      (behaviorTypeTrends[log.behaviorType].weeklyCounts[weekKey] || 0) + 1;
  });

  // Aggregate by severity
  const severityTrends = {
    Low: { total: 0, dailyCounts: {}, weeklyCounts: {} },
    Moderate: { total: 0, dailyCounts: {}, weeklyCounts: {} },
    High: { total: 0, dailyCounts: {}, weeklyCounts: {} },
  };

  logs.forEach((log) => {
    severityTrends[log.severity].total++;

    const day = new Date(log.dateTime).toISOString().split("T")[0];
    severityTrends[log.severity].dailyCounts[day] =
      (severityTrends[log.severity].dailyCounts[day] || 0) + 1;

    const logDate = new Date(log.dateTime);
    const weekStart = new Date(logDate);
    weekStart.setDate(logDate.getDate() - logDate.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];
    severityTrends[log.severity].weeklyCounts[weekKey] =
      (severityTrends[log.severity].weeklyCounts[weekKey] || 0) + 1;
  });

  // Daily trends (all behaviors combined)
  const dailyTrends = {};
  logs.forEach((log) => {
    const day = new Date(log.dateTime).toISOString().split("T")[0];
    if (!dailyTrends[day]) {
      dailyTrends[day] = {
        date: day,
        total: 0,
        bySeverity: { Low: 0, Moderate: 0, High: 0 },
        byType: {},
      };
    }
    dailyTrends[day].total++;
    dailyTrends[day].bySeverity[log.severity]++;
    dailyTrends[day].byType[log.behaviorType] =
      (dailyTrends[day].byType[log.behaviorType] || 0) + 1;
  });

  // Weekly trends
  const weeklyTrends = {};
  logs.forEach((log) => {
    const logDate = new Date(log.dateTime);
    const weekStart = new Date(logDate);
    weekStart.setDate(logDate.getDate() - logDate.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];

    if (!weeklyTrends[weekKey]) {
      weeklyTrends[weekKey] = {
        week: weekKey,
        total: 0,
        bySeverity: { Low: 0, Moderate: 0, High: 0 },
        byType: {},
      };
    }
    weeklyTrends[weekKey].total++;
    weeklyTrends[weekKey].bySeverity[log.severity]++;
    weeklyTrends[weekKey].byType[log.behaviorType] =
      (weeklyTrends[weekKey].byType[log.behaviorType] || 0) + 1;
  });

  // Time of day patterns
  const timeOfDay = {
    morning: 0, // 6 AM - 12 PM
    afternoon: 0, // 12 PM - 6 PM
    evening: 0, // 6 PM - 12 AM
    night: 0, // 12 AM - 6 AM
  };

  logs.forEach((log) => {
    const hour = new Date(log.dateTime).getHours();
    if (hour >= 6 && hour < 12) {
      timeOfDay.morning++;
    } else if (hour >= 12 && hour < 18) {
      timeOfDay.afternoon++;
    } else if (hour >= 18 && hour < 24) {
      timeOfDay.evening++;
    } else {
      timeOfDay.night++;
    }
  });

  // Day of week patterns
  const dayOfWeek = {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
  };

  logs.forEach((log) => {
    const dayName = new Date(log.dateTime).toLocaleDateString("en-US", {
      weekday: "long",
    });
    dayOfWeek[dayName] = (dayOfWeek[dayName] || 0) + 1;
  });

  // Convert daily/weekly trends to arrays for easier consumption
  const dailyTrendsArray = Object.values(dailyTrends).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const weeklyTrendsArray = Object.values(weeklyTrends).sort(
    (a, b) => new Date(a.week) - new Date(b.week)
  );

  return {
    period: {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: Math.ceil(daysDiff),
      weeks: Math.ceil(weeksDiff),
    },
    summary: {
      totalIncidents: logs.length,
      averagePerDay: daysDiff > 0 ? logs.length / daysDiff : 0,
      averagePerWeek: weeksDiff > 0 ? logs.length / weeksDiff : 0,
    },
    trends: {
      behaviorTypeTrends,
      severityTrends,
      dailyTrends: dailyTrendsArray,
      weeklyTrends: weeklyTrendsArray,
    },
    patterns: {
      timeOfDay,
      dayOfWeek,
    },
  };
}

/**
 * Get behavior frequency by type for a specific month
 * @param {string} residentId - Resident ID (optional)
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Behavior frequency analysis
 */
async function getBehaviorFrequency(
  residentId,
  month,
  year,
  tenantId
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const where = {
    deletedAt: null,
    tenantId,
    ...(residentId && { residentId }),
    dateTime: {
      gte: startDate,
      lte: endDate,
    },
  };

  const logs = await prisma.behavioralLog.findMany({
    where,
    select: {
      behaviorType: true,
      severity: true,
      dateTime: true,
    },
  });

  // Count by behavior type
  const frequency = {};
  logs.forEach((log) => {
    if (!frequency[log.behaviorType]) {
      frequency[log.behaviorType] = {
        total: 0,
        bySeverity: { Low: 0, Moderate: 0, High: 0 },
        percentage: 0,
      };
    }
    frequency[log.behaviorType].total++;
    frequency[log.behaviorType].bySeverity[log.severity]++;
  });

  // Calculate percentages
  const total = logs.length;
  Object.keys(frequency).forEach((type) => {
    frequency[type].percentage =
      total > 0 ? (frequency[type].total / total) * 100 : 0;
  });

  // Sort by frequency (descending)
  const sortedFrequency = Object.entries(frequency)
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.total - a.total);

  return {
    period: {
      month,
      year,
      startDate,
      endDate,
    },
    totalIncidents: total,
    frequency: sortedFrequency,
  };
}

/**
 * Get severity trends over time
 * @param {string} residentId - Resident ID (optional)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Severity trend analysis
 */
async function getSeverityTrends(
  residentId,
  startDate,
  endDate,
  tenantId
) {
  const where = {
    deletedAt: null,
    tenantId,
    ...(residentId && { residentId }),
    dateTime: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  };

  const logs = await prisma.behavioralLog.findMany({
    where,
    select: {
      severity: true,
      dateTime: true,
    },
    orderBy: {
      dateTime: "asc",
    },
  });

  // Aggregate by day
  const dailySeverity = {};
  logs.forEach((log) => {
    const day = new Date(log.dateTime).toISOString().split("T")[0];
    if (!dailySeverity[day]) {
      dailySeverity[day] = {
        date: day,
        Low: 0,
        Moderate: 0,
        High: 0,
        total: 0,
      };
    }
    dailySeverity[day][log.severity]++;
    dailySeverity[day].total++;
  });

  // Aggregate by week
  const weeklySeverity = {};
  logs.forEach((log) => {
    const logDate = new Date(log.dateTime);
    const weekStart = new Date(logDate);
    weekStart.setDate(logDate.getDate() - logDate.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];

    if (!weeklySeverity[weekKey]) {
      weeklySeverity[weekKey] = {
        week: weekKey,
        Low: 0,
        Moderate: 0,
        High: 0,
        total: 0,
      };
    }
    weeklySeverity[weekKey][log.severity]++;
    weeklySeverity[weekKey].total++;
  });

  // Calculate totals and percentages
  const totals = {
    Low: logs.filter((l) => l.severity === "Low").length,
    Moderate: logs.filter((l) => l.severity === "Moderate").length,
    High: logs.filter((l) => l.severity === "High").length,
  };

  const total = logs.length;
  const percentages = {
    Low: total > 0 ? (totals.Low / total) * 100 : 0,
    Moderate: total > 0 ? (totals.Moderate / total) * 100 : 0,
    High: total > 0 ? (totals.High / total) * 100 : 0,
  };

  // Convert to arrays
  const dailyTrends = Object.values(dailySeverity).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const weeklyTrends = Object.values(weeklySeverity).sort(
    (a, b) => new Date(a.week) - new Date(b.week)
  );

  return {
    period: {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
    totals,
    percentages,
    trends: {
      daily: dailyTrends,
      weekly: weeklyTrends,
    },
  };
}

/**
 * Get trigger analysis - most common triggers
 * @param {string} residentId - Resident ID (optional)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Trigger analysis
 */
async function getTriggerAnalysis(
  residentId,
  startDate,
  endDate,
  tenantId
) {
  const where = {
    deletedAt: null,
    tenantId,
    ...(residentId && { residentId }),
    dateTime: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
    trigger: {
      not: null,
    },
  };

  const logs = await prisma.behavioralLog.findMany({
    where,
    select: {
      trigger: true,
      behaviorType: true,
      severity: true,
    },
  });

  // Count triggers (simple keyword extraction)
  const triggerCounts = {};
  logs.forEach((log) => {
    if (log.trigger) {
      // Normalize trigger text (lowercase, trim)
      const normalized = log.trigger.toLowerCase().trim();
      if (!triggerCounts[normalized]) {
        triggerCounts[normalized] = {
          trigger: log.trigger, // Keep original for display
          count: 0,
          byBehaviorType: {},
          bySeverity: { Low: 0, Moderate: 0, High: 0 },
        };
      }
      triggerCounts[normalized].count++;
      triggerCounts[normalized].byBehaviorType[log.behaviorType] =
        (triggerCounts[normalized].byBehaviorType[log.behaviorType] || 0) + 1;
      triggerCounts[normalized].bySeverity[log.severity]++;
    }
  });

  // Sort by frequency
  const sortedTriggers = Object.values(triggerCounts)
    .sort((a, b) => b.count - a.count)
    .map((trigger, index) => ({
      ...trigger,
      rank: index + 1,
      percentage:
        logs.length > 0 ? (trigger.count / logs.length) * 100 : 0,
    }));

  return {
    period: {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
    totalLogsWithTriggers: logs.length,
    totalLogs: logs.length, // All logs in this query have triggers
    triggers: sortedTriggers,
    topTriggers: sortedTriggers.slice(0, 10), // Top 10
  };
}

/**
 * Detect escalation patterns - high-risk behaviors
 * @param {string} residentId - Resident ID (optional)
 * @param {string} tenantId - Tenant ID
 * @param {number} lookbackDays - Number of days to look back (default: 30)
 * @returns {Promise<Object>} Escalation detection results
 */
async function detectEscalations(
  residentId,
  tenantId,
  lookbackDays = 30
) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - lookbackDays);

  const where = {
    deletedAt: null,
    tenantId,
    ...(residentId && { residentId }),
    dateTime: {
      gte: startDate,
      lte: endDate,
    },
  };

  const logs = await prisma.behavioralLog.findMany({
    where,
    select: {
      id: true,
      residentId: true,
      behaviorType: true,
      severity: true,
      dateTime: true,
    },
    orderBy: {
      dateTime: "desc",
    },
  });

  const escalations = {
    highSeverityClusters: [],
    increasingFrequency: false,
    consecutiveHighSeverity: [],
    weeklyHighSeverity: {},
  };

  // Detect high severity clusters (3+ high severity in a week)
  const weeklyHighSeverity = {};
  logs
    .filter((l) => l.severity === "High")
    .forEach((log) => {
      const logDate = new Date(log.dateTime);
      const weekStart = new Date(logDate);
      weekStart.setDate(logDate.getDate() - logDate.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];

      if (!weeklyHighSeverity[weekKey]) {
        weeklyHighSeverity[weekKey] = [];
      }
      weeklyHighSeverity[weekKey].push(log);
    });

  Object.entries(weeklyHighSeverity).forEach(([week, weekLogs]) => {
    if (weekLogs.length >= 3) {
      escalations.highSeverityClusters.push({
        week,
        count: weekLogs.length,
        logs: weekLogs.map((l) => ({
          id: l.id,
          behaviorType: l.behaviorType,
          dateTime: l.dateTime,
        })),
      });
    }
  });

  // Detect consecutive high severity days
  const highSeverityLogs = logs.filter((l) => l.severity === "High");
  const consecutiveDays = [];
  let currentStreak = [];

  highSeverityLogs.forEach((log, index) => {
    const logDate = new Date(log.dateTime).toISOString().split("T")[0];
    const prevDate =
      index > 0
        ? new Date(highSeverityLogs[index - 1].dateTime)
            .toISOString()
            .split("T")[0]
        : null;

    if (prevDate === logDate || currentStreak.length === 0) {
      currentStreak.push(log);
    } else {
      if (currentStreak.length >= 2) {
        consecutiveDays.push([...currentStreak]);
      }
      currentStreak = [log];
    }
  });

  if (currentStreak.length >= 2) {
    consecutiveDays.push(currentStreak);
  }

  escalations.consecutiveHighSeverity = consecutiveDays.map((streak) => ({
    startDate: new Date(streak[streak.length - 1].dateTime),
    endDate: new Date(streak[0].dateTime),
    count: streak.length,
    logs: streak.map((l) => ({
      id: l.id,
      behaviorType: l.behaviorType,
      dateTime: l.dateTime,
    })),
  }));

  // Detect increasing frequency (compare first half vs second half)
  const midpoint = Math.floor(logs.length / 2);
  const firstHalf = logs.slice(0, midpoint);
  const secondHalf = logs.slice(midpoint);

  const firstHalfRate = firstHalf.length / (lookbackDays / 2);
  const secondHalfRate = secondHalf.length / (lookbackDays / 2);

  escalations.increasingFrequency =
    secondHalfRate > firstHalfRate * 1.2; // 20% increase threshold

  escalations.weeklyHighSeverity = Object.entries(weeklyHighSeverity).map(
    ([week, weekLogs]) => ({
      week,
      count: weekLogs.length,
      isEscalation: weekLogs.length >= 3,
    })
  );

  // Overall escalation status
  escalations.hasEscalation =
    escalations.highSeverityClusters.length > 0 ||
    escalations.consecutiveHighSeverity.length > 0 ||
    escalations.increasingFrequency;

  escalations.summary = {
    totalHighSeverity: highSeverityLogs.length,
    highSeverityClusters: escalations.highSeverityClusters.length,
    consecutiveDays: escalations.consecutiveHighSeverity.length,
    increasingFrequency: escalations.increasingFrequency,
  };

  return {
    period: {
      startDate,
      endDate,
      lookbackDays,
    },
    escalations,
  };
}

module.exports = {
  calculateBehaviorTrends,
  getBehaviorFrequency,
  getSeverityTrends,
  getTriggerAnalysis,
  detectEscalations,
};


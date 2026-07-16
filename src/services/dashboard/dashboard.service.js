const prisma = require("../../lib/prisma");
const userService = require("../user/user.service");

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getMonthBuckets(monthCount = 6) {
  const buckets = [];
  const now = new Date();
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({ key, label: MONTH_LABELS[d.getMonth()] });
  }
  return buckets;
}

function bucketCountsByMonth(dates, buckets) {
  const map = Object.fromEntries(buckets.map((b) => [b.key, 0]));
  for (const dt of dates) {
    const d = new Date(dt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (map[key] !== undefined) map[key] += 1;
  }
  return buckets.map((b) => map[b.key] || 0);
}

/**
 * @param {import('@prisma/client').User} user
 * @param {{ tenantId?: string|null }} query
 */
function resolveScope(user, query) {
  if (user.role === "SUPER_ADMIN") {
    const q = query.tenantId && String(query.tenantId).trim();
    if (q) {
      return { mode: "tenant", tenantId: q };
    }
    return { mode: "platform", tenantId: null };
  }
  return { mode: "tenant", tenantId: user.tenantId };
}

function tenantWhere(mode, tenantId) {
  if (mode === "platform") return {};
  return { tenantId };
}

function residentDisplayName(r) {
  if (!r) return null;
  const n =
    r.residentPreferredName?.trim() || r.residentFullLegalName?.trim() || "";
  return n || "Resident";
}

/**
 * Home dashboard aggregates (main /dashboard page).
 * @param {import('@prisma/client').User} user
 * @param {{
 *   tenantId?: string|null,
 *   residentId?: string|null,
 *   staffUserId?: string|null,
 *   facilityId?: string|null,
 * }} query
 */
async function getHomeDashboard(user, query = {}) {
  const { mode, tenantId } = resolveScope(user, query);

  let tenantRow = null;
  if (mode === "tenant" && tenantId) {
    tenantRow = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenantRow) {
      const err = new Error("Organization not found");
      err.statusCode = 404;
      throw err;
    }
  }

  const rawResidentId = query.residentId && String(query.residentId).trim();
  let residentId = null;
  let filterResident = null;

  if (rawResidentId) {
    if (mode !== "tenant" || !tenantId) {
      const err = new Error(
        "Select an organization before filtering by resident"
      );
      err.statusCode = 400;
      throw err;
    }
    filterResident = await prisma.resident.findFirst({
      where: { id: rawResidentId, tenantId, deletedAt: null },
      select: {
        id: true,
        residentFullLegalName: true,
        residentPreferredName: true,
      },
    });
    if (!filterResident) {
      const err = new Error("Resident not found");
      err.statusCode = 404;
      throw err;
    }
    residentId = filterResident.id;
  }

  const rawStaffUserId = query.staffUserId && String(query.staffUserId).trim();
  let staffUserId = null;
  let filterStaffUser = null;
  if (rawStaffUserId) {
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const err = new Error("Staff filter is only available for administrators");
      err.statusCode = 403;
      throw err;
    }
    if (mode !== "tenant" || !tenantId) {
      const err = new Error(
        "Select an organization before filtering by staff member"
      );
      err.statusCode = 400;
      throw err;
    }
    filterStaffUser = await prisma.user.findFirst({
      where: { id: rawStaffUserId, tenantId, isActive: true },
      select: { id: true, name: true, email: true },
    });
    if (!filterStaffUser) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }
    staffUserId = filterStaffUser.id;
  }

  const rawFacilityId = query.facilityId && String(query.facilityId).trim();
  let facilityId = null;
  let filterFacility = null;
  if (rawFacilityId) {
    if (user.role === "ADMIN") {
      const err = new Error(
        "Facility filter is not available for organization administrators"
      );
      err.statusCode = 403;
      throw err;
    }
    if (mode !== "tenant" || !tenantId) {
      const err = new Error(
        "Select an organization before filtering by facility"
      );
      err.statusCode = 400;
      throw err;
    }
    filterFacility = await prisma.facility.findFirst({
      where: { id: rawFacilityId, tenantId },
      select: { id: true, name: true },
    });
    if (!filterFacility) {
      const err = new Error("Facility not found");
      err.statusCode = 404;
      throw err;
    }
    facilityId = filterFacility.id;
  }

  const resWhere = {
    deletedAt: null,
    ...tenantWhere(mode, tenantId),
    ...(residentId ? { id: residentId } : {}),
  };
  const taskBase = {
    deletedAt: null,
    ...tenantWhere(mode, tenantId),
    ...(staffUserId ? { assigneeId: staffUserId } : {}),
  };
  const incidentWhere = {
    deletedAt: null,
    status: "Open",
    ...tenantWhere(mode, tenantId),
    ...(residentId ? { residentId } : {}),
    ...(staffUserId ? { staffId: staffUserId } : {}),
  };

  const behavioralWhere = {
    deletedAt: null,
    ...tenantWhere(mode, tenantId),
    ...(residentId ? { residentId } : {}),
    ...(staffUserId ? { staffId: staffUserId } : {}),
  };

  const visitorLogWhere =
    facilityId != null
      ? {
          facilityId,
          ...(residentId ? { residentId } : {}),
        }
      : null;

  const buckets = getMonthBuckets(6);
  const chartStart = new Date();
  chartStart.setMonth(chartStart.getMonth() - 5);
  chartStart.setDate(1);
  chartStart.setHours(0, 0, 0, 0);

  const userStatsOptions =
    user.role === "SUPER_ADMIN" && mode === "tenant" && tenantId
      ? { tenantId }
      : {};

  const [
    userStats,
    residentTotal,
    residentsNew30d,
    facilityCount,
    pendingTasks,
    inProgressTasks,
    openIncidents,
    recentResidents,
    residentsForChart,
    behavioralLogsForChart,
    visitorsForChart,
    tenantsForChart,
    tenantActiveCount,
    tenantInactiveCount,
    behavioralLogsTotal,
    behavioralLogsLast30d,
    visitorLogsTotal,
    visitorLogsLast30d,
  ] = await Promise.all([
    userService.getUserStats(user, userStatsOptions),
    prisma.resident.count({ where: resWhere }),
    prisma.resident.count({
      where: {
        ...resWhere,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.facility.count({
      where: {
        ...tenantWhere(mode, tenantId),
        ...(facilityId ? { id: facilityId } : {}),
      },
    }),
    prisma.task.count({
      where: { ...taskBase, status: "PENDING" },
    }),
    prisma.task.count({
      where: { ...taskBase, status: "IN_PROGRESS" },
    }),
    prisma.incidentReport.count({ where: incidentWhere }),
    mode === "tenant" && tenantId
      ? prisma.resident.findMany({
          where: resWhere,
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: {
            id: true,
            residentFullLegalName: true,
            residentPreferredName: true,
            admissionDate: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    mode === "tenant" && tenantId && !residentId
      ? prisma.resident.findMany({
          where: {
            ...resWhere,
            createdAt: { gte: chartStart },
          },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    mode === "tenant" && tenantId && residentId
      ? prisma.behavioralLog.findMany({
          where: {
            ...behavioralWhere,
            createdAt: { gte: chartStart },
          },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    mode === "tenant" && tenantId && facilityId && !residentId
      ? prisma.visitorLog.findMany({
          where: {
            facilityId,
            checkInAt: { gte: chartStart },
          },
          select: { checkInAt: true },
        })
      : Promise.resolve([]),
    mode === "platform"
      ? prisma.tenant.findMany({
          where: { createdAt: { gte: chartStart } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    mode === "platform"
      ? prisma.tenant.count({ where: { isActive: true } })
      : Promise.resolve(0),
    mode === "platform"
      ? prisma.tenant.count({ where: { isActive: false } })
      : Promise.resolve(0),
    prisma.behavioralLog.count({ where: behavioralWhere }),
    prisma.behavioralLog.count({
      where: {
        ...behavioralWhere,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    visitorLogWhere
      ? prisma.visitorLog.count({ where: visitorLogWhere })
      : Promise.resolve(null),
    visitorLogWhere
      ? prisma.visitorLog.count({
          where: {
            ...visitorLogWhere,
            checkInAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        })
      : Promise.resolve(null),
  ]);

  let chart;
  if (mode === "tenant" && tenantId && residentId) {
    const data = bucketCountsByMonth(
      behavioralLogsForChart.map((b) => b.createdAt),
      buckets
    );
    chart = {
      title: "Behavioral logs",
      categories: buckets.map((b) => b.label),
      series: [{ name: "New logs", data }],
    };
  } else if (mode === "tenant" && tenantId && facilityId && !residentId) {
    const data = bucketCountsByMonth(
      visitorsForChart.map((v) => v.checkInAt),
      buckets
    );
    chart = {
      title: "Visitor check-ins",
      categories: buckets.map((b) => b.label),
      series: [{ name: "Check-ins", data }],
    };
  } else if (mode === "tenant" && tenantId) {
    const data = bucketCountsByMonth(
      residentsForChart.map((r) => r.createdAt),
      buckets
    );
    chart = {
      title: "New residents",
      categories: buckets.map((b) => b.label),
      series: [{ name: "New residents", data }],
    };
  } else if (mode === "platform") {
    const data = bucketCountsByMonth(
      tenantsForChart.map((t) => t.createdAt),
      buckets
    );
    chart = {
      title: "New organizations",
      categories: buckets.map((b) => b.label),
      series: [{ name: "New organizations", data }],
    };
  } else {
    chart = {
      title: "",
      categories: buckets.map((b) => b.label),
      series: [{ name: "", data: buckets.map(() => 0) }],
    };
  }

  const recentResidentsFormatted = recentResidents.map((r) => {
    const name =
      r.residentPreferredName?.trim() ||
      r.residentFullLegalName?.trim() ||
      "Unnamed resident";
    return {
      id: r.id,
      name,
      admissionDate: r.admissionDate,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    };
  });

  return {
    scope: mode,
    tenantId: mode === "tenant" ? tenantId : null,
    tenantName: tenantRow?.name ?? null,
    filters: {
      tenantId: mode === "tenant" ? tenantId : null,
      residentId,
      residentName: filterResident ? residentDisplayName(filterResident) : null,
      staffUserId,
      staffName: filterStaffUser?.name ?? null,
      facilityId,
      facilityName: filterFacility?.name ?? null,
    },
    users: userStats,
    residents: {
      total: residentTotal,
      newLast30Days: residentsNew30d,
    },
    facilities: { count: facilityCount },
    tasks: {
      pending: pendingTasks,
      inProgress: inProgressTasks,
    },
    incidents: { open: openIncidents },
    behavioralLogs: {
      total: behavioralLogsTotal,
      last30Days: behavioralLogsLast30d,
    },
    visitorLogs:
      visitorLogsTotal != null
        ? { total: visitorLogsTotal, last30Days: visitorLogsLast30d ?? 0 }
        : null,
    organizations:
      mode === "platform"
        ? { active: tenantActiveCount, inactive: tenantInactiveCount }
        : null,
    chart,
    recentResidents: recentResidentsFormatted,
  };
}

module.exports = {
  getHomeDashboard,
  resolveScope,
};

const prisma = require("../../lib/prisma");
const facilityService = require("./facility.service");

const REGULAR_INTERVAL_DAYS = 60;
const ANNUAL_INTERVAL_DAYS = 365;

/**
 * Get facilityId for tenant (creates facility if needed)
 * @param {string} tenantId - Tenant ID
 * @param {string} [facilityId] - Optional facility ID (when tenant has multiple facilities)
 */
async function resolveFacilityId(tenantId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  return facility.id;
}

/**
 * List drills for a facility
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - { drillType?, facilityId?, page?, limit? }
 */
async function listDrills(tenantId, filters = {}) {
  const { facilityId, ...rest } = filters;
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);
  const { drillType, page = 1, limit = 50 } = rest;

  const where = { facilityId: resolvedFacilityId };
  if (drillType) where.drillType = drillType;

  const [drills, total] = await Promise.all([
    prisma.evacuationDrill.findMany({
      where,
      orderBy: { scheduledDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.evacuationDrill.count({ where }),
  ]);

  return {
    drills,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Create a drill
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - { drillType, scheduledDate, notes?, facilityId? }
 */
async function createDrill(tenantId, data) {
  const { facilityId } = data;
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);
  const { drillType, scheduledDate, notes } = data;

  return prisma.evacuationDrill.create({
    data: {
      facilityId: resolvedFacilityId,
      drillType,
      scheduledDate: new Date(scheduledDate),
      notes: notes?.trim() || null,
    },
  });
}

/**
 * Mark drill as completed
 * @param {string} tenantId - Tenant ID
 * @param {string} drillId - Drill ID
 * @param {Object} data - { completedDate?, completedBy?, notes?, facilityId? }
 */
async function completeDrill(tenantId, drillId, data) {
  const { facilityId } = data;
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);
  const { completedDate, completedBy, notes } = data;

  const drill = await prisma.evacuationDrill.findFirst({
    where: { id: drillId, facilityId: resolvedFacilityId },
  });
  if (!drill) return null;

  return prisma.evacuationDrill.update({
    where: { id: drillId },
    data: {
      completedDate: completedDate ? new Date(completedDate) : new Date(),
      completedBy: completedBy || null,
      notes: notes !== undefined ? notes?.trim() || null : drill.notes,
    },
  });
}

/**
 * Get compliance status: next regular due (60 days), next annual due (1 year)
 * @param {string} tenantId - Tenant ID
 * @param {string} [facilityId] - Optional facility ID
 */
async function getComplianceStatus(tenantId, facilityId) {
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastRegular = await prisma.evacuationDrill.findFirst({
    where: {
      facilityId: resolvedFacilityId,
      drillType: "REGULAR",
      completedDate: { not: null },
    },
    orderBy: { completedDate: "desc" },
  });

  const lastAnnual = await prisma.evacuationDrill.findFirst({
    where: {
      facilityId: resolvedFacilityId,
      drillType: "ANNUAL_FULL",
      completedDate: { not: null },
    },
    orderBy: { completedDate: "desc" },
  });

  let regularDue = null;
  let annualDue = null;

  if (lastRegular?.completedDate) {
    const next = new Date(lastRegular.completedDate);
    next.setDate(next.getDate() + REGULAR_INTERVAL_DAYS);
    next.setHours(0, 0, 0, 0);
    regularDue = next;
  }
  // When no completed regular drill: null = "not started yet" (don't show as overdue)

  if (lastAnnual?.completedDate) {
    const next = new Date(lastAnnual.completedDate);
    next.setFullYear(next.getFullYear() + 1);
    next.setHours(0, 0, 0, 0);
    annualDue = next;
  }
  // When no completed annual drill: null = "not started yet" (don't show as overdue)

  return {
    regularDue: regularDue ? regularDue.toISOString().split("T")[0] : null,
    annualDue: annualDue ? annualDue.toISOString().split("T")[0] : null,
    lastRegularDrill: lastRegular
      ? {
          id: lastRegular.id,
          completedDate: lastRegular.completedDate?.toISOString().split("T")[0],
        }
      : null,
    lastAnnualDrill: lastAnnual
      ? {
          id: lastAnnual.id,
          completedDate: lastAnnual.completedDate?.toISOString().split("T")[0],
        }
      : null,
  };
}

module.exports = {
  listDrills,
  createDrill,
  completeDrill,
  getComplianceStatus,
};

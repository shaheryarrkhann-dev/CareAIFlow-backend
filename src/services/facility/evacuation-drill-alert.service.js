const evacuationDrillService = require("./evacuation-drill.service");

const UPCOMING_DAYS = 7; // Alert when due within 7 days

/**
 * Check drill alerts for a tenant (facility)
 * Returns upcoming (due within 7 days) and overdue drills
 * @param {string} tenantId - Tenant ID
 * @param {string} [facilityId] - Optional facility ID (when tenant has multiple facilities)
 * @returns {Promise<Object>} { regularOverdue, regularUpcoming, annualOverdue, annualUpcoming }
 */
async function checkDrillAlerts(tenantId, facilityId) {
  const status = await evacuationDrillService.getComplianceStatus(
    tenantId,
    facilityId
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const addDays = (dateStr, days) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

  const regularDue = status.regularDue;
  const annualDue = status.annualDue;

  const regularOverdue = regularDue && regularDue < todayStr;
  const annualOverdue = annualDue && annualDue < todayStr;
  const regularUpcoming =
    regularDue &&
    !regularOverdue &&
    regularDue <= addDays(todayStr, UPCOMING_DAYS);
  const annualUpcoming =
    annualDue &&
    !annualOverdue &&
    annualDue <= addDays(todayStr, UPCOMING_DAYS);

  return {
    regularOverdue: regularOverdue || false,
    regularUpcoming: !!regularUpcoming,
    regularDue: regularDue || null,
    annualOverdue: annualOverdue || false,
    annualUpcoming: !!annualUpcoming,
    annualDue: annualDue || null,
    lastRegularDrill: status.lastRegularDrill,
    lastAnnualDrill: status.lastAnnualDrill,
  };
}

/**
 * Check drill alerts for all tenants with facilities
 * Used by cron job
 * @returns {Promise<Array>} Array of { tenantId, facilityName, alerts }
 */
async function checkAllDrillAlerts() {
  const prisma = require("../../lib/prisma");
  const facilities = await prisma.facility.findMany({
    include: { tenant: { select: { id: true, name: true } } },
  });

  const results = [];
  for (const f of facilities) {
    const alerts = await checkDrillAlerts(f.tenantId, f.id);
    if (
      alerts.regularOverdue ||
      alerts.regularUpcoming ||
      alerts.annualOverdue ||
      alerts.annualUpcoming
    ) {
      results.push({
        tenantId: f.tenantId,
        facilityId: f.id,
        facilityName: f.name,
        tenantName: f.tenant.name,
        alerts,
      });
    }
  }
  return results;
}

module.exports = {
  checkDrillAlerts,
  checkAllDrillAlerts,
};

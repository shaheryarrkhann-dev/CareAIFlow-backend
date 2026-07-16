const prisma = require("../../lib/prisma");
const facilityService = require("./facility.service");
const { sendVisitorCheckoutReminderEmail } = require("../../utils/email.util");

function getResidentDisplayName(resident) {
  if (!resident) return "";
  const preferred =
    resident.residentIdentificationPreferredName ||
    resident.residentPreferredName;
  const fullLegal =
    resident.residentIdentificationFullLegalName ||
    resident.residentFullLegalName;
  return preferred || fullLegal || "";
}

async function resolveFacilityId(tenantId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  return facility.id;
}

/**
 * List visitor logs with filters
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - { residentId?, startDate?, endDate?, activeOnly?, facilityId?, page?, limit? }
 */
async function listVisitors(tenantId, filters = {}) {
  const { facilityId, ...rest } = filters;
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);
  const {
    residentId,
    startDate,
    endDate,
    activeOnly,
    page = 1,
    limit = 50,
  } = rest;

  const where = { facilityId: resolvedFacilityId };
  if (residentId) where.residentId = residentId;
  if (startDate || endDate) {
    where.checkInAt = {};
    if (startDate) where.checkInAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.checkInAt.lte = end;
    }
  }
  if (activeOnly) where.checkOutAt = null;

  const [logs, total] = await Promise.all([
    prisma.visitorLog.findMany({
      where,
      orderBy: { checkInAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        facility: { select: { name: true } },
        resident: {
          select: {
            id: true,
            residentPreferredName: true,
            residentFullLegalName: true,
            residentIdentificationPreferredName: true,
            residentIdentificationFullLegalName: true,
          },
        },
      },
    }),
    prisma.visitorLog.count({ where }),
  ]);

  return {
    visitors: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Check-in: create visitor log
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - { visitorName, residentId?, personVisitedName?, visitorEmail?, visitorPhone?, expectedDurationMinutes?, notes?, facilityId? }
 */
async function checkIn(tenantId, data) {
  const { facilityId } = data;
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);
  const {
    visitorName,
    residentId,
    personVisitedName,
    visitorEmail,
    visitorPhone,
    expectedDurationMinutes,
    notes,
  } = data;

  return prisma.visitorLog.create({
    data: {
      facilityId: resolvedFacilityId,
      visitorName: visitorName.trim(),
      residentId: residentId || null,
      personVisitedName: personVisitedName?.trim() || null,
      visitorEmail: visitorEmail?.trim() || null,
      visitorPhone: visitorPhone?.trim() || null,
      expectedDurationMinutes:
        expectedDurationMinutes != null ? Number(expectedDurationMinutes) : null,
      checkInAt: new Date(),
      notes: notes?.trim() || null,
    },
  });
}

/**
 * Check-out: set checkOutAt
 * @param {string} tenantId - Tenant ID
 * @param {string} logId - Visitor log ID
 * @param {string} [facilityId] - Optional facility ID
 */
async function checkOut(tenantId, logId, facilityId) {
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);

  const log = await prisma.visitorLog.findFirst({
    where: { id: logId, facilityId: resolvedFacilityId },
  });
  if (!log) return null;
  if (log.checkOutAt) return log; // Already checked out

  return prisma.visitorLog.update({
    where: { id: logId },
    data: { checkOutAt: new Date() },
  });
}

/**
 * Link a visitor log entry to a resident (staff links after public sign-in)
 * @param {string} tenantId - Tenant ID
 * @param {string} logId - Visitor log ID
 * @param {string} residentId - Resident UUID to link
 * @param {string} [facilityId] - Optional facility ID
 * @returns {Promise<object|null>} Updated log with resident, or null if not found
 */
async function linkResident(tenantId, logId, residentId, facilityId) {
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);

  const log = await prisma.visitorLog.findFirst({
    where: { id: logId, facilityId: resolvedFacilityId },
  });
  if (!log) return null;

  return prisma.visitorLog.update({
    where: { id: logId },
    data: { residentId },
    include: {
      facility: { select: { name: true } },
      resident: {
        select: {
          id: true,
          residentPreferredName: true,
          residentFullLegalName: true,
          residentIdentificationPreferredName: true,
          residentIdentificationFullLegalName: true,
        },
      },
    },
  });
}

/**
 * Export visitor logs to CSV
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - { residentId?, startDate?, endDate?, facilityId? }
 */
async function exportToCsv(tenantId, filters = {}) {
  const { facilityId, residentId, startDate, endDate } = filters;
  const resolvedFacilityId = await resolveFacilityId(tenantId, facilityId);

  const where = { facilityId: resolvedFacilityId };
  if (residentId) where.residentId = residentId;
  if (startDate || endDate) {
    where.checkInAt = {};
    if (startDate) where.checkInAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.checkInAt.lte = end;
    }
  }

  const logs = await prisma.visitorLog.findMany({
    where,
    orderBy: { checkInAt: "desc" },
    include: {
      resident: {
        select: {
          residentPreferredName: true,
          residentFullLegalName: true,
          residentIdentificationPreferredName: true,
          residentIdentificationFullLegalName: true,
        },
      },
    },
  });

  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n"))
      return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const headers = [
    "Visitor Name",
    "Visitor Email",
    "Visitor Phone",
    "Person Visited / Resident",
    "Check In",
    "Check Out",
    "Expected Duration (min)",
    "Notes",
  ];
  const rows = logs.map((l) => {
    const residentName = getResidentDisplayName(l.resident);
    const personVisited = l.personVisitedName || residentName;
    return [
      escape(l.visitorName),
      escape(l.visitorEmail || ""),
      escape(l.visitorPhone || ""),
      escape(personVisited),
      escape(l.checkInAt?.toISOString()),
      escape(l.checkOutAt?.toISOString() || ""),
      escape(l.expectedDurationMinutes != null ? String(l.expectedDurationMinutes) : ""),
      escape(l.notes),
    ];
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  return Buffer.from(csv, "utf-8");
}

const REMINDER_MINUTES_BEFORE = 5;

/**
 * Process visitor reminders (email 5 min before expected checkout) and auto-checkout.
 * Call from a cron job every 1–2 minutes.
 * @returns {{ remindersSent: number, autoCheckedOut: number }}
 */
async function processVisitorRemindersAndAutoCheckout() {
  const now = new Date();
  let remindersSent = 0;
  let autoCheckedOut = 0;

  // Active logs with expected duration and email, reminder not yet sent
  const forReminder = await prisma.visitorLog.findMany({
    where: {
      checkOutAt: null,
      expectedDurationMinutes: { not: null },
      visitorEmail: { not: null },
      reminderSentAt: null,
    },
    include: { facility: { select: { name: true } } },
  });

  for (const log of forReminder) {
    const checkInAt = new Date(log.checkInAt);
    const expectedEnd = new Date(
      checkInAt.getTime() + log.expectedDurationMinutes * 60 * 1000
    );
    const reminderTime = new Date(
      expectedEnd.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000
    );
    // Send reminder when we're within the 5-min-before window (e.g. now >= reminderTime and now < expectedEnd)
    if (now >= reminderTime && now < expectedEnd) {
      try {
        const facilityName = log.facility?.name || "Facility";
        await sendVisitorCheckoutReminderEmail(
          log.visitorEmail,
          log.visitorName,
          facilityName,
          expectedEnd
        );
        await prisma.visitorLog.update({
          where: { id: log.id },
          data: { reminderSentAt: now },
        });
        remindersSent += 1;
      } catch (err) {
        console.error(
          `Visitor reminder email failed for log ${log.id}:`,
          err?.message
        );
      }
    }
  }

  // Auto-checkout: active logs where expected end time has passed
  const forAutoCheckOut = await prisma.visitorLog.findMany({
    where: {
      checkOutAt: null,
      expectedDurationMinutes: { not: null },
    },
  });

  for (const log of forAutoCheckOut) {
    const checkInAt = new Date(log.checkInAt);
    const expectedEnd = new Date(
      checkInAt.getTime() + log.expectedDurationMinutes * 60 * 1000
    );
    if (now >= expectedEnd) {
      await prisma.visitorLog.update({
        where: { id: log.id },
        data: { checkOutAt: now },
      });
      autoCheckedOut += 1;
    }
  }

  return { remindersSent, autoCheckedOut };
}

module.exports = {
  listVisitors,
  checkIn,
  checkOut,
  linkResident,
  exportToCsv,
  processVisitorRemindersAndAutoCheckout,
};

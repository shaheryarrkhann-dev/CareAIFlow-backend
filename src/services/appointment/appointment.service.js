const prisma = require("../../lib/prisma");
const { PDFDocument } = require("pdf-lib");
const letterheadPdf = require("../document/letterheadPdf.service");
const { validateResidentId } = require("../resident/resident.service");

async function resolveTenantId(user, tenantIdFromQuery) {
  if (user.role === "SUPER_ADMIN") {
    const tenantId = tenantIdFromQuery || user.tenantId;
    if (!tenantId) {
      throw new Error("tenantId is required when creating appointment as SUPER_ADMIN");
    }
    return tenantId;
  }
  const tenantId = user.tenantId;
  if (!tenantId) {
    throw new Error("You must belong to a tenant to manage appointments");
  }
  return tenantId;
}

async function validateStaffId(staffId, tenantId) {
  if (!staffId || !tenantId) return true;
  const staff = await prisma.staffMember.findFirst({
    where: { id: staffId, tenantId },
    select: { id: true },
  });
  return !!staff;
}

async function validateFacilityId(facilityId, tenantId) {
  if (!facilityId || !tenantId) return true;
  const facility = await prisma.facility.findFirst({
    where: { id: facilityId, tenantId },
    select: { id: true },
  });
  return !!facility;
}

const appointmentInclude = {
  resident: {
    select: {
      id: true,
      residentFullLegalName: true,
      residentPreferredName: true,
      residentIdentificationPreferredName: true,
      residentIdentificationFullLegalName: true,
    },
  },
  staff: {
    select: {
      id: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  facility: {
    select: { id: true, name: true },
  },
  reminders: true,
};

function formatAppointment(appointment) {
  if (!appointment) return null;
  const a = { ...appointment };
  if (a.staff?.user) {
    a.staffName = a.staff.user?.name ?? null;
    a.staff = { id: a.staff.id, name: a.staff.user?.name, email: a.staff.user?.email };
  }
  if (a.resident) {
    a.residentName =
      a.resident.residentIdentificationPreferredName ||
      a.resident.residentPreferredName ||
      a.resident.residentIdentificationFullLegalName ||
      a.resident.residentFullLegalName ||
      null;
  }
  return a;
}

/** Default duration in minutes when not specified (for conflict check and calendar end time) */
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_APPOINTMENT_DURATION_MS = DEFAULT_DURATION_MINUTES * 60 * 1000;

function getAppointmentEndMs(scheduledAt, durationMinutes) {
  const minutes = durationMinutes != null && [15, 30, 45, 60].includes(Number(durationMinutes))
    ? Number(durationMinutes)
    : DEFAULT_DURATION_MINUTES;
  return new Date(scheduledAt).getTime() + minutes * 60 * 1000;
}

/**
 * Check for overlapping appointments (same resident, staff, or facility) in the given time range.
 * Uses each appointment's durationMinutes (or 60 if null) to compute end time.
 * @param {string} tenantId
 * @param {object} options - { residentId?, staffId?, facilityId?, start, end, excludeAppointmentId? }
 */
async function findConflictingAppointments(tenantId, options) {
  const { residentId, staffId, facilityId, start, end, excludeAppointmentId } = options;
  const hasLink = residentId || staffId || facilityId;
  if (!hasLink) return [];

  const orConditions = [];
  if (residentId) orConditions.push({ residentId });
  if (staffId) orConditions.push({ staffId });
  if (facilityId) orConditions.push({ facilityId });

  const startDate = new Date(start);
  const endDate = new Date(end);
  // Fetch appointments that start before the new range end (candidates for overlap)
  const whereCandidates = {
    tenantId,
    deletedAt: null,
    OR: orConditions,
    ...(excludeAppointmentId && { id: { not: excludeAppointmentId } }),
    scheduledAt: { lt: endDate },
  };

  const candidates = await prisma.appointment.findMany({
    where: whereCandidates,
    select: { id: true, title: true, scheduledAt: true, durationMinutes: true },
  });

  const startMs = startDate.getTime();
  const conflicting = candidates.filter((a) => {
    const existingEndMs = getAppointmentEndMs(a.scheduledAt, a.durationMinutes);
    return existingEndMs > startMs;
  });
  return conflicting;
}

async function createAppointment(data, user, tenantIdFromQuery = null) {
  const tenantId = await resolveTenantId(user, tenantIdFromQuery);

  if (data.residentId) {
    const valid = await validateResidentId(data.residentId.trim(), tenantId);
    if (!valid) {
      throw new Error("Resident not found or does not belong to your organization");
    }
  }
  if (data.staffId) {
    const valid = await validateStaffId(data.staffId.trim(), tenantId);
    if (!valid) {
      throw new Error("Staff member not found or does not belong to your organization");
    }
  }
  if (data.facilityId) {
    const valid = await validateFacilityId(data.facilityId.trim(), tenantId);
    if (!valid) {
      throw new Error("Facility not found or does not belong to your organization");
    }
  }

  const reminderMinutes = Array.isArray(data.reminderMinutesBefore)
    ? [...new Set(data.reminderMinutesBefore)].filter((m) => Number.isInteger(m) && m >= 0)
    : [];

  const durationMinutes = [15, 30, 45, 60].includes(Number(data.durationMinutes))
    ? Number(data.durationMinutes)
    : DEFAULT_DURATION_MINUTES;
  const scheduledAt = new Date(data.scheduledAt);
  const endAt = new Date(getAppointmentEndMs(scheduledAt, durationMinutes));
  const conflicts = await findConflictingAppointments(tenantId, {
    residentId: data.residentId?.trim() || null,
    staffId: data.staffId?.trim() || null,
    facilityId: data.facilityId?.trim() || null,
    start: scheduledAt,
    end: endAt,
  });
  if (conflicts.length > 0) {
    const first = conflicts[0];
    throw new Error(
      `This time conflicts with another appointment: "${first.title}" at ${first.scheduledAt.toISOString()}. Please choose a different time or resource.`
    );
  }

  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      title: data.title.trim(),
      scheduledAt,
      durationMinutes,
      location: data.location?.trim() || null,
      notes: data.notes?.trim() || null,
      appointmentType: data.appointmentType,
      status: data.status?.trim() || "SCHEDULED",
      residentId: data.residentId?.trim() || null,
      staffId: data.staffId?.trim() || null,
      facilityId: data.facilityId?.trim() || null,
      reminders: reminderMinutes.length
        ? {
            create: reminderMinutes.map((minutes) => ({
              tenantId,
              reminderMinutesBefore: minutes,
            })),
          }
        : undefined,
    },
    include: appointmentInclude,
  });

  return formatAppointment(appointment);
}

async function getAppointmentById(id, user) {
  const tenantId = await resolveTenantId(user, null);
  const appointment = await prisma.appointment.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
    include: appointmentInclude,
  });
  if (!appointment) {
    throw new Error("Appointment not found");
  }
  return formatAppointment(appointment);
}

/**
 * Compute dateFrom/dateTo (UTC) for calendar view.
 * @param {string} view - 'day' | 'week' | 'month'
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {{ dateFrom: string, dateTo: string }}
 */
function computeCalendarRange(view, dateStr) {
  const d = new Date(dateStr + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date for calendar");
  }
  let start;
  let end;
  if (view === "day") {
    start = new Date(d);
    end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  } else if (view === "week") {
    const dayOfWeek = d.getUTCDay();
    const daysFromMonday = (dayOfWeek + 6) % 7;
    start = new Date(d);
    start.setUTCDate(start.getUTCDate() - daysFromMonday);
    start.setUTCHours(0, 0, 0, 0);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
  } else {
    // month - use UTC
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    end = new Date(Date.UTC(y, m, lastDay.getUTCDate(), 23, 59, 59, 999));
  }
  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
  };
}

async function getCalendarAppointments(view, dateStr, user, tenantIdFromQuery = null) {
  const range = computeCalendarRange(view || "day", dateStr);
  const filters = {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    page: 1,
    limit: 500,
    tenantId: tenantIdFromQuery,
  };
  const result = await listAppointments(filters, user);
  return { appointments: result.appointments };
}

async function listAppointments(filters, user) {
  const tenantIdFromQuery = user.role === "SUPER_ADMIN" ? filters.tenantId : null;
  const tenantId = await resolveTenantId(user, tenantIdFromQuery);

  const {
    page = 1,
    limit = 20,
    residentId,
    staffId,
    facilityId,
    dateFrom,
    dateTo,
    type,
    status,
  } = filters;

  const where = {
    tenantId,
    deletedAt: null,
    ...(residentId && { residentId }),
    ...(staffId && { staffId }),
    ...(facilityId && { facilityId }),
    ...(type && { appointmentType: type }),
    ...(status && { status }),
  };

  if (dateFrom || dateTo) {
    where.scheduledAt = {};
    if (dateFrom) {
      const from = dateFrom;
      // If date-only (YYYY-MM-DD), use start of day UTC
      where.scheduledAt.gte = from.length === 10 ? new Date(from + "T00:00:00.000Z") : new Date(from);
    }
    if (dateTo) {
      const to = dateTo;
      // If date-only (YYYY-MM-DD), use end of day UTC so the full day is included
      where.scheduledAt.lte =
        to.length === 10 ? new Date(to + "T23:59:59.999Z") : new Date(to);
    }
  }

  const skip = (page - 1) * limit;
  const take = Math.min(limit, 100);

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip,
      take,
      orderBy: { scheduledAt: "asc" },
      include: appointmentInclude,
    }),
    prisma.appointment.count({ where }),
  ]);

  return {
    appointments: appointments.map(formatAppointment),
    pagination: {
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

async function updateAppointment(id, data, user) {
  const tenantId = await resolveTenantId(user, null);
  const existing = await prisma.appointment.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { reminders: true },
  });
  if (!existing) {
    throw new Error("Appointment not found");
  }

  if (data.residentId !== undefined) {
    if (data.residentId) {
      const valid = await validateResidentId(data.residentId.trim(), tenantId);
      if (!valid) {
        throw new Error("Resident not found or does not belong to your organization");
      }
    }
  }
  if (data.staffId !== undefined && data.staffId) {
    const valid = await validateStaffId(data.staffId.trim(), tenantId);
    if (!valid) {
      throw new Error("Staff member not found or does not belong to your organization");
    }
  }
  if (data.facilityId !== undefined && data.facilityId) {
    const valid = await validateFacilityId(data.facilityId.trim(), tenantId);
    if (!valid) {
      throw new Error("Facility not found or does not belong to your organization");
    }
  }

  const finalResidentId = data.residentId !== undefined ? (data.residentId?.trim() || null) : existing.residentId;
  const finalStaffId = data.staffId !== undefined ? (data.staffId?.trim() || null) : existing.staffId;
  const finalFacilityId = data.facilityId !== undefined ? (data.facilityId?.trim() || null) : existing.facilityId;
  const finalScheduledAt = data.scheduledAt !== undefined ? new Date(data.scheduledAt) : existing.scheduledAt;
  const finalDurationMinutes = data.durationMinutes !== undefined
    ? ([15, 30, 45, 60].includes(Number(data.durationMinutes)) ? Number(data.durationMinutes) : existing.durationMinutes ?? DEFAULT_DURATION_MINUTES)
    : (existing.durationMinutes ?? DEFAULT_DURATION_MINUTES);
  const endAt = new Date(getAppointmentEndMs(finalScheduledAt, finalDurationMinutes));
  const conflicts = await findConflictingAppointments(tenantId, {
    residentId: finalResidentId,
    staffId: finalStaffId,
    facilityId: finalFacilityId,
    start: finalScheduledAt,
    end: endAt,
    excludeAppointmentId: id,
  });
  if (conflicts.length > 0) {
    const first = conflicts[0];
    throw new Error(
      `This time conflicts with another appointment: "${first.title}" at ${first.scheduledAt.toISOString()}. Please choose a different time or resource.`
    );
  }

  const updateData = {
    ...(data.title !== undefined && { title: data.title.trim() }),
    ...(data.scheduledAt !== undefined && { scheduledAt: new Date(data.scheduledAt) }),
    ...(data.durationMinutes !== undefined && { durationMinutes: [15, 30, 45, 60].includes(Number(data.durationMinutes)) ? Number(data.durationMinutes) : null }),
    ...(data.location !== undefined && { location: data.location?.trim() || null }),
    ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
    ...(data.appointmentType !== undefined && { appointmentType: data.appointmentType }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.residentId !== undefined && { residentId: data.residentId?.trim() || null }),
    ...(data.staffId !== undefined && { staffId: data.staffId?.trim() || null }),
    ...(data.facilityId !== undefined && { facilityId: data.facilityId?.trim() || null }),
  };

  if (data.reminderMinutesBefore !== undefined) {
    const reminderMinutes = Array.isArray(data.reminderMinutesBefore)
      ? [...new Set(data.reminderMinutesBefore)].filter((m) => Number.isInteger(m) && m >= 0)
      : [];
    await prisma.appointmentReminder.deleteMany({ where: { appointmentId: id } });
    if (reminderMinutes.length > 0) {
      await prisma.appointmentReminder.createMany({
        data: reminderMinutes.map((minutes) => ({
          appointmentId: id,
          tenantId,
          reminderMinutesBefore: minutes,
        })),
      });
    }
  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data: updateData,
    include: appointmentInclude,
  });

  return formatAppointment(appointment);
}

async function deleteAppointment(id, user) {
  const tenantId = await resolveTenantId(user, null);
  const existing = await prisma.appointment.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!existing) {
    throw new Error("Appointment not found");
  }
  await prisma.appointment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return { id, tenantId: existing.tenantId };
}

async function getNotifications(user, options = {}) {
  const { unreadOnly = false, limit = 50 } = options;
  const where = { userId: user.id };
  if (user.tenantId) {
    where.tenantId = user.tenantId;
  }
  if (unreadOnly) {
    where.readAt = null;
  }
  const notifications = await prisma.appointmentNotification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    select: {
      id: true,
      appointmentId: true,
      title: true,
      message: true,
      readAt: true,
      createdAt: true,
    },
  });
  return notifications;
}

async function markNotificationRead(notificationId, user) {
  const where = { id: notificationId, userId: user.id };
  if (user.tenantId) {
    where.tenantId = user.tenantId;
  }
  const notification = await prisma.appointmentNotification.findFirst({
    where,
  });
  if (!notification) {
    throw new Error("Notification not found");
  }
  await prisma.appointmentNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return { id: notificationId };
}

/**
 * Export appointments to CSV or PDF
 * @param {object} user
 * @param {object} options - { dateFrom, dateTo, format: 'csv'|'pdf', tenantId? }
 * @returns {{ contentType: string, buffer: Buffer, filename: string }}
 */
async function exportAppointments(user, options = {}) {
  const { dateFrom, dateTo, format = "csv" } = options;
  const tenantIdFromQuery = user.role === "SUPER_ADMIN" ? options.tenantId : null;
  const tenantIdForLetterhead = await resolveTenantId(user, tenantIdFromQuery);
  const result = await listAppointments(
    {
      dateFrom,
      dateTo,
      page: 1,
      limit: 10000,
      tenantId: tenantIdFromQuery,
    },
    user
  );
  const appointments = result.appointments || [];

  if (format === "csv") {
    const header =
      "Title,Scheduled At,Type,Status,Resident,Staff,Facility,Location,Notes\n";
    const rows = appointments.map((a) => {
      const escape = (v) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      return [
        escape(a.title),
        escape(a.scheduledAt),
        escape(a.appointmentType),
        escape(a.status),
        escape(a.residentName ?? a.resident?.residentPreferredName ?? ""),
        escape(a.staffName ?? a.staff?.name ?? ""),
        escape(a.facility?.name ?? ""),
        escape(a.location),
        escape(a.notes),
      ].join(",");
    });
    const csv = header + rows.join("\n");
    return {
      contentType: "text/csv; charset=utf-8",
      buffer: Buffer.from(csv, "utf-8"),
      filename: `appointments-${dateFrom}-to-${dateTo}.csv`,
    };
  }

  // PDF
  const pdfDoc = await PDFDocument.create();
  const letterheadAssets = await letterheadPdf.prepareLetterheadAssets(
    pdfDoc,
    tenantIdForLetterhead,
    options.facilityId
  );
  const font = letterheadAssets.fonts.font;
  const boldFont = letterheadAssets.fonts.boldFont;
  let currentPage = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
  const margin = 50;
  const pageHeight = 792;
  const bottomMin = letterheadPdf.contentBottomMin(letterheadAssets);
  let y = letterheadAssets.contentStartY;

  currentPage.drawText("Appointments Export", {
    x: margin,
    y,
    size: 16,
    font: boldFont,
  });
  y -= 24;
  currentPage.drawText(`Date range: ${dateFrom} to ${dateTo}`, {
    x: margin,
    y,
    size: 10,
    font,
  });
  y -= 20;

  const colWidths = [80, 100, 70, 70, 80, 70, 60];
  const headers = ["Title", "Scheduled", "Type", "Status", "Resident", "Staff", "Location"];

  const drawRow = (page, textArr, useBold = false) => {
    let x = margin;
    textArr.forEach((cell, i) => {
      page.drawText(String(cell).slice(0, 20), {
        x,
        y,
        size: useBold ? 9 : 8,
        font: useBold ? boldFont : font,
      });
      x += colWidths[i];
    });
  };

  let x = margin;
  headers.forEach((h, i) => {
    currentPage.drawText(h, { x, y, size: 9, font: boldFont });
    x += colWidths[i];
  });
  y -= 14;

  for (const a of appointments) {
    if (y < bottomMin + 40) {
      currentPage = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
      y = letterheadAssets.contentStartY;
      drawRow(currentPage, headers, true);
      y -= 14;
    }
    const scheduledStr = a.scheduledAt
      ? new Date(a.scheduledAt).toLocaleString()
      : "";
    const residentStr = a.residentName ?? a.resident?.residentPreferredName ?? "";
    const staffStr = a.staffName ?? a.staff?.name ?? "";
    const row = [
      (a.title || "").slice(0, 20),
      scheduledStr.slice(0, 18),
      (a.appointmentType || "").slice(0, 10),
      (a.status || "").slice(0, 10),
      residentStr.slice(0, 14),
      staffStr.slice(0, 14),
      (a.location || "").slice(0, 12),
    ];
    drawRow(currentPage, row, false);
    y -= 12;
  }

  letterheadPdf.stampPageNumbers(pdfDoc, font, margin);
  const pdfBytes = await pdfDoc.save();
  return {
    contentType: "application/pdf",
    buffer: Buffer.from(pdfBytes),
    filename: `appointments-${dateFrom}-to-${dateTo}.pdf`,
  };
}

const UPCOMING_APPOINTMENT_DAYS = 7;

/**
 * Scheduled appointments for a tenant within the next N days (from now).
 * Used by admin email digest and dashboard-style summaries.
 */
async function listUpcomingScheduledAppointments(
  tenantId,
  { days = UPCOMING_APPOINTMENT_DAYS } = {}
) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: "SCHEDULED",
      scheduledAt: {
        gte: now,
        lte: end,
      },
    },
    orderBy: { scheduledAt: "asc" },
    include: appointmentInclude,
  });

  return appointments.map(formatAppointment);
}

module.exports = {
  createAppointment,
  getAppointmentById,
  listAppointments,
  getCalendarAppointments,
  listUpcomingScheduledAppointments,
  updateAppointment,
  deleteAppointment,
  getNotifications,
  markNotificationRead,
  exportAppointments,
  UPCOMING_APPOINTMENT_DAYS,
};

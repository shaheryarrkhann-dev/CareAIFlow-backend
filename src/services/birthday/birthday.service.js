const prisma = require("../../lib/prisma");
const {
  sendPushToUsers,
} = require("../firebase/firebase-push.service");

/**
 * Calendar parts for a date-of-birth from DB (@db.Date / UTC midnight).
 * Local getMonth()/getDate() shifts the civil day in western timezones (e.g. Apr 18 → Apr 17).
 */
function dobCalendarMonth(dob) {
  return dob.getUTCMonth();
}
function dobCalendarDay(dob) {
  return dob.getUTCDate();
}
function dobCalendarYear(dob) {
  return dob.getUTCFullYear();
}

/** Residents counted for birthdays: not soft-deleted, not discharged/deceased (NULL status = still current). */
function residentWhereForBirthdays(tenantId) {
  return {
    tenantId,
    deletedAt: null,
    AND: [
      {
        OR: [
          { admissionStatus: null },
          {
            AND: [
              {
                NOT: {
                  admissionStatus: {
                    equals: "Discharged",
                    mode: "insensitive",
                  },
                },
              },
              {
                NOT: {
                  admissionStatus: { equals: "Deceased", mode: "insensitive" },
                },
              },
            ],
          },
        ],
      },
      {
        OR: [
          { residentDateOfBirth: { not: null } },
          { residentIdentificationDateOfBirth: { not: null } },
        ],
      },
    ],
  };
}

/**
 * Staff-like birthdays: active roster (StaffMember → User with DOB) plus tenant users
 * with DOB who are not on the roster (e.g. ADMIN / GUARDIAN accounts with no StaffMember row).
 */
async function fetchActiveStaffWithDobForBirthdays(tenantId) {
  const rows = await prisma.staffMember.findMany({
    where: {
      tenantId,
      employmentStatus: "ACTIVE",
      user: {
        isActive: true,
        dateOfBirth: { not: null },
      },
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          dateOfBirth: true,
        },
      },
    },
  });

  const fromRoster = rows.map((row) => ({
    ...row.user,
    staffMemberId: row.id,
  }));

  const rosterUserIds = new Set(fromRoster.map((u) => u.id));

  const additionalWhere = {
    tenantId,
    isActive: true,
    dateOfBirth: { not: null },
  };
  if (rosterUserIds.size > 0) {
    additionalWhere.id = { notIn: [...rosterUserIds] };
  }

  const additionalUsers = await prisma.user.findMany({
    where: additionalWhere,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      dateOfBirth: true,
    },
  });

  const fromTenant = additionalUsers.map((u) => ({
    ...u,
    staffMemberId: null,
  }));

  return [...fromRoster, ...fromTenant];
}

/**
 * Get upcoming birthdays for residents and staff within a tenant.
 * @param {string} tenantId
 * @param {object} options - { range: "week" | "month", page, limit }
 */
async function getUpcomingBirthdays(tenantId, options = {}) {
  const { range = "week", page = 1, limit = 50 } = options;
  const now = new Date();
  const currentYear = now.getFullYear();

  // Calculate date window
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(now);
  if (range === "week") {
    endDate.setDate(endDate.getDate() + 7);
  } else {
    endDate.setDate(endDate.getDate() + 30);
  }
  endDate.setHours(23, 59, 59, 999);

  // Residents: DOB from profile fields; exclude discharged/deceased
  const residents = await prisma.resident.findMany({
    where: residentWhereForBirthdays(tenantId),
    select: {
      id: true,
      residentFullLegalName: true,
      residentPreferredName: true,
      residentIdentificationFullLegalName: true,
      residentIdentificationPreferredName: true,
      residentDateOfBirth: true,
      residentIdentificationDateOfBirth: true,
      residentPhoto: true,
    },
  });

  const staffUsers = await fetchActiveStaffWithDobForBirthdays(tenantId);

  const birthdays = [];

  // Process residents
  for (const r of residents) {
    const dob = r.residentIdentificationDateOfBirth || r.residentDateOfBirth;
    if (!dob) continue;

    const m = dobCalendarMonth(dob);
    const d = dobCalendarDay(dob);
    const birthdayThisYear = new Date(currentYear, m, d);
    // If birthday already passed this year, check next year too
    let targetBirthday = birthdayThisYear;
    if (birthdayThisYear < startDate) {
      targetBirthday = new Date(currentYear + 1, m, d);
    }

    if (targetBirthday >= startDate && targetBirthday <= endDate) {
      const name =
        r.residentIdentificationPreferredName ||
        r.residentPreferredName ||
        r.residentIdentificationFullLegalName ||
        r.residentFullLegalName ||
        "Unknown Resident";
      const age = targetBirthday.getFullYear() - dobCalendarYear(dob);
      birthdays.push({
        id: r.id,
        personType: "resident",
        name,
        dateOfBirth: dob,
        birthdayDate: targetBirthday,
        age,
        photo: r.residentPhoto || null,
        daysUntil: Math.ceil((targetBirthday - now) / (1000 * 60 * 60 * 24)),
      });
    }
  }

  for (const u of staffUsers) {
    const dob = u.dateOfBirth;
    const m = dobCalendarMonth(dob);
    const d = dobCalendarDay(dob);
    const birthdayThisYear = new Date(currentYear, m, d);
    let targetBirthday = birthdayThisYear;
    if (birthdayThisYear < startDate) {
      targetBirthday = new Date(currentYear + 1, m, d);
    }

    if (targetBirthday >= startDate && targetBirthday <= endDate) {
      const age = targetBirthday.getFullYear() - dobCalendarYear(dob);
      birthdays.push({
        id: u.id,
        staffMemberId: u.staffMemberId,
        personType: "staff",
        name: u.name,
        dateOfBirth: dob,
        birthdayDate: targetBirthday,
        age,
        role: u.role,
        daysUntil: Math.ceil((targetBirthday - now) / (1000 * 60 * 60 * 24)),
      });
    }
  }

  // Sort by closest birthday first
  birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

  // Paginate
  const total = birthdays.length;
  const skip = (page - 1) * limit;
  const paginated = birthdays.slice(skip, skip + limit);

  return {
    birthdays: paginated,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get today's birthdays for a tenant (used by dashboard)
 */
async function getTodaysBirthdays(tenantId) {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  const residents = await prisma.resident.findMany({
    where: residentWhereForBirthdays(tenantId),
    select: {
      id: true,
      residentFullLegalName: true,
      residentPreferredName: true,
      residentIdentificationFullLegalName: true,
      residentIdentificationPreferredName: true,
      residentDateOfBirth: true,
      residentIdentificationDateOfBirth: true,
      residentPhoto: true,
    },
  });

  const staffUsers = await fetchActiveStaffWithDobForBirthdays(tenantId);

  const todayBirthdays = [];

  for (const r of residents) {
    const dob = r.residentIdentificationDateOfBirth || r.residentDateOfBirth;
    if (!dob) continue;
    if (dobCalendarMonth(dob) === month && dobCalendarDay(dob) === day) {
      const name =
        r.residentIdentificationPreferredName ||
        r.residentPreferredName ||
        r.residentIdentificationFullLegalName ||
        r.residentFullLegalName ||
        "Unknown Resident";
      todayBirthdays.push({
        id: r.id,
        personType: "resident",
        name,
        age: now.getFullYear() - dobCalendarYear(dob),
        photo: r.residentPhoto || null,
      });
    }
  }

  for (const u of staffUsers) {
    const dob = u.dateOfBirth;
    if (dobCalendarMonth(dob) === month && dobCalendarDay(dob) === day) {
      todayBirthdays.push({
        id: u.id,
        staffMemberId: u.staffMemberId,
        personType: "staff",
        name: u.name,
        age: now.getFullYear() - dobCalendarYear(dob),
        role: u.role,
      });
    }
  }

  return todayBirthdays;
}

/**
 * Get/update birthday reminder config for a tenant.
 * Stored as a simple key in tenant or we use a default of 7 days.
 * For simplicity we use an in-memory default; can be extended to DB config.
 */
const DEFAULT_REMINDER_DAYS = 7;

async function getReminderConfig(tenantId) {
  // Future: store in a TenantConfig table. For now, return default.
  return { tenantId, reminderDaysBefore: DEFAULT_REMINDER_DAYS };
}

/**
 * Get notification list for a user (birthday notifications)
 */
async function getNotifications(user, options = {}) {
  const { unreadOnly = false, limit = 50 } = options;

  const where = { userId: user.id };
  if (user.role !== "SUPER_ADMIN") {
    where.tenantId = user.tenantId;
  }
  if (unreadOnly) {
    where.readAt = null;
  }

  const notifications = await prisma.birthdayNotification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return notifications;
}

/**
 * Mark a birthday notification as read
 */
async function markNotificationRead(notificationId, user) {
  const notification = await prisma.birthdayNotification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new Error("Birthday notification not found");
  }

  if (notification.userId !== user.id) {
    throw new Error("Not authorized to mark this notification");
  }

  await prisma.birthdayNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

/**
 * Process birthday reminders - called by daily cron.
 * Creates in-app notifications for upcoming birthdays within the reminder window.
 */
async function processBirthdayReminders() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let totalProcessed = 0;

  for (const tenant of tenants) {
    try {
      const processed = await processTenantBirthdayReminders(tenant.id);
      totalProcessed += processed;
    } catch (err) {
      console.error(
        `[birthday-reminder] Failed for tenant ${tenant.id}:`,
        err.message
      );
    }
  }

  return { processed: totalProcessed };
}

async function processTenantBirthdayReminders(tenantId) {
  const reminderDays = DEFAULT_REMINDER_DAYS;
  const now = new Date();
  const currentYear = now.getFullYear();

  // Target date: reminderDays from now
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + reminderDays);
  const targetMonth = targetDate.getMonth();
  const targetDay = targetDate.getDate();

  // Also check today's birthdays (day-of notification)
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();

  // Get all staff/admin users to notify
  const recipientUsers = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: ["STAFF", "ADMIN"] },
    },
    select: { id: true },
  });

  if (recipientUsers.length === 0) return 0;
  const recipientIds = recipientUsers.map((u) => u.id);

  let processed = 0;

  const residents = await prisma.resident.findMany({
    where: residentWhereForBirthdays(tenantId),
    select: {
      id: true,
      residentFullLegalName: true,
      residentPreferredName: true,
      residentIdentificationFullLegalName: true,
      residentIdentificationPreferredName: true,
      residentDateOfBirth: true,
      residentIdentificationDateOfBirth: true,
    },
  });

  for (const r of residents) {
    const dob = r.residentIdentificationDateOfBirth || r.residentDateOfBirth;
    if (!dob) continue;

    const dobMonth = dobCalendarMonth(dob);
    const dobDay = dobCalendarDay(dob);

    const isReminderDay = dobMonth === targetMonth && dobDay === targetDay;
    const isBirthdayToday = dobMonth === todayMonth && dobDay === todayDay;

    if (!isReminderDay && !isBirthdayToday) continue;

    const name =
      r.residentIdentificationPreferredName ||
      r.residentPreferredName ||
      r.residentIdentificationFullLegalName ||
      r.residentFullLegalName ||
      "Unknown Resident";
    const age = currentYear - dobCalendarYear(dob);
    const birthdayDate = new Date(currentYear, dobMonth, dobDay);

    // Check if we already sent this notification today for this person
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const existing = await prisma.birthdayNotification.findFirst({
      where: {
        tenantId,
        personId: r.id,
        personType: "resident",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    const title = isBirthdayToday
      ? `Happy Birthday, ${name}!`
      : `Upcoming Birthday: ${name}`;
    const message = isBirthdayToday
      ? `Today is ${name}'s birthday! They are turning ${age}.`
      : `${name}'s birthday is in ${reminderDays} days (${birthdayDate.toLocaleDateString()}). They will be turning ${age}.`;

    // Create in-app notification for each recipient
    for (const userId of recipientIds) {
      await prisma.birthdayNotification.create({
        data: {
          tenantId,
          userId,
          personType: "resident",
          personId: r.id,
          personName: name,
          birthdayDate,
          title,
          message,
        },
      });
    }

    // Send push notification to all recipients
    try {
      await sendPushToUsers(recipientIds, {
        title,
        body: message,
        data: { type: "birthday", personId: r.id, personType: "resident" },
      });
    } catch (pushErr) {
      console.error("[birthday-push] Push failed for resident:", pushErr.message);
    }

    processed++;
  }

  const staffUsers = await fetchActiveStaffWithDobForBirthdays(tenantId);

  for (const u of staffUsers) {
    const dob = u.dateOfBirth;
    const dobMonth = dobCalendarMonth(dob);
    const dobDay = dobCalendarDay(dob);

    const isReminderDay = dobMonth === targetMonth && dobDay === targetDay;
    const isBirthdayToday = dobMonth === todayMonth && dobDay === todayDay;

    if (!isReminderDay && !isBirthdayToday) continue;

    const age = currentYear - dobCalendarYear(dob);
    const birthdayDate = new Date(currentYear, dobMonth, dobDay);

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const existing = await prisma.birthdayNotification.findFirst({
      where: {
        tenantId,
        personId: u.id,
        personType: "staff",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    const title = isBirthdayToday
      ? `Happy Birthday, ${u.name}!`
      : `Upcoming Birthday: ${u.name}`;
    const message = isBirthdayToday
      ? `Today is ${u.name}'s birthday! They are turning ${age}.`
      : `${u.name}'s birthday is in ${reminderDays} days (${birthdayDate.toLocaleDateString()}). They will be turning ${age}.`;

    for (const userId of recipientIds) {
      await prisma.birthdayNotification.create({
        data: {
          tenantId,
          userId,
          personType: "staff",
          personId: u.id,
          personName: u.name,
          birthdayDate,
          title,
          message,
        },
      });
    }

    // Send push notification to all recipients
    try {
      await sendPushToUsers(recipientIds, {
        title,
        body: message,
        data: { type: "birthday", personId: u.id, personType: "staff" },
      });
    } catch (pushErr) {
      console.error("[birthday-push] Push failed for staff:", pushErr.message);
    }

    processed++;
  }

  return processed;
}

module.exports = {
  getUpcomingBirthdays,
  getTodaysBirthdays,
  getReminderConfig,
  getNotifications,
  markNotificationRead,
  processBirthdayReminders,
};

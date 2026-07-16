const prisma = require("../../lib/prisma");

/**
 * Get reminders that are due: scheduledAt - reminderMinutesBefore is in the past.
 * Excludes already sent (sentAt not null) and deleted appointments.
 * No upper bound on how long ago they were due: if the cron runs late (e.g. at 16 min
 * instead of 15 min), we still send. After sending, sentAt is set so they are never sent again.
 */
async function getDueReminders() {
  const now = new Date();

  const reminders = await prisma.appointmentReminder.findMany({
    where: {
      sentAt: null,
      appointment: {
        deletedAt: null,
      },
    },
    include: {
      appointment: {
        include: {
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
              userId: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const due = [];
  for (const r of reminders) {
    const scheduledAt = new Date(r.appointment.scheduledAt);
    const dueAt = new Date(
      scheduledAt.getTime() - r.reminderMinutesBefore * 60 * 1000
    );
    if (dueAt <= now) {
      due.push(r);
    }
  }
  return due;
}

function formatAppointmentTitle(appointment) {
  const residentName =
    appointment.resident?.residentIdentificationPreferredName ||
    appointment.resident?.residentPreferredName ||
    appointment.resident?.residentIdentificationFullLegalName ||
    appointment.resident?.residentFullLegalName ||
    "Appointment";
  return `${appointment.title} (${residentName})`;
}

/**
 * Resolve recipient user IDs for a reminder:
 * - If appointment has staffId, notify that staff's userId only.
 * - Otherwise notify all users in the tenant with role STAFF or ADMIN.
 */
async function getRecipientUserIds(appointment) {
  if (appointment.staffId && appointment.staff?.userId) {
    return [appointment.staff.userId];
  }
  const users = await prisma.user.findMany({
    where: {
      tenantId: appointment.tenantId,
      role: { in: ["STAFF", "ADMIN"] },
      isActive: true,
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Process due reminders: create in-app notifications and mark reminders as sent.
 * Called by cron.
 * When the appointment time has already passed, use a "past appointment" title/message
 * so the user sees it was a missed or late reminder, but we still send once and mark sent.
 */
async function processDueReminders() {
  const due = await getDueReminders();
  if (due.length === 0) return { processed: 0 };

  let processed = 0;
  const now = new Date();

  for (const reminder of due) {
    const appointment = reminder.appointment;
    const scheduledAt = new Date(appointment.scheduledAt);
    const appointmentTimeHasPassed = scheduledAt.getTime() < now.getTime();
    const timeStr = scheduledAt.toLocaleString();

    const title = appointmentTimeHasPassed
      ? "Past appointment (reminder)"
      : "Appointment reminder";
    const message = appointmentTimeHasPassed
      ? `${formatAppointmentTitle(appointment)} was scheduled at ${timeStr}.`
      : `${formatAppointmentTitle(appointment)} at ${timeStr}.`;

    try {
      const userIds = await getRecipientUserIds(appointment);
      for (const userId of userIds) {
        await prisma.appointmentNotification.create({
          data: {
            tenantId: reminder.tenantId,
            userId,
            appointmentId: appointment.id,
            reminderId: reminder.id,
            title,
            message,
          },
        });
      }
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: { sentAt: now },
      });
      processed++;
    } catch (err) {
      console.error(
        "[appointment-reminder] Failed to process reminder",
        reminder.id,
        err.message
      );
    }
  }

  return { processed };
}

module.exports = {
  getDueReminders,
  processDueReminders,
};

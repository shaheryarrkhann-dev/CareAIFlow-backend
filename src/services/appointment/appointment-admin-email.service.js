const prisma = require("../../lib/prisma");
const { isEmailDeliveryConfigured } = require("../../utils/email.util");
const {
  listUpcomingScheduledAppointments,
  UPCOMING_APPOINTMENT_DAYS,
} = require("./appointment.service");
const { getAdminEmailsForTenant } = require("../compliance/document-compliance-email.service");

const TYPE_LABELS = {
  MEDICAL: "Medical",
  THERAPY: "Therapy",
  INSPECTION: "Inspection",
  INTERNAL_OTHER: "Internal / Other",
};

function formatAppointmentDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function appointmentDetailLine(appointment) {
  const typeLabel =
    TYPE_LABELS[appointment.appointmentType] || appointment.appointmentType;
  const parts = [formatAppointmentDateTime(appointment.scheduledAt), typeLabel];
  if (appointment.residentName) parts.push(appointment.residentName);
  if (appointment.staffName) parts.push(appointment.staffName);
  if (appointment.location?.trim()) parts.push(appointment.location.trim());
  return parts.join(" · ");
}

async function sendUpcomingAppointmentsEmail({ to, tenantName, appointments }) {
  if (!isEmailDeliveryConfigured()) {
    console.warn(
      "[appointment-admin-email] Email not configured, skipping digest"
    );
    return { skipped: true, reason: "email_not_configured" };
  }

  const count = appointments.length;
  const subject = `Upcoming appointments (next ${UPCOMING_APPOINTMENT_DAYS} days) — ${tenantName}`;
  const frontendUrl = process.env.FRONTEND_URL || "";
  const appointmentsUrl = frontendUrl
    ? `${frontendUrl.replace(/\/$/, "")}/appointments`
    : "/appointments";

  const lines = [
    `Upcoming appointments for ${tenantName}`,
    "",
    count === 1
      ? "You have 1 scheduled appointment in the next 7 days:"
      : `You have ${count} scheduled appointments in the next 7 days:`,
    "",
  ];

  for (const a of appointments.slice(0, 50)) {
    lines.push(`  • ${a.title} — ${appointmentDetailLine(a)}`);
  }
  if (appointments.length > 50) {
    lines.push(`  … and ${appointments.length - 50} more`);
  }

  lines.push("");
  lines.push(`View appointments: ${appointmentsUrl}`);

  const text = lines.join("\n");

  const listHtml =
    appointments.length === 0
      ? "<p>No scheduled appointments in the next 7 days.</p>"
      : `<ul>${appointments
          .slice(0, 50)
          .map(
            (a) =>
              `<li><strong>${escapeHtml(a.title)}</strong><br/><span style="color:#555">${escapeHtml(
                appointmentDetailLine(a)
              )}</span></li>`
          )
          .join("")}</ul>`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
    <h2>Upcoming appointments</h2>
    <p><strong>${escapeHtml(tenantName)}</strong></p>
    <p>${count === 1 ? "1 appointment" : `${count} appointments`} scheduled in the next ${UPCOMING_APPOINTMENT_DAYS} days.</p>
    ${listHtml}
    <p><a href="${escapeHtml(appointmentsUrl)}">View all appointments</a></p>
  </div>`;

  const recipients = Array.isArray(to) ? to : [to];

  if (process.env.SENDGRID_API_KEY) {
    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: recipients,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "CareConnect",
      },
      subject,
      text,
      html,
    });
  } else {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || "CareConnect"}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: recipients.join(", "),
      subject,
      text,
      html,
    });
  }

  return { sent: true, recipientCount: recipients.length, appointmentCount: count };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendDigestForTenant(tenantId, tenantName) {
  const emails = await getAdminEmailsForTenant(tenantId);
  if (emails.length === 0) {
    return { skipped: true, reason: "no_admin_emails" };
  }

  const appointments = await listUpcomingScheduledAppointments(tenantId);
  if (appointments.length === 0) {
    return { skipped: true, reason: "no_upcoming_appointments" };
  }

  return sendUpcomingAppointmentsEmail({
    to: emails,
    tenantName: tenantName || "Your organization",
    appointments,
  });
}

async function runAllTenantAppointmentDigests() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const results = [];

  for (const tenant of tenants) {
    try {
      const result = await sendDigestForTenant(tenant.id, tenant.name);
      results.push({ tenantId: tenant.id, ...result });
    } catch (err) {
      console.error(
        `[appointment-admin-email] Digest failed for ${tenant.id}:`,
        err.message
      );
      results.push({ tenantId: tenant.id, error: err.message });
    }
  }

  return results;
}

module.exports = {
  sendUpcomingAppointmentsEmail,
  sendDigestForTenant,
  runAllTenantAppointmentDigests,
};

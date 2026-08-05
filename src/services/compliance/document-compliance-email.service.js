const prisma = require("../../lib/prisma");
const { isEmailDeliveryConfigured } = require("../../utils/email.util");
const { evaluateDashboard } = require("./document-compliance-evaluation.service");
const { markDigestSent } = require("./document-compliance-settings.service");

async function sendComplianceDigestEmail({ to, tenantName, dashboard }) {
  if (!isEmailDeliveryConfigured()) {
    console.warn("[document-compliance-email] Email not configured, skipping digest");
    return { skipped: true, reason: "email_not_configured" };
  }

  const { summary, incompleteProfiles } = dashboard;
  const subject = `Document compliance summary — ${tenantName}`;
  const lines = [
    `Document compliance digest for ${tenantName}`,
    "",
    `Complete: ${summary.complete} | Partial: ${summary.partial} | Missing: ${summary.missing}`,
    `Total profiles: ${summary.totalProfiles}`,
    "",
  ];

  if (incompleteProfiles.length === 0) {
    lines.push("All profiles are complete. No action required.");
  } else {
    lines.push("Profiles needing attention:");
    for (const p of incompleteProfiles.slice(0, 25)) {
      lines.push(
        `  - ${p.entityName} (${p.entityType}): ${p.overallStatus} — ${p.missingCount} missing, ${p.partialCount} partial`
      );
    }
    if (incompleteProfiles.length > 25) {
      lines.push(`  … and ${incompleteProfiles.length - 25} more`);
    }
    lines.push("");
    lines.push(
      `Open the app: ${process.env.FRONTEND_URL || ""}/document-compliance`
    );
  }

  const text = lines.join("\n");
  const listHtml =
    incompleteProfiles.length === 0
      ? "<p>All profiles are complete.</p>"
      : `<ul>${incompleteProfiles
          .slice(0, 25)
          .map(
            (p) =>
              `<li><strong>${p.entityName}</strong> (${p.entityType}) — ${p.overallStatus}</li>`
          )
          .join("")}</ul>`;

  const frontendUrl = process.env.FRONTEND_URL || "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
    <h2>Document compliance digest</h2>
    <p><strong>${tenantName}</strong></p>
    <p>Complete: ${summary.complete} · Partial: ${summary.partial} · Missing: ${summary.missing}</p>
    ${listHtml}
    <p><a href="${frontendUrl}/document-compliance">View dashboard</a></p>
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

  return { sent: true, recipientCount: recipients.length };
}

async function getAdminEmailsForTenant(tenantId) {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: "ADMIN",
    },
    select: { email: true },
  });
  return users.map((u) => u.email).filter(Boolean);
}

async function sendDigestForTenant(tenantId, tenantName) {
  const emails = await getAdminEmailsForTenant(tenantId);
  if (emails.length === 0) {
    return { skipped: true, reason: "no_admin_emails" };
  }

  const dashboard = await evaluateDashboard(tenantId, { useCache: true });
  const result = await sendComplianceDigestEmail({
    to: emails,
    tenantName: tenantName || "Your organization",
    dashboard,
  });

  if (result.sent) {
    await markDigestSent(tenantId);
  }
  return result;
}

async function runAllTenantDigests() {
  const { listTenantsWithDigestEnabled } = require("./document-compliance-settings.service");
  const configs = await listTenantsWithDigestEnabled();
  const results = [];

  for (const cfg of configs) {
    if (!cfg.tenant?.isActive) continue;
    try {
      const r = await sendDigestForTenant(cfg.tenantId, cfg.tenant.name);
      results.push({ tenantId: cfg.tenantId, ...r });
    } catch (err) {
      console.error(
        `[document-compliance-email] Digest failed for ${cfg.tenantId}:`,
        err.message
      );
      results.push({ tenantId: cfg.tenantId, error: err.message });
    }
  }

  return results;
}

module.exports = {
  sendDigestForTenant,
  runAllTenantDigests,
  getAdminEmailsForTenant,
};

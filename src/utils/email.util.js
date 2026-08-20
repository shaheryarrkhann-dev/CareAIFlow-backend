const sgMail = require("@sendgrid/mail");
const nodemailer = require("nodemailer");

/**
 * Email utility with SendGrid primary and Nodemailer fallback
 */

let emailProvider = "sendgrid"; // 'sendgrid' or 'nodemailer'
let transporter = null;

/**
 * Initialize email service
 */
function initializeEmail() {
  // Option 1: SendGrid API Key (Preferred)
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    emailProvider = "sendgrid";
    console.log("📧 Email configured with SendGrid API");
    return;
  }

  // Option 2: SendGrid SMTP or Generic SMTP
  const isSmtpConfigured =
    process.env.EMAIL_HOST &&
    process.env.EMAIL_PORT &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS;

  if (isSmtpConfigured) {
    emailProvider = "nodemailer";
    const provider =
      process.env.EMAIL_HOST === "smtp.sendgrid.net" ? "SendGrid SMTP" : "SMTP";
    console.log(`📧 Email configured with ${provider}`);
    return;
  }

  // Development mode - use test email
  emailProvider = "test";
  console.log("📧 Email in TEST MODE - No real emails will be sent");
  console.log("💡 Configure EMAIL_HOST and EMAIL_USER for production");
}

/**
 * Create Nodemailer transporter (for fallback)
 */
async function getNodemailerTransporter() {
  if (transporter) return transporter;

  const isSmtpConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER;

  if (isSmtpConfigured) {
    console.log("🔧 Creating SMTP transporter with config:", {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      user: process.env.EMAIL_USER,
      passLength: process.env.EMAIL_PASS?.length,
    });

    transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Test mode
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransporter({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return transporter;
}

/**
 * Extract a readable message from @sendgrid/mail ResponseError.
 */
function formatSendGridError(error) {
  const body = error.response?.body;
  if (body?.errors && Array.isArray(body.errors)) {
    return body.errors
      .map((e) => {
        if (typeof e === "string") return e;
        const parts = [e.message, e.field].filter(Boolean);
        return parts.join(" - ");
      })
      .filter(Boolean)
      .join("; ");
  }
  if (body && typeof body === "object") {
    try {
      return JSON.stringify(body);
    } catch {
      /* ignore */
    }
  }
  return error.message || "SendGrid request failed";
}

/**
 * Send email via SendGrid
 */
async function sendWithSendGrid(msg) {
  try {
    await sgMail.send(msg);
    console.log(`✅ Email sent via SendGrid to: ${msg.to}`);
    return { success: true, provider: "sendgrid" };
  } catch (error) {
    const detail = formatSendGridError(error);
    console.error("SendGrid error:", error.response?.body || error.message);
    const hasDetail =
      detail &&
      detail !== "{}" &&
      detail !== "SendGrid request failed";
    const err = new Error(
      hasDetail
        ? `Failed to send email via SendGrid: ${detail}`
        : "Failed to send email via SendGrid"
    );
    const sc = error.response?.statusCode;
    err.status =
      typeof sc === "number" && sc >= 400 && sc < 600 ? sc : 502;
    throw err;
  }
}

/**
 * Send email via Nodemailer
 */
async function sendWithNodemailer(mailOptions) {
  try {
    const transporter = await getNodemailerTransporter();
    const info = await transporter.sendMail(mailOptions);

    if (nodemailer.getTestMessageUrl(info)) {
      console.log("📧 Test email preview:", nodemailer.getTestMessageUrl(info));
    } else {
      console.log(`✅ Email sent via SMTP to: ${mailOptions.to}`);
    }

    return {
      success: true,
      provider: "nodemailer",
      previewUrl: nodemailer.getTestMessageUrl(info),
    };
  } catch (error) {
    console.error("❌ Nodemailer SMTP Error Details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
    });
    throw new Error(
      `SMTP Error: ${error.message || "Failed to send email via SMTP"}`
    );
  }
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, resetToken, name) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const expiresIn = process.env.JWT_RESET_PASSWORD_EXPIRES || "1h";

  if (emailProvider === "sendgrid") {
    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject: "Password Reset Request",
      text: `Hi ${name},\n\nYou requested to reset your password. Click the link below:\n\n${resetUrl}\n\nThis link expires in ${expiresIn}.\n\nIf you didn't request this, ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center;">
            <h1>Password Reset Request</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <p>Hi ${name},</p>
            <p>You recently requested to reset your password. Click the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #666;">Or copy this link: ${resetUrl}</p>
            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
              <strong>⚠️ Security Notice:</strong>
              <ul style="margin: 5px 0;">
                <li>Link expires in ${expiresIn}</li>
                <li>If you didn't request this, ignore this email</li>
              </ul>
            </div>
          </div>
        </div>
      `,
    };
    return await sendWithSendGrid(msg);
  } else {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "AI Onboarding"}" <${
        process.env.EMAIL_FROM || process.env.EMAIL_USER
      }>`,
      to: email,
      subject: "Password Reset Request",
      text: `Hi ${name},\n\nReset your password: ${resetUrl}\n\nExpires in ${expiresIn}.`,
      html: `<p>Hi ${name},</p><p><a href="${resetUrl}">Reset Password</a></p><p>Expires in ${expiresIn}</p>`,
    };
    return await sendWithNodemailer(mailOptions);
  }
}

/**
 * Self-serve signup: verify email only (no temp password / invite copy).
 * Uses the same SendGrid / SMTP / test providers as existing product emails.
 */
async function sendEmailVerificationEmail(email, name, verificationToken) {
  const verifyUrl = `${process.env.FRONTEND_URL}/onboarding/verify-email?token=${verificationToken}`;
  const displayName = name || "there";
  const fromName = process.env.EMAIL_FROM_NAME || "CareAIFlow";
  const subject = "Verify your CareAIFlow email";
  const text = `Hi ${displayName},\n\nThanks for creating a CareAIFlow account. Verify your email to continue setup:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create this account, you can ignore this email.`;
  // Table layout + word-break so long JWT links don't blow out the card in YOPMail/Gmail.
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#edf2ff;-webkit-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#edf2ff;margin:0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d3d7ed;">
          <tr>
            <td style="background-color:#26428b;padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#b9c7f0;">CareAIFlow</p>
              <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Verify your email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif;color:#262a42;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${displayName},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#454a66;">
                Thanks for creating a CareAIFlow account. Click the button below to verify your email and continue setup.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${verifyUrl}" style="display:inline-block;background-color:#386cdc;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;">
                      Verify email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6a6f8c;">
                Button not working? Paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;padding:12px 14px;background-color:#f5f7ff;border:1px solid #d3d7ed;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#386cdc;word-break:break-all;overflow-wrap:anywhere;">
                <a href="${verifyUrl}" style="color:#386cdc;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${verifyUrl}</a>
              </p>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#8e92af;">
                This link expires in 24 hours. If you did not create this account, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#8e92af;border-top:1px solid #edeffc;">
              Sent by ${fromName} · CareAIFlow onboarding
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  console.log("[Email] Verification URL:", verifyUrl);

  if (emailProvider === "sendgrid") {
    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: fromName,
      },
      subject,
      text,
      html,
    };
    return await sendWithSendGrid(msg);
  }

  if (emailProvider === "test") {
    console.log("📧 TEST MODE - verification email not sent. Use URL above.");
    return { success: true, provider: "test", verifyUrl };
  }

  const mailOptions = {
    from: `"${fromName}" <${
      process.env.EMAIL_FROM || process.env.EMAIL_USER
    }>`,
    to: email,
    subject,
    text,
    html,
  };
  return await sendWithNodemailer(mailOptions);
}

/**
 * Dunning: card charge failed - ask admin to update billing.
 */
async function sendPaymentFailedDunningEmail(email, name, options = {}) {
  const displayName = name || "there";
  const fromName = process.env.EMAIL_FROM_NAME || "CareAIFlow";
  const updateBillingUrl =
    options.updateBillingUrl ||
    `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/settings?tab=billing`;
  const attemptCount = options.attemptCount || 1;
  const amountCents =
    typeof options.amountDue === "number" ? options.amountDue : null;
  const currency = String(options.currency || "usd").toUpperCase();
  const amountLabel =
    amountCents != null
      ? `${(amountCents / 100).toFixed(2)} ${currency}`
      : null;

  const subject = "Action needed: CareAIFlow payment failed";
  const text = `Hi ${displayName},

We could not process your CareAIFlow subscription payment${
    amountLabel ? ` (${amountLabel})` : ""
  } (attempt ${attemptCount}).

Please update your card so access is not interrupted:
${updateBillingUrl}

You can still use CareAIFlow for now, but adding facilities and some billing changes stay locked until payment succeeds.

If you already updated your card, you can ignore this email.
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#edf2ff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#edf2ff;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d3d7ed;">
          <tr>
            <td style="background-color:#b45309;padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fde68a;">CareAIFlow Billing</p>
              <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Payment failed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#262a42;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${displayName},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#454a66;">
                We could not process your CareAIFlow subscription payment${
                  amountLabel ? ` (<strong>${amountLabel}</strong>)` : ""
                }. This was attempt ${attemptCount}.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#454a66;">
                Update your card to keep uninterrupted access. You can still use the product for now, but adding facilities stays locked until payment succeeds.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${updateBillingUrl}" style="display:inline-block;background-color:#386cdc;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;">
                      Update billing
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8e92af;">
                If you already updated your card, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#8e92af;border-top:1px solid #edeffc;">
              Sent by ${fromName} · CareAIFlow billing
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  console.log("[Email] Payment failed dunning →", email, updateBillingUrl);

  if (emailProvider === "sendgrid") {
    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: fromName,
      },
      subject,
      text,
      html,
    };
    return await sendWithSendGrid(msg);
  }

  if (emailProvider === "test") {
    console.log("📧 TEST MODE - dunning email not sent.");
    return { success: true, provider: "test", updateBillingUrl };
  }

  const mailOptions = {
    from: `"${fromName}" <${
      process.env.EMAIL_FROM || process.env.EMAIL_USER
    }>`,
    to: email,
    subject,
    text,
    html,
  };
  return await sendWithNodemailer(mailOptions);
}

/**
 * Send user invitation email with verification link
 */
async function sendUserInvitationEmail(
  email,
  invitedBy,
  temporaryPassword,
  tenantName,
  verificationToken,
  roleLabel = "Team member",
) {
  const acceptUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${verificationToken}`;

  if (emailProvider === "sendgrid") {
    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject: `You're invited to ${tenantName}`,
      text: `Hello!\n\n${invitedBy} invited you to join ${tenantName} as ${roleLabel}.\n\nReview your invitation and create your password:\n${acceptUrl}\n\nThis link expires in 24 hours.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #26428b; color: white; padding: 20px; text-align: center;">
            <h1 style="margin:0;font-size:22px;">You're invited to ${tenantName}</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <p>Hello,</p>
            <p><strong>${invitedBy}</strong> invited you to join <strong>${tenantName}</strong> as <strong>${roleLabel}</strong>.</p>
            <p>Open the link below to review the organization and set your password before joining.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${acceptUrl}" style="background-color: #386cdc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 999px; display: inline-block;">Review invitation</a>
            </div>
            <p style="font-size: 13px; color: #6a6f8c;">This link expires in 24 hours. If you weren’t expecting this email, you can ignore it.</p>
          </div>
        </div>
      `,
    };
    return await sendWithSendGrid(msg);
  } else {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "AI Onboarding"}" <${
        process.env.EMAIL_FROM || process.env.EMAIL_USER
      }>`,
      to: email,
      subject: `You're invited to ${tenantName}`,
      text: `${invitedBy} invited you to ${tenantName} as ${roleLabel}.\n\nReview invitation: ${acceptUrl}\n`,
      html: `
        <p>${invitedBy} invited you to ${tenantName} as ${roleLabel}</p>
        <p><strong><a href="${acceptUrl}">Review invitation</a></strong></p>
        <p style="font-size:13px;color:#6a6f8c;">This link expires in 24 hours.</p>
      `,
    };
    return await sendWithNodemailer(mailOptions);
  }
}

/**
 * Send password changed email
 */
async function sendPasswordChangedEmail(email, name) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;

  if (emailProvider === "sendgrid") {
    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject: "Password Changed Successfully",
      text: `Hi ${name},\n\nYour password was changed successfully.\n\nLogin: ${loginUrl}\n\nIf you didn't make this change, contact support immediately.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center;">
            <h1>✅ Password Changed</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <p>Hi ${name},</p>
            <p>Your password has been successfully changed.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="background-color: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Login Now</a>
            </div>
            <div style="background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0;">
              <strong>⚠️ Didn't change your password?</strong>
              <p style="margin: 5px 0;">Contact support immediately if you didn't make this change.</p>
            </div>
          </div>
        </div>
      `,
    };
    return await sendWithSendGrid(msg);
  } else {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "AI Onboarding"}" <${
        process.env.EMAIL_FROM || process.env.EMAIL_USER
      }>`,
      to: email,
      subject: "Password Changed",
      text: `Hi ${name},\n\nPassword changed successfully.\n\n${loginUrl}`,
      html: `<p>Hi ${name},</p><p>Password changed.</p><p><a href="${loginUrl}">Login</a></p>`,
    };
    return await sendWithNodemailer(mailOptions);
  }
}

/**
 * Send visitor checkout reminder (5 minutes before expected checkout)
 */
async function sendVisitorCheckoutReminderEmail(
  toEmail,
  visitorName,
  facilityDisplayName,
  expectedCheckOutTime
) {
  const timeStr =
    expectedCheckOutTime instanceof Date
      ? expectedCheckOutTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : String(expectedCheckOutTime);

  if (emailProvider === "sendgrid") {
    const msg = {
      to: toEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject: `Check-out reminder - ${facilityDisplayName}`,
      text: `Hi ${visitorName},\n\nThis is a reminder that your visit at ${facilityDisplayName} is expected to end around ${timeStr}. Please check out at the front desk when you leave.\n\nThank you.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center;">
            <h1>Check-out reminder</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <p>Hi ${visitorName},</p>
            <p>Your visit at <strong>${facilityDisplayName}</strong> is expected to end around <strong>${timeStr}</strong>.</p>
            <p>Please check out at the front desk when you leave.</p>
            <p>Thank you.</p>
          </div>
        </div>
      `,
    };
    return await sendWithSendGrid(msg);
  } else {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "AI Onboarding"}" <${
        process.env.EMAIL_FROM || process.env.EMAIL_USER
      }>`,
      to: toEmail,
      subject: `Check-out reminder - ${facilityDisplayName}`,
      text: `Hi ${visitorName},\n\nYour visit at ${facilityDisplayName} is expected to end around ${timeStr}. Please check out when you leave.`,
      html: `<p>Hi ${visitorName},</p><p>Your visit at ${facilityDisplayName} is expected to end around ${timeStr}. Please check out at the front desk when you leave.</p>`,
    };
    return await sendWithNodemailer(mailOptions);
  }
}

/**
 * Whether outbound email is configured for real delivery (not dev test mode).
 */
function isEmailDeliveryConfigured() {
  return emailProvider === "sendgrid" || emailProvider === "nodemailer";
}

/**
 * Send a user-generated PDF report to one or more recipients (platform email).
 * Uses SendGrid or Nodemailer according to initializeEmail().
 */
async function sendReportPdfEmail({
  to,
  subject,
  text,
  pdfBase64,
  pdfFilename,
}) {
  if (!isEmailDeliveryConfigured()) {
    throw new Error(
      "Email is not configured. Set SENDGRID_API_KEY or SMTP (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)."
    );
  }

  const toList = Array.isArray(to) ? to : String(to).split(/[,;]/);
  const recipients = toList.map((e) => e.trim()).filter(Boolean);
  if (!recipients.length) {
    throw new Error("At least one recipient is required");
  }

  const safeName = String(pdfFilename || "report.pdf")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .slice(0, 200);
  if (!safeName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Attachment filename must end with .pdf");
  }

  const plain =
    text && String(text).trim()
      ? String(text).trim()
      : "Please find the exported PDF attached.";

  // Strip whitespace / accidental data-URL prefix (SendGrid expects raw base64)
  let attachmentB64 = String(pdfBase64).trim();
  const dataUrlIdx = attachmentB64.indexOf("base64,");
  if (attachmentB64.startsWith("data:") && dataUrlIdx !== -1) {
    attachmentB64 = attachmentB64.slice(dataUrlIdx + "base64,".length);
  }
  attachmentB64 = attachmentB64.replace(/\s/g, "");

  if (emailProvider === "sendgrid") {
    const msg = {
      to: recipients,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject: String(subject).slice(0, 500),
      text: plain,
      attachments: [
        {
          content: attachmentB64,
          filename: safeName,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    };
    if (!msg.from.email) {
      throw new Error("SENDGRID_FROM_EMAIL or EMAIL_FROM must be set");
    }
    await sendWithSendGrid(msg);
    return { success: true, provider: "sendgrid" };
  }

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "AI Onboarding"}" <${
      process.env.EMAIL_FROM || process.env.EMAIL_USER
    }>`,
    to: recipients.join(", "),
    subject: String(subject).slice(0, 500),
    text: plain,
    attachments: [
      {
        filename: safeName,
        content: Buffer.from(attachmentB64, "base64"),
        contentType: "application/pdf",
      },
    ],
  };
  return await sendWithNodemailer(mailOptions);
}

/**
 * Notify an existing account that they were added to another organization.
 * They keep their current password and sign in normally.
 */
async function sendExistingUserOrgInviteEmail(
  email,
  invitedBy,
  tenantName,
  roleLabel = "Team member",
  noticeToken = null,
) {
  const acceptUrl = noticeToken
    ? `${process.env.FRONTEND_URL}/accept-invite?token=${noticeToken}`
    : `${process.env.FRONTEND_URL}/login`;
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const subject = `You've been added to ${tenantName}`;
  const text = `Hello!\n\n${invitedBy} added you to ${tenantName} on CareAIFlow as ${roleLabel}.\n\nReview your access:\n${acceptUrl}\n\nThen sign in with your existing password:\n${loginUrl}\n`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #26428b; color: white; padding: 20px; text-align: center;">
        <h1 style="margin:0;font-size:22px;">You're on the team</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
        <p>Hello,</p>
        <p><strong>${invitedBy}</strong> added you to <strong>${tenantName}</strong> as <strong>${roleLabel}</strong>.</p>
        <p>Review the invitation details, then sign in with your existing email and password - no new account setup needed.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${acceptUrl}" style="background-color: #386cdc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 999px; display: inline-block;">Review invitation</a>
        </div>
      </div>
    </div>
  `;

  if (emailProvider === "sendgrid") {
    return await sendWithSendGrid({
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject,
      text,
      html,
    });
  }

  return await sendWithNodemailer({
    from: `"${process.env.EMAIL_FROM_NAME || "AI Onboarding"}" <${
      process.env.EMAIL_FROM || process.env.EMAIL_USER
    }>`,
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Plan confirmed - self-serve or assisted.
 */
async function sendPlanConfirmedEmail(
  email,
  name,
  planKey,
  billingPeriod = "monthly",
  mode = "self_serve",
) {
  const displayName = name || "there";
  const fromName = process.env.EMAIL_FROM_NAME || "CareAIFlow";
  const planLabel = String(planKey || "your plan")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const periodLabel = billingPeriod === "annual" ? "annual" : "monthly";
  const setupUrl = `${String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/onboarding/organization`;
  const subject = `Your CareAIFlow ${planLabel} plan is confirmed`;
  const modeLine =
    mode === "assisted"
      ? "Your account was activated by the CareAIFlow team (no card charge in-app)."
      : "Your subscription checkout completed successfully.";
  const text = `Hi ${displayName},\n\n${modeLine}\n\nPlan: ${planLabel} (${periodLabel})\n\nNext step - set up your organization:\n${setupUrl}\n`;
  const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#262a42;background:#edf2ff;padding:24px;">
  <table width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #d3d7ed;">
    <tr><td style="background:#26428b;padding:24px;color:#fff;"><strong>CareAIFlow</strong><br/>Plan confirmed</td></tr>
    <tr><td style="padding:28px;">
      <p>Hi ${displayName},</p>
      <p>${modeLine}</p>
      <p><strong>Plan:</strong> ${planLabel} · ${periodLabel}</p>
      <p style="margin:24px 0;"><a href="${setupUrl}" style="background:#386cdc;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">Set up your organization</a></p>
    </td></tr>
  </table>
</body></html>`.trim();

  if (emailProvider === "sendgrid") {
    return await sendWithSendGrid({
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: fromName,
      },
      subject,
      text,
      html,
    });
  }
  if (emailProvider === "test") {
    console.log("[Email] Plan confirmed (test):", { email, planKey, setupUrl });
    return { success: true, provider: "test", setupUrl };
  }
  return await sendWithNodemailer({
    from: `"${fromName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Assisted activation - set password / continue setup (distinct from generic reset copy).
 */
async function sendAssistedActivationEmail(email, name, setPasswordToken) {
  const displayName = name || "there";
  const fromName = process.env.EMAIL_FROM_NAME || "CareAIFlow";
  const base = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(
    /\/$/,
    "",
  );
  const setupUrl = `${base}/reset-password?token=${encodeURIComponent(setPasswordToken)}&assisted=1`;
  const subject = "Your CareAIFlow account is ready - set your password";
  const text = `Hi ${displayName},\n\nCareAIFlow has activated your account. Set your password to continue organization and facility setup:\n\n${setupUrl}\n\nThis link expires soon. If you did not expect this, contact support.\n`;
  const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#262a42;background:#edf2ff;padding:24px;">
  <table width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #d3d7ed;">
    <tr><td style="background:#26428b;padding:24px;color:#fff;"><strong>CareAIFlow</strong><br/>Assisted activation</td></tr>
    <tr><td style="padding:28px;">
      <p>Hi ${displayName},</p>
      <p>Your CareAIFlow account has been provisioned by our team. Set a password to continue setup (organization and first facility).</p>
      <p style="margin:24px 0;"><a href="${setupUrl}" style="background:#386cdc;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">Set password &amp; continue</a></p>
      <p style="font-size:12px;color:#6a6f8c;word-break:break-all;">${setupUrl}</p>
    </td></tr>
  </table>
</body></html>`.trim();

  if (emailProvider === "sendgrid") {
    return await sendWithSendGrid({
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: fromName,
      },
      subject,
      text,
      html,
    });
  }
  if (emailProvider === "test") {
    console.log("[Email] Assisted activation (test):", setupUrl);
    return { success: true, provider: "test", setupUrl };
  }
  return await sendWithNodemailer({
    from: `"${fromName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Onboarding paused reminder - resume next unfinished step.
 */
async function sendOnboardingPausedReminderEmail(email, name, resumeUrl) {
  const displayName = name || "there";
  const fromName = process.env.EMAIL_FROM_NAME || "CareAIFlow";
  const subject = "Continue your CareAIFlow setup";
  const url =
    resumeUrl ||
    `${String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/onboarding`;
  const text = `Hi ${displayName},\n\nYour CareAIFlow setup is still in progress. Pick up where you left off:\n\n${url}\n`;
  const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#262a42;padding:24px;">
  <p>Hi ${displayName},</p>
  <p>Your CareAIFlow setup is still in progress. Continue when you are ready:</p>
  <p><a href="${url}" style="background:#386cdc;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">Resume setup</a></p>
</body></html>`.trim();

  if (emailProvider === "sendgrid") {
    return await sendWithSendGrid({
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: fromName,
      },
      subject,
      text,
      html,
    });
  }
  if (emailProvider === "test") {
    console.log("[Email] Onboarding paused reminder (test):", { email, url });
    return { success: true, provider: "test", url };
  }
  return await sendWithNodemailer({
    from: `"${fromName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text,
    html,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Notify super-admin owner when a landing lead form is submitted.
 * Default recipient: LEAD_NOTIFY_EMAIL or alirazaarif95@gmail.com
 */
async function sendLeadNotificationEmail(lead) {
  const to = process.env.LEAD_NOTIFY_EMAIL || "alirazaarif95@gmail.com";
  const fromName = process.env.EMAIL_FROM_NAME || "CareAIFlow";
  const subject = `New CareAIFlow lead - ${lead.fullName} (${lead.organization})`;
  const rows = [
    ["Full name", lead.fullName],
    ["Work email", lead.email],
    ["Organization", lead.organization],
    ["Role", lead.role],
    ["Facilities", lead.facilities],
    ["Resident population", lead.population],
    ["Phone", lead.phone || "-"],
    ["Current system", lead.currentSystem || "-"],
    ["Source", lead.source || "landing_contact"],
    [
      "Submitted",
      lead.createdAt ? new Date(lead.createdAt).toISOString() : " - ",
    ],
  ];
  const textLines = rows.map(([k, v]) => `${k}: ${v}`);
  textLines.push("", "Message:", lead.message || "");
  const text = `New lead request\n\n${textLines.join("\n")}\n`;
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;color:#6a6f8c;font-size:13px;">${escapeHtml(k)}</td><td style="padding:6px 10px;font-size:13px;color:#111426;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#262a42;background:#edf2ff;padding:24px;">
  <table width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #d3d7ed;">
    <tr><td style="background:#26428b;padding:24px;color:#fff;"><strong>CareAIFlow</strong><br/>New lead request</td></tr>
    <tr><td style="padding:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">${htmlRows}</table>
      <div style="margin-top:16px;padding:14px;background:#f6f7fb;border-radius:12px;">
        <div style="font-size:12px;color:#6a6f8c;margin-bottom:6px;">Message</div>
        <div style="font-size:14px;white-space:pre-wrap;">${escapeHtml(lead.message || "")}</div>
      </div>
    </td></tr>
  </table>
</body></html>`.trim();

  if (emailProvider === "sendgrid") {
    return await sendWithSendGrid({
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: fromName,
      },
      subject,
      text,
      html,
    });
  }
  if (emailProvider === "test") {
    console.log("[Email] Lead notification (test):", {
      to,
      subject,
      leadId: lead.id,
    });
    return { success: true, provider: "test", to };
  }
  return await sendWithNodemailer({
    from: `"${fromName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

// Initialize on module load
initializeEmail();

module.exports = {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendPaymentFailedDunningEmail,
  sendUserInvitationEmail,
  sendExistingUserOrgInviteEmail,
  sendPasswordChangedEmail,
  sendVisitorCheckoutReminderEmail,
  sendReportPdfEmail,
  sendPlanConfirmedEmail,
  sendAssistedActivationEmail,
  sendOnboardingPausedReminderEmail,
  sendLeadNotificationEmail,
  isEmailDeliveryConfigured,
};

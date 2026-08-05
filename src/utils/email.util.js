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
        return parts.join(" — ");
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
 * Send user invitation email with verification link
 */
async function sendUserInvitationEmail(
  email,
  invitedBy,
  temporaryPassword,
  tenantName,
  verificationToken
) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  console.log('verifyUrl', verifyUrl)

  if (emailProvider === "sendgrid") {
    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || "AI Onboarding",
      },
      subject: `Welcome to ${tenantName}!`,
      text: `Hello!\n\n${invitedBy} invited you to ${tenantName}.\n\nStep 1: Verify your email: ${verifyUrl}\n\nStep 2: After verification, you'll be redirected to set your password. Use the temporary password below:\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\nStep 3: Once you've set your password, you can login at: ${loginUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center;">
            <h1>🎉 Welcome to ${tenantName}!</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <p>Hello,</p>
            <p><strong>${invitedBy}</strong> has invited you to join <strong>${tenantName}</strong>.</p>

            <div style="background-color: #DBEAFE; border-left: 4px solid #3B82F6; padding: 15px; margin: 20px 0;">
              <strong>📧 Step 1: Verify Your Email</strong>
              <p style="margin: 10px 0;">Click the button below to verify your email address:</p>
              <div style="text-align: center; margin: 15px 0;">
                <a href="${verifyUrl}" style="background-color: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
              </div>
            </div>

            <div style="background-color: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0;">
              <strong>🔑 Step 2: Set Your Password</strong>
              <p style="margin: 10px 0;">After verifying your email, you'll be automatically redirected to set your password. You'll need your temporary password:</p>
              <div style="background-color: #E5E7EB; padding: 15px; border-radius: 5px; font-family: monospace; margin-top: 10px;">
                <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${temporaryPassword}</p>
              </div>
            </div>

            <div style="background-color: #E5E7EB; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Step 3: Login</strong>
              <p style="margin: 10px 0;">Once you've set your password, you can login at:</p>
              <p style="margin: 5px 0;"><a href="${loginUrl}" style="color: #3B82F6;">${loginUrl}</a></p>
            </div>

            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
              <strong>🔒 Security Notice:</strong>
              <ul style="margin: 5px 0;">
                <li>Verification link expires in 24 hours</li>
                <li>You must set a new password after email verification</li>
                <li>Keep your credentials secure and never share them</li>
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
      subject: `Welcome to ${tenantName}!`,
      text: `${invitedBy} invited you!\n\nStep 1: Verify email: ${verifyUrl}\n\nStep 2: After verification, set your password using:\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\nStep 3: Login at: ${loginUrl}`,
      html: `
        <p>${invitedBy} invited you to ${tenantName}</p>
        <p><strong>Step 1:</strong> <a href="${verifyUrl}">Verify Email</a></p>
        <p><strong>Step 2:</strong> After verification, you'll be redirected to set your password. Use:<br>Email: ${email}<br>Temporary Password: ${temporaryPassword}</p>
        <p><strong>Step 3:</strong> <a href="${loginUrl}">Login</a> after setting your password</p>
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
      subject: `Check-out reminder – ${facilityDisplayName}`,
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
      subject: `Check-out reminder – ${facilityDisplayName}`,
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

// Initialize on module load
initializeEmail();

module.exports = {
  sendPasswordResetEmail,
  sendUserInvitationEmail,
  sendPasswordChangedEmail,
  sendVisitorCheckoutReminderEmail,
  sendReportPdfEmail,
  isEmailDeliveryConfigured,
};

const { validationResult } = require("express-validator");
const {
  sendReportPdfEmail,
  isEmailDeliveryConfigured,
} = require("../../utils/email.util");

function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const msg = first.msg || "Validation error";
    const field = first.param;
    const error = new Error(`${msg}${field ? ` (${field})` : ""}`);
    error.status = 400;
    throw error;
  }
}

/**
 * POST /api/pdfs/send-report-email
 * Body: { to, subject, message?, pdfBase64, filename? }
 */
exports.sendReportEmail = async (req, res, next) => {
  try {
    handleValidation(req);

    if (!isEmailDeliveryConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "Email is not configured on the server. Set SENDGRID_API_KEY or SMTP settings.",
      });
    }

    const { to, subject, message, pdfBase64, filename } = req.body;
    const pdfFilename =
      filename && String(filename).trim()
        ? String(filename).trim()
        : "report.pdf";

    await sendReportPdfEmail({
      to,
      subject,
      text: message || "",
      pdfBase64: String(pdfBase64).trim(),
      pdfFilename,
    });

    return res.json({
      success: true,
      message: "Email sent successfully.",
    });
  } catch (err) {
    next(err);
  }
};

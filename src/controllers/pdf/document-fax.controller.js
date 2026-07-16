const { validationResult } = require("express-validator");
const {
  sendFaxReport,
  isIfaxConfigured,
} = require("../../services/fax/ifax.service");

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
 * GET /api/pdfs/ifax-configured
 * Whether server has an iFax API key (for UI enable/disable).
 */
exports.ifaxConfigured = (req, res) => {
  return res.json({
    success: true,
    configured: isIfaxConfigured(),
  });
};

/**
 * POST /api/pdfs/send-report-fax
 * Body: { faxNumber, subject?, message?, fromName?, toName?, pdfBase64, filename? }
 */
exports.sendReportFax = async (req, res, next) => {
  try {
    handleValidation(req);

    if (!isIfaxConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "Fax is not configured on the server. Set IFAX_API_KEY from the iFax dashboard (Settings → Developer API).",
      });
    }

    const { faxNumber, subject, message, fromName, toName, pdfBase64, filename } =
      req.body;
    const pdfFilename =
      filename && String(filename).trim()
        ? String(filename).trim()
        : "report.pdf";

    const senderName =
      (fromName && String(fromName).trim()) ||
      (req.user && req.user.name) ||
      undefined;

    const result = await sendFaxReport({
      faxNumber,
      subject: subject || "",
      message: message || "",
      fromName: senderName,
      toName: toName || "",
      pdfBase64: String(pdfBase64).trim(),
      fileName: pdfFilename,
    });

    return res.json({
      success: true,
      message: result.message || "Fax submitted successfully.",
      jobId: result.jobId,
    });
  } catch (err) {
    next(err);
  }
};

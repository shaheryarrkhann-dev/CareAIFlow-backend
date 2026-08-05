const { validationResult } = require("express-validator");
const {
  sendFaxReport,
  isIfaxConfigured,
} = require("../../services/fax/ifax.service");
const { logOutboundDelivery } = require("../../lib/logOutboundDelivery");
const { normalizeOutboundSubject } = require("../../utils/outbound-subject.util");

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

    const { faxNumber, subject, message, fromName, toName, pdfBase64, filename, sourceModule } =
      req.body;
    const normalizedSubject = normalizeOutboundSubject(subject || "");
    const pdfFilename =
      filename && String(filename).trim()
        ? String(filename).trim()
        : "report.pdf";

    const senderName =
      (fromName && String(fromName).trim()) ||
      (req.user && req.user.name) ||
      undefined;

    let result;
    try {
      result = await sendFaxReport({
        faxNumber,
        subject: normalizedSubject,
        message: message || "",
        fromName: senderName,
        toName: toName || "",
        pdfBase64: String(pdfBase64).trim(),
        fileName: pdfFilename,
      });
    } catch (sendErr) {
      await logOutboundDelivery(req, {
        type: "fax",
        status: "failed",
        recipient: faxNumber,
        subject: normalizedSubject,
        message: message || "",
        filename: pdfFilename,
        pdfBase64,
        recipientName: toName || null,
        senderName: senderName || null,
        sourceModule: sourceModule || null,
        errorMessage: sendErr.message || "Fax send failed",
      });
      throw sendErr;
    }

    await logOutboundDelivery(req, {
      type: "fax",
      status: "sent",
      recipient: faxNumber,
      subject: normalizedSubject,
      message: message || "",
      filename: pdfFilename,
      pdfBase64,
      recipientName: toName || null,
      senderName: senderName || null,
      sourceModule: sourceModule || null,
      jobId: result.jobId != null ? String(result.jobId) : null,
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

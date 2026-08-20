const outboundDeliveryService = require("../services/outbound-delivery/outbound-delivery.service");
const { uploadOutboundDeliveryPdfToS3 } = require("../utils/s3.util");
const { resolveActiveTenantId } = require("./resolveActiveTenantId");

function stripPdfBase64(pdfBase64) {
  let s = String(pdfBase64).trim();
  const dataUrlIdx = s.indexOf("base64,");
  if (s.startsWith("data:") && dataUrlIdx !== -1) {
    s = s.slice(dataUrlIdx + "base64,".length);
  }
  return s.replace(/\s/g, "");
}

async function tryStoreAttachment(tenantId, pdfBase64, filename) {
  if (!pdfBase64 || !process.env.S3_BUCKET_NAME) return null;

  try {
    const fileData = stripPdfBase64(pdfBase64);
    const buffer = Buffer.from(fileData, "base64");
    if (!buffer.length || buffer.slice(0, 5).toString() !== "%PDF-") {
      return null;
    }

    const result = await uploadOutboundDeliveryPdfToS3({
      tenantId,
      fileName: filename || "report.pdf",
      buffer,
    });
    return result.s3Key;
  } catch (err) {
    console.error(
      "[OutboundDelivery] Failed to store attachment:",
      err.message
    );
    return null;
  }
}

/**
 * Best-effort log of an outbound email/fax send. Never throws.
 * @param {import("express").Request} req
 * @param {object} payload
 * @param {string} [payload.pdfBase64]
 */
async function logOutboundDelivery(req, payload) {
  const tenantId = resolveActiveTenantId(req);
  const createdBy = req.user?.id;

  if (!tenantId || !createdBy) {
    console.warn(
      "[OutboundDelivery] Skipped log — missing tenantId or user id",
      { tenantId: tenantId || null, userId: createdBy || null }
    );
    return;
  }

  const { pdfBase64, filename, ...rest } = payload;
  const resolvedFilename = filename || rest.filename || null;

  try {
    // Save the delivery record first so a slow/failed S3 upload never blocks logging.
    const record = await outboundDeliveryService.createOutboundDelivery({
      tenantId,
      createdBy,
      filename: resolvedFilename,
      ...rest,
    });

    const attachmentS3Key = await tryStoreAttachment(
      tenantId,
      pdfBase64,
      resolvedFilename
    );

    if (attachmentS3Key) {
      await outboundDeliveryService.updateOutboundDeliveryAttachment(
        record.id,
        tenantId,
        attachmentS3Key
      );
    }
  } catch (err) {
    console.error("[OutboundDelivery] Failed to log delivery:", err.message);
  }
}

module.exports = { logOutboundDelivery };

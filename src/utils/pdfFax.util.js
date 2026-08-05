const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");

/** Decoded PDF size limit for iFax (~20MB request with base64 + JSON overhead). */
const FAX_MAX_PDF_BYTES = 14 * 1024 * 1024;

/** Max upload size before server-side compression (express body allows more). */
const FAX_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const COMPRESSION_STEPS = [
  { scale: 1.5, quality: 82 },
  { scale: 1.25, quality: 72 },
  { scale: 1.0, quality: 65 },
  { scale: 0.85, quality: 55 },
  { scale: 0.7, quality: 45 },
];

function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function faxSizeErrorMessage(actualBytes) {
  return (
    `PDF is too large for fax (${formatMegabytes(actualBytes)}MB). ` +
    `Maximum is about ${Math.round(FAX_MAX_PDF_BYTES / (1024 * 1024))}MB after compression. ` +
    "Try sending fewer pages, use email instead, or export a smaller report."
  );
}

/**
 * Rasterize PDF pages to JPEG and rebuild a smaller PDF for fax delivery.
 * @param {Buffer} pdfBuffer
 * @param {number} maxBytes
 * @returns {Promise<Buffer|null>}
 */
async function rasterizePdfUnderLimit(pdfBuffer, maxBytes) {
  const { pdf } = await import("pdf-to-img");
  const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;

  for (const { scale, quality } of COMPRESSION_STEPS) {
    const document = await pdf(dataUrl, { scale });
    const outPdf = await PDFDocument.create();

    for await (const pageImage of document) {
      const jpeg = await sharp(pageImage)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      const img = await outPdf.embedJpg(jpeg);
      const page = outPdf.addPage([img.width, img.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height,
      });
    }

    const out = Buffer.from(await outPdf.save());
    if (out.length <= maxBytes) {
      console.log(
        `[Fax] Compressed PDF ${pdfBuffer.length} -> ${out.length} bytes (scale=${scale}, quality=${quality})`
      );
      return out;
    }
  }

  return null;
}

/**
 * Ensure PDF fits within iFax size limits, compressing when possible.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer>}
 */
async function preparePdfBufferForFax(pdfBuffer) {
  if (!pdfBuffer?.length) {
    throw new Error("PDF is empty");
  }
  if (pdfBuffer.slice(0, 5).toString() !== "%PDF-") {
    throw new Error("Attachment must be a PDF file");
  }

  if (pdfBuffer.length <= FAX_MAX_PDF_BYTES) {
    return pdfBuffer;
  }

  console.log(
    `[Fax] PDF is ${formatMegabytes(pdfBuffer.length)}MB — compressing for fax...`
  );

  const compressed = await rasterizePdfUnderLimit(
    pdfBuffer,
    FAX_MAX_PDF_BYTES
  );

  if (compressed) {
    return compressed;
  }

  throw new Error(faxSizeErrorMessage(pdfBuffer.length));
}

module.exports = {
  FAX_MAX_PDF_BYTES,
  FAX_MAX_UPLOAD_BYTES,
  preparePdfBufferForFax,
  faxSizeErrorMessage,
};

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const axios = require("axios");
const facilityQrService = require("./facility-qr.service");
const { downloadFileFromS3 } = require("../../utils/s3.util");
const letterheadPdf = require("../document/letterheadPdf.service");

const QR_SIZE = 256;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;

function getSignInUrl(token) {
  const base = process.env.FRONTEND_URL || "https://app.compliformsai.com";
  return `${base.replace(/\/$/, "")}/sign-in/visitor?t=${encodeURIComponent(token)}`;
}

function getQrImageUrl(signInUrl, size = QR_SIZE) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(signInUrl)}`;
}

async function fetchImageAsUint8Array(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    maxRedirects: 5,
    validateStatus: (status) => status === 200,
  });
  return new Uint8Array(res.data);
}

async function getLogoBytes(config) {
  if (config.logoS3Key) {
    const buffer = await downloadFileFromS3(config.logoS3Key);
    return new Uint8Array(buffer);
  }
  if (config.logoUrl) {
    return fetchImageAsUint8Array(config.logoUrl);
  }
  return null;
}

/**
 * Generate a printable PDF for the facility's visitor QR sign-in template.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePrintPdf(tenantId, facilityId) {
  const config = await facilityQrService.getOrCreateConfig(tenantId, facilityId);
  const facilityDisplayName =
    config.facilityDisplayName || config.facility?.name || "Visitor Sign-In";
  const instructionText = config.instructionText || "Scan to Sign In";
  const disclaimerText = config.disclaimerText || null;

  const signInUrl = getSignInUrl(config.token);
  const qrImageUrl = getQrImageUrl(signInUrl);

  const pdfDoc = await PDFDocument.create();
  const letterheadAssets = await letterheadPdf.prepareLetterheadAssets(
    pdfDoc,
    tenantId,
    facilityId
  );
  const font = letterheadAssets.fonts.font;
  const fontBold = letterheadAssets.fonts.boldFont;
  const page = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
  const { width, height } = page.getSize();
  let y = letterheadAssets.contentStartY;

  const logoBytes = await getLogoBytes(config);
  if (logoBytes && logoBytes.length > 0) {
    try {
      const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
      const image = isPng
        ? await pdfDoc.embedPng(logoBytes)
        : await pdfDoc.embedJpg(logoBytes);
      const logoH = 48;
      const logoW = Math.min((image.width / image.height) * logoH, 200);
      page.drawImage(image, {
        x: (width - logoW) / 2,
        y: y - logoH,
        width: logoW,
        height: logoH,
      });
      y -= logoH + 16;
    } catch (err) {
      console.warn("Visitor QR PDF: could not embed logo:", err?.message);
    }
  }

  page.drawText(facilityDisplayName, {
    x: MARGIN,
    y,
    size: 22,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 28;

  page.drawText(instructionText, {
    x: MARGIN,
    y,
    size: 14,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 32;

  try {
    const qrBytes = await fetchImageAsUint8Array(qrImageUrl);
    const qrImage = await pdfDoc.embedPng(qrBytes);
    const qrDrawSize = 180;
    page.drawImage(qrImage, {
      x: (width - qrDrawSize) / 2,
      y: y - qrDrawSize,
      width: qrDrawSize,
      height: qrDrawSize,
    });
    y -= qrDrawSize + 24;
  } catch (err) {
    console.warn("Visitor QR PDF: could not embed QR image:", err?.message);
    page.drawText("[QR code could not be loaded]", {
      x: (width - 200) / 2,
      y: y - 20,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 32;
  }

  if (disclaimerText) {
    const disclaimerLines = disclaimerText.split(/\n/).filter(Boolean);
    const lineHeight = 10;
    const fontSize = 9;
    for (const line of disclaimerLines) {
      if (y < MARGIN + lineHeight) break;
      page.drawText(line.substring(0, 120), {
        x: MARGIN,
        y,
        size: fontSize,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= lineHeight;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Return QR code image as PNG buffer for the facility's sign-in URL (for print/embed).
 * Server-side fetch avoids CORS so the frontend can use this for print preview.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function getQrImageBuffer(tenantId, facilityId) {
  const config = await facilityQrService.getOrCreateConfig(tenantId, facilityId);
  const signInUrl = getSignInUrl(config.token);
  const qrImageUrl = getQrImageUrl(signInUrl, 256);
  const bytes = await fetchImageAsUint8Array(qrImageUrl);
  return Buffer.from(bytes);
}

module.exports = {
  generatePrintPdf,
  getQrImageBuffer,
};

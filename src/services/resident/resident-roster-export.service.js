const { PDFDocument, rgb } = require("pdf-lib");
const prisma = require("../../lib/prisma");
const letterheadPdf = require("../document/letterheadPdf.service");

function getText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function formatPhone(value) {
  const raw = getText(value);
  return raw;
}

function displayValue(value, fallback = "-") {
  const text = getText(value);
  return text || fallback;
}

function toMm(mm) {
  return (mm * 72) / 25.4;
}

function drawCenteredText(page, text, xCenter, y, size, font, color) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xCenter - width / 2, y, size, font, color });
}

function normalizeResidentForRoster(resident) {
  return {
    residentName: pickFirst(resident, [
      "residentIdentificationFullLegalName",
      "residentFullLegalName",
      "name",
    ]),
    roomNumber: pickFirst(resident, [
      "admissionRoomNumber",
      "roomNumber",
      "residentRoomNumber",
    ]),
    residentPhone: formatPhone(
      pickFirst(resident, [
        "phone",
        "phoneNumber",
        "mobile",
        "emergencyPrimaryContactPhone",
      ])
    ),
    residentEmail: pickFirst(resident, [
      "email",
      "emailAddress",
      "emergencyPrimaryContactEmail",
    ]),
    repName: pickFirst(resident, [
      "emergencyPrimaryContactName",
      "representativeName",
      "guardianName",
    ]),
    repRelationship: pickFirst(resident, [
      "emergencyPrimaryContactRelationship",
      "representativeRelationship",
      "guardianRelationship",
    ]),
    repPhone: formatPhone(
      pickFirst(resident, ["emergencyPrimaryContactPhone", "representativePhone"])
    ),
    repEmail: pickFirst(resident, [
      "emergencyPrimaryContactEmail",
      "representativeEmail",
    ]),
    repAddress: pickFirst(resident, [
      "representativeAddress",
      "emergencyPrimaryContactAddress",
      "address",
    ]),
  };
}

async function exportResidentRosterPdf(user, options = {}) {
  const {
    residentIds = [],
    facilityId,
    tenantId: tenantIdFromRequest,
  } = options;

  const tenantId =
    user.role === "SUPER_ADMIN"
      ? tenantIdFromRequest || user.tenantId
      : user.tenantId;

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  const where = {
    tenantId,
    deletedAt: null,
    ...(Array.isArray(residentIds) && residentIds.length > 0
      ? { id: { in: residentIds } }
      : {}),
  };

  const residents = await prisma.resident.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const rosterRows = residents.map(normalizeResidentForRoster);
  const rowsPerPage = 6;
  const chunks = [];
  for (let i = 0; i < Math.max(1, rosterRows.length); i += rowsPerPage) {
    chunks.push(rosterRows.slice(i, i + rowsPerPage));
  }

  const pdfDoc = await PDFDocument.create();
  const letterheadAssets = await letterheadPdf.prepareLetterheadAssets(
    pdfDoc,
    tenantId,
    facilityId
  );
  const font = letterheadAssets.fonts.font;
  const boldFont = letterheadAssets.fonts.boldFont;
  const totalPages = chunks.length;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const page = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
    const { width, height } = page.getSize();
    const margin = toMm(10);
    const colW = (width - margin * 2) / 4;
    const pageRows = chunks[pageIndex] || [];
    const rowsThisPage = Math.max(1, pageRows.length);

    const titleTop = letterheadAssets.contentStartY - 8;
    const tableTop = titleTop - 36;
    const rowH = toMm(20);
    const headerRowH = rowH * 0.72;
    const tableHeight = headerRowH + rowH * rowsThisPage;
    const tableBottom = tableTop - tableHeight;

    const dark = rgb(0.09, 0.09, 0.09);

    drawCenteredText(
      page,
      "Resident Roster",
      width / 2,
      titleTop - 20,
      16,
      boldFont,
      dark
    );

    page.drawRectangle({
      x: margin,
      y: tableBottom,
      width: width - margin * 2,
      height: tableHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.8,
    });

    for (let i = 1; i <= 3; i += 1) {
      const x = margin + colW * i;
      page.drawLine({
        start: { x, y: tableBottom },
        end: { x, y: tableTop },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
    }
    for (let i = 0; i <= rowsThisPage; i += 1) {
      const y = tableTop - headerRowH - rowH * i;
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
    }

    const headerCenterY = tableTop - headerRowH / 2 - 3;
    drawCenteredText(page, "Resident", margin + colW * 0.5, headerCenterY, 10.5, boldFont, dark);
    drawCenteredText(page, "Contact", margin + colW * 1.5, headerCenterY, 10.5, boldFont, dark);
    drawCenteredText(
      page,
      "Representative",
      margin + colW * 2.5,
      headerCenterY,
      10.5,
      boldFont,
      dark
    );
    drawCenteredText(page, "Contact", margin + colW * 3.5, headerCenterY, 10.5, boldFont, dark);

    for (let row = 0; row < rowsThisPage; row += 1) {
      const data = pageRows[row] || {
        residentName: "",
        roomNumber: "",
        residentPhone: "",
        residentEmail: "",
        repName: "",
        repRelationship: "",
        repPhone: "",
        repEmail: "",
        repAddress: "",
      };
      const yTop = tableTop - headerRowH - rowH * row;
      const line1 = yTop - 13;
      const line2 = yTop - 30;
      const line3 = yTop - 47;

      const c1 = margin + 4;
      const c2 = margin + colW + 4;
      const c3 = margin + colW * 2 + 4;
      const c4 = margin + colW * 3 + 4;
      const maxW = colW - 8;

      page.drawText(`Name: ${displayValue(data.residentName)}`, { x: c1, y: line1, size: 9.2, font, color: dark, maxWidth: maxW });
      page.drawText(`Room #: ${displayValue(data.roomNumber)}`, { x: c1, y: line2, size: 9.2, font, color: dark, maxWidth: maxW });

      page.drawText(`Phone: ${displayValue(data.residentPhone)}`, { x: c2, y: line1, size: 9.2, font, color: dark, maxWidth: maxW });
      page.drawText(`Email: ${displayValue(data.residentEmail, "N/A")}`, { x: c2, y: line2, size: 9.2, font, color: dark, maxWidth: maxW });

      page.drawText(`Name: ${displayValue(data.repName)}`, { x: c3, y: line1, size: 9.2, font, color: dark, maxWidth: maxW });
      page.drawText(`Relationship: ${displayValue(data.repRelationship)}`, { x: c3, y: line2, size: 9.2, font, color: dark, maxWidth: maxW });

      page.drawText(`Phone: ${displayValue(data.repPhone)}`, { x: c4, y: line1, size: 9.2, font, color: dark, maxWidth: maxW });
      page.drawText(`Email: ${displayValue(data.repEmail, "N/A")}`, { x: c4, y: line2, size: 9.2, font, color: dark, maxWidth: maxW });
      page.drawText(`Address: ${displayValue(data.repAddress)}`, { x: c4, y: line3, size: 9.2, font, color: dark, maxWidth: maxW });
    }

  }

  letterheadPdf.stampPageNumbers(pdfDoc, letterheadAssets.fonts.font, 50);
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  exportResidentRosterPdf,
};

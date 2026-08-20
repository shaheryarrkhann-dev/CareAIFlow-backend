/**
 * Admission Agreement PDF Generator
 * Uses the platform universal letterhead (same as all other reports).
 * Only core resident fields are shown — optional fields are omitted if blank.
 */

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const {
  prepareLetterheadAssets,
  addLetterheadPage,
  stampPageNumbers,
  contentBottomMin,
  BODY_MARGIN,
} = require("../document/letterheadPdf.service");

const C = {
  brand:   rgb(14 / 255, 117 / 255, 21 / 255),
  heading: rgb(0.08, 0.08, 0.08),
  body:    rgb(0.20, 0.20, 0.20),
  label:   rgb(0.38, 0.40, 0.42),
  divider: rgb(0.86, 0.88, 0.90),
  white:   rgb(1, 1, 1),
  sigBox:  rgb(0.96, 0.98, 0.96),
};

function fmt(val, fallback = "") {
  if (val === null || val === undefined || String(val).trim() === "") return fallback;
  return String(val).trim();
}

function fmtDate(val) {
  if (!val) return "";
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function wrapText(text, maxWidth, font, fontSize) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function generateAdmissionAgreement(resident, tenantId, documentName = "Resident Admission Agreement") {
  const pdfDoc = await PDFDocument.create();

  const assets   = await prepareLetterheadAssets(pdfDoc, tenantId, null).catch(() => null);
  const font     = assets?.fonts?.font     ?? await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = assets?.fonts?.boldFont ?? await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin     = assets?.bodyMargin ?? BODY_MARGIN;
  const pageW      = 612;
  const pageH      = 792;
  const contentW   = pageW - margin * 2;
  const bottomMin  = assets ? contentBottomMin(assets) : 70;
  const topStart   = assets?.contentStartY ?? (pageH - margin);

  let page = assets ? addLetterheadPage(pdfDoc, assets) : pdfDoc.addPage([pageW, pageH]);
  let y    = topStart;

  function ensureSpace(needed) {
    if (y - needed < bottomMin) {
      page = assets ? addLetterheadPage(pdfDoc, assets) : pdfDoc.addPage([pageW, pageH]);
      y    = topStart;
    }
  }

  function gap(pts) { y -= pts; }

  function drawDivider() {
    ensureSpace(10);
    page.drawRectangle({ x: margin, y: y + 4, width: contentW, height: 0.6, color: C.divider });
    y -= 12;
  }

  function drawSectionBand(title) {
    ensureSpace(26);
    page.drawRectangle({ x: margin, y: y - 5, width: contentW, height: 20, color: C.brand });
    page.drawText(title.toUpperCase(), {
      x: margin + 8, y: y - 1,
      size: 8.5, font: boldFont, color: C.white,
    });
    y -= 22;
  }

  /** Single label: value row with underline */
  function drawInfoRow(label, value, col2X = margin + 150) {
    if (!value) return; // skip if empty
    ensureSpace(18);
    page.drawText(label, { x: margin, y, size: 8.5, font, color: C.label });
    page.drawText(value, { x: col2X, y, size: 8.5, font: boldFont, color: C.heading });
    y -= 16;
  }

  /** Two info fields side-by-side — skips if both empty */
  function drawInfoPair(l1, v1, l2, v2) {
    if (!v1 && !v2) return;
    ensureSpace(18);
    const half = contentW / 2 - 10;
    if (v1) {
      page.drawText(l1, { x: margin,       y, size: 8.5, font, color: C.label });
      page.drawText(v1, { x: margin + 110, y, size: 8.5, font: boldFont, color: C.heading });
    }
    if (v2) {
      page.drawText(l2, { x: margin + half,       y, size: 8.5, font, color: C.label });
      page.drawText(v2, { x: margin + half + 110, y, size: 8.5, font: boldFont, color: C.heading });
    }
    y -= 16;
  }

  let clauseNum = 0;
  function drawClause(text) {
    clauseNum += 1;
    ensureSpace(14);
    page.drawText(`${clauseNum}.`, { x: margin, y, size: 8.5, font: boldFont, color: C.heading });
    const lines = wrapText(text, contentW - 16, font, 8.5);
    for (const ln of lines) {
      ensureSpace(14);
      page.drawText(ln, { x: margin + 16, y, size: 8.5, font, color: C.body });
      y -= 13;
    }
    gap(4);
  }

  // ─── Underline field helper (for signature section) ────────────────────────
  function drawUnderlineField(label, value, x, fieldY, w) {
    page.drawRectangle({ x, y: fieldY - 1, width: w, height: 0.7, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(label, { x, y: fieldY - 12, size: 7.5, font, color: C.label });
    if (value) {
      page.drawText(value, { x, y: fieldY + 2, size: 8.5, font, color: C.heading });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DOCUMENT TITLE
  // ══════════════════════════════════════════════════════════════════════════════
  const facilityName = assets?.context?.displayName ?? "Facility";
  const genDate      = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const title  = documentName.toUpperCase();
  const titleW = boldFont.widthOfTextAtSize(title, 16);
  page.drawText(title, { x: (pageW - titleW) / 2, y, size: 16, font: boldFont, color: C.brand });
  y -= 20;

  const sub  = `${facilityName}  ·  ${genDate}`;
  const subW = font.widthOfTextAtSize(sub, 8.5);
  page.drawText(sub, { x: (pageW - subW) / 2, y, size: 8.5, font, color: C.label });
  y -= 6;
  drawDivider();
  gap(2);

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — RESIDENT INFORMATION
  // ══════════════════════════════════════════════════════════════════════════════
  drawSectionBand("Section 1 — Resident Information");
  gap(4);

  const resName = fmt(resident.residentFullLegalName || resident.name);
  drawInfoRow("Full Legal Name:",   resName || "—");
  drawInfoPair(
    "Date of Birth:", fmtDate(resident.residentDateOfBirth),
    "Gender:",        fmt(resident.residentGenderSex)
  );
  drawInfoPair(
    "Admission Date:", fmtDate(resident.admissionDate),
    "Room / Unit:",    fmt(resident.admissionRoomNumber)
  );
  drawInfoRow("Admission Type:",    fmt(resident.admissionType));
  drawInfoRow("Primary Language:",  fmt(resident.residentPrimaryLanguage));

  gap(6);
  drawDivider();

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 2 — TERMS & CONDITIONS
  // ══════════════════════════════════════════════════════════════════════════════
  drawSectionBand("Section 2 — Terms & Conditions of Admission");
  gap(6);

  drawClause(
    `ADMISSION AND SERVICES. ${facilityName} ("Facility") agrees to provide residential care, personal assistance, and related services appropriate to the assessed needs of the Resident. An individualized service plan will be developed in collaboration with the Resident and/or authorized representative within 30 days of admission and reviewed at least annually or as needs change.`
  );

  drawClause(
    `FINANCIAL RESPONSIBILITY. The Resident or responsible party agrees to pay all fees in accordance with the current fee schedule provided at admission. Monthly statements are issued by the 5th of each month and are due by the 15th. The Facility will provide a minimum of 30 days written notice of any rate adjustment.`
  );

  drawClause(
    `RESIDENT RIGHTS. The Facility upholds all rights afforded to residents under applicable federal and state laws, including the right to be treated with dignity and respect; the right to privacy and confidentiality; the right to participate in care planning; the right to file grievances without retaliation; and the right to communicate freely with family and outside agencies.`
  );

  drawClause(
    `PRIVACY AND CONFIDENTIALITY (HIPAA). Protected health information (PHI) will be maintained in accordance with HIPAA and applicable state privacy laws. The Facility's Notice of Privacy Practices has been provided to the Resident or authorized representative.`
  );

  drawClause(
    `ADVANCE DIRECTIVES. The Facility will honor valid advance directives including DPOA for Healthcare, POLST, and living wills. A copy must be provided to the Facility and kept in the Resident's file. Execution of an advance directive is not a condition of admission.`
  );

  drawClause(
    `MEDICATIONS. All medications must be ordered by a licensed prescriber. Medications will be administered as prescribed and documented in the Medication Administration Record. All medications will be stored securely per state regulations.`
  );

  drawClause(
    `DISCHARGE AND TRANSFER. The Facility may initiate discharge or transfer for reasons permitted by state regulation, including non-payment, needs exceeding the Facility's capabilities, or safety concerns. Required advance written notice will be provided and safe transfer planning will be assisted.`
  );

  drawClause(
    `GRIEVANCE PROCEDURE. Residents and their representatives have the right to voice grievances without retaliation. Written grievances should be submitted to the Administrator. The Facility will acknowledge receipt within 3 business days and respond in writing within 14 days. Unresolved concerns may be reported to the state licensing agency or Long-Term Care Ombudsman.`
  );

  gap(6);
  drawDivider();

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 3 — ACKNOWLEDGEMENTS
  // ══════════════════════════════════════════════════════════════════════════════
  drawSectionBand("Section 3 — Acknowledgements");
  gap(8);

  const ackText =
    "The undersigned acknowledges receipt of and agreement to the following documents provided at admission:";
  for (const ln of wrapText(ackText, contentW, font, 8.5)) {
    ensureSpace(14);
    page.drawText(ln, { x: margin, y, size: 8.5, font, color: C.body });
    y -= 13;
  }
  gap(4);

  const ackItems = [
    "Resident Rights and Responsibilities",
    "Notice of Privacy Practices (HIPAA)",
    "Facility Fee Schedule and Rate Structure",
    "House Rules and Community Policies",
    "Emergency and Evacuation Procedures",
    "Grievance and Complaint Procedure",
  ];
  for (const item of ackItems) {
    ensureSpace(14);
    page.drawText("•", { x: margin + 10, y, size: 8.5, font: boldFont, color: C.brand });
    page.drawText(item, { x: margin + 22, y, size: 8.5, font, color: C.body });
    y -= 13;
  }

  gap(6);
  drawDivider();

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 4 — SIGNATURES
  // ══════════════════════════════════════════════════════════════════════════════
  ensureSpace(210);
  drawSectionBand("Section 4 — Signatures");
  gap(8);

  // Intro text
  const introText = `By signing below, the Resident or Authorized Representative confirms having read and agreed to all terms of this Resident Admission Agreement with ${facilityName}, effective ${genDate}.`;
  for (const ln of wrapText(introText, contentW, font, 8.5)) {
    ensureSpace(14);
    page.drawText(ln, { x: margin, y, size: 8.5, font, color: C.body });
    y -= 13;
  }
  gap(18);

  // ── Two-column signature block ──────────────────────────────────────────────
  const colW  = (contentW - 24) / 2;
  const col1X = margin;
  const col2X = margin + colW + 24;
  const sigTopY = y;

  // ── LEFT: Resident / Authorized Representative ──────────────────────────────

  // Capture page number for the signature page (1-based, pdfDoc.getPageCount() = current total)
  const sigPageNumber = pdfDoc.getPageCount();

  // Column label
  page.drawText("Resident / Authorized Representative", {
    x: col1X, y: sigTopY,
    size: 8.5, font: boldFont, color: C.heading,
  });

  // Shaded signature box (DocuSign widget sits inside here)
  // sigBoxH must be tall enough for the DocuSign SignHere button (~44px at 72dpi).
  const sigBoxH = 65;
  const boxBottom = sigTopY - 14 - sigBoxH; // pdf-lib y of box bottom edge
  page.drawRectangle({
    x: col1X, y: boxBottom,
    width: colW, height: sigBoxH,
    color: C.sigBox,
    borderColor: C.divider,
    borderWidth: 0.8,
  });
  // "Sign Here" hint text inside the box (vertically centered)
  page.drawText("Sign Here", {
    x: col1X + 8, y: boxBottom + sigBoxH / 2 - 4,
    size: 8, font, color: rgb(0.65, 0.70, 0.65),
  });

  // Compute absolute DocuSign tab position to center the SignHere button inside the box.
  // DocuSign coordinate system: origin at TOP-LEFT, Y increases downward (opposite of pdf-lib).
  // DocuSign SignHere button is ~150px wide and ~44px tall at 72 DPI (1pt = 1px).
  const buttonW = 150, buttonH = 44;
  const tabX = Math.round(col1X + (colW - buttonW) / 2);
  // boxBottom + sigBoxH = pdf-lib Y of box top edge; convert to DocuSign Y (from top)
  const boxTopInDocuSign = pageH - (boxBottom + sigBoxH);
  const tabY = Math.round(boxTopInDocuSign + (sigBoxH - buttonH) / 2);
  const tabPosition = { pageNumber: sigPageNumber, xPosition: tabX, yPosition: tabY };

  const col1FieldsY = boxBottom - 20;
  drawUnderlineField("Printed Name", resName || "", col1X, col1FieldsY, colW);
  drawUnderlineField("Date",         "",              col1X, col1FieldsY - 28, colW * 0.55);
  drawUnderlineField("Relationship to Resident (if not Resident)", "", col1X, col1FieldsY - 56, colW);

  // ── RIGHT: Facility Representative ─────────────────────────────────────────

  page.drawText("Facility Representative", {
    x: col2X, y: sigTopY,
    size: 8.5, font: boldFont, color: C.heading,
  });

  // Facility signature box (blank — wet ink or staff signs separately)
  page.drawRectangle({
    x: col2X, y: boxBottom,
    width: colW, height: sigBoxH,
    color: C.sigBox,
    borderColor: C.divider,
    borderWidth: 0.8,
  });
  page.drawText("Sign Here", {
    x: col2X + 8, y: boxBottom + sigBoxH / 2 - 4,
    size: 8, font, color: rgb(0.65, 0.70, 0.65),
  });

  const col2FieldsY = col1FieldsY;
  drawUnderlineField("Printed Name", facilityName, col2X, col2FieldsY, colW);
  drawUnderlineField("Date",         "",            col2X, col2FieldsY - 28, colW * 0.55);
  drawUnderlineField("Title",        "",            col2X, col2FieldsY - 56, colW);

  y = col1FieldsY - 76;
  gap(16);
  drawDivider();

  // ── Footer notice ───────────────────────────────────────────────────────────
  ensureSpace(48);
  page.drawRectangle({
    x: margin, y: y - 34, width: contentW, height: 42,
    color: rgb(0.97, 0.99, 0.97),
    borderColor: C.brand, borderWidth: 0.4,
  });
  const notices = [
    `This document is transmitted for electronic signature via CareAIFlow.`,
    `Agreement Date: ${genDate}  ·  Facility: ${facilityName}`,
    `Questions? Contact the Facility Administrator or your assigned case manager.`,
  ];
  let ny = y + 2;
  for (const n of notices) {
    page.drawText(n, { x: margin + 8, y: ny, size: 7.5, font, color: C.label });
    ny -= 12;
  }

  // ── Page numbers ─────────────────────────────────────────────────────────────
  stampPageNumbers(pdfDoc, font, margin);

  const bytes = await pdfDoc.save();
  return { pdfBuffer: Buffer.from(bytes), tabPosition };
}

module.exports = { generateAdmissionAgreement };

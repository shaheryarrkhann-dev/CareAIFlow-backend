const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const prisma = require("../../lib/prisma");
const { getMarRecords } = require("./mar.service");
const { getMedications } = require("./medication.service");
const { getPrnRecords } = require("./prn-record.service");
const { getResidentById } = require("../resident/resident.service");
const { generateCalendarMarPdf } = require("./mar-calendar-export.service");

/**
 * Wrap text to fit within specified width
 */
function wrapText({ text, maxWidth, font, fontSize }) {
  if (!text) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";
  const widthOf = (line) => font.widthOfTextAtSize(line, fontSize);

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }
    const candidate = `${currentLine} ${word}`;
    if (widthOf(candidate) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

/**
 * Export MAR records to PDF
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportMarToPdf(user, filters = {}) {
  const result = await getMarRecords(user, {
    ...filters,
    page: 1,
    limit: 10000, // Get all records for export
  });

  if (result.records.length === 0) {
    throw new Error("No MAR records found to export");
  }

  const records = result.records;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Note: PDF-lib StandardFonts doesn't have semibold, using regular font as closest option
  // For true semibold, you would need to embed a custom font file
  const semiBoldFont = font; // Using regular font as semibold approximation

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  let currentY = pageHeight - margin;
  let currentPage = page;

  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Calculate content width early (needed for header)
  const contentWidth = pageWidth - margin * 2;

  // Modern header without background
  currentPage.drawText("Medication Administration Record (MAR)", {
    x: margin,
    y: currentY,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0), // Black text
  });
  currentY -= 30;

  const tenantName = records[0]?.tenant?.name || "All Facilities";
  const dateRange =
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(
          filters.dateTo
        ).toLocaleDateString()}`
      : "All Dates";
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Info section with better styling
  currentPage.drawText(`Facility: ${tenantName}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Date Range: ${dateRange}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Generated: ${generatedAt}`, {
    x: margin,
    y: currentY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  currentY -= 30;

  // Table headers with better column widths
  const colWidths = {
    date: 75,
    time: 65,
    medication: 140,
    resident: 110,
    status: 70,
    caregiver: 100,
  };
  // Adjust medication column if needed to fit
  const totalFixedWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  if (totalFixedWidth > contentWidth) {
    colWidths.medication = Math.max(
      100,
      colWidths.medication - (totalFixedWidth - contentWidth)
    );
  }

  const colX = {
    date: margin,
    time: margin + colWidths.date,
    medication: margin + colWidths.date + colWidths.time,
    resident: margin + colWidths.date + colWidths.time + colWidths.medication,
    status:
      margin +
      colWidths.date +
      colWidths.time +
      colWidths.medication +
      colWidths.resident,
    caregiver:
      margin +
      colWidths.date +
      colWidths.time +
      colWidths.medication +
      colWidths.resident +
      colWidths.status,
  };

  // Modern table header with professional styling
  const headerHeight = 24;
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.906, 0.971, 0.821), // #88DB1B33 - Light green tint (transparent green approximated)
  });

  const headers = [
    "Date",
    "Time",
    "Medication",
    "Resident",
    "Status",
    "Caregiver",
  ];
  headers.forEach((header, idx) => {
    const x = Object.values(colX)[idx];
    const maxWidth = Object.values(colWidths)[idx] - 4;
    const headerText = wrapText({
      text: header,
      maxWidth,
      font: semiBoldFont,
      fontSize: 10,
    });
    currentPage.drawText(headerText[0] || header, {
      x: x + 6,
      y: currentY - 16,
      size: 10,
      font: semiBoldFont,
      color: rgb(0, 0, 0), // Black text
    });

    // Draw subtle column separator (except for last column)
    if (idx < headers.length - 1) {
      const separatorX = x + Object.values(colWidths)[idx];
      currentPage.drawLine({
        start: { x: separatorX, y: currentY - headerHeight + 2 },
        end: { x: separatorX, y: currentY - 2 },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  });
  currentY -= headerHeight;

  // Subtle line under headers
  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  currentY -= 0; // No space between header and body

  // Records with proper row height calculation
  for (const record of records) {
    const date = new Date(record.administeredAt).toLocaleDateString();
    const time = new Date(record.administeredAt).toLocaleTimeString();
    const medication = record.medication?.name || "N/A";
    const resident =
      record.residentName ||
      (record.residentId ? record.residentId.substring(0, 12) + "..." : "N/A");
    const status = record.status;
    const caregiver = record.caregiverName || "N/A";

    // Calculate max lines needed for this row and store wrapped text for each cell
    const values = [date, time, medication, resident, status, caregiver];
    let maxLines = 1;
    const cellLines = [];
    values.forEach((value, idx) => {
      const maxWidth = Object.values(colWidths)[idx] - 4;
      const lines = wrapText({
        text: String(value),
        maxWidth,
        font,
        fontSize: 9,
      });
      const limitedLines = lines.slice(0, 3); // Max 3 lines per cell
      cellLines.push(limitedLines);
      maxLines = Math.max(maxLines, limitedLines.length);
    });

    // Increased row height for better spacing (more padding)
    const lineHeight = 12;
    const verticalPadding = 10; // Top and bottom padding
    const rowHeight = maxLines * lineHeight + verticalPadding * 2;
    checkNewPage(rowHeight + 12);

    // Draw row background (alternating between light gray and sage green)
    const rowIndex = records.indexOf(record);
    if (rowIndex % 2 === 0) {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(1, 1, 1), // White
      });
    } else {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.97, 0.99, 0.92), // Sage green (same as table header)
      });
    }

    // Calculate row center for vertical centering
    const rowCenterY = currentY - rowHeight / 2;

    // Draw cell values with vertical centering
    values.forEach((value, idx) => {
      const x = Object.values(colX)[idx];
      const lines = cellLines[idx];
      const numLines = lines.length;

      // Calculate vertical position to center the text block
      // For single line: center at row center
      // For multiple lines: center the block around row center
      const textBlockHeight = (numLines - 1) * lineHeight;
      const firstLineY = rowCenterY + textBlockHeight / 2;

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(line, {
          x: x + 6,
          y: firstLineY - lineIdx * lineHeight,
          size: 9,
          font: font,
          color: rgb(0.2, 0.2, 0.2), // Darker text for better readability
        });
      });

      // Draw subtle column separator (except for last column)
      if (idx < values.length - 1) {
        const separatorX = x + Object.values(colWidths)[idx];
        currentPage.drawLine({
          start: { x: separatorX, y: currentY - rowHeight + 2 },
          end: { x: separatorX, y: currentY - 2 },
          thickness: 0.3,
          color: rgb(0.92, 0.92, 0.92),
        });
      }
    });

    // Draw subtle row separator
    currentPage.drawLine({
      start: { x: margin, y: currentY - rowHeight },
      end: { x: pageWidth - margin, y: currentY - rowHeight },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    currentY -= rowHeight;
  }

  // Modern footer with better styling
  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    // Footer background line
    pdfPage.drawLine({
      start: { x: margin, y: margin + 20 },
      end: { x: pageWidth - margin, y: margin + 20 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    pdfPage.drawText("Generated by AFH Platform – HIPAA Compliant Record", {
      x: margin,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export medication list to PDF
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportMedicationListToPdf(user, filters = {}) {
  const result = await getMedications(user, {
    ...filters,
    page: 1,
    limit: 10000,
  });

  if (result.medications.length === 0) {
    throw new Error("No medications found to export");
  }

  const medications = result.medications;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Note: PDF-lib StandardFonts doesn't have semibold, using regular font as closest option
  // For true semibold, you would need to embed a custom font file
  const semiBoldFont = font; // Using regular font as semibold approximation

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  let currentY = pageHeight - margin;
  let currentPage = page;

  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Calculate content width early (needed for header)
  const contentWidth = pageWidth - margin * 2;

  // Modern header without background
  currentPage.drawText("Medication List", {
    x: margin,
    y: currentY,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0), // Black text
  });
  currentY -= 30;

  const tenantName = medications[0]?.tenant?.name || "All Facilities";
  const dateRange =
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(
          filters.dateTo
        ).toLocaleDateString()}`
      : "All Dates";
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Info section with better styling
  currentPage.drawText(`Facility: ${tenantName}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Date Range: ${dateRange}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Generated: ${generatedAt}`, {
    x: margin,
    y: currentY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  currentY -= 30;

  // Table headers with better column widths
  const colWidths = {
    medication: 150,
    dosage: 90,
    route: 70,
    frequency: 90,
    resident: 100,
    status: 70,
  };
  // Adjust columns if needed to fit within contentWidth
  const totalFixedWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  if (totalFixedWidth > contentWidth) {
    // Proportionally reduce all columns
    const scaleFactor = contentWidth / totalFixedWidth;
    Object.keys(colWidths).forEach((key) => {
      colWidths[key] = Math.floor(colWidths[key] * scaleFactor);
    });
  }

  const colX = {
    medication: margin,
    dosage: margin + colWidths.medication,
    route: margin + colWidths.medication + colWidths.dosage,
    frequency:
      margin + colWidths.medication + colWidths.dosage + colWidths.route,
    resident:
      margin +
      colWidths.medication +
      colWidths.dosage +
      colWidths.route +
      colWidths.frequency,
    status:
      margin +
      colWidths.medication +
      colWidths.dosage +
      colWidths.route +
      colWidths.frequency +
      colWidths.resident,
  };

  // Modern table header with professional styling
  const headerHeight = 24;
  // Draw header background first
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.906, 0.971, 0.821), // #88DB1B33 - Light green tint (transparent green approximated)
  });

  const headers = [
    "Medication",
    "Dosage",
    "Route",
    "Frequency",
    "Resident",
    "Status",
  ];
  headers.forEach((header, idx) => {
    const x = Object.values(colX)[idx];
    const colWidth = Object.values(colWidths)[idx];
    const maxWidth = colWidth - 12; // More padding to prevent overflow
    const headerText = wrapText({
      text: header,
      maxWidth,
      font: semiBoldFont,
      fontSize: 10,
    });
    currentPage.drawText(headerText[0] || header, {
      x: x + 6,
      y: currentY - 16,
      size: 10,
      font: semiBoldFont,
      color: rgb(0, 0, 0), // Black text
    });

    // Draw subtle column separator (except for last column)
    if (idx < headers.length - 1) {
      const separatorX = x + colWidth;
      currentPage.drawLine({
        start: { x: separatorX, y: currentY - headerHeight + 2 },
        end: { x: separatorX, y: currentY - 2 },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  });
  currentY -= headerHeight;

  // Subtle line under headers
  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  currentY -= 0; // No space between header and body

  // Records with proper row height calculation
  for (const med of medications) {
    const status = med.isActive ? (med.isPrn ? "PRN" : "Active") : "Inactive";
    const name = med.name || "N/A";
    const dosage = med.dosage || "N/A";
    const route = med.route || "N/A";
    const frequency = med.frequency || "N/A";
    const resident =
      med.residentName ||
      (med.residentId ? med.residentId.substring(0, 12) + "..." : "N/A");

    // Calculate max lines needed for this row and store wrapped text for each cell
    const values = [name, dosage, route, frequency, resident, status];
    let maxLines = 1;
    const cellLines = [];
    values.forEach((value, idx) => {
      const colWidth = Object.values(colWidths)[idx];
      const maxWidth = colWidth - 12; // Account for 6px padding on each side
      const lines = wrapText({
        text: String(value),
        maxWidth,
        font,
        fontSize: 9,
      });
      const limitedLines = lines.slice(0, 3); // Max 3 lines per cell
      cellLines.push(limitedLines);
      maxLines = Math.max(maxLines, limitedLines.length);
    });

    // Increased row height for better spacing (more padding)
    const lineHeight = 12;
    const verticalPadding = 10; // Top and bottom padding
    const rowHeight = maxLines * lineHeight + verticalPadding * 2;
    checkNewPage(rowHeight + 12);

    // Draw row background (alternating between light gray and sage green)
    const rowIndex = medications.indexOf(med);
    if (rowIndex % 2 === 0) {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(1, 1, 1), // White
      });
    } else {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.97, 0.99, 0.92), // Sage green (same as table header)
      });
    }

    // Calculate row center for vertical centering
    const rowCenterY = currentY - rowHeight / 2;

    // Determine status color
    let statusColor = rgb(0.2, 0.2, 0.2);
    if (status === "Active") {
      statusColor = rgb(0.2, 0.6, 0.35); // Green
    } else if (status === "PRN") {
      statusColor = rgb(0.2, 0.5, 0.8); // Blue
    } else if (status === "Inactive") {
      statusColor = rgb(0.5, 0.5, 0.5); // Gray
    }

    // Draw cell values with vertical centering
    values.forEach((value, idx) => {
      const x = Object.values(colX)[idx];
      const lines = cellLines[idx];
      const numLines = lines.length;

      // Calculate vertical position to center the text block
      // For single line: center at row center
      // For multiple lines: center the block around row center
      const textBlockHeight = (numLines - 1) * lineHeight;
      const firstLineY = rowCenterY + textBlockHeight / 2;

      // Use status color for status column, otherwise default
      const textColor = idx === 5 ? statusColor : rgb(0.2, 0.2, 0.2);

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(line, {
          x: x + 6,
          y: firstLineY - lineIdx * lineHeight,
          size: 9,
          font: font,
          color: textColor,
        });
      });

      // Draw subtle column separator (except for last column)
      if (idx < values.length - 1) {
        const separatorX = x + Object.values(colWidths)[idx];
        currentPage.drawLine({
          start: { x: separatorX, y: currentY - rowHeight + 2 },
          end: { x: separatorX, y: currentY - 2 },
          thickness: 0.3,
          color: rgb(0.92, 0.92, 0.92),
        });
      }
    });

    // Draw subtle row separator
    currentPage.drawLine({
      start: { x: margin, y: currentY - rowHeight },
      end: { x: pageWidth - margin, y: currentY - rowHeight },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    currentY -= rowHeight;
  }

  // Modern footer with better styling
  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    // Footer background line
    pdfPage.drawLine({
      start: { x: margin, y: margin + 20 },
      end: { x: pageWidth - margin, y: margin + 20 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    pdfPage.drawText("Generated by AFH Platform – HIPAA Compliant Record", {
      x: margin,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export PRN logs to PDF
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportPrnLogsToPdf(user, filters = {}) {
  const result = await getPrnRecords(user, {
    ...filters,
    page: 1,
    limit: 10000,
  });

  if (result.records.length === 0) {
    throw new Error("No PRN records found to export");
  }

  const records = result.records;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Note: PDF-lib StandardFonts doesn't have semibold, using regular font as closest option
  // For true semibold, you would need to embed a custom font file
  const semiBoldFont = font; // Using regular font as semibold approximation

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  let currentY = pageHeight - margin;
  let currentPage = page;

  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Calculate content width early (needed for header)
  const contentWidth = pageWidth - margin * 2;

  // Modern header without background
  currentPage.drawText("PRN Medication Logs", {
    x: margin,
    y: currentY,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0), // Black text
  });
  currentY -= 30;

  const tenantName = records[0]?.tenant?.name || "All Facilities";
  const dateRange =
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(
          filters.dateTo
        ).toLocaleDateString()}`
      : "All Dates";
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Info section with better styling
  currentPage.drawText(`Facility: ${tenantName}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Date Range: ${dateRange}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Generated: ${generatedAt}`, {
    x: margin,
    y: currentY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  currentY -= 30;

  // Table headers with better column widths
  const colWidths = {
    date: 75,
    time: 65,
    medication: 130,
    resident: 100,
    whyGiven: 100,
    caregiver: 100,
  };
  // Adjust medication column if needed to fit
  const totalFixedWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  if (totalFixedWidth > contentWidth) {
    colWidths.medication = Math.max(
      90,
      colWidths.medication - (totalFixedWidth - contentWidth)
    );
  }

  const colX = {
    date: margin,
    time: margin + colWidths.date,
    medication: margin + colWidths.date + colWidths.time,
    resident: margin + colWidths.date + colWidths.time + colWidths.medication,
    whyGiven:
      margin +
      colWidths.date +
      colWidths.time +
      colWidths.medication +
      colWidths.resident,
    caregiver:
      margin +
      colWidths.date +
      colWidths.time +
      colWidths.medication +
      colWidths.resident +
      colWidths.whyGiven,
  };

  // Modern table header with professional styling
  const headerHeight = 24;
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.906, 0.971, 0.821), // #88DB1B33 - Light green tint (transparent green approximated)
  });

  const headers = [
    "Date",
    "Time",
    "Medication",
    "Resident",
    "Why Given",
    "Caregiver",
  ];
  headers.forEach((header, idx) => {
    const x = Object.values(colX)[idx];
    const maxWidth = Object.values(colWidths)[idx] - 4;
    const headerText = wrapText({
      text: header,
      maxWidth,
      font: semiBoldFont,
      fontSize: 10,
    });
    currentPage.drawText(headerText[0] || header, {
      x: x + 6,
      y: currentY - 16,
      size: 10,
      font: semiBoldFont,
      color: rgb(0, 0, 0), // Black text
    });

    // Draw subtle column separator (except for last column)
    if (idx < headers.length - 1) {
      const separatorX = x + Object.values(colWidths)[idx];
      currentPage.drawLine({
        start: { x: separatorX, y: currentY - headerHeight + 2 },
        end: { x: separatorX, y: currentY - 2 },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  });
  currentY -= headerHeight;

  // Subtle line under headers
  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  currentY -= 0; // No space between header and body

  // Records with proper row height calculation
  for (const record of records) {
    const date = new Date(record.givenAt).toLocaleDateString();
    const time = new Date(record.givenAt).toLocaleTimeString();
    const medication = `${record.medication?.name || "N/A"}${
      record.medication?.dosage ? ` - ${record.medication.dosage}` : ""
    }`;
    const resident =
      record.residentName ||
      (record.residentId ? record.residentId.substring(0, 12) + "..." : "N/A");
    const whyGiven = record.whyGiven || record.symptom || "N/A";
    const caregiver = record.caregiverName || "N/A";

    // Calculate max lines needed for this row and store wrapped text for each cell
    const values = [date, time, medication, resident, whyGiven, caregiver];
    let maxLines = 1;
    const cellLines = [];
    values.forEach((value, idx) => {
      const maxWidth = Object.values(colWidths)[idx] - 4;
      const lines = wrapText({
        text: String(value),
        maxWidth,
        font,
        fontSize: 9,
      });
      const limitedLines = lines.slice(0, 3); // Max 3 lines per cell
      cellLines.push(limitedLines);
      maxLines = Math.max(maxLines, limitedLines.length);
    });

    // Increased row height for better spacing (more padding)
    const lineHeight = 12;
    const verticalPadding = 10; // Top and bottom padding
    const rowHeight = maxLines * lineHeight + verticalPadding * 2;
    checkNewPage(rowHeight + 12);

    // Draw row background (alternating between light gray and sage green)
    const rowIndex = records.indexOf(record);
    if (rowIndex % 2 === 0) {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(1, 1, 1), // Light gray
      });
    } else {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.97, 0.99, 0.92), // Sage green (same as table header)
      });
    }

    // Calculate row center for vertical centering
    const rowCenterY = currentY - rowHeight / 2;

    // Draw cell values with vertical centering
    values.forEach((value, idx) => {
      const x = Object.values(colX)[idx];
      const lines = cellLines[idx];
      const numLines = lines.length;

      // Calculate vertical position to center the text block
      // For single line: center at row center
      // For multiple lines: center the block around row center
      const textBlockHeight = (numLines - 1) * lineHeight;
      const firstLineY = rowCenterY + textBlockHeight / 2;

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(line, {
          x: x + 6,
          y: firstLineY - lineIdx * lineHeight,
          size: 9,
          font: font,
          color: rgb(0.2, 0.2, 0.2), // Darker text for better readability
        });
      });

      // Draw subtle column separator (except for last column)
      if (idx < values.length - 1) {
        const separatorX = x + Object.values(colWidths)[idx];
        currentPage.drawLine({
          start: { x: separatorX, y: currentY - rowHeight + 2 },
          end: { x: separatorX, y: currentY - 2 },
          thickness: 0.3,
          color: rgb(0.92, 0.92, 0.92),
        });
      }
    });

    // Draw subtle row separator
    currentPage.drawLine({
      start: { x: margin, y: currentY - rowHeight },
      end: { x: pageWidth - margin, y: currentY - rowHeight },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    currentY -= rowHeight;
  }

  // Modern footer with better styling
  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    // Footer background line
    pdfPage.drawLine({
      start: { x: margin, y: margin + 20 },
      end: { x: pageWidth - margin, y: margin + 20 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    pdfPage.drawText("Generated by AFH Platform – HIPAA Compliant Record", {
      x: margin,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export audit trail to PDF
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportAuditTrailToPdf(user, filters = {}) {
  // Build tenant filter
  let tenantWhere = {};
  if (user.role === "SUPER_ADMIN") {
    if (filters.tenantId) {
      tenantWhere = { tenantId: filters.tenantId };
    }
  } else {
    tenantWhere = { tenantId: user.tenantId };
  }

  // Build date filter
  const dateFilter = {};
  if (filters.dateFrom) {
    dateFilter.gte = new Date(filters.dateFrom);
  }
  if (filters.dateTo) {
    dateFilter.lte = new Date(filters.dateTo);
  }

  // Build action filter
  const actionFilter = {};
  const marActions = [
    "MAR_RECORD_CREATED",
    "MAR_RECORD_UPDATED",
    "MAR_RECORD_DELETED",
    "MAR_RECORD_LOCKED",
    "MAR_RECORD_UNLOCKED",
    "PRN_RECORD_CREATED",
    "PRN_RECORD_UPDATED",
    "MEDICATION_CREATED",
    "MEDICATION_UPDATED",
    "MEDICATION_DELETED",
    "MEDICATION_ACTIVATED",
    "MEDICATION_DEACTIVATED",
  ];
  if (filters.action) {
    actionFilter.action = filters.action;
  } else {
    actionFilter.action = { in: marActions };
  }

  const where = {
    ...tenantWhere,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    ...actionFilter,
  };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  if (logs.length === 0) {
    throw new Error("No audit trail records found to export");
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  let currentY = pageHeight - margin;
  let currentPage = page;

  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Header
  currentPage.drawText("eMAR Audit Trail", {
    x: margin,
    y: currentY,
    size: 16,
    font: boldFont,
  });
  currentY -= 25;

  const dateRange =
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(
          filters.dateTo
        ).toLocaleDateString()}`
      : "All Dates";

  currentPage.drawText(`Date Range: ${dateRange}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
  });
  currentY -= 30;

  // Table with better column widths
  const contentWidth = pageWidth - margin * 2;
  const colWidths = {
    date: 110,
    action: 140,
    user: 110,
    resource: 100,
    details: 152,
  };
  const totalFixedWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  if (totalFixedWidth > contentWidth) {
    colWidths.details = Math.max(
      100,
      colWidths.details - (totalFixedWidth - contentWidth)
    );
  }

  const colX = {
    date: margin,
    action: margin + colWidths.date,
    user: margin + colWidths.date + colWidths.action,
    resource: margin + colWidths.date + colWidths.action + colWidths.user,
    details:
      margin +
      colWidths.date +
      colWidths.action +
      colWidths.user +
      colWidths.resource,
  };

  // Draw header background
  const headerHeight = 20;
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.9, 0.9, 0.9),
  });

  const headers = ["Date/Time", "Action", "User", "Resource ID", "Details"];
  headers.forEach((header, idx) => {
    currentPage.drawText(header, {
      x: Object.values(colX)[idx] + 2,
      y: currentY - 14,
      size: 10,
      font: boldFont,
    });
  });
  currentY -= headerHeight;

  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 10;

  for (const log of logs) {
    const dateTime = new Date(log.createdAt).toLocaleString();
    const action = log.action;
    const userName = log.userName || log.userEmail || "Unknown";
    const resourceId = log.resourceId
      ? log.resourceId.substring(0, 12) + "..."
      : "N/A";
    const details =
      log.description || JSON.stringify(log.metadata || {}).substring(0, 80);

    const values = [dateTime, action, userName, resourceId, details];

    // Calculate max lines needed
    let maxLines = 1;
    values.forEach((value, idx) => {
      const maxWidth = Object.values(colWidths)[idx] - 4;
      const lines = wrapText({
        text: String(value),
        maxWidth,
        font,
        fontSize: 8,
      });
      maxLines = Math.max(maxLines, Math.min(lines.length, 3));
    });

    const rowHeight = maxLines * 10 + 6;
    checkNewPage(rowHeight + 10);

    // Alternating row background
    const rowIndex = logs.indexOf(log);
    if (rowIndex % 2 === 0) {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.98),
      });
    }

    values.forEach((value, idx) => {
      const maxWidth = Object.values(colWidths)[idx] - 4;
      const lines = wrapText({
        text: String(value),
        maxWidth,
        font,
        fontSize: 8,
      });
      lines.slice(0, 3).forEach((line, lineIdx) => {
        currentPage.drawText(line, {
          x: Object.values(colX)[idx] + 2,
          y: currentY - 8 - lineIdx * 10,
          size: 8,
          font: font,
        });
      });
    });

    // Row separator
    currentPage.drawLine({
      start: { x: margin, y: currentY - rowHeight },
      end: { x: pageWidth - margin, y: currentY - rowHeight },
      thickness: 0.3,
      color: rgb(0.85, 0.85, 0.85),
    });

    currentY -= rowHeight;
  }

  // Footer
  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText("Generated by AFH Platform – HIPAA Compliant Record", {
      x: margin,
      y: margin / 2,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export resident summary to PDF
 * @param {string} residentId - Resident ID
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options (dateFrom, dateTo)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportResidentSummaryToPdf(residentId, user, filters = {}) {
  // Get resident info
  const resident = await getResidentById(residentId, user);
  if (!resident) {
    throw new Error("Resident not found or access denied");
  }

  // Get medications
  const medsResult = await getMedications(user, {
    residentId,
    page: 1,
    limit: 1000,
  });

  // Get MAR records
  const marResult = await getMarRecords(user, {
    residentId,
    ...filters,
    page: 1,
    limit: 1000,
  });

  // Get PRN records
  const prnResult = await getPrnRecords(user, {
    residentId,
    ...filters,
    page: 1,
    limit: 1000,
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  let currentY = pageHeight - margin;
  let currentPage = page;

  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Header
  currentPage.drawText("Resident Medication Summary", {
    x: margin,
    y: currentY,
    size: 16,
    font: boldFont,
  });
  currentY -= 25;

  currentPage.drawText(`Resident: ${resident.name}`, {
    x: margin,
    y: currentY,
    size: 12,
    font: boldFont,
  });
  currentY -= 20;

  const dateRange =
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(
          filters.dateTo
        ).toLocaleDateString()}`
      : "All Dates";

  currentPage.drawText(`Period: ${dateRange}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
  });
  currentY -= 30;

  const contentWidth = pageWidth - margin * 2;

  // Active Medications
  checkNewPage(50);
  currentPage.drawText("Active Medications", {
    x: margin,
    y: currentY,
    size: 12,
    font: boldFont,
  });
  currentY -= 20;

  const activeMeds = medsResult.medications.filter((m) => m.isActive);
  if (activeMeds.length === 0) {
    currentPage.drawText("No active medications", {
      x: margin + 20,
      y: currentY,
      size: 9,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    currentY -= 15;
  } else {
    activeMeds.forEach((med, idx) => {
      const medText = `${med.name} - ${med.dosage} (${med.route}) - ${med.frequency}`;
      const lines = wrapText({
        text: medText,
        maxWidth: contentWidth - 40,
        font,
        fontSize: 9,
      });
      const requiredSpace = lines.length * 12 + 5;
      checkNewPage(requiredSpace);

      // Alternating background
      if (idx % 2 === 0) {
        currentPage.drawRectangle({
          x: margin + 20,
          y: currentY - lines.length * 12,
          width: contentWidth - 40,
          height: lines.length * 12 + 2,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(`• ${line}`, {
          x: margin + 20,
          y: currentY - lineIdx * 12,
          size: 9,
          font: font,
        });
      });
      currentY -= lines.length * 12 + 5;
    });
  }

  currentY -= 20;

  // Recent MAR Records
  checkNewPage(50);
  currentPage.drawText("Recent Medication Administration", {
    x: margin,
    y: currentY,
    size: 12,
    font: boldFont,
  });
  currentY -= 20;

  const recentMar = marResult.records.slice(0, 10);
  if (recentMar.length === 0) {
    currentPage.drawText("No administration records", {
      x: margin + 20,
      y: currentY,
      size: 9,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    currentY -= 15;
  } else {
    recentMar.forEach((record, idx) => {
      const date = new Date(record.administeredAt).toLocaleDateString();
      const time = new Date(record.administeredAt).toLocaleTimeString();
      const recordText = `${date} ${time} - ${
        record.medication?.name || "N/A"
      } - Status: ${record.status}`;
      const lines = wrapText({
        text: recordText,
        maxWidth: contentWidth - 40,
        font,
        fontSize: 9,
      });
      const requiredSpace = lines.length * 12 + 5;
      checkNewPage(requiredSpace);

      // Alternating background
      if (idx % 2 === 0) {
        currentPage.drawRectangle({
          x: margin + 20,
          y: currentY - lines.length * 12,
          width: contentWidth - 40,
          height: lines.length * 12 + 2,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(`• ${line}`, {
          x: margin + 20,
          y: currentY - lineIdx * 12,
          size: 9,
          font: font,
        });
      });
      currentY -= lines.length * 12 + 5;
    });
  }

  currentY -= 20;

  // Recent PRN Records
  checkNewPage(50);
  currentPage.drawText("Recent PRN Administration", {
    x: margin,
    y: currentY,
    size: 12,
    font: boldFont,
  });
  currentY -= 20;

  const recentPrn = prnResult.records.slice(0, 10);
  if (recentPrn.length === 0) {
    currentPage.drawText("No PRN records", {
      x: margin + 20,
      y: currentY,
      size: 9,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    currentY -= 15;
  } else {
    recentPrn.forEach((record, idx) => {
      const date = new Date(record.givenAt).toLocaleDateString();
      const prnText = `${date} - ${record.medication?.name || "N/A"} - ${
        record.whyGiven || record.symptom || "N/A"
      }`;
      const lines = wrapText({
        text: prnText,
        maxWidth: contentWidth - 40,
        font,
        fontSize: 9,
      });
      const requiredSpace = lines.length * 12 + 5;
      checkNewPage(requiredSpace);

      // Alternating background
      if (idx % 2 === 0) {
        currentPage.drawRectangle({
          x: margin + 20,
          y: currentY - lines.length * 12,
          width: contentWidth - 40,
          height: lines.length * 12 + 2,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(`• ${line}`, {
          x: margin + 20,
          y: currentY - lineIdx * 12,
          size: 9,
          font: font,
        });
      });
      currentY -= lines.length * 12 + 5;
    });
  }

  // Footer
  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText("Generated by AFH Platform – HIPAA Compliant Record", {
      x: margin,
      y: margin / 2,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export calendar-style MAR to PDF
 * @param {string} residentId - Resident ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportCalendarMarToPdf(residentId, month, year, tenantId) {
  return generateCalendarMarPdf(residentId, month, year, tenantId);
}

module.exports = {
  exportMarToPdf,
  exportMedicationListToPdf,
  exportPrnLogsToPdf,
  exportAuditTrailToPdf,
  exportResidentSummaryToPdf,
  exportCalendarMarToPdf,
};

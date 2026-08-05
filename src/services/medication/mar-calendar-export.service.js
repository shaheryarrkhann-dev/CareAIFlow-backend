const { PDFDocument, rgb } = require("pdf-lib");
const prisma = require("../../lib/prisma");
const letterheadPdf = require("../document/letterheadPdf.service");
const {
  getSchedulesForDate,
  getSchedulesForMedication,
} = require("./mar-scheduler.service");
const { getResidentById } = require("../resident/resident.service");

/**
 * Helper function to wrap text
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
 * Generate calendar-style MAR PDF (traditional pharmacy format)
 * Format: Medications with HOUR column and days 1-31 across
 * Similar to standard paper MAR charts used in healthcare facilities
 * @param {string} residentId - Resident ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateCalendarMarPdf(residentId, month, year, tenantId) {
  // Validate resident
  const { validateResidentId } = require("../resident/resident.service");
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error("Resident not found or does not belong to tenant");
  }

  // Get resident info
  const user = { tenantId, role: "ADMIN" };
  const resident = await getResidentById(residentId, user);

  // Calculate month start and end dates
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Get all active medications for the month
  const medications = await prisma.medication.findMany({
    where: {
      residentId,
      tenantId,
      isActive: true,
      deletedAt: null,
      isPrn: false, // Only scheduled medications for calendar MAR
      OR: [
        {
          endDate: {
            gte: monthStart,
          },
        },
        {
          endDate: null,
        },
      ],
      startDate: {
        lte: monthEnd,
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  if (medications.length === 0) {
    throw new Error("No active scheduled medications found for this month");
  }

  // Get all schedules for the month with MAR records
  const allSchedules = await prisma.medicationSchedule.findMany({
    where: {
      residentId,
      tenantId,
      scheduledDate: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
    include: {
      medication: {
        select: {
          id: true,
          name: true,
          dosage: true,
          route: true,
          frequency: true,
        },
      },
      marRecord: {
        select: {
          id: true,
          status: true,
          caregiverInitials: true,
          notGivenReason: true,
          refusedReason: true,
          administeredAt: true,
        },
      },
    },
    orderBy: [{ scheduledDate: "asc" }, { scheduledTime: "asc" }],
  });

  // Get all MAR records for the month (for records without scheduleId)
  const orphanedRecords = await prisma.marRecord.findMany({
    where: {
      residentId,
      tenantId,
      scheduleId: null, // Records not linked to schedules
      administeredAt: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
    include: {
      medication: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  // Build medication-hour grid structure
  // Group schedules by medication and time slot
  const medicationGrid = {};

  medications.forEach((medication) => {
    if (!medicationGrid[medication.id]) {
      medicationGrid[medication.id] = {
        medication,
        timeSlots: {}, // { "8AM": { days: { "1": schedule, "2": schedule, ... } } }
      };
    }
  });

  // Populate schedules into grid
  allSchedules.forEach((schedule) => {
    const medId = schedule.medicationId;
    const timeSlot = schedule.timeSlot;
    const day = new Date(schedule.scheduledDate).getUTCDate();

    if (!medicationGrid[medId]) return;

    if (!medicationGrid[medId].timeSlots[timeSlot]) {
      medicationGrid[medId].timeSlots[timeSlot] = {};
    }

    medicationGrid[medId].timeSlots[timeSlot][day] = schedule;
  });

  // Create PDF document - landscape grid with universal letterhead
  const pdfDoc = await PDFDocument.create();
  const letterheadAssets = await letterheadPdf.prepareLetterheadAssets(
    pdfDoc,
    tenantId,
    undefined
  );
  const font = letterheadAssets.fonts.font;
  const boldFont = letterheadAssets.fonts.boldFont;

  // Use landscape orientation with larger width for 31 days
  const pageWidth = 1050; // Wider to fit 31 days
  const pageHeight = 792;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  letterheadPdf.drawLetterheadOnPage(page, pdfDoc, letterheadAssets);

  const margin = 30;
  const medicationColWidth = 150;
  const hourColWidth = 50;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayColWidth =
    (pageWidth - margin * 2 - medicationColWidth - hourColWidth) / daysInMonth;
  const rowHeight = 20;

  const contentFloor = letterheadPdf.contentBottomMin(letterheadAssets) + 100;
  let currentY = letterheadAssets.contentStartY;
  let currentPage = page;

  const checkNewPage = () => {
    if (currentY < contentFloor) {
      const newPage = pdfDoc.addPage([pageWidth, pageHeight]);
      letterheadPdf.drawLetterheadOnPage(newPage, pdfDoc, letterheadAssets);
      currentY = letterheadAssets.contentStartY;
      currentPage = newPage;
      return true;
    }
    return false;
  };

  // Header section
  currentPage.drawText(
    "PERSONAL MEDICATION ADMINISTRATION RECORD (MAR) CHART",
    {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    }
  );
  currentY -= 18;

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Resident info header
  currentPage.drawText(`Resident: ${resident.name}`, {
    x: margin,
    y: currentY,
    size: 11,
    font: boldFont,
  });
  currentPage.drawText(`Month: ${monthName}`, {
    x: margin + 200,
    y: currentY,
    size: 11,
    font: boldFont,
  });
  currentY -= 20;

  currentPage.drawText(`Facility: ${tenant?.name || "N/A"}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
  });
  currentY -= 30;

  // Table header row
  const tableStartY = currentY;
  const headerHeight = rowHeight;

  // Draw "MEDICATION" column header
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: medicationColWidth,
    height: headerHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(0.9, 0.9, 0.9),
  });
  currentPage.drawText("MEDICATION", {
    x: margin + 5,
    y: currentY - 14,
    size: 8,
    font: boldFont,
  });

  // Draw "HOUR" column header
  currentPage.drawRectangle({
    x: margin + medicationColWidth,
    y: currentY - headerHeight,
    width: hourColWidth,
    height: headerHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(0.9, 0.9, 0.9),
  });
  currentPage.drawText("HOUR", {
    x: margin + medicationColWidth + 8,
    y: currentY - 14,
    size: 8,
    font: boldFont,
  });

  // Draw day column headers (1-31)
  for (let day = 1; day <= daysInMonth; day++) {
    const x =
      margin + medicationColWidth + hourColWidth + (day - 1) * dayColWidth;
    currentPage.drawRectangle({
      x,
      y: currentY - headerHeight,
      width: dayColWidth,
      height: headerHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Day number
    const dayText = String(day);
    const dayTextWidth = font.widthOfTextAtSize(dayText, 7);
    currentPage.drawText(dayText, {
      x: x + dayColWidth / 2 - dayTextWidth / 2,
      y: currentY - 14,
      size: 7,
      font: boldFont,
    });
  }

  currentY -= headerHeight;

  // Draw medication rows - one row per medication per time slot
  for (const medication of medications) {
    const medData = medicationGrid[medication.id];
    if (!medData || Object.keys(medData.timeSlots).length === 0) continue;

    const timeSlots = Object.keys(medData.timeSlots).sort((a, b) => {
      // Sort time slots chronologically
      const parseTime = (slot) => {
        const match = slot.match(/(\d+):?(\d*)(AM|PM)/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        const period = match[3].toUpperCase();
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };
      return parseTime(a) - parseTime(b);
    });

    // For each time slot of this medication, create a row
    for (let timeSlotIdx = 0; timeSlotIdx < timeSlots.length; timeSlotIdx++) {
      const timeSlot = timeSlots[timeSlotIdx];
      const isFirstRow = timeSlotIdx === 0;

      // Check if new page needed
      if (checkNewPage()) {
        // Redraw headers on new page
        currentPage.drawText("MAR CHART (Continued)", {
          x: margin,
          y: currentY,
          size: 10,
          font: boldFont,
        });
        currentY -= 15;
        currentPage.drawText(`Resident: ${resident.name} | ${monthName}`, {
          x: margin,
          y: currentY,
          size: 8,
          font: font,
        });
        currentY -= 20;

        // Redraw column headers
        const headers = [
          { text: "MEDICATION", width: medicationColWidth },
          { text: "HOUR", width: hourColWidth },
        ];
        let headerX = margin;
        headers.forEach((header) => {
          currentPage.drawRectangle({
            x: headerX,
            y: currentY - headerHeight,
            width: header.width,
            height: headerHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            color: rgb(0.9, 0.9, 0.9),
          });
          currentPage.drawText(header.text, {
            x: headerX + 5,
            y: currentY - 14,
            size: 8,
            font: boldFont,
          });
          headerX += header.width;
        });

        // Day headers
        for (let day = 1; day <= daysInMonth; day++) {
          const x =
            margin +
            medicationColWidth +
            hourColWidth +
            (day - 1) * dayColWidth;
          currentPage.drawRectangle({
            x,
            y: currentY - headerHeight,
            width: dayColWidth,
            height: headerHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            color: rgb(0.9, 0.9, 0.9),
          });
          const dayText = String(day);
          const dayTextWidth = font.widthOfTextAtSize(dayText, 7);
          currentPage.drawText(dayText, {
            x: x + dayColWidth / 2 - dayTextWidth / 2,
            y: currentY - 14,
            size: 7,
            font: boldFont,
          });
        }
        currentY -= headerHeight;
      }

      // Draw medication info cell (only on first row for this medication)
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: medicationColWidth,
        height: rowHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });

      if (isFirstRow) {
        // Show medication name and details on first row only
        const medLines = wrapText({
          text: `${medication.name} ${medication.dosage} ${medication.route}`,
          maxWidth: medicationColWidth - 6,
          font,
          fontSize: 7,
        });
        medLines.slice(0, 2).forEach((line, idx) => {
          currentPage.drawText(line, {
            x: margin + 3,
            y: currentY - 10 - idx * 8,
            size: 7,
            font: font,
          });
        });
      }

      // Draw HOUR cell
      currentPage.drawRectangle({
        x: margin + medicationColWidth,
        y: currentY - rowHeight,
        width: hourColWidth,
        height: rowHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });
      const hourTextWidth = font.widthOfTextAtSize(timeSlot, 7);
      currentPage.drawText(timeSlot, {
        x: margin + medicationColWidth + hourColWidth / 2 - hourTextWidth / 2,
        y: currentY - 13,
        size: 7,
        font: boldFont,
      });

      // Draw day cells for this time slot
      for (let day = 1; day <= daysInMonth; day++) {
        const x =
          margin + medicationColWidth + hourColWidth + (day - 1) * dayColWidth;
        const schedule = medData.timeSlots[timeSlot]?.[day];

        // Check if medication is active on this date
        const currentDate = new Date(
          Date.UTC(year, month - 1, day, 0, 0, 0, 0)
        );
        const isActiveOnDate =
          medication.startDate <= currentDate &&
          (!medication.endDate || medication.endDate >= currentDate);

        // Draw cell
        currentPage.drawRectangle({
          x,
          y: currentY - rowHeight,
          width: dayColWidth,
          height: rowHeight,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
          color: isActiveOnDate ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
        });

        // Display status if active and scheduled
        if (isActiveOnDate && schedule) {
          let statusSymbol = "";
          let statusColor = rgb(0, 0, 0);
          let caregiverInitials = "";

          // Priority 1: Use MAR record status if exists (caregiver created a record)
          if (schedule.marRecord) {
            const record = schedule.marRecord;
            caregiverInitials = record.caregiverInitials || "";

            if (record.status === "Given") {
              statusSymbol = "G";
              statusColor = rgb(0, 0.7, 0); // Green
            } else if (record.status === "NotGiven") {
              statusSymbol = "X";
              statusColor = rgb(0.7, 0, 0); // Red
            } else if (record.status === "Refused") {
              statusSymbol = "R";
              statusColor = rgb(0.7, 0.5, 0); // Orange
            }
          } else {
            // Priority 2: Use schedule status if no record (system marked it)
            if (schedule.status === "Missed" || schedule.isMissed) {
              statusSymbol = "M";
              statusColor = rgb(0.7, 0, 0); // Red
            } else if (schedule.status === "Pending") {
              // Check if it's in the past
              const now = new Date();
              const scheduleDate = new Date(schedule.scheduledTime);
              if (scheduleDate < now) {
                statusSymbol = "-"; // Pending but overdue
                statusColor = rgb(0.5, 0.5, 0.5); // Gray
              }
            }
          }

          // Draw status symbol (centered)
          if (statusSymbol) {
            const symbolWidth = font.widthOfTextAtSize(statusSymbol, 8);
            currentPage.drawText(statusSymbol, {
              x: x + dayColWidth / 2 - symbolWidth / 2,
              y: currentY - 12,
              size: 8,
              font: boldFont,
              color: statusColor,
            });
          }

          // Draw caregiver initials (bottom left of cell)
          if (caregiverInitials) {
            currentPage.drawText(caregiverInitials, {
              x: x + 1,
              y: currentY - rowHeight + 2,
              size: 5,
              font: font,
              color: rgb(0.3, 0.3, 0.3),
            });
          }
        }
      }

      currentY -= rowHeight;
    }
  }

  const pages = pdfDoc.getPages();
  letterheadPdf.stampPageNumbers(pdfDoc, font, margin);

  // Legend at bottom
  const lastPage = pages[pages.length - 1];
  let legendY = margin + 40;

  // Draw legend box
  lastPage.drawRectangle({
    x: margin,
    y: legendY - 35,
    width: 600,
    height: 35,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.98),
  });

  lastPage.drawText("Legend:", {
    x: margin + 5,
    y: legendY - 12,
    size: 8,
    font: boldFont,
  });

  lastPage.drawText("G = Given", {
    x: margin + 60,
    y: legendY - 12,
    size: 7,
    font: font,
    color: rgb(0, 0.7, 0),
  });

  lastPage.drawText("X = Not Given", {
    x: margin + 130,
    y: legendY - 12,
    size: 7,
    font: font,
    color: rgb(0.7, 0, 0),
  });

  lastPage.drawText("R = Refused", {
    x: margin + 220,
    y: legendY - 12,
    size: 7,
    font: font,
    color: rgb(0.7, 0.5, 0),
  });

  lastPage.drawText("M = Missed (No Record)", {
    x: margin + 310,
    y: legendY - 12,
    size: 7,
    font: font,
    color: rgb(0.7, 0, 0),
  });

  lastPage.drawText("- = Pending (Overdue)", {
    x: margin + 60,
    y: legendY - 25,
    size: 7,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  lastPage.drawText(
    "Initials shown in bottom-left of each cell indicate caregiver who administered",
    {
      x: margin + 5,
      y: legendY - 32,
      size: 6,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    }
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  generateCalendarMarPdf,
};

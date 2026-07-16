const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const prisma = require("../../lib/prisma");
const { getBehavioralLogs } = require("./behavioral.service");
const { logBehavioralAction } = require("../compliance/audit.service");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

/**
 * Wrap text to fit within specified width
 * @param {Object} params - Text wrapping parameters
 * @returns {Array<string>} Array of text lines
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

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Render signature text to image using Puppeteer (same rendering as frontend)
 * Uses Google Fonts Dancing Script exactly like the frontend does
 * @param {string} signatureText - The signature text to render
 * @param {number} fontSize - Font size in points
 * @param {number} maxWidth - Maximum width in points
 * @param {Object} browserInstance - Optional shared browser instance to reuse
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function renderSignatureToImage(
  signatureText,
  fontSize = 12,
  maxWidth = 200,
  browserInstance = null
) {
  let browser = browserInstance;
  let shouldCloseBrowser = false;
  try {
    console.log(
      `[PDF] 🎨 Rendering signature with Puppeteer (same as frontend): "${signatureText}"`
    );

    // Convert points to pixels (1pt = 1.33px at 96 DPI, but we'll use 2x for quality)
    const scale = 2;
    const fontSizePx = (fontSize * scale * 1.33).toFixed(0); // Match frontend 1.75rem ≈ 28px for 12pt
    const widthPx = Math.ceil(maxWidth * scale * 1.33);
    // Height should be just enough for the text, not too much padding
    const heightPx = Math.ceil(fontSize * 1.5 * scale * 1.33); // Reduced padding

    // Launch headless browser only if not provided (reuse shared instance)
    if (!browser) {
      shouldCloseBrowser = true;
      // Launch headless browser (using Puppeteer's bundled browser)
      // In Docker, we need additional args for Chromium to work properly
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process", // May help in Docker environments
          "--disable-gpu",
          "--disable-software-rasterizer",
        ],
        // Let Puppeteer use its bundled Chromium
        executablePath: undefined, // Use bundled Chromium
      });
    }

    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: widthPx,
      height: heightPx,
      deviceScaleFactor: scale,
    });

    // Create HTML exactly like the frontend does
    // Frontend uses: fontFamily: '"Dancing Script", cursive', fontSize: "1.75rem", fontWeight: 600, letterSpacing: "0.05em"
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600&display=swap" rel="stylesheet">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              width: ${widthPx}px;
              height: ${heightPx}px;
              display: flex;
              align-items: flex-end;
              justify-content: flex-start;
              padding: 0;
              padding-left: 5px;
              padding-bottom: 2px;
              background: transparent;
              font-family: "Dancing Script", cursive;
              font-size: ${fontSizePx}px;
              font-weight: 600;
              letter-spacing: 0.05em;
              color: #000000;
              overflow: hidden;
              line-height: 1;
            }
            .signature {
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          </style>
        </head>
        <body>
          <div class="signature">${signatureText}</div>
        </body>
      </html>
    `;

    // Load HTML and wait for fonts
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait a bit more for font to fully render (using Promise instead of deprecated waitForTimeout)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Take screenshot with transparent background
    const imageBuffer = await page.screenshot({
      type: "png",
      omitBackground: true, // Transparent background
      clip: { x: 0, y: 0, width: widthPx, height: heightPx },
    });

    console.log(
      `[PDF] 🎨 ✅ Signature rendered with Dancing Script font (${imageBuffer.length} bytes)`
    );
    return imageBuffer;
  } catch (error) {
    console.error(
      `[PDF] 🎨 ❌ Failed to render signature with Puppeteer: ${error.message}`
    );
    console.error(`[PDF] 🎨 ❌ Error stack: ${error.stack?.substring(0, 300)}`);
    throw error;
  } finally {
    // Only close browser if we created it (not if it was passed in)
    if (browser && shouldCloseBrowser) {
      await browser.close();
    }
  }
}

/**
 * Export behavioral report to PDF
 * Generates a comprehensive PDF report with behavioral logs, summary, and AI narrative
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportBehavioralReportToPdf(user, filters = {}) {
  // Get all behavioral logs matching filters (no pagination for export)
  const logsResult = await getBehavioralLogs(user, {
    ...filters,
    page: 1,
    limit: 10000, // Get all logs for export
  });

  if (logsResult.logs.length === 0) {
    throw new Error("No behavioral logs found to export");
  }

  const logs = logsResult.logs;

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Note: PDF-lib StandardFonts doesn't have semibold, using regular font as closest option
  // For true semibold, you would need to embed a custom font file
  const semiBoldFont = font; // Using regular font as semibold approximation

  // Page dimensions
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  const footerMargin = 80; // Space reserved for footer (footer line at margin + 20 = 70, text at margin/2 + 5 = 30, use 80 for safety)
  const sectionSpacing = 20;

  // Track current Y position
  let currentY = pageHeight - margin;

  let currentPage = page;

  // Helper function to add new page if needed
  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < footerMargin) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Helper function to get resident display name
  const getResidentDisplayName = (log) => {
    if (log.residentName) {
      return log.residentName;
    }
    if (log.residentId && log.residentId.length > 8) {
      return `Resident ID: ${log.residentId.substring(0, 8)}...`;
    }
    return log.residentId || "Unknown Resident";
  };

  // Get header information
  const tenantName = logs[0]?.tenant?.name || "All Facilities";
  let residentName = "All Residents";
  if (filters.residentId) {
    const filteredLog = logs.find((l) => l.residentId === filters.residentId);
    if (filteredLog) {
      residentName = getResidentDisplayName(filteredLog);
    }
  } else if (logs.length > 0 && logs[0].residentName) {
    const firstResidentId = logs[0].residentId;
    const allSameResident = logs.every((l) => l.residentId === firstResidentId);
    if (allSameResident) {
      residentName = getResidentDisplayName(logs[0]);
    }
  }

  // Get date range
  let dateRangeText = "All Dates";
  if (filters.dateFrom || filters.dateTo) {
    const fromDate = filters.dateFrom
      ? new Date(filters.dateFrom).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Start";
    const toDate = filters.dateTo
      ? new Date(filters.dateTo).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "End";
    dateRangeText = `${fromDate} to ${toDate}`;
  } else if (logs.length > 0) {
    const dates = logs.map((l) => new Date(l.dateTime)).sort((a, b) => a - b);
    const fromDate = dates[0].toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const toDate = dates[dates.length - 1].toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    dateRangeText = `${fromDate} to ${toDate}`;
  }

  // Calculate content width early (needed for header)
  const contentWidth = pageWidth - margin * 2;

  // ============================================
  // HEADER SECTION
  // ============================================
  // Modern header without background
  currentPage.drawText("Behavioral Health Report", {
    x: margin,
    y: currentY,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0), // Black text
  });
  currentY -= 30;

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

  currentPage.drawText(`Resident: ${residentName}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(`Date Range: ${dateRangeText}`, {
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

  // ============================================
  // SUMMARY SECTION
  // ============================================
  const summaryPage = checkNewPage(100);
  if (summaryPage !== currentPage) {
    currentPage = summaryPage;
    currentY = pageHeight - margin;
  }

  currentPage.drawText("Summary", {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  // Calculate summary statistics
  const totalIncidents = logs.length;
  const severityCounts = {
    Low: logs.filter((l) => l.severity === "Low").length,
    Moderate: logs.filter((l) => l.severity === "Moderate").length,
    High: logs.filter((l) => l.severity === "High").length,
  };

  const behaviorTypeCounts = {};
  logs.forEach((log) => {
    behaviorTypeCounts[log.behaviorType] =
      (behaviorTypeCounts[log.behaviorType] || 0) + 1;
  });

  const mostFrequentBehavior = Object.keys(behaviorTypeCounts).reduce(
    (a, b) => (behaviorTypeCounts[a] > behaviorTypeCounts[b] ? a : b),
    null
  );

  currentPage.drawText(`Total Incidents: ${totalIncidents}`, {
    x: margin + 20,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= 15;

  currentPage.drawText(
    `Severity Breakdown: Low (${severityCounts.Low}), Moderate (${severityCounts.Moderate}), High (${severityCounts.High})`,
    {
      x: margin + 20,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    }
  );
  currentY -= 15;

  if (mostFrequentBehavior) {
    currentPage.drawText(
      `Most Frequent Behavior: ${mostFrequentBehavior} (${behaviorTypeCounts[mostFrequentBehavior]} incidents)`,
      {
        x: margin + 20,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      }
    );
    currentY -= 15;
  }

  currentY -= sectionSpacing;

  // ============================================
  // AI-GENERATED SERVICE ENTRY NOTES SECTION
  // ============================================
  // Generate service-entry formatted notes on-the-fly if residentId is provided
  if (filters.residentId) {
    try {
      const {
        generateBehavioralNoteForPdf,
      } = require("./behavioral-ai.service");
      const tenantIdToUse = user.tenantId || filters.tenantId;

      // Generate note with the same filters as logs (dateFrom, dateTo, behaviorType, severity)
      const noteOptions = {};

      // Use the same date filters as the logs
      if (filters.dateFrom || filters.dateTo) {
        noteOptions.includeAll = false;
        // Use the same date values as passed to getBehavioralLogs
        if (filters.dateFrom) {
          noteOptions.dateFrom =
            filters.dateFrom instanceof Date
              ? filters.dateFrom
              : new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          noteOptions.dateTo =
            filters.dateTo instanceof Date
              ? filters.dateTo
              : new Date(filters.dateTo);
        }
      } else {
        noteOptions.includeAll = true;
      }

      // Use the same behaviorType and severity filters as the logs
      if (filters.behaviorType) {
        noteOptions.behaviorType = filters.behaviorType;
      }
      if (filters.severity) {
        noteOptions.severity = filters.severity;
      }

      const behavioralNote = await generateBehavioralNoteForPdf(
        filters.residentId,
        tenantIdToUse,
        noteOptions,
        user
      );

      if (behavioralNote && behavioralNote.trim().length > 0) {
        const narrativePage = checkNewPage(150);
        if (narrativePage !== currentPage) {
          currentPage = narrativePage;
          currentY = pageHeight - margin;
        }

        // Parse service entries from the note
        const noteLines = behavioralNote.split("\n");
        const serviceEntries = [];
        let currentEntry = null;
        let currentSection = null;
        let currentSectionContent = [];

        for (let i = 0; i < noteLines.length; i++) {
          const line = noteLines[i].trim();
          if (!line || line.match(/^-{3,}/)) continue;

          if (line.startsWith("Service Entry")) {
            if (currentEntry) {
              serviceEntries.push(currentEntry);
            }
            currentEntry = {
              date: "",
              time: "",
              behaviors: "",
              interventions: "",
              outcome: "",
              staff: "",
            };
            currentSection = null;
            currentSectionContent = [];
          } else if (line.startsWith("Date:")) {
            currentEntry.date = line.replace("Date:", "").trim();
          } else if (line.startsWith("Time:")) {
            currentEntry.time = line.replace("Time:", "").trim();
          } else if (line.startsWith("Staff:")) {
            currentEntry.staff = line.replace("Staff:", "").trim();
          } else if (
            line.startsWith("Observed Behaviors:") ||
            line.startsWith("Interventions:") ||
            line.startsWith("Staff Interventions:")
          ) {
            if (currentSection && currentSectionContent.length > 0) {
              currentEntry[currentSection] = currentSectionContent.join(" ");
            }
            currentSection = "behaviors";
            if (line.includes("Interventions")) {
              currentSection = "interventions";
            }
            currentSectionContent = [];
            const content = line.split(":").slice(1).join(":").trim();
            if (content) {
              currentSectionContent.push(content);
            }
          } else if (line.startsWith("Outcome:")) {
            if (currentSection && currentSectionContent.length > 0) {
              currentEntry[currentSection] = currentSectionContent.join(" ");
            }
            currentSection = "outcome";
            currentSectionContent = [];
            const content = line.split(":").slice(1).join(":").trim();
            if (content) {
              currentSectionContent.push(content);
            }
          } else if (
            currentSection &&
            (line.startsWith("- ") || line.startsWith("• "))
          ) {
            currentSectionContent.push(line.substring(2).trim());
          } else if (currentSection && line) {
            currentSectionContent.push(line);
          }
        }

        // Add last entry
        if (currentEntry) {
          if (currentSection && currentSectionContent.length > 0) {
            currentEntry[currentSection] = currentSectionContent.join(" ");
          }
          serviceEntries.push(currentEntry);
        }

        // Render table if we have entries
        if (serviceEntries.length > 0) {
          // Section header
          currentPage.drawText("Behavioral Tracking Notes", {
            x: margin,
            y: currentY,
            size: 14,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          currentY -= 25;

          // Table headers with better column widths - much wider for Behaviors and Interventions
          const notesColWidths = {
            date: 70,
            time: 60,
            behaviors: 190,
            interventions: 190,
            // outcome: 100, // Commented out
            staff: 200,
          };
          // Adjust columns if needed to fit within contentWidth
          const notesTotalWidth = Object.values(notesColWidths).reduce(
            (a, b) => a + b,
            0
          );
          if (notesTotalWidth > contentWidth) {
            // First, try to reduce smaller columns while preserving Behaviors and Interventions
            const fixedColsWidth =
              notesColWidths.behaviors + notesColWidths.interventions;
            const flexibleColsWidth = notesTotalWidth - fixedColsWidth;
            const availableForFlexible = contentWidth - fixedColsWidth;

            if (availableForFlexible > flexibleColsWidth * 0.5) {
              // We can preserve Behaviors and Interventions, reduce others
              const scaleFactor = availableForFlexible / flexibleColsWidth;
              notesColWidths.date = Math.max(
                60,
                Math.floor(notesColWidths.date * scaleFactor)
              );
              notesColWidths.time = Math.max(
                50,
                Math.floor(notesColWidths.time * scaleFactor)
              );
              // notesColWidths.outcome = Math.max(75, Math.floor(notesColWidths.outcome * scaleFactor)); // Commented out
              notesColWidths.staff = Math.max(
                150,
                Math.floor(notesColWidths.staff * scaleFactor)
              );
            } else {
              // Need to reduce all columns proportionally, but ensure minimums
              const scaleFactor = contentWidth / notesTotalWidth;
              Object.keys(notesColWidths).forEach((key) => {
                notesColWidths[key] = Math.floor(
                  notesColWidths[key] * scaleFactor
                );
              });
              // Ensure minimum widths for readability
              notesColWidths.date = Math.max(60, notesColWidths.date);
              notesColWidths.time = Math.max(50, notesColWidths.time);
              notesColWidths.behaviors = Math.max(
                170,
                notesColWidths.behaviors
              );
              notesColWidths.interventions = Math.max(
                170,
                notesColWidths.interventions
              );
              // notesColWidths.outcome = Math.max(75, notesColWidths.outcome); // Commented out
              notesColWidths.staff = Math.max(150, notesColWidths.staff);
            }
          }

          const notesColX = {
            date: margin,
            time: margin + notesColWidths.date,
            behaviors: margin + notesColWidths.date + notesColWidths.time,
            interventions:
              margin +
              notesColWidths.date +
              notesColWidths.time +
              notesColWidths.behaviors,
            // outcome:
            //   margin +
            //   notesColWidths.date +
            //   notesColWidths.time +
            //   notesColWidths.behaviors +
            //   notesColWidths.interventions, // Commented out
            staff:
              margin +
              notesColWidths.date +
              notesColWidths.time +
              notesColWidths.behaviors +
              notesColWidths.interventions,
            // notesColWidths.outcome, // Commented out
          };

          // Modern table header with professional styling
          const notesHeaderHeight = 24;
          currentPage.drawRectangle({
            x: margin,
            y: currentY - notesHeaderHeight,
            width: contentWidth,
            height: notesHeaderHeight,
            color: rgb(0.906, 0.971, 0.821), // #88DB1B33 - Light green tint
          });

          const notesHeaders = [
            "Date",
            "Time",
            "Behaviors",
            "Interventions",
            // "Outcome", // Commented out
            "Staff",
          ];
          notesHeaders.forEach((header, idx) => {
            const x = Object.values(notesColX)[idx];
            const colWidth = Object.values(notesColWidths)[idx];
            const maxWidth = colWidth - 12;
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
            if (idx < notesHeaders.length - 1) {
              const separatorX = x + colWidth;
              currentPage.drawLine({
                start: { x: separatorX, y: currentY - notesHeaderHeight + 2 },
                end: { x: separatorX, y: currentY - 2 },
                thickness: 0.5,
                color: rgb(0.4, 0.4, 0.4),
              });
            }
          });
          currentY -= notesHeaderHeight;

          // Subtle line under headers
          currentPage.drawLine({
            start: { x: margin, y: currentY },
            end: { x: pageWidth - margin, y: currentY },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
          });
          currentY -= 0; // No space between header and body

          // Render service entries as table rows
          for (const entry of serviceEntries) {
            const date = entry.date || "N/A";
            const time = entry.time || "N/A";
            const behaviors = entry.behaviors || "N/A";
            const interventions = entry.interventions || "N/A";
            // const outcome = entry.outcome || "N/A"; // Commented out
            const staff = entry.staff || "N/A";

            // Calculate max lines needed for this row
            const entryValues = [
              date,
              time,
              behaviors,
              interventions,
              /* outcome, */ staff,
            ];
            let maxLines = 1;
            const entryCellLines = [];
            entryValues.forEach((value, idx) => {
              const colWidth = Object.values(notesColWidths)[idx];
              // Use more of the column width for text (less padding for long text columns)
              const isLongTextColumn = idx === 2 || idx === 3; // Behaviors or Interventions
              const horizontalPadding = isLongTextColumn ? 8 : 12;
              const maxWidth = colWidth - horizontalPadding;
              const lines = wrapText({
                text: String(value),
                maxWidth,
                font,
                fontSize: 9,
              });
              // Show all lines - no limit for Behaviors and Interventions columns
              // For other columns, limit to reasonable number
              const limitedLines = isLongTextColumn ? lines : lines.slice(0, 5);
              entryCellLines.push(limitedLines);
              maxLines = Math.max(maxLines, limitedLines.length);
            });

            // Increased row height for better spacing
            const lineHeight = 12;
            const verticalPadding = 10;
            const rowHeight = maxLines * lineHeight + verticalPadding * 2;
            checkNewPage(rowHeight + 12);

            // Draw row background (alternating)
            const rowIndex = serviceEntries.indexOf(entry);
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
                color: rgb(0.97, 0.99, 0.92), // Sage green
              });
            }

            // Calculate row center for vertical centering
            const rowCenterY = currentY - rowHeight / 2;

            // Draw cell values with vertical centering
            entryValues.forEach((value, idx) => {
              const x = Object.values(notesColX)[idx];
              const lines = entryCellLines[idx];
              const numLines = lines.length;
              const isLongTextColumn = idx === 2 || idx === 3; // Behaviors or Interventions
              const horizontalPadding = isLongTextColumn ? 4 : 6;

              const textBlockHeight = (numLines - 1) * lineHeight;
              const firstLineY = rowCenterY + textBlockHeight / 2;

              lines.forEach((line, lineIdx) => {
                currentPage.drawText(line, {
                  x: x + horizontalPadding,
                  y: firstLineY - lineIdx * lineHeight,
                  size: 9,
                  font: font,
                  color: rgb(0.2, 0.2, 0.2),
                });
              });

              // Draw subtle column separator (except for last column)
              if (idx < entryValues.length - 1) {
                const separatorX = x + Object.values(notesColWidths)[idx];
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

          currentY -= sectionSpacing;
        }
      }
    } catch (error) {
      console.warn(
        "[BEHAVIORAL-EXPORT] Could not generate behavioral note:",
        error.message
      );
      // Continue without note
    }
  }

  // ============================================
  // BEHAVIORAL LOGS - TABLE FORMAT
  // ============================================
  const logsPage = checkNewPage(100);
  if (logsPage !== currentPage) {
    currentPage = logsPage;
    currentY = pageHeight - margin;
  }

  // Section heading
  currentPage.drawText("Behavioral Logs", {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 25;

  // Table headers with better column widths - Severity removed from table
  const colWidths = {
    date: 75,
    time: 65,
    behaviorType: 150, // Increased since severity is removed
    trigger: 150, // Increased since severity is removed
    staff: 120, // Increased since severity is removed
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

  // Column X positions - Severity removed from table
  const colX = {
    date: margin,
    time: margin + colWidths.date,
    behaviorType: margin + colWidths.date + colWidths.time,
    trigger: margin + colWidths.date + colWidths.time + colWidths.behaviorType,
    staff:
      margin +
      colWidths.date +
      colWidths.time +
      colWidths.behaviorType +
      colWidths.trigger,
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

  const headers = ["Date", "Time", "Behavior Type", "Trigger", "Staff"];
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
  for (const log of logs) {
    const date = new Date(log.dateTime).toLocaleDateString();
    const time = new Date(log.dateTime).toLocaleTimeString();
    const behaviorType = log.behaviorType || "N/A";
    // Severity removed from table but kept in summary statistics for KPI tracking
    const trigger = log.trigger || "N/A";
    const staffName =
      (log.staff && (log.staff.name || log.staff.email)) ||
      log.staffName ||
      log.staffId ||
      "Unknown";

    // Calculate max lines needed for this row and store wrapped text for each cell
    // Severity removed from table but kept in summary statistics above
    const values = [date, time, behaviorType, trigger, staffName];
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
    const rowIndex = logs.indexOf(log);
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

    // Severity removed from table display but still used for summary statistics above
    // Severity data is still stored in database for KPI tracking

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

      // Use default text color (severity column removed from table)
      const textColor = rgb(0.2, 0.2, 0.2);

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
  // ============================================
  // FOOTER ON ALL PAGES
  // ============================================
  // Modern footer with better styling
  const pages = pdfDoc.getPages();
  for (let index = 0; index < pages.length; index++) {
    const pdfPage = pages[index];
    // Footer background line
    pdfPage.drawLine({
      start: { x: margin, y: margin + 20 },
      end: { x: pageWidth - margin, y: margin + 20 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    // Required footer text
    pdfPage.drawText("HCA 13-0126 (2/25)", {
      x: margin,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Page numbers
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Generate PDF buffer
  // Wrap save in try-catch to handle fontkit buffer errors during width computation
  try {
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (saveError) {
    // Check if error is related to font buffer issues
    const errorMsg = saveError.message || String(saveError);
    const isFontBufferError =
      errorMsg.includes("buffer") ||
      errorMsg.includes("RangeError") ||
      errorMsg.includes("Trying to access beyond");

    if (isFontBufferError && isDancingScriptLoaded) {
      // Font causes issues during save - regenerate PDF without custom font
      console.warn(
        `[PDF] ⚠️ Dancing Script font causes buffer error during save, regenerating with italic font`
      );
      console.warn(`[PDF] Error: ${errorMsg.substring(0, 100)}`);

      // Regenerate PDF without custom font by calling the function again with font disabled
      // For now, just throw a more helpful error message
      throw new Error(
        "Dancing Script font is incompatible with pdf-lib fontkit. Please use italic font or update the font file."
      );
    }

    // Re-throw if it's not a font-related error
    throw saveError;
  }
}

/**
 * Generate PDF for batch behavior logs
 * Creates a PDF with all service entries from a batch submission
 * @param {Object} batchData - Batch data with residentId, date, and services
 * @param {Array} createdLogs - Array of created log IDs
 * @param {Object} user - Current user
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateBatchLogsPdf(
  batchData,
  createdLogs,
  user,
  options = {}
) {
  // options.forceItalicFont: if true, skip custom font loading
  if (!createdLogs || createdLogs.length === 0) {
    throw new Error("No logs provided to generate PDF");
  }

  // Determine tenantId
  const tenantId = user.tenantId || batchData.tenantId;
  if (!tenantId) {
    throw new Error("tenantId is required to generate PDF");
  }

  // Shared browser instance for all signature renders (will be closed in finally block)
  let sharedBrowser = null;

  // Create a map of log IDs to their original service indices
  const logIndexMap = new Map();
  createdLogs.forEach((log) => {
    if (log.index !== undefined) {
      logIndexMap.set(log.id, log.index);
    }
  });

  // Get the created logs from database with full details
  const logs = await prisma.behavioralLog.findMany({
    where: {
      id: { in: createdLogs.map((log) => log.id) },
      tenantId: tenantId,
    },
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (logs.length === 0) {
    throw new Error("No logs found to generate PDF");
  }

  // Check if this is a batch record (single log with services array)
  const isBatchRecord =
    logs.length === 1 && logs[0].services && Array.isArray(logs[0].services);

  // Use services from database record if available (batch records), otherwise use batchData
  let servicesToUse = batchData.services;
  if (isBatchRecord) {
    // Use services from the database record (batch format)
    servicesToUse = logs[0].services;
  }

  // Sort logs by their original service index (for legacy format)
  if (!isBatchRecord) {
    logs.sort((a, b) => {
      const indexA = logIndexMap.get(a.id) ?? 999;
      const indexB = logIndexMap.get(b.id) ?? 999;
      return indexA - indexB;
    });
  }

  // Create a map of service indices to service data (for summary extraction)
  const serviceDataMap = new Map();
  if (servicesToUse && Array.isArray(servicesToUse)) {
    servicesToUse.forEach((service) => {
      const serviceIndex =
        service.index !== undefined
          ? service.index
          : servicesToUse.indexOf(service) + 1;
      serviceDataMap.set(serviceIndex, service);
    });
  }

  // Get resident name and data
  const { getResidentName } = require("./behavioral.service");
  const residentName = await getResidentName(batchData.residentId, tenantId);

  // Get full resident data for client information section
  let residentData = null;
  let residentDateOfBirth = null;
  let residentTier = null;

  // First, try to get tier from the saved logs (preferred - uses user-selected tier)
  if (logs.length > 0 && logs[0].selectedTier) {
    residentTier = logs[0].selectedTier;
  }

  try {
    // Use getResidentData from billing.utils which doesn't require a user object
    const { getResidentData } = require("../../utils/billing.utils");
    residentData = await getResidentData(batchData.residentId, tenantId);
    // getResidentData returns { residentData: {...}, formData: {...}, name: "..." }
    // Both residentData and formData contain the same resident object with all fields
    const resident = residentData.residentData || residentData.formData || {};
    residentDateOfBirth =
      resident.residentDateOfBirth ||
      resident.residentIdentificationDateOfBirth;

    // Debug log to check if date of birth is found
    if (!residentDateOfBirth) {
      console.warn(
        `[PDF] Date of birth not found for resident ${batchData.residentId}`
      );
    }

    // Get active billing tier as fallback (only if not already set from log)
    if (!residentTier) {
      try {
        const {
          getResidentBilling,
        } = require("../billing/resident-billing.service");
        const billingInfo = await getResidentBilling(
          batchData.residentId,
          tenantId
        );
        if (billingInfo.activeBilling?.billingTier) {
          residentTier = billingInfo.activeBilling.billingTier.name;
        }
      } catch (tierError) {
        console.warn(
          "[PDF] Could not fetch tier information:",
          tierError.message
        );
      }
    }
  } catch (residentError) {
    console.warn(
      "[PDF] Could not fetch full resident data:",
      residentError.message
    );
  }

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();
  // Register fontkit for custom font embedding (required for TTF fonts like Dancing Script)
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const semiBoldFont = font; // Using regular font as semibold approximation

  // Load Dancing Script font for signature (matching the create page)
  // NOTE: We're using canvas images for signatures now, so we don't need to embed the font in pdf-lib
  // This prevents the buffer errors. The font will be used in canvas rendering instead.
  let signatureFont = italicFont;
  let isDancingScriptLoaded = false;

  // DISABLED: Skip font loading in pdf-lib entirely - we use canvas images for signatures now
  // This prevents pdf-lib fontkit buffer errors that cause PDF regeneration
  // The signature will be rendered as an image using canvas, which handles fonts differently
  const shouldLoadFont = false; // Disabled - using canvas images instead

  if (false && shouldLoadFont && !options.forceItalicFont) {
    // Try to load Dancing Script font - will catch save errors later if font causes issues
    try {
      // Service file is at: src/services/behavioral/behavioral-export.service.js
      // Fonts are at: src/fonts/
      // So we need to go up two levels: ../../fonts
      // Use path.resolve to get absolute path for better reliability
      const fontsDir = path.resolve(__dirname, "../../fonts");

      // Determine which font to try based on options
      let fontPaths = [];
      if (options.triedRegular) {
        // Already tried Regular, skip to SemiBold (though this shouldn't happen)
        fontPaths = [path.join(fontsDir, "DancingScript-SemiBold.ttf")];
      } else if (options.triedFont === "Regular") {
        // Explicitly trying Regular
        fontPaths = [path.join(fontsDir, "DancingScript-Regular.ttf")];
      } else {
        // Default: Try Regular first (more stable with pdf-lib), then SemiBold
        fontPaths = [
          path.join(fontsDir, "DancingScript-Regular.ttf"), // Try Regular first (more stable)
          path.join(fontsDir, "DancingScript-SemiBold.ttf"), // Fallback to SemiBold
        ];
      }

      console.log(`[PDF] ========== FONT LOADING DEBUG ==========`);
      console.log(`[PDF] __dirname: ${__dirname}`);
      console.log(`[PDF] Looking for fonts in: ${fontsDir}`);
      console.log(`[PDF] Font directory exists: ${fs.existsSync(fontsDir)}`);

      if (fs.existsSync(fontsDir)) {
        const filesInDir = fs.readdirSync(fontsDir);
        console.log(`[PDF] Files in fonts directory: ${filesInDir.join(", ")}`);
      }

      for (const fontPath of fontPaths) {
        const exists = fs.existsSync(fontPath);
        console.log(
          `[PDF] Checking: ${path.basename(fontPath)} - Exists: ${exists}`
        );

        if (!exists) {
          continue;
        }

        try {
          const fontBytes = fs.readFileSync(fontPath);
          if (!fontBytes || fontBytes.length === 0) {
            console.warn(`[PDF] Font file is empty: ${fontPath}`);
            continue;
          }

          // Convert to Uint8Array if needed
          let fontArray;
          if (fontBytes instanceof Uint8Array) {
            fontArray = fontBytes;
          } else if (Buffer.isBuffer(fontBytes)) {
            fontArray = new Uint8Array(fontBytes);
          } else {
            fontArray = new Uint8Array(fontBytes);
          }

          console.log(
            `[PDF] Attempting to load: ${path.basename(fontPath)} (${
              fontArray.length
            } bytes)`
          );

          // Try to embed the font
          try {
            signatureFont = await pdfDoc.embedFont(fontArray);
            isDancingScriptLoaded = true;
            // Track which font variant was loaded for error handling
            const fontVariant = path.basename(fontPath).includes("SemiBold")
              ? "SemiBold"
              : "Regular";
            options.loadedFontVariant = fontVariant;
            console.log(
              `[PDF] ✅ Successfully loaded Dancing Script ${fontVariant}: ${path.basename(
                fontPath
              )}!`
            );
            console.log(`[PDF] ========================================`);
            break;
          } catch (embedError) {
            // If embedding fails, log and try next font
            console.warn(
              `[PDF] ⚠️ Failed to embed ${path.basename(fontPath)}: ${
                embedError.message
              }`
            );
            if (
              embedError.message.includes("buffer") ||
              embedError.message.includes("RangeError")
            ) {
              console.warn(
                `[PDF] ⚠️ This font file may be incompatible with pdf-lib, trying next font...`
              );
            }
            continue;
          }
        } catch (embedError) {
          console.warn(
            `[PDF] ⚠️ Failed to embed ${path.basename(fontPath)}: ${
              embedError.message
            }`
          );
          console.warn(
            `[PDF] Error stack: ${embedError.stack?.substring(0, 200)}`
          );
          continue;
        }
      }

      if (!isDancingScriptLoaded) {
        console.warn(
          `[PDF] ⚠️ Dancing Script font not loaded - using italic fallback`
        );
        console.warn(`[PDF] Checked paths:`);
        fontPaths.forEach((p) =>
          console.warn(`[PDF]   - ${p} (exists: ${fs.existsSync(p)})`)
        );
        console.log(`[PDF] ========================================`);
      }
    } catch (error) {
      console.warn(`[PDF] ⚠️ Error during font loading: ${error.message}`);
      console.warn(`[PDF] Error stack: ${error.stack?.substring(0, 200)}`);
      signatureFont = italicFont;
      isDancingScriptLoaded = false;
    }
  } else {
    console.log(
      `[PDF] Using italic font (custom font disabled due to previous error)`
    );
  }

  // Page dimensions
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  const footerMargin = 80; // Space reserved for footer (footer line at margin + 20 = 70, text at margin/2 + 5 = 30, use 80 for safety)
  const sectionSpacing = 20;

  // Track current Y position
  let currentY = pageHeight - margin;
  let currentPage = page;

  // Helper function to add new page if needed
  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < footerMargin) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Get header information
  const tenantName = logs[0]?.tenant?.name || "Unknown Facility";
  const logDate = new Date(batchData.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // ============================================
  // HEADER SECTION
  // ============================================
  // Try to load and embed the Washington State Health Care Authority logo
  let logoImage = null;
  try {
    // Use logo from src/assets/logo.png
    const logoPath = path.join(__dirname, "../../assets/logo.png");

    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      logoImage = await pdfDoc.embedPng(logoBytes);
    } else {
      console.warn(
        "[PDF] Logo not found at src/assets/logo.png, header will display without logo"
      );
    }
  } catch (error) {
    console.warn("[PDF] Failed to load logo:", error.message);
    // Continue without logo
  }

  // Header layout: Text on left, logo on right
  const headerY = currentY;
  const headerHeight = 60; // Space for header content

  // Left side: Title text (two lines)
  const titleLine1 = "CBHS Supportive Supervision";
  const titleLine2 = "services tracking form";

  currentPage.drawText(titleLine1, {
    x: margin,
    y: headerY,
    size: 24,
    font: semiBoldFont,
    color: rgb(0, 0, 0),
  });

  currentPage.drawText(titleLine2, {
    x: margin,
    y: headerY - 22,
    size: 24,
    font: semiBoldFont,
    color: rgb(0, 0, 0),
  });

  // Right side: Logo (if available) - top right corner aligned with heading
  if (logoImage) {
    const logoWidth = 120; // Adjust as needed
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
    const logoX = pageWidth - margin - logoWidth;
    const logoY = headerY; // Aligned with top of heading

    currentPage.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // Horizontal rule below the title
  const ruleY = headerY - 35;
  currentPage.drawLine({
    start: { x: margin, y: ruleY },
    end: { x: pageWidth - margin, y: ruleY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // Community Behavioral Health Supports (CBHS) text
  currentPage.drawText("Community Behavioral Health Supports (CBHS)", {
    x: margin,
    y: ruleY - 16,
    size: 14,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Instructions text with top margin
  const instructionsHeadingY = ruleY - 40; // Added 10pt margin top
  currentPage.drawText("Instructions.", {
    x: margin,
    y: instructionsHeadingY,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  // Instructions content text
  const instructionsText =
    "Use one form per individual to indicate the number of behavioral health supportive supervision hours provided. This does not include time spent assisting with or performing activities of daily living";

  // Wrap the instructions text to fit within page width
  const instructionsMaxWidth = pageWidth - margin * 2;
  const instructionsLines = wrapText({
    text: instructionsText,
    maxWidth: instructionsMaxWidth,
    font: font,
    fontSize: 10,
  });

  // Draw each line of the instructions text (positioned below the Instructions heading)
  let instructionsY = instructionsHeadingY - 16; // 16pt spacing below the heading
  instructionsLines.forEach((line, index) => {
    currentPage.drawText(line, {
      x: margin,
      y: instructionsY - index * 12,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  });

  // Update currentY to account for all header elements including instructions
  const instructionsHeight = instructionsLines.length * 12;
  currentY = instructionsY - instructionsHeight - 2; // Reduced spacing below instructions text

  // ============================================
  // CLIENT INFORMATION SECTION
  // ============================================
  const clientInfoSectionSpacing = 15;
  const sectionHeaderHeight = 25;
  const fieldLabelSize = 10;
  const fieldValueSize = 10;
  const lineHeight = 14;
  const inputLineLength = 200; // Length of input line
  const checkboxSize = 12; // Increased from 8 to 12
  const checkboxSpacing = 5;

  // Check if we need a new page for the Client Information section
  const clientInfoPage = checkNewPage(150);
  if (clientInfoPage !== currentPage) {
    currentPage = clientInfoPage;
    currentY = pageHeight - margin;
  }

  // Section header: Black bar with "1" in white and "Client information" in bold
  const sectionHeaderY = currentY;
  const sectionHeaderBarHeight = 20;

  // Draw black bar background
  currentPage.drawRectangle({
    x: margin,
    y: sectionHeaderY - sectionHeaderBarHeight,
    width: pageWidth - margin * 2,
    height: sectionHeaderBarHeight,
    color: rgb(0, 0, 0),
  });

  // Draw "1" in white text (centered in bar)
  currentPage.drawText("1", {
    x: margin + 10,
    y: sectionHeaderY - sectionHeaderBarHeight + 5,
    size: 14,
    font: boldFont,
    color: rgb(1, 1, 1), // White
  });

  // Draw "Client information" in bold (to the right of "1")
  currentPage.drawText("Client information", {
    x: margin + 30,
    y: sectionHeaderY - sectionHeaderBarHeight + 5,
    size: 12,
    font: boldFont,
    color: rgb(1, 1, 1), // White
  });

  currentY = sectionHeaderY - sectionHeaderBarHeight - clientInfoSectionSpacing;

  // First and last name field
  const nameLabelY = currentY;
  currentPage.drawText("First and last name", {
    x: margin,
    y: nameLabelY,
    size: fieldLabelSize,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Input line for name (long horizontal line) - increased gap from label
  const nameLineY = nameLabelY - 18; // Increased from 12 to 18 for better spacing
  const nameLineWidth = 300;
  currentPage.drawLine({
    start: { x: margin, y: nameLineY },
    end: { x: margin + nameLineWidth, y: nameLineY },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  // Fill in the name if available - positioned above the line for better appearance
  if (residentName) {
    currentPage.drawText(residentName, {
      x: margin + 2,
      y: nameLineY + 2, // Position text slightly above the line
      size: fieldValueSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  // Date of birth field (positioned to the right of name field)
  const dobLabelX = margin + nameLineWidth + 30;
  currentPage.drawText("Date of birth", {
    x: dobLabelX,
    y: nameLabelY,
    size: fieldLabelSize,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Input line for date of birth (shorter horizontal line) - increased gap from label
  const dobLineY = nameLineY; // Same Y position as name line for alignment
  const dobLineWidth = 120;
  currentPage.drawLine({
    start: { x: dobLabelX, y: dobLineY },
    end: { x: dobLabelX + dobLineWidth, y: dobLineY },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  // Fill in the date of birth if available - positioned above the line for better appearance
  if (residentDateOfBirth) {
    try {
      // Handle different date formats (Date object, ISO string, or date string)
      let dobDate;
      if (residentDateOfBirth instanceof Date) {
        dobDate = residentDateOfBirth;
      } else if (typeof residentDateOfBirth === "string") {
        // Handle ISO string or date string
        const dateStr = residentDateOfBirth.split("T")[0]; // Get just the date part if it's an ISO string
        dobDate = new Date(dateStr);
      } else {
        dobDate = new Date(residentDateOfBirth);
      }

      // Format as MM/DD/YYYY
      const dobFormatted = dobDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });

      // Only draw if we have a valid date
      if (!isNaN(dobDate.getTime())) {
        currentPage.drawText(dobFormatted, {
          x: dobLabelX + 2,
          y: dobLineY + 2, // Position text slightly above the line
          size: fieldValueSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
    } catch (error) {
      console.warn("[PDF] Error formatting date of birth:", error);
      // If formatting fails, try to display the raw value
      if (typeof residentDateOfBirth === "string") {
        currentPage.drawText(residentDateOfBirth, {
          x: dobLabelX + 2,
          y: dobLineY + 2,
          size: fieldValueSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  // Add margin bottom for name and date of birth fields
  currentY = nameLineY - 20; // Reduced spacing above Authorized tier

  // Authorized tier field
  currentPage.drawText("Authorized tier", {
    x: margin,
    y: currentY,
    size: fieldLabelSize,
    font: font,
    color: rgb(0, 0, 0),
  });

  currentY -= 16; // Reduced by 2px (was 18, now 16)

  // Tier checkboxes (6 tiers in 1 row)
  const tierOptions = [
    "Tier 1 (.5-2)",
    "Tier 2 (2.1-6)",
    "Tier 3 (6.1-10)",
    "Tier 4 (10.1-15)",
    "Tier 5 (15.1-20)",
    "Tier 6 (20.1-24)",
  ];

  const checkboxStartX = margin;
  const checkboxY = currentY;
  // Calculate column width to fit all 6 options in one row
  const availableWidth = pageWidth - margin * 2;
  const checkboxColumnWidth = availableWidth / 6; // Distribute evenly across 6 columns
  const tierLabelFontSize = 8; // Reduced font size for tier labels

  tierOptions.forEach((tier, index) => {
    const checkboxX = checkboxStartX + index * checkboxColumnWidth;

    // Draw checkbox square - center it vertically with the text
    const checkboxCenterY = checkboxY - checkboxSize / 2;
    currentPage.drawRectangle({
      x: checkboxX,
      y: checkboxCenterY - checkboxSize / 2,
      width: checkboxSize,
      height: checkboxSize,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1), // White background
    });

    // Check if this tier matches the saved tier from the log
    // First try exact match, then try partial match (for backward compatibility with billing tier names)
    let isSelected = false;
    if (residentTier) {
      // Exact match (preferred - for saved tier values like "Tier 1 (.5-2)")
      if (tier === residentTier) {
        isSelected = true;
      } else {
        // Partial match (for backward compatibility with billing tier names like "Tier 1")
        const tierNumber = tier.match(/Tier\s*(\d+)/i)?.[1];
        const residentTierNumber = residentTier.match(/Tier\s*(\d+)/i)?.[1];
        if (
          tierNumber &&
          residentTierNumber &&
          tierNumber === residentTierNumber
        ) {
          isSelected = true;
        }
      }
    }
    if (isSelected) {
      // Draw checkmark using lines (WinAnsi compatible) - centered in checkbox
      const checkPadding = 2; // Padding from checkbox edges
      const checkBoxTop = checkboxCenterY + checkboxSize / 2;
      const checkBoxBottom = checkboxCenterY - checkboxSize / 2;
      const checkBoxLeft = checkboxX;
      const checkBoxRight = checkboxX + checkboxSize;

      // Calculate checkmark points (forming a checkmark shape)
      // Start point: left side, slightly above center
      const checkStartX = checkBoxLeft + checkPadding;
      const checkStartY = checkboxCenterY;
      // Middle point: center-left
      const checkMidX = checkBoxLeft + checkboxSize * 0.35;
      const checkMidY = checkBoxBottom + checkboxSize * 0.25;
      // End point: top-right
      const checkEndX = checkBoxRight - checkPadding;
      const checkEndY = checkBoxTop - checkPadding;

      // Draw checkmark: two lines forming a checkmark shape
      // First line: bottom-left to middle (vertical part)
      currentPage.drawLine({
        start: { x: checkStartX, y: checkStartY },
        end: { x: checkMidX, y: checkMidY },
        thickness: 1.8,
        color: rgb(0, 0, 0),
      });
      // Second line: middle to top-right (diagonal part)
      currentPage.drawLine({
        start: { x: checkMidX, y: checkMidY },
        end: { x: checkEndX, y: checkEndY },
        thickness: 1.8,
        color: rgb(0, 0, 0),
      });
    }

    // Draw tier label - aligned horizontally with checkbox center
    currentPage.drawText(tier, {
      x: checkboxX + checkboxSize + checkboxSpacing,
      y: checkboxCenterY + tierLabelFontSize / 2 - 6, // Center text vertically with checkbox, moved down 2px
      size: tierLabelFontSize, // Reduced font size
      font: font,
      color: rgb(0, 0, 0),
    });
  });

  currentY = checkboxY - 15; // Reduced spacing below Authorized tier

  // ============================================
  // SUMMARY OF SERVICES AND SIGNATURE SECTION
  // ============================================
  // Check if we need a new page for the Summary section
  const summaryPage = checkNewPage(200);
  if (summaryPage !== currentPage) {
    currentPage = summaryPage;
    currentY = pageHeight - margin;
  }

  // Add 2px space above the section
  currentY -= 3;

  // Section header: Black bar with "2" in white and "Summary of services and signature" in bold
  const summaryHeaderY = currentY;
  const summaryHeaderBarHeight = 20;

  // Draw black bar background
  currentPage.drawRectangle({
    x: margin,
    y: summaryHeaderY - summaryHeaderBarHeight,
    width: pageWidth - margin * 2,
    height: summaryHeaderBarHeight,
    color: rgb(0, 0, 0),
  });

  // Draw "2" in white text (centered in bar)
  currentPage.drawText("2", {
    x: margin + 10,
    y: summaryHeaderY - summaryHeaderBarHeight + 5,
    size: 14,
    font: boldFont,
    color: rgb(1, 1, 1), // White
  });

  // Draw "Summary of services and signature" in bold (to the right of "2")
  currentPage.drawText("Summary of services and signature", {
    x: margin + 30,
    y: summaryHeaderY - summaryHeaderBarHeight + 5,
    size: 12,
    font: boldFont,
    color: rgb(1, 1, 1), // White
  });

  currentY = summaryHeaderY - summaryHeaderBarHeight - clientInfoSectionSpacing;

  // Introductory paragraph
  const attestationText =
    "By signing I attest this information is true, accurate, and complete. I understand any falsification, omission, or concealment of material fact may subject me or the represented organization to further corrective actions.";

  // Wrap the attestation text
  const attestationMaxWidth = pageWidth - margin * 2;
  const attestationLines = wrapText({
    text: attestationText,
    maxWidth: attestationMaxWidth,
    font: font,
    fontSize: 10,
  });

  // Draw each line of the attestation text
  let attestationY = currentY;
  attestationLines.forEach((line, index) => {
    currentPage.drawText(line, {
      x: margin,
      y: attestationY - index * 12,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  });

  currentY = attestationY - attestationLines.length * 12 - 13; // Reduced by 2px (was 15, now 13)

  // Instructions - combine heading with first instruction item (no line break)
  const instructionLineHeight = 12; // Consistent line height for all lines
  const boldPrefix = "Fill out the fields below with ";
  const fieldInstructionsText =
    'Date, time or duration of services you provided (e.g. "8 – 10 a.m." or "2 hours"), summary of behavior(s) exhibited (or prevented) that led to intervention and the intervention(s) leveraged by staff (e.g. monitoring, redirection, diversion, and/or cueing), names of staff, and signature.';

  // Calculate width of bold prefix to determine available width for rest of text
  const boldPrefixWidth = boldFont.widthOfTextAtSize(boldPrefix, 10);
  const availableWidthForText = attestationMaxWidth - boldPrefixWidth;

  // Wrap the instructions text (without the bold prefix)
  const instructionLines = wrapText({
    text: fieldInstructionsText,
    maxWidth: availableWidthForText,
    font: font,
    fontSize: 10,
  });

  // Draw bold prefix on first line
  currentPage.drawText(boldPrefix, {
    x: margin,
    y: currentY,
    size: 10,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  // Draw first line of instructions immediately after bold prefix
  if (instructionLines.length > 0) {
    currentPage.drawText(instructionLines[0], {
      x: margin + boldPrefixWidth,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  // Draw remaining lines (if any) below
  for (let i = 1; i < instructionLines.length; i++) {
    currentPage.drawText(instructionLines[i], {
      x: margin,
      y: currentY - i * instructionLineHeight,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  // Update currentY based on number of lines
  currentY -= instructionLines.length * instructionLineHeight;

  currentY -= 10; // Reduced spacing before the form

  // ============================================
  // SERVICE ENTRIES - Loop through each service
  // ============================================
  // Show each service on a separate page without "Service X" headings

  const showServiceHeadings = false; // Never show service headings

  // Determine what to iterate: services array for batch records, or logs for legacy format
  const itemsToProcess = isBatchRecord ? servicesToUse : logs;
  const log = isBatchRecord ? logs[0] : null; // For batch records, use the single log

  for (
    let serviceIndex = 0;
    serviceIndex < itemsToProcess.length;
    serviceIndex++
  ) {
    const item = itemsToProcess[serviceIndex];
    const serviceNumber = serviceIndex + 1;

    // For batch records, item is a service object; for legacy, item is a log
    let originalService;
    let currentLog;

    if (isBatchRecord) {
      // Batch format: item is a service from the services array
      originalService = item;
      currentLog = log; // Use the single log for all services
      const serviceIndexFromMap =
        originalService.index !== undefined
          ? originalService.index
          : serviceNumber;
    } else {
      // Legacy format: item is a log
      currentLog = item;
      originalService = serviceDataMap.get(currentLog.id);
      const serviceIndexFromMap =
        logIndexMap.get(currentLog.id) ?? serviceNumber;
    }

    // For each service after the first, create a new page
    if (serviceIndex > 0) {
      currentPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
    }

    // Add "Service X" heading if showing multiple services
    if (showServiceHeadings) {
      const serviceHeadingY = currentY;
      const serviceHeadingHeight = 25;

      // Draw black bar background for service heading
      currentPage.drawRectangle({
        x: margin,
        y: serviceHeadingY - serviceHeadingHeight,
        width: pageWidth - margin * 2,
        height: serviceHeadingHeight,
        color: rgb(0, 0, 0),
      });

      // Draw "Service X" in white text
      const serviceTitle = `Service ${serviceIndexFromMap}`;
      currentPage.drawText(serviceTitle, {
        x: margin + 10,
        y: serviceHeadingY - serviceHeadingHeight + 7,
        size: 14,
        font: boldFont,
        color: rgb(1, 1, 1), // White
      });

      currentY = serviceHeadingY - serviceHeadingHeight - 15;
    }

    // Extract data for this specific service
    // Date - use the service's individual date if available, otherwise use log dateTime
    let serviceDate;
    if (originalService && originalService.dateTime) {
      serviceDate = new Date(originalService.dateTime).toLocaleDateString(
        "en-US",
        {
          month: "short",
          day: "numeric",
          year: "numeric",
        }
      );
    } else if (originalService && originalService.date) {
      serviceDate = new Date(originalService.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } else {
      serviceDate = new Date(currentLog.dateTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    // Time or duration for this service
    const serviceTimeOrDuration =
      (originalService && originalService.timeOrDuration) ||
      currentLog.duration ||
      (originalService && originalService.dateTime
        ? new Date(originalService.dateTime).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date(currentLog.dateTime).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }));

    // Staff names for this service
    let serviceStaffNames = "";
    if (originalService && originalService.staffName) {
      serviceStaffNames = originalService.staffName.trim();
    } else if (currentLog.staffName && currentLog.staffName.trim()) {
      serviceStaffNames = currentLog.staffName.trim();
    } else if (currentLog.staffNotes) {
      const staffMatch = currentLog.staffNotes.match(
        /Staff:\s*(.+?)(?:\s*\||$)/
      );
      if (staffMatch) {
        serviceStaffNames = staffMatch[1].trim();
      }
    }
    if (!serviceStaffNames && currentLog.staff?.name) {
      serviceStaffNames = currentLog.staff.name;
    }

    // Summary for this service
    let serviceSummary = "";
    if (originalService && originalService.summary) {
      serviceSummary = originalService.summary;
    } else if (currentLog.staffNotes) {
      const summaryMatch = currentLog.staffNotes.match(
        /Summary:\s*(.+?)(?:\s*\||$)/
      );
      if (summaryMatch) {
        serviceSummary = summaryMatch[1].trim();
      }
    }

    // Signature for this service
    let serviceSignature = "";
    if (originalService && originalService.signature) {
      serviceSignature = originalService.signature.trim();
    } else if (currentLog.staffNotes) {
      const signatureMatch = currentLog.staffNotes.match(
        /Signature:\s*(.+?)(?:\s*\||$)/
      );
      if (signatureMatch) {
        serviceSignature = signatureMatch[1].trim();
      }
    }
    // Fallback to staff name if no signature
    if (!serviceSignature && serviceStaffNames) {
      serviceSignature = serviceStaffNames;
    }

    // ============================================
    // SERVICE ENTRY FORM (Two-column layout) for this service
    // ============================================
    const formDate = serviceDate;
    const timeOrDurationText = serviceTimeOrDuration;
    const staffNamesText = serviceStaffNames;
    const summaryText = serviceSummary;
    const signatureText = serviceSignature;

    const formContentWidth = pageWidth - margin * 2;
    const formColumnGap = 15;
    const formLeftColumnWidth = (formContentWidth - formColumnGap) * 0.25; // Reduced to 25% to accommodate wider right column
    const baseRightColumnWidth = (formContentWidth - formColumnGap) * 0.65; // 65% for right column (wider)
    const formRightColumnWidth = baseRightColumnWidth * 1.15; // Increase width by 15%
    const formLeftColumnX = margin;
    const formRightColumnX = margin + formLeftColumnWidth + formColumnGap;
    const formFieldSpacing = 30; // Spacing between fields (increased for better readability)
    const formLabelFontSize = 9;
    const formValueFontSize = 9;
    const formLineThickness = 0.5;
    const formLineLength = formLeftColumnWidth - 4;
    const labelToFieldGap = 10; // Gap between label and field line

    let formLeftY = currentY;
    let formRightY = currentY;

    // LEFT COLUMN - Administrative fields
    // Date field - add 10 points margin to move it down
    formLeftY = formLeftY - 10; // Add 10 points margin to move date field down

    currentPage.drawText("Date", {
      x: formLeftColumnX,
      y: formLeftY,
      size: formLabelFontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
    // Increase spacing between "Date" label and date line
    const dateLabelToFieldGap = 20; // Increased spacing between "Date" label and date line
    const dateLineY = formLeftY - dateLabelToFieldGap;
    currentPage.drawLine({
      start: { x: formLeftColumnX, y: dateLineY },
      end: { x: formLeftColumnX + formLineLength, y: dateLineY },
      thickness: formLineThickness,
      color: rgb(0, 0, 0),
    });
    // Pre-fill date
    if (formDate) {
      const dateValueSpacing = 4; // Space above the date value
      currentPage.drawText(formDate, {
        x: formLeftColumnX + 2,
        y: dateLineY + dateValueSpacing,
        size: formValueFontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    formLeftY = dateLineY - formFieldSpacing; // Proper spacing after date field

    // Time or duration of services field
    const timeLabelLines = wrapText({
      text: "Time or duration of services",
      maxWidth: formLeftColumnWidth,
      font: font,
      fontSize: formLabelFontSize,
    });
    const timeLabelStartY = formLeftY;
    timeLabelLines.forEach((line, idx) => {
      currentPage.drawText(line, {
        x: formLeftColumnX,
        y: formLeftY - idx * 10,
        size: formLabelFontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    });
    const timeLabelHeight = timeLabelLines.length * 10;
    const timeLineY = formLeftY - timeLabelHeight - labelToFieldGap;
    currentPage.drawLine({
      start: { x: formLeftColumnX, y: timeLineY },
      end: { x: formLeftColumnX + formLineLength, y: timeLineY },
      thickness: formLineThickness,
      color: rgb(0, 0, 0),
    });
    // Pre-fill time or duration
    if (timeOrDurationText) {
      const timeValueLines = wrapText({
        text: timeOrDurationText,
        maxWidth: formLineLength - 4,
        font: font,
        fontSize: formValueFontSize,
      });
      timeValueLines.forEach((line, idx) => {
        currentPage.drawText(line, {
          x: formLeftColumnX + 2,
          y: timeLineY + 2 - idx * 10,
          size: formValueFontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      });
    }
    formLeftY = timeLineY - formFieldSpacing; // Proper spacing after time field

    // Name(s) of staff who provided services - with box
    const staffLabelLines = wrapText({
      text: "Name(s) of staff who provided services",
      maxWidth: formLeftColumnWidth,
      font: font,
      fontSize: formLabelFontSize,
    });
    staffLabelLines.forEach((line, idx) => {
      currentPage.drawText(line, {
        x: formLeftColumnX,
        y: formLeftY - idx * 10,
        size: formLabelFontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    });
    const staffLabelHeight = staffLabelLines.length * 10;
    const staffBoxHeight = 50; // Rectangular box for staff names
    const staffBoxY = formLeftY - staffLabelHeight - labelToFieldGap;
    currentPage.drawRectangle({
      x: formLeftColumnX,
      y: staffBoxY - staffBoxHeight,
      width: formLeftColumnWidth,
      height: staffBoxHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: formLineThickness,
    });
    // Pre-fill staff names in the box
    // Split by comma or newline to handle multiple staff names
    if (staffNamesText) {
      const staffNames = staffNamesText
        .split(/[,\n]+/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      const staffBoxPaddingTop = 10; // Increased padding top inside the box
      let currentY = staffBoxY - staffBoxPaddingTop;

      staffNames.forEach((name, idx) => {
        // Wrap each name if it's too long
        const nameLines = wrapText({
          text: name,
          maxWidth: formLeftColumnWidth - 6,
          font: font,
          fontSize: formValueFontSize,
        });

        nameLines.forEach((line, lineIdx) => {
          currentPage.drawText(line, {
            x: formLeftColumnX + 3,
            y: currentY - lineIdx * 10,
            size: formValueFontSize,
            font: font,
            color: rgb(0, 0, 0),
          });
        });

        // Move Y position down for next name (with spacing)
        currentY = currentY - nameLines.length * 10 - 2; // 2px spacing between names
      });
    }
    formLeftY = staffBoxY - staffBoxHeight - formFieldSpacing; // Proper spacing after staff box

    // Signature field
    currentPage.drawText("Signature", {
      x: formLeftColumnX,
      y: formLeftY,
      size: formLabelFontSize,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Split signature by comma or newline to handle multiple names
    const signatureNames = signatureText
      ? signatureText
          .split(/[,\n]+/)
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      : [];
    const hasMultipleNames = signatureNames.length > 1;

    // Calculate spacing for multiple signatures
    const signatureFontSize = hasMultipleNames ? 6 : 6;
    const signatureLineSpacing = hasMultipleNames ? 10 : 0; // Spacing between multiple signatures

    // For single signature: line at normal position
    // For multiple: we'll calculate line position after rendering signatures
    let signatureLineY;
    if (!hasMultipleNames) {
      signatureLineY = formLeftY - 25;
      // Draw signature line for single signature
      currentPage.drawLine({
        start: { x: formLeftColumnX, y: signatureLineY },
        end: { x: formLeftColumnX + formLineLength, y: signatureLineY },
        thickness: formLineThickness,
        color: rgb(0, 0, 0),
      });
    }

    // Pre-fill signature with Dancing Script font (matching the create page)
    // Use canvas to render signature as image to bypass pdf-lib fontkit buffer errors
    if (signatureText && signatureNames.length > 0) {
      // signatureFontSize and signatureLineSpacing already defined above

      try {
        // Render each signature name as an image using canvas
        for (let index = 0; index < signatureNames.length; index++) {
          const name = signatureNames[index];

          console.log(
            `[PDF] 🎨 Attempting to render signature "${name}" (${index + 1}/${
              signatureNames.length
            })`
          );

          // Render signature text to image with Dancing Script font
          // Use shared browser instance if available (much faster)
          let signatureImageBuffer;
          try {
            signatureImageBuffer = await renderSignatureToImage(
              name,
              signatureFontSize,
              formLineLength - 6,
              sharedBrowser
            );
          } catch (renderError) {
            console.error(
              `[PDF] 🎨 ❌ Failed to render signature "${name}": ${renderError.message}`
            );
            console.error(
              `[PDF] 🎨 ❌ Render error stack: ${renderError.stack?.substring(
                0,
                500
              )}`
            );
            throw renderError; // Re-throw to trigger fallback
          }

          if (!signatureImageBuffer || signatureImageBuffer.length < 100) {
            console.error(
              `[PDF] 🎨 ❌ Invalid image buffer for "${name}": ${
                signatureImageBuffer?.length || 0
              } bytes`
            );
            throw new Error(
              `Invalid image buffer (${
                signatureImageBuffer?.length || 0
              } bytes)`
            );
          }

          console.log(
            `[PDF] 🎨 ✅ Successfully rendered signature "${name}" (${signatureImageBuffer.length} bytes)`
          );

          // Embed the image in the PDF
          const signatureImage = await pdfDoc.embedPng(signatureImageBuffer);
          const imageDims = signatureImage.scale(0.5); // Scale down from 2x DPI to 1x

          // Calculate Y position for this signature (PDF coordinates: y increases upward)
          let yPos;
          let imageY;

          if (hasMultipleNames) {
            // For multiple signatures: stack them from top to bottom, line goes BELOW all
            // Start from top position, stack downward
            const topSignatureY = formLeftY - 25; // Top position (same as label gap)
            const imageHeight = imageDims.height; // Actual height of signature image

            // Position each signature: first at top, subsequent ones below
            // First signature (index 0) at top, last signature at bottom
            yPos = topSignatureY - index * (imageHeight + signatureLineSpacing);

            // Position image so text baseline aligns with yPos
            imageY = yPos - 1; // Account for 1px padding after scaling

            // Track the bottom of the last signature to position the line below it
            if (index === signatureNames.length - 1) {
              // This is the last signature, position line below it
              // imageY is the bottom of the image, line goes below it
              const paddingAboveLine = 3; // Small padding between last signature and line
              signatureLineY = imageY - paddingAboveLine;

              // Draw the line below all signatures
              currentPage.drawLine({
                start: { x: formLeftColumnX, y: signatureLineY },
                end: { x: formLeftColumnX + formLineLength, y: signatureLineY },
                thickness: formLineThickness,
                color: rgb(0, 0, 0),
              });
            }
          } else {
            // Single signature: position on the line
            yPos = signatureLineY;
            imageY = yPos - 1; // Position so text baseline (1px from image bottom after scaling) aligns with line
          }

          currentPage.drawImage(signatureImage, {
            x: formLeftColumnX + 3,
            y: imageY,
            width: imageDims.width,
            height: imageDims.height,
          });

          console.log(
            `[PDF] ✅ Signature image drawn for "${name}" at lineY=${signatureLineY}, imageY=${imageY.toFixed(
              1
            )}, size=${imageDims.width.toFixed(1)}x${imageDims.height.toFixed(
              1
            )}`
          );
        }

        console.log(
          `[PDF] ✅ Signature drawn as image with Dancing Script font: "${signatureText}"`
        );
      } catch (imageError) {
        console.error(
          `[PDF] ❌ Failed to render signature as image, using italic text fallback`
        );
        console.error(`[PDF] ❌ Error: ${imageError.message}`);
        console.error(
          `[PDF] ❌ Error stack: ${imageError.stack?.substring(0, 300)}`
        );
        // Fallback to italic text if image rendering fails
        signatureNames.forEach((name, index) => {
          let yPos;
          if (hasMultipleNames) {
            // For multiple names: use same top position as image rendering
            const topSignatureY = formLeftY - 25;
            yPos =
              topSignatureY -
              index * (signatureFontSize + signatureLineSpacing);
          } else {
            // For single name: use the signature line position
            yPos = signatureLineY;
          }
          currentPage.drawText(name, {
            x: formLeftColumnX + 3,
            y: yPos,
            size: signatureFontSize,
            font: italicFont,
            color: rgb(0, 0, 0),
          });
        });
        // Draw line for fallback (if not already drawn)
        if (hasMultipleNames && !signatureLineY) {
          // Calculate line position below all signatures
          const topSignatureY = formLeftY - 25;
          const totalHeight =
            signatureNames.length * (signatureFontSize + signatureLineSpacing) -
            signatureLineSpacing;
          signatureLineY = topSignatureY - totalHeight - 3; // 3pt padding below last signature
          currentPage.drawLine({
            start: { x: formLeftColumnX, y: signatureLineY },
            end: { x: formLeftColumnX + formLineLength, y: signatureLineY },
            thickness: formLineThickness,
            color: rgb(0, 0, 0),
          });
        }
      }
    }
    formLeftY = signatureLineY - formFieldSpacing; // Proper spacing after signature field

    // RIGHT COLUMN - Summary of services
    // Title
    const summaryLabelY = formRightY;
    currentPage.drawText("Summary of services", {
      x: formRightColumnX,
      y: summaryLabelY,
      size: formLabelFontSize,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Calculate summary box position - start below the label with proper spacing
    const labelToBoxGap = 10; // Gap between label and box
    const summaryBoxTop = summaryLabelY - labelToBoxGap;

    // Calculate box height to match left column content (from label to bottom of left column)
    // Reduced height by 15%
    const leftColumnBottom = formLeftY;
    const baseSummaryBoxHeight = summaryBoxTop - leftColumnBottom;
    let summaryBoxHeight = baseSummaryBoxHeight * 1.16; // Reduced by 15% (was 1.365, now 1.16)
    // Ensure summary box doesn't go below footer margin
    const maxSummaryBoxHeight = summaryBoxTop - footerMargin;
    if (summaryBoxHeight > maxSummaryBoxHeight) {
      summaryBoxHeight = maxSummaryBoxHeight;
    }
    const summaryBoxY = summaryBoxTop - summaryBoxHeight; // Bottom of the box

    // Draw the summary box
    currentPage.drawRectangle({
      x: formRightColumnX,
      y: summaryBoxY,
      width: formRightColumnWidth,
      height: summaryBoxHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: formLineThickness,
    });

    // Pre-fill summary text in the box with proper heading formatting
    if (summaryText) {
      const textPadding = 5; // Padding inside the box
      const paddingTop = 0; // Minimal top padding
      // Push text down by 6% of box height to center it better
      const verticalOffset = summaryBoxHeight * 0.06;
      const textStartY =
        summaryBoxTop - textPadding - paddingTop - verticalOffset; // Start with top padding
      const lineHeight = 10;

      // Parse and format summary text with headings
      let formattedSummaryText = summaryText;
      // Remove "Summary:" prefix if present
      formattedSummaryText = formattedSummaryText
        .replace(/^Summary:\s*/i, "")
        .trim();

      // Add line breaks before section headers
      formattedSummaryText = formattedSummaryText
        .replace(/\s*(Observed Behaviors:)/gi, "\n\n$1")
        .replace(/\s*(Interventions:)/gi, "\n\n$1")
        .replace(/\s*(Outcome:)/gi, "\n\n$1")
        .trim();

      // Add line break after section headers
      formattedSummaryText = formattedSummaryText
        .replace(/(Observed Behaviors:)\s+/gi, "$1\n")
        .replace(/(Interventions:)\s+/gi, "$1\n")
        .replace(/(Outcome:)\s+/gi, "$1\n");

      // Clean up multiple consecutive newlines
      formattedSummaryText = formattedSummaryText.replace(/\n{4,}/g, "\n\n\n");
      formattedSummaryText = formattedSummaryText.replace(/\n{3}/g, "\n\n");
      formattedSummaryText = formattedSummaryText.replace(/^\n+/, "");

      // Split into paragraphs and process
      const paragraphs = formattedSummaryText.split(/\n\s*\n/);
      let summaryLines = [];

      paragraphs.forEach((paragraph) => {
        const trimmedPara = paragraph.trim();
        if (trimmedPara) {
          // Check if paragraph starts with a section header
          const headerMatch = trimmedPara.match(
            /^(Observed Behaviors|Interventions|Outcome):\s*(.+)$/is
          );

          if (headerMatch) {
            // Split header and content
            const header = headerMatch[1] + ":";
            let content = headerMatch[2].trim();
            content = content.replace(/^\n+/, "").trim();

            // Add header as a single line
            summaryLines.push(header);

            // Wrap and add content lines
            if (content) {
              const wrappedContentLines = wrapText({
                text: content,
                maxWidth: formRightColumnWidth - textPadding * 2,
                font: font,
                fontSize: formValueFontSize,
              });
              summaryLines.push(...wrappedContentLines);
            }
          } else {
            // Regular paragraph - wrap normally
            const wrappedLines = wrapText({
              text: trimmedPara,
              maxWidth: formRightColumnWidth - textPadding * 2,
              font: font,
              fontSize: formValueFontSize,
            });
            summaryLines.push(...wrappedLines);
          }

          // Add empty line between paragraphs
          summaryLines.push("");
        }
      });

      // Draw formatted summary lines
      let currentLineY = textStartY;
      summaryLines.forEach((line, idx) => {
        // Skip empty lines but account for spacing
        if (line === "") {
          currentLineY -= lineHeight * 0.5;
          return;
        }

        // Check if line is within box bounds and above footer margin
        if (currentLineY >= Math.max(summaryBoxY + textPadding, footerMargin)) {
          // Check if this line is a section header
          const isSectionHeader =
            /^(Observed Behaviors|Interventions|Outcome):/i.test(line.trim());

          if (isSectionHeader) {
            // Draw header as bold
            currentPage.drawText(line, {
              x: formRightColumnX + textPadding,
              y: currentLineY,
              size: formValueFontSize,
              font: boldFont, // Bold font for headings
              color: rgb(0, 0, 0), // Black for headers
            });
            currentLineY -= lineHeight;
            // Small spacing after header
            currentLineY -= lineHeight * 0.2;
          } else {
            // Draw regular paragraph text
            currentPage.drawText(line, {
              x: formRightColumnX + textPadding,
              y: currentLineY,
              size: formValueFontSize,
              font: font,
              color: rgb(0, 0, 0),
            });
            currentLineY -= lineHeight;
          }
        }
      });
    }

    // Update currentY to the bottom of the form for this service
    // Ensure we don't go below the footer margin
    const formBottom = Math.min(formLeftY, summaryBoxY) - 20;
    currentY = Math.max(formBottom, footerMargin);
  } // End of service loop

  // SERVICE ENTRIES SECTION removed - using new format above instead

  // ============================================
  // FOOTER ON ALL PAGES
  // ============================================
  const pages = pdfDoc.getPages();
  for (let index = 0; index < pages.length; index++) {
    const pdfPage = pages[index];
    // Footer background line
    pdfPage.drawLine({
      start: { x: margin, y: margin + 20 },
      end: { x: pageWidth - margin, y: margin + 20 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    // Required footer text
    pdfPage.drawText("HCA 13-0126 (2/25)", {
      x: margin,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Page numbers
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - margin - textWidth,
      y: margin / 2 + 5,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Close shared browser instance if it was created (before PDF save to free resources)
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
      console.log(`[PDF] ✅ Closed shared Puppeteer browser instance`);
    } catch (closeError) {
      console.warn(
        `[PDF] ⚠️ Error closing shared browser: ${closeError.message}`
      );
    }
  }

  // Generate PDF buffer
  // Wrap save in try-catch to handle fontkit buffer errors during width computation
  try {
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (saveError) {
    // Check if error is related to font buffer issues
    const errorMsg = saveError.message || String(saveError);
    const errorStack = saveError.stack || "";
    const isFontBufferError =
      (errorMsg.includes("buffer") ||
        errorMsg.includes("RangeError") ||
        errorMsg.includes("Trying to access beyond") ||
        errorStack.includes("fontkit") ||
        errorStack.includes("CustomFontEmbedder")) &&
      isDancingScriptLoaded;

    if (isFontBufferError && !options.forceItalicFont) {
      // Font causes issues during save - try Regular font if we used SemiBold
      const loadedFontVariant = options.loadedFontVariant || "unknown";
      console.error(
        `[PDF] ❌ Dancing Script ${loadedFontVariant} font causes buffer error during save`
      );
      console.error(`[PDF] Error: ${errorMsg.substring(0, 150)}`);

      // If we loaded SemiBold, try Regular instead
      if (loadedFontVariant === "SemiBold" && !options.triedRegular) {
        console.log(
          `[PDF] 🔄 SemiBold font incompatible - trying Regular font instead...`
        );
        return await generateBatchLogsPdf(batchData, createdLogs, user, {
          forceItalicFont: false,
          triedRegular: true,
          triedFont: "Regular",
        });
      }

      // If Regular also fails or we've already tried it, fall back to italic
      console.log(
        `[PDF] 🔄 Regenerating PDF without Dancing Script font (using italic instead)...`
      );
      return await generateBatchLogsPdf(batchData, createdLogs, user, {
        forceItalicFont: true,
      });
    }

    // Re-throw if it's not a font-related error, or if we're already using italic
    throw saveError;
  }
}

/**
 * Generate PDF for existing behavioral logs by ID
/**
 * Build filename for behavioral/CBHS PDF per client spec:
 * "[Bill Type] for [Initials] at [Facility] for [Month] [Year].pdf"
 * Client: "CBHS/ILOS Bill for member's initials at facility name for X month(s) year"
 * @param {Object} params
 * @param {string} residentName - Full resident name (e.g., "John Doe")
 * @param {string} facilityName - Facility/tenant name
 * @param {string|null} selectedTier - Tier from log (e.g., "Tier 1 (.5-2)", "ILOS T1")
 * @param {Array<string>} dateKeys - Array of YYYY-MM-DD dates from logs
 * @returns {string} Filename (e.g., "CBHS Bill for JD at Central Hospital for August 2025.pdf")
 */
function buildBehavioralPdfFileName(
  residentName,
  facilityName,
  selectedTier,
  dateKeys
) {
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Bill Type: ILOS if tier contains "ILOS", else CBHS
  const isILOS =
    selectedTier && String(selectedTier).toUpperCase().includes("ILOS");
  let billType = isILOS ? "ILOS Bill" : "CBHS Bill";
  if (selectedTier && selectedTier.trim()) {
    billType += ` - ${selectedTier.trim()}`;
  }

  // Member initials: first letter of first word + first letter of last word
  let initials = "XX";
  if (residentName && typeof residentName === "string") {
    const parts = residentName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      initials = parts[0][0].toUpperCase();
    }
  }

  // Facility: sanitize for filename
  const facility = (facilityName || "Unknown Facility")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim();

  // Month(s) Year: from date keys
  let monthYearPart = "Unknown";
  if (dateKeys && dateKeys.length > 0) {
    const monthYears = new Map(); // year -> Set of month indices
    dateKeys.forEach((dk) => {
      const [y, m] = dk.split("-").map(Number);
      if (!monthYears.has(y)) monthYears.set(y, new Set());
      monthYears.get(y).add(m - 1); // 0-indexed
    });
    const sortedYears = Array.from(monthYears.keys()).sort((a, b) => a - b);
    if (sortedYears.length === 1) {
      const months = Array.from(monthYears.get(sortedYears[0])).sort(
        (a, b) => a - b
      );
      if (months.length === 1) {
        monthYearPart = `${MONTHS[months[0]]} ${sortedYears[0]}`;
      } else {
        monthYearPart = `${MONTHS[months[0]]}-${
          MONTHS[months[months.length - 1]]
        } ${sortedYears[0]}`;
      }
    } else {
      const firstY = sortedYears[0];
      const lastY = sortedYears[sortedYears.length - 1];
      const firstMonths = Array.from(monthYears.get(firstY)).sort(
        (a, b) => a - b
      );
      const lastMonths = Array.from(monthYears.get(lastY)).sort(
        (a, b) => a - b
      );
      monthYearPart = `${MONTHS[firstMonths[0]]} ${firstY}-${
        MONTHS[lastMonths[lastMonths.length - 1]]
      } ${lastY}`;
    }
  }

  const raw = `${billType} for ${initials} at ${facility} for ${monthYearPart}.pdf`;
  // Sanitize for Content-Disposition: remove/replace chars that break headers
  return raw.replace(/["\\]/g, "'").replace(/[\r\n]/g, " ");
}

/**
 * Creates a PDF with service entries from existing logs (same format as batch PDF)
 * @param {Array<string>} logIds - Array of log IDs to generate PDF for
 * @param {Object} user - Current user
 * @returns {Promise<{ pdfBuffer: Buffer, fileName: string }>} PDF buffer and filename
 */
async function generateLogsPdfByIds(logIds, user) {
  if (!logIds || logIds.length === 0) {
    throw new Error("No log IDs provided to generate PDF");
  }

  // Get the logs from database with full details
  const logs = await prisma.behavioralLog.findMany({
    where: {
      id: { in: logIds },
      ...(user.role !== "SUPER_ADMIN" && { tenantId: user.tenantId }),
      deletedAt: null,
    },
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      dateTime: "asc", // Sort by date/time
    },
  });

  if (logs.length === 0) {
    throw new Error("No logs found to generate PDF");
  }

  // Group logs by resident and date to create batch-like structure
  const logsByResidentDate = new Map();
  logs.forEach((log) => {
    const logDate = new Date(log.dateTime);
    const dateKey = logDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const key = `${log.residentId}-${dateKey}`;

    if (!logsByResidentDate.has(key)) {
      logsByResidentDate.set(key, {
        residentId: log.residentId,
        date: dateKey,
        logs: [],
      });
    }
    logsByResidentDate.get(key).logs.push(log);
  });

  // For now, we'll generate PDF for the first group (most common case: single log)
  // If multiple groups exist, we'll use the first one
  const firstGroup = Array.from(logsByResidentDate.values())[0];
  const residentId = firstGroup.residentId;
  const date = firstGroup.date;
  const groupLogs = firstGroup.logs;

  // Determine tenantId
  const tenantId = groupLogs[0]?.tenantId || user.tenantId;
  if (!tenantId) {
    throw new Error("tenantId is required to generate PDF");
  }

  // Get selectedTier from the first log (all logs in a batch should have the same tier)
  const selectedTier = groupLogs[0]?.selectedTier || null;

  // Create mock batch data structure
  const batchData = {
    residentId,
    date,
    tenantId,
    selectedTier, // Pass the selected tier from the log
    services: groupLogs.map((log, index) => {
      // Extract date from log's dateTime
      const logDate = new Date(log.dateTime);
      const dateKey = logDate.toISOString().split("T")[0]; // YYYY-MM-DD

      // Extract signature from staffNotes (same logic as batch function)
      let serviceSignature = "";
      if (log.staffNotes) {
        const signatureMatch = log.staffNotes.match(
          /Signature:\s*(.+?)(?:\s*\||$)/
        );
        if (signatureMatch) {
          serviceSignature = signatureMatch[1].trim();
        }
      }
      // Fallback to staff name if no signature found
      if (!serviceSignature && log.staffName) {
        serviceSignature = log.staffName;
      }

      return {
        index: index + 1,
        date: dateKey, // Include date for each service
        timeOrDuration: log.duration || "",
        observedBehaviors: log.observedBehaviors || [log.behaviorType],
        interventions: log.interventions || [],
        residentExplanation: log.residentExplanation || "",
        staffName: log.staffName || "",
        signature: serviceSignature, // Use extracted signature
        outcome: log.outcome || "",
        summary: log.staffNotes || "", // Use staffNotes as summary if available
      };
    }),
  };

  // Create mock createdLogs array
  const createdLogs = groupLogs.map((log, index) => ({
    id: log.id,
    index: index + 1,
  }));

  // Get resident name for filename
  const { getResidentName } = require("./behavioral.service");
  const residentName = await getResidentName(residentId, tenantId);

  // Build filename per client spec: "[Bill Type] for [Initials] at [Facility] for [Month] [Year].pdf"
  const facilityName = groupLogs[0]?.tenant?.name || "Unknown Facility";
  const dateKeys = groupLogs.map((log) => {
    const d = new Date(log.dateTime);
    return d.toISOString().split("T")[0];
  });
  const fileName = buildBehavioralPdfFileName(
    residentName,
    facilityName,
    selectedTier,
    dateKeys
  );

  // Use existing generateBatchLogsPdf function
  const pdfBuffer = await generateBatchLogsPdf(batchData, createdLogs, user);

  return { pdfBuffer, fileName };
}

module.exports = {
  exportBehavioralReportToPdf,
  generateBatchLogsPdf,
  generateLogsPdfByIds,
  buildBehavioralPdfFileName,
};

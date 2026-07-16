const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { getCarePlanById } = require("./care-plan.service");
const { getVersions } = require("./care-plan-version.service");
const { getCarePlans } = require("./care-plan.service");
const { logCarePlanAction } = require("../compliance/audit.service");

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
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return "N/A";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format date and time for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date and time string
 */
function formatDateTime(date) {
  if (!date) return "N/A";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Export care plan to PDF
 * Generates a comprehensive PDF document with full care plan details
 * @param {string} carePlanId - Care plan ID
 * @param {Object} options - Export options
 * @param {boolean} options.includeVersionHistory - Include version history (default: false)
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportCarePlanToPdf(carePlanId, options = {}, requestingUser) {
  // Get care plan with all relations
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  if (!carePlan) {
    throw new Error("Care plan not found");
  }

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page dimensions
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  const sectionSpacing = 20;
  const lineHeight = 15;

  // Track current Y position
  let currentY = pageHeight - margin;
  let currentPage = page;

  // Helper function to add new page if needed
  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Get tenant name
  const tenantName = carePlan.tenant?.name || "Unknown Facility";

  // ============================================
  // HEADER SECTION
  // ============================================
  // Modern header without background
  currentPage.drawText("Nursing Care Plan", {
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

  currentPage.drawText(`Resident: ${carePlan.residentName || carePlan.residentId}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  if (carePlan.title) {
    currentPage.drawText(`Title: ${carePlan.title}`, {
      x: margin,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    currentY -= 16;
  }

  currentPage.drawText(`Status: ${carePlan.status}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  if (carePlan.lastReviewedAt) {
    currentPage.drawText(`Last Reviewed: ${formatDate(carePlan.lastReviewedAt)}`, {
      x: margin,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    currentY -= 16;
  }

  if (carePlan.nextReviewDate) {
    currentPage.drawText(`Next Review: ${formatDate(carePlan.nextReviewDate)}`, {
      x: margin,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    currentY -= 16;
  }

  if (carePlan.approvedBy) {
    currentPage.drawText(
      `Approved: ${formatDate(carePlan.approvedAt)} by ${carePlan.approvedByName || "Unknown"}`,
      {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
      }
    );
    currentY -= 16;
  }

  currentPage.drawText(`Created: ${formatDate(carePlan.createdAt)} by ${carePlan.createdByName || "Unknown"}`, {
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
  // DESCRIPTION SECTION
  // ============================================
  if (carePlan.description) {
    const descPage = checkNewPage(60);
    if (descPage !== currentPage) {
      currentPage = descPage;
      currentY = pageHeight - margin;
    }

    currentPage.drawText("Description", {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 20;

    const descLines = wrapText({
      text: carePlan.description,
      maxWidth: pageWidth - margin * 2,
      font,
      fontSize: 10,
    });

    for (const line of descLines) {
      const descPageCheck = checkNewPage(15);
      if (descPageCheck !== currentPage) {
        currentPage = descPageCheck;
        currentY = pageHeight - margin;
      }
      currentPage.drawText(line, {
        x: margin + 10,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= lineHeight;
    }

    currentY -= sectionSpacing;
  }

  // ============================================
  // PROBLEMS SECTION
  // ============================================
  const problems = carePlan.problems || [];
  if (problems.length > 0) {
    const problemsPage = checkNewPage(100);
    if (problemsPage !== currentPage) {
      currentPage = problemsPage;
      currentY = pageHeight - margin;
    }

    currentPage.drawText("Problems / Diagnoses", {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 25;

    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i];
      const problemPage = checkNewPage(150);
      if (problemPage !== currentPage) {
        currentPage = problemPage;
        currentY = pageHeight - margin;
      }

      // Problem header
      currentPage.drawText(`${i + 1}. ${problem.title || "Problem"}`, {
        x: margin + 10,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      currentY -= 18;

      // Problem details
      if (problem.category) {
        currentPage.drawText(`Category: ${problem.category}`, {
          x: margin + 20,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= 15;
      }

      if (problem.priority) {
        currentPage.drawText(`Priority: ${problem.priority}`, {
          x: margin + 20,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= 15;
      }

      if (problem.diagnosisCode) {
        currentPage.drawText(`Diagnosis Code: ${problem.diagnosisCode}`, {
          x: margin + 20,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= 15;
      }

      if (problem.onsetDate) {
        currentPage.drawText(`Onset Date: ${formatDate(problem.onsetDate)}`, {
          x: margin + 20,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= 15;
      }

      if (problem.description) {
        const descLines = wrapText({
          text: problem.description,
          maxWidth: pageWidth - margin * 2 - 20,
          font,
          fontSize: 10,
        });

        for (const line of descLines) {
          const descPageCheck = checkNewPage(15);
          if (descPageCheck !== currentPage) {
            currentPage = descPageCheck;
            currentY = pageHeight - margin;
          }
          currentPage.drawText(line, {
            x: margin + 20,
            y: currentY,
            size: 10,
            font: font,
            color: rgb(0, 0, 0),
          });
          currentY -= lineHeight;
        }
      }

      // Goals for this problem
      const goals = problem.goals || [];
      if (goals.length > 0) {
        currentY -= 10;
        const goalsPage = checkNewPage(100);
        if (goalsPage !== currentPage) {
          currentPage = goalsPage;
          currentY = pageHeight - margin;
        }

        currentPage.drawText("Goals:", {
          x: margin + 30,
          y: currentY,
          size: 11,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= 20;

        for (let j = 0; j < goals.length; j++) {
          const goal = goals[j];
          const goalPage = checkNewPage(120);
          if (goalPage !== currentPage) {
            currentPage = goalPage;
            currentY = pageHeight - margin;
          }

          // Goal header
          currentPage.drawText(
            `${String.fromCharCode(97 + j)}. ${goal.description || "Goal"}`,
            {
              x: margin + 40,
              y: currentY,
              size: 11,
              font: boldFont,
              color: rgb(0, 0, 0),
            }
          );
          currentY -= 18;

          // Goal status
          currentPage.drawText(`Status: ${goal.status}`, {
            x: margin + 50,
            y: currentY,
            size: 10,
            font: font,
            color: rgb(0, 0, 0),
          });
          currentY -= 15;

          if (goal.targetDate) {
            currentPage.drawText(`Target Date: ${formatDate(goal.targetDate)}`, {
              x: margin + 50,
              y: currentY,
              size: 10,
              font: font,
              color: rgb(0, 0, 0),
            });
            currentY -= 15;
          }

          if (goal.achievedDate) {
            currentPage.drawText(`Achieved Date: ${formatDate(goal.achievedDate)}`, {
              x: margin + 50,
              y: currentY,
              size: 10,
              font: font,
              color: rgb(0, 0, 0),
            });
            currentY -= 15;
          }

          if (goal.evaluationNotes) {
            const evalLines = wrapText({
              text: goal.evaluationNotes,
              maxWidth: pageWidth - margin * 2 - 50,
              font,
              fontSize: 9,
            });

            for (const line of evalLines) {
              const evalPageCheck = checkNewPage(12);
              if (evalPageCheck !== currentPage) {
                currentPage = evalPageCheck;
                currentY = pageHeight - margin;
              }
              currentPage.drawText(`Evaluation: ${line}`, {
                x: margin + 50,
                y: currentY,
                size: 9,
                font: font,
                color: rgb(0.3, 0.3, 0.3),
              });
              currentY -= 12;
            }
          }

          // Interventions for this goal
          const interventions = goal.interventions || [];
          if (interventions.length > 0) {
            currentY -= 8;
            const intPage = checkNewPage(80);
            if (intPage !== currentPage) {
              currentPage = intPage;
              currentY = pageHeight - margin;
            }

            currentPage.drawText("Interventions:", {
              x: margin + 60,
              y: currentY,
              size: 10,
              font: boldFont,
              color: rgb(0, 0, 0),
            });
            currentY -= 18;

            for (let k = 0; k < interventions.length; k++) {
              const intervention = interventions[k];
              const intPageCheck = checkNewPage(60);
              if (intPageCheck !== currentPage) {
                currentPage = intPageCheck;
                currentY = pageHeight - margin;
              }

              currentPage.drawText(
                `${k + 1}. ${intervention.description || "Intervention"}`,
                {
                  x: margin + 70,
                  y: currentY,
                  size: 10,
                  font: font,
                  color: rgb(0, 0, 0),
                }
              );
              currentY -= 15;

              if (intervention.frequency) {
                currentPage.drawText(`Frequency: ${intervention.frequency}`, {
                  x: margin + 80,
                  y: currentY,
                  size: 9,
                  font: font,
                  color: rgb(0.4, 0.4, 0.4),
                });
                currentY -= 12;
              }

              if (intervention.responsibleRole) {
                currentPage.drawText(`Responsible: ${intervention.responsibleRole}`, {
                  x: margin + 80,
                  y: currentY,
                  size: 9,
                  font: font,
                  color: rgb(0.4, 0.4, 0.4),
                });
                currentY -= 12;
              }

              if (intervention.notes) {
                const notesLines = wrapText({
                  text: intervention.notes,
                  maxWidth: pageWidth - margin * 2 - 80,
                  font,
                  fontSize: 9,
                });

                for (const line of notesLines) {
                  const notesPageCheck = checkNewPage(12);
                  if (notesPageCheck !== currentPage) {
                    currentPage = notesPageCheck;
                    currentY = pageHeight - margin;
                  }
                  currentPage.drawText(line, {
                    x: margin + 80,
                    y: currentY,
                    size: 9,
                    font: font,
                    color: rgb(0.3, 0.3, 0.3),
                  });
                  currentY -= 12;
                }
              }

              currentY -= 5;
            }
          }

          currentY -= 10;
        }
      }

      currentY -= sectionSpacing;
    }
  } else {
    const noProblemsPage = checkNewPage(30);
    if (noProblemsPage !== currentPage) {
      currentPage = noProblemsPage;
      currentY = pageHeight - margin;
    }

    currentPage.drawText("No problems documented", {
      x: margin + 10,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    currentY -= 20;
  }

  // ============================================
  // VERSION HISTORY SECTION (if requested)
  // ============================================
  if (options.includeVersionHistory) {
    try {
      const versions = await getVersions(carePlanId, requestingUser);
      if (versions && versions.length > 0) {
        const versionPage = checkNewPage(100);
        if (versionPage !== currentPage) {
          currentPage = versionPage;
          currentY = pageHeight - margin;
        }

        currentPage.drawText("Version History", {
          x: margin,
          y: currentY,
          size: 14,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= 25;

        for (const version of versions.slice(0, 10)) {
          // Limit to last 10 versions
          const vPage = checkNewPage(40);
          if (vPage !== currentPage) {
            currentPage = vPage;
            currentY = pageHeight - margin;
          }

          currentPage.drawText(
            `Version ${version.version} - ${formatDateTime(version.createdAt)} by ${version.creatorName || "Unknown"}`,
            {
              x: margin + 10,
              y: currentY,
              size: 10,
              font: font,
              color: rgb(0, 0, 0),
            }
          );
          currentY -= 15;

          if (version.changeDescription) {
            const changeLines = wrapText({
              text: version.changeDescription,
              maxWidth: pageWidth - margin * 2 - 20,
              font,
              fontSize: 9,
            });

            for (const line of changeLines) {
              const changePageCheck = checkNewPage(12);
              if (changePageCheck !== currentPage) {
                currentPage = changePageCheck;
                currentY = pageHeight - margin;
              }
              currentPage.drawText(line, {
                x: margin + 20,
                y: currentY,
                size: 9,
                font: font,
                color: rgb(0.4, 0.4, 0.4),
              });
              currentY -= 12;
            }
          }

          currentY -= 10;
        }
      }
    } catch (error) {
      console.error("Error including version history:", error);
      // Continue without version history
    }
  }

  // Log audit event
  try {
    logCarePlanAction({
      action: "CARE_PLAN_EXPORTED",
      userId: requestingUser.id,
      tenantId: carePlan.tenantId,
      resourceId: carePlan.id,
      req: null,
      metadata: {
        includeVersionHistory: options.includeVersionHistory || false,
      },
    });
  } catch (error) {
    console.warn("Failed to log audit event:", error);
  }

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export version history to PDF
 * Generates a PDF document comparing care plan versions
 * @param {string} carePlanId - Care plan ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportVersionHistoryToPdf(carePlanId, requestingUser) {
  // Get care plan
  const carePlan = await getCarePlanById(carePlanId, requestingUser);

  if (!carePlan) {
    throw new Error("Care plan not found");
  }

  // Get all versions
  const versions = await getVersions(carePlanId, requestingUser);

  if (!versions || versions.length === 0) {
    throw new Error("No version history found");
  }

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page dimensions
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  const lineHeight = 15;

  // Track current Y position
  let currentY = pageHeight - margin;
  let currentPage = page;

  // Helper function to add new page if needed
  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Get tenant name
  const tenantName = carePlan.tenant?.name || "Unknown Facility";

  // ============================================
  // HEADER SECTION
  // ============================================
  // Modern header without background
  currentPage.drawText("Care Plan Version History", {
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

  currentPage.drawText(`Resident: ${carePlan.residentName || carePlan.residentId}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  if (carePlan.title) {
    currentPage.drawText(`Care Plan: ${carePlan.title}`, {
      x: margin,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    currentY -= 16;
  }

  currentPage.drawText(`Generated: ${generatedAt}`, {
    x: margin,
    y: currentY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  currentY -= 30;

  // ============================================
  // VERSION LIST
  // ============================================
  for (const version of versions) {
    const vPage = checkNewPage(80);
    if (vPage !== currentPage) {
      currentPage = vPage;
      currentY = pageHeight - margin;
    }

    // Version header
    currentPage.drawText(
      `Version ${version.version} - ${formatDateTime(version.createdAt)}`,
      {
        x: margin,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      }
    );
    currentY -= 18;

    currentPage.drawText(`Created by: ${version.creatorName || "Unknown"}`, {
      x: margin + 10,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    currentY -= 15;

    if (version.changeDescription) {
      const changeLines = wrapText({
        text: version.changeDescription,
        maxWidth: pageWidth - margin * 2 - 20,
        font,
        fontSize: 10,
      });

      for (const line of changeLines) {
        const changePageCheck = checkNewPage(15);
        if (changePageCheck !== currentPage) {
          currentPage = changePageCheck;
          currentY = pageHeight - margin;
        }
        currentPage.drawText(line, {
          x: margin + 20,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0.3, 0.3, 0.3),
        });
        currentY -= 15;
      }
    }

    currentY -= 20;
  }

  // Log audit event
  try {
    logCarePlanAction({
      action: "CARE_PLAN_VERSION_HISTORY_EXPORTED",
      userId: requestingUser.id,
      tenantId: carePlan.tenantId,
      resourceId: carePlan.id,
      req: null,
      metadata: {
        versionCount: versions.length,
      },
    });
  } catch (error) {
    console.warn("Failed to log audit event:", error);
  }

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export care plan summary report
 * Generates a PDF summary of all care plans for a resident
 * @param {string} residentId - Resident ID
 * @param {Object} dateRange - Date range filter (optional)
 * @param {Date} dateRange.startDate - Start date
 * @param {Date} dateRange.endDate - End date
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportCarePlanSummary(residentId, dateRange = {}, requestingUser) {
  // Build filters
  const filters = {
    residentId,
    page: 1,
    limit: 100, // Get all care plans for the resident
  };

  if (dateRange.startDate) {
    filters.dateFrom = dateRange.startDate;
  }
  if (dateRange.endDate) {
    filters.dateTo = dateRange.endDate;
  }

  // Get all care plans
  const result = await getCarePlans(filters, requestingUser);
  const carePlans = result.carePlans || [];

  if (carePlans.length === 0) {
    throw new Error("No care plans found for this resident");
  }

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page dimensions
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  const sectionSpacing = 20;
  const lineHeight = 15;

  // Track current Y position
  let currentY = pageHeight - margin;
  let currentPage = page;

  // Helper function to add new page if needed
  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Get resident name and tenant name from first care plan
  const residentName = carePlans[0]?.residentName || residentId;
  const tenantName = carePlans[0]?.tenant?.name || requestingUser.tenant?.name || "Unknown Facility";

  // Date range
  let dateRangeText = "All Care Plans";
  if (dateRange.startDate || dateRange.endDate) {
    const fromDate = dateRange.startDate
      ? formatDate(dateRange.startDate)
      : "Start";
    const toDate = dateRange.endDate ? formatDate(dateRange.endDate) : "End";
    dateRangeText = `${fromDate} to ${toDate}`;
  }

  // ============================================
  // HEADER SECTION
  // ============================================
  // Modern header without background
  currentPage.drawText("Care Plan Summary Report", {
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

  currentPage.drawText(`Total Care Plans: ${carePlans.length}`, {
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
  // SUMMARY STATISTICS
  // ============================================
  const summaryPage = checkNewPage(100);
  if (summaryPage !== currentPage) {
    currentPage = summaryPage;
    currentY = pageHeight - margin;
  }

  currentPage.drawText("Summary Statistics", {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 25;

  // Calculate statistics
  const activePlans = carePlans.filter((cp) => cp.status === "Active").length;
  const archivedPlans = carePlans.filter((cp) => cp.status === "Archived").length;
  const draftPlans = carePlans.filter((cp) => cp.status === "Draft").length;

  let totalProblems = 0;
  let totalGoals = 0;
  let totalInterventions = 0;

  carePlans.forEach((cp) => {
    const problems = cp.problems || [];
    totalProblems += problems.length;
    problems.forEach((p) => {
      const goals = p.goals || [];
      totalGoals += goals.length;
      goals.forEach((g) => {
        const interventions = g.interventions || [];
        totalInterventions += interventions.length;
      });
    });
  });

  currentPage.drawText(`Active Plans: ${activePlans}`, {
    x: margin + 10,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= 15;

  currentPage.drawText(`Archived Plans: ${archivedPlans}`, {
    x: margin + 10,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= 15;

  currentPage.drawText(`Draft Plans: ${draftPlans}`, {
    x: margin + 10,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  currentPage.drawText(`Total Problems: ${totalProblems}`, {
    x: margin + 10,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= 15;

  currentPage.drawText(`Total Goals: ${totalGoals}`, {
    x: margin + 10,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= 15;

  currentPage.drawText(`Total Interventions: ${totalInterventions}`, {
    x: margin + 10,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });
  currentY -= sectionSpacing * 2;

  // ============================================
  // CARE PLAN LIST
  // ============================================
  currentPage.drawText("Care Plans", {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 25;

  for (let i = 0; i < carePlans.length; i++) {
    const cp = carePlans[i];
    const cpPage = checkNewPage(100);
    if (cpPage !== currentPage) {
      currentPage = cpPage;
      currentY = pageHeight - margin;
    }

    // Care plan header
    currentPage.drawText(`${i + 1}. ${cp.title || "Care Plan"}`, {
      x: margin + 10,
      y: currentY,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 18;

    currentPage.drawText(`Status: ${cp.status}`, {
      x: margin + 20,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    currentY -= 15;

    currentPage.drawText(`Created: ${formatDate(cp.createdAt)}`, {
      x: margin + 20,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    currentY -= 15;

    if (cp.lastReviewedAt) {
      currentPage.drawText(`Last Reviewed: ${formatDate(cp.lastReviewedAt)}`, {
        x: margin + 20,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 15;
    }

    if (cp.nextReviewDate) {
      currentPage.drawText(`Next Review: ${formatDate(cp.nextReviewDate)}`, {
        x: margin + 20,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 15;
    }

    // Count problems, goals, interventions
    const problems = cp.problems || [];
    const problemCount = problems.length;
    let goalCount = 0;
    let interventionCount = 0;

    problems.forEach((p) => {
      const goals = p.goals || [];
      goalCount += goals.length;
      goals.forEach((g) => {
        const interventions = g.interventions || [];
        interventionCount += interventions.length;
      });
    });

    currentPage.drawText(
      `Problems: ${problemCount}, Goals: ${goalCount}, Interventions: ${interventionCount}`,
      {
        x: margin + 20,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0.4, 0.4, 0.4),
      }
    );
    currentY -= 20;
  }

  // Log audit event
  try {
    logCarePlanAction({
      action: "CARE_PLAN_SUMMARY_EXPORTED",
      userId: requestingUser.id,
      tenantId: requestingUser.tenantId,
      resourceId: residentId,
      req: null,
      metadata: {
        carePlanCount: carePlans.length,
        dateRange: dateRangeText,
      },
    });
  } catch (error) {
    console.warn("Failed to log audit event:", error);
  }

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  exportCarePlanToPdf,
  exportVersionHistoryToPdf,
  exportCarePlanSummary,
};


const prisma = require("../../lib/prisma");
const { getTenantFilter } = require("../../middlewares/tenant.middleware");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { validateResidentId } = require("../resident/resident.service");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Create new note
 * STAFF can create notes for residents in their tenant
 * ADMIN/SUPER_ADMIN can create notes for any resident
 */
async function createNote(data, requestingUser, tenantIdFromQuery = null) {
  // Determine tenantId
  let tenantId = null;

  // For SUPER_ADMIN, can specify tenantId in query, otherwise use their tenant (or query param)
  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = tenantIdFromQuery || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("tenantId is required when creating note as SUPER_ADMIN");
    }
  } else {
    // Others: use their tenant
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to create notes");
    }
  }

  // Validate that residentId exists and belongs to the tenant
  const isValidResident = await validateResidentId(
    data.residentId.trim(),
    tenantId
  );

  if (!isValidResident) {
    throw new Error(
      "Resident not found or does not belong to your organization"
    );
  }

  // Validate prisma client
  if (!prisma?.note) {
    console.error("[NOTE] Prisma client not initialized");
    throw new Error(
      "Database client not initialized. Please regenerate Prisma client."
    );
  }

  // Create note with currentVersion 0
  const note = await prisma.note.create({
    data: {
      residentId: data.residentId.trim(),
      residentName: data.residentName || null, // Optional: store resident name for display
      staffId: requestingUser.id,
      tenantId,
      type: data.type,
      description: data.description,
      currentVersion: 0, // Version starts at 0
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

  // Create version 0 (initial version snapshot)
  await prisma.noteVersion.create({
    data: {
      noteId: note.id,
      version: 0,
      residentId: note.residentId,
      residentName: note.residentName,
      staffId: note.staffId,
      tenantId: note.tenantId,
      type: note.type,
      description: note.description,
      createdBy: requestingUser.id,
    },
  });

  return note;
}

/**
 * Get notes with filtering (tenant-scoped)
 * Supports filters: residentId, type, dateFrom, dateTo
 * STAFF/GUARDIAN: see only their own notes (unless ADMIN)
 * ADMIN: see all notes in their tenant
 * SUPER_ADMIN: see all notes (optionally filter by tenantId)
 */
async function getNotes(user, filters = {}) {
  const {
    page = 1,
    limit = 10,
    residentId,
    type,
    dateFrom,
    dateTo,
    tenantId, // From query param (SUPER_ADMIN only)
  } = filters;

  const skip = (page - 1) * limit;

  // Build tenant filter
  let tenantWhere = {};
  if (user.role === "SUPER_ADMIN") {
    // SUPER_ADMIN can filter by tenantId from query or see all
    if (tenantId) {
      tenantWhere = { tenantId };
    }
    // else no filter = all tenants
  } else {
    // Others: filter by their tenant (from user)
    tenantWhere = { tenantId: user.tenantId };
  }

  // Build date filter
  const dateFilter = {};
  if (dateFrom) {
    dateFilter.gte = new Date(dateFrom);
  }
  if (dateTo) {
    dateFilter.lte = new Date(dateTo);
  }

  // Build where clause
  const where = {
    ...tenantWhere,
    ...(residentId && { residentId }),
    ...(type && { type }),
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    // Filter out soft-deleted notes
    deletedAt: null,
  };

  // Guardians can only see their own notes
  if (user.role === "GUARDIAN") {
    where.staffId = user.id;
  }

  // Check if prisma client is properly initialized
  if (!prisma?.note) {
    console.error(
      "[NOTE] Prisma client not initialized or Note model not available"
    );
    console.error("[NOTE] Try running: npx prisma generate");
    throw new Error(
      "Database client not initialized. Please regenerate Prisma client."
    );
  }

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        residentId: true,
        residentName: true,
        staffId: true,
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        type: true,
        description: true,
        currentVersion: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            versions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.note.count({ where }),
  ]);

  return {
    notes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get note by ID with version history
 */
async function getNoteById(noteId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: noteId,
    ...tenantWhere,
    // Filter out soft-deleted notes
    deletedAt: null,
  };

  // Guardians can only see their own notes
  if (requestingUser.role === "GUARDIAN") {
    where.staffId = requestingUser.id;
  }

  const note = await prisma.note.findFirst({
    where,
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
      versions: {
        include: {
          staff: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          version: "desc", // Latest version first
        },
      },
    },
  });

  if (!note) {
    throw new Error("Note not found or access denied");
  }

  return note;
}

/**
 * Update note (creates new version, increments version number)
 * STAFF can only edit their own notes
 * ADMIN can edit any note in their tenant
 * SUPER_ADMIN can edit any note
 */
async function updateNote(noteId, newDescription, requestingUser) {
  // Get existing note
  const existingNote = await getNoteById(noteId, requestingUser);

  // Check permissions for STAFF
  if (requestingUser.role === "STAFF" || requestingUser.role === "GUARDIAN") {
    if (existingNote.staffId !== requestingUser.id) {
      throw new Error("You can only edit your own notes");
    }
  }

  // Validate new description
  if (!newDescription?.trim()) {
    throw new Error("Description cannot be empty");
  }

  // Calculate new version number
  const newVersion = existingNote.currentVersion + 1;

  // Create version record (full snapshot of the note at this version)
  await prisma.noteVersion.create({
    data: {
      noteId: noteId,
      version: newVersion,
      residentId: existingNote.residentId,
      residentName: existingNote.residentName,
      staffId: existingNote.staffId, // Original staff who created the note
      tenantId: existingNote.tenantId,
      type: existingNote.type,
      description: newDescription.trim(), // New description for this version
      createdBy: requestingUser.id, // User who created this version (editor)
    },
  });

  // Update note (increment currentVersion, update description)
  const updatedNote = await prisma.note.update({
    where: { id: noteId },
    data: {
      description: newDescription.trim(),
      currentVersion: newVersion,
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
      versions: {
        include: {
          staff: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          version: "desc", // Latest version first
        },
      },
    },
  });

  return updatedNote;
}

/**
 * Delete note (soft delete)
 * Sets deletedAt timestamp but preserves the note and all versions for audit compliance.
 * Only administrators may delete notes.
 */
async function deleteNote(noteId, requestingUser) {
  await getNoteById(noteId, requestingUser);

  if (requestingUser.role !== "ADMIN" && requestingUser.role !== "SUPER_ADMIN") {
    throw new Error("Only an administrator can delete this.");
  }

  // Soft delete: set deletedAt timestamp (note and versions remain in DB)
  const deletedNote = await prisma.note.update({
    where: { id: noteId },
    data: {
      deletedAt: new Date(),
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

  return deletedNote;
}

/**
 * Export notes to PDF
 * Generates a PDF report with filtered notes
 */
async function exportNotesToPdf(user, filters = {}) {
  // Get all notes matching filters (no pagination for export)
  // tenantId in filters comes from query param for SUPER_ADMIN
  // Explicitly set page=1 to ensure we get all notes from the first page
  const notesResult = await getNotes(user, {
    ...filters,
    page: 1,
    limit: 10000,
  });

  if (notesResult.notes.length === 0) {
    throw new Error("No notes found to export");
  }

  const notes = notesResult.notes;

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
  let currentY = pageHeight - margin;
  let currentPage = page;

  // Column widths and positions (needed for checkNewPage function)
  const contentWidth = pageWidth - margin * 2;
  const baseColWidths = {
    date: 80,
    time: 70,
    type: 90,
    staff: 90,
  };
  const fixedColumnsTotal =
    baseColWidths.date +
    baseColWidths.time +
    baseColWidths.type +
    baseColWidths.staff;
  const descriptionWidth = Math.max(contentWidth - fixedColumnsTotal, 160);

  const colWidths = {
    ...baseColWidths,
    description: descriptionWidth,
  };

  const colX = {
    date: margin,
    time: margin + colWidths.date,
    type: margin + colWidths.date + colWidths.time,
    staff: margin + colWidths.date + colWidths.time + colWidths.type,
    description:
      margin +
      colWidths.date +
      colWidths.time +
      colWidths.type +
      colWidths.staff,
  };

  // Helper function to add new page if needed and redraw header
  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < margin + 50) {
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = pageHeight - margin;
      currentPage = newPage;

      // Redraw table header on new page
      const headerHeight = 24;
      newPage.drawRectangle({
        x: margin,
        y: currentY - headerHeight,
        width: contentWidth,
        height: headerHeight,
        color: rgb(0.906, 0.971, 0.821), // Sage green
      });

      const headers = ["Date", "Time", "Note Type", "Staff", "Description"];
      headers.forEach((header, idx) => {
        const x = Object.values(colX)[idx];
        const maxWidth = Object.values(colWidths)[idx] - 4;
        const headerText = wrapText({
          text: header,
          maxWidth,
          font: semiBoldFont,
          fontSize: 10,
        });
        newPage.drawText(headerText[0] || header, {
          x: x + 6,
          y: currentY - 16,
          size: 10,
          font: semiBoldFont,
          color: rgb(0, 0, 0),
        });

        // Draw subtle column separator (except for last column)
        if (idx < headers.length - 1) {
          const separatorX = x + Object.values(colWidths)[idx];
          newPage.drawLine({
            start: { x: separatorX, y: currentY - headerHeight + 2 },
            end: { x: separatorX, y: currentY - 2 },
            thickness: 0.5,
            color: rgb(0.4, 0.4, 0.4),
          });
        }
      });
      currentY -= headerHeight;

      // Subtle line under headers
      newPage.drawLine({
        start: { x: margin, y: currentY },
        end: { x: pageWidth - margin, y: currentY },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      currentY -= 0; // No space between header and body

      return newPage;
    }
    return currentPage;
  };

  // Helper function to get resident display name
  const getResidentDisplayName = (note) => {
    if (note.residentName) {
      return note.residentName;
    }
    // Fallback: use residentId if name not available
    if (note.residentId && note.residentId.length > 8) {
      return `Resident ID: ${note.residentId.substring(0, 8)}...`;
    }
    return note.residentId || "Unknown Resident";
  };

  // Get header information
  const tenantName = notes[0]?.tenant?.name || "All Facilities";

  // Get resident name: from filter or from first note
  let residentName = "All Residents";
  if (filters.residentId) {
    const filteredNote = notes.find((n) => n.residentId === filters.residentId);
    if (filteredNote) {
      residentName = getResidentDisplayName(filteredNote);
    }
  } else if (notes.length > 0 && notes[0].residentName) {
    // If single resident or all notes are for same resident, show that
    const firstResidentId = notes[0].residentId;
    const allSameResident = notes.every(
      (n) => n.residentId === firstResidentId
    );
    if (allSameResident) {
      residentName = getResidentDisplayName(notes[0]);
    }
  }

  // Modern header without background
  currentPage.drawText("Progress Notes", {
    x: margin,
    y: currentY,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0), // Black text
  });
  currentY -= 30;

  // Get date range: from filters or from note dates
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
  } else if (notes.length > 0) {
    // If no date filter, use date range from notes
    const dates = notes.map((n) => new Date(n.createdAt)).sort((a, b) => a - b);
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

  // Modern table header with professional styling
  const headerHeight = 24;
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.906, 0.971, 0.821), // #88DB1B33 - Light green tint (transparent green approximated)
  });

  const headers = ["Date", "Time", "Note Type", "Staff", "Description"];
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
  for (const note of notes) {
    const noteDate = new Date(note.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const noteTime = new Date(note.createdAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const staffName =
      (note.staff && (note.staff.name || note.staff.email)) ||
      note.staffId ||
      "Unknown";
    const type = note.type;
    const cleanedDescription = (note.description || "")
      .replace(/\r/g, "")
      .replace(/\n+/g, " ")
      .trim();

    // Calculate max lines needed for this row and store wrapped text for each cell
    const values = [noteDate, noteTime, type, staffName, cleanedDescription];
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
      // Description column (index 4) can have unlimited lines, other columns limited to 3
      const limitedLines = idx === 4 ? lines : lines.slice(0, 3);
      cellLines.push(limitedLines);
      maxLines = Math.max(maxLines, limitedLines.length);
    });

    // Increased row height for better spacing (more padding)
    const lineHeight = 12;
    const verticalPadding = 10; // Top and bottom padding
    const rowHeight = maxLines * lineHeight + verticalPadding * 2;
    currentPage = checkNewPage(rowHeight + 12);

    // Draw row background (alternating between light gray and sage green)
    const rowIndex = notes.indexOf(note);
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

  // Generate PDF buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

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
 * Generate progress note using AI
 * Takes a prompt and note type, generates a professional progress note description
 */
async function generateNoteWithAI(prompt, noteType) {
  const systemInstructions = `You are a professional medical documentation assistant specializing in assisted living facility (AFH) progress notes. Your task is to generate clear, concise, and professional progress notes based on the information provided.

IMPORTANT GUIDELINES:
1. Professional Tone: Write in a professional, objective, clinical tone suitable for healthcare documentation.
2. HIPAA Compliance: Do not include identifying information beyond what is necessary for the note. Do not add names, MRNs, addresses, or other PHI unless explicitly provided and required.
3. Clarity: Use clear, simple language that is easy to understand.
4. Completeness: Include relevant details from the prompt, but be concise.
5. Accuracy: Only include information that can be reasonably inferred from the prompt. Do not fabricate details.
6. Tense & Voice: Use past tense for completed actions. Use third person (e.g., "Resident", "Staff") when applicable.

OUTPUT RULES (MANDATORY):
- For CARE notes only: Output MUST follow the SOAP structure with exactly these labeled sections, each on its own line and in this order:
  S – Subjective:
  O – Objective:
  A – Assessment:
  P – Plan:
  Each section should contain 1–4 concise sentences (expand only if situation is complex). Keep labels exactly as shown (including the en dash and colon). Do NOT include any other headings, metadata, or explanations.
- For BEHAVIOR notes: Output MUST use the DAR (Data – Action – Response) format with exactly these labeled sections, each on its own line and in this order:
  D – Data:
  A – Action:
  R – Response:
  D – Data: time of event, exact behavior observed (what you saw/heard), duration/frequency if relevant, safety if any. Facts only. No opinions, assumptions, or diagnoses.
  A – Action: staff interventions (redirection, reassurance, offers of care or medication, care plan strategies, notifications). Document what staff did.
  R – Response: resident outcome (how they responded; whether behavior improved, continued, or stopped; safety outcome).
  Use AFH-appropriate language: use "declined" or "refused" when documenting care refusal; never use "non-compliant." Be objective, observable, neutral, and inspection-safe. Return ONLY the DAR note text. No markdown, no extra commentary, no prefixes, no trailing signatures.
- For other non-CARE notes (Incident, StatusUpdate): follow the note type guidance provided in the user prompt.
- Return ONLY the note text. No markdown, no additional commentary, no prefixes, no trailing signatures.
- Length: typically 50–500 words overall, but use clinical judgment for complex incidents.
- If times/dates/vitals are provided in the input, include them in the appropriate SOAP section. If not provided, do not invent them.
- If the input is insufficient, create a concise, conservative note based only on given facts.

EXAMPLE (format the AI should follow for Care notes):
S – Subjective:
Resident reports mild knee pain this morning and says it felt stiff when getting out of bed. No new complaints overnight.
O – Objective:
Observed resident ambulating slowly without assistance; no visible swelling. Vitals within baseline.
A – Assessment:
Mild knee discomfort consistent with chronic arthritis; no signs of acute injury.
P – Plan:
Encourage gentle stretching, apply warm compress PRN, monitor for changes, and notify nursing if pain worsens or mobility declines.`;

  // Build user prompt with note type context
  const noteTypeContext = {
    Care: "Generate a SOAP-formatted care progress note. Use the SOAP structure with exact labels: 'S – Subjective:', 'O – Objective:', 'A – Assessment:', 'P – Plan:'. Each section should be concise (1-4 sentences) and clinically focused on care activities, treatments, medications, vital signs, and the resident's response to care. Return ONLY the SOAP text—no extra commentary or markdown.",
    Behavior:
      "Generate a BEHAVIOR note in DAR format (D – Data:, A – Action:, R – Response:). If the information describes care refusal (e.g. declined shower, refused medication, turned away from hygiene or dressing), use the Care Refusal pattern: D – time and what resident declined/refused; A – what staff offered and that they followed care plan; R – resident outcome. Use phrases like 'Resident declined a shower when offered' or 'Resident refused medication by pushing the pill cup away'—use 'declined' or 'refused' only, never 'non-compliant.' For other behavior, use general DAR: D – time and exact behavior observed; A – staff interventions (redirection, reassurance, offers, care plan); R – how resident responded. Return ONLY the DAR text—no markdown or commentary.",
    Incident:
      "Generate an incident report note. Focus on what happened, when, where, who was involved, actions taken, and follow-up required.",
    StatusUpdate:
      "Generate a status update note. Focus on current status, changes from baseline, and overall condition.",
  };

  const userPrompt = `${
    noteTypeContext[noteType] || "Generate a progress note."
  }

Information provided:
${prompt}

Generate a professional progress note based on the above information.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14",
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7, // Balanced creativity and consistency
      max_tokens: 2000, // Allow for detailed notes
    });

    const generatedNote = completion.choices[0].message.content.trim();

    // Remove any markdown formatting if present
    const cleanedNote = generatedNote
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```$/g, "")
      .trim();

    return cleanedNote;
  } catch (error) {
    console.error("[AI Note Generation] Error:", error);
    throw new Error(
      `Failed to generate note: ${error.message || "AI service unavailable"}`
    );
  }
}

module.exports = {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  exportNotesToPdf,
  generateNoteWithAI,
};

const prisma = require("../../lib/prisma");
const { getTenantFilter } = require("../../middlewares/tenant.middleware");
const { PDFDocument, rgb } = require("pdf-lib");
const letterheadPdf = require("../document/letterheadPdf.service");
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
 * Supports filters: noteId, noteIds, residentId, type, dateFrom, dateTo
 * STAFF/GUARDIAN: see only their own notes (unless ADMIN)
 * ADMIN: see all notes in their tenant
 * SUPER_ADMIN: see all notes (optionally filter by tenantId)
 */
async function getNotes(user, filters = {}) {
  const {
    page = 1,
    limit = 10,
    noteId,
    noteIds,
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
    ...(noteId
      ? { id: noteId }
      : Array.isArray(noteIds) && noteIds.length > 0
        ? { id: { in: noteIds } }
        : {}),
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

  const pdfDoc = await PDFDocument.create();
  const tenantId = filters.tenantId || user.tenantId;
  const letterheadAssets = await letterheadPdf.prepareLetterheadAssets(
    pdfDoc,
    tenantId,
    filters.facilityId
  );
  let currentPage = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
  const font = letterheadAssets.fonts.font;
  const boldFont = letterheadAssets.fonts.boldFont;
  const margin = 50;
  const pageWidth = currentPage.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const bottomMin = letterheadPdf.contentBottomMin(letterheadAssets);
  let currentY = letterheadAssets.contentStartY - 6;

  /** Compact typography for a cleaner clinical report look */
  const FS = {
    title: 18,
    subtitle: 9,
    dateHeading: 12,
    summaryHeader: 8,
    summaryValue: 10,
    cardHeader: 9,
    sectionTitle: 8.5,
    body: 8.5,
  };
  const SP = {
    afterTitle: 18,
    afterSubtitle: 12,
    afterSummary: 12,
    minBeforeDate: 22,
    /** Extra vertical space above each date section title */
    beforeDateHeading: 16,
    afterDateLabel: 8,
    cardTopPad: 3,
    cardBottomPad: 10,
    cardHeaderH: 20,
    cardInnerPadX: 10,
    wrapPadX: 20,
    /** Gap between section heading baseline and first body line */
    sectionTitleBodyGap: 11,
    /** Body line leading (~1.5× font size at 8.5pt) */
    bodyLine: 13,
    /** Space after last body line before next section */
    betweenSections: 6,
    /** Space above each section heading (including first, under grey bar) */
    beforeSectionHeading: 5,
  };

  const colorText = rgb(0.16, 0.18, 0.2);
  const colorMuted = rgb(0.5, 0.54, 0.58);
  const colorBorder = rgb(0.86, 0.88, 0.9);
  const colorSage = rgb(0.906, 0.971, 0.821);

  const getResidentDisplayName = (note) => {
    if (note.residentName) return note.residentName;
    if (note.residentId && note.residentId.length > 8) {
      return `Resident ${note.residentId.substring(0, 8)}...`;
    }
    return note.residentId || "Unknown Resident";
  };

  const ensureSpace = (requiredSpace) => {
    if (currentY - requiredSpace < bottomMin) {
      currentPage = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
      currentY = letterheadAssets.contentStartY;
    }
  };

  const formatDateLabel = (iso) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const formatRange = () => {
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
      return `${fromDate} – ${toDate}`;
    }
    if (notes.length === 0) return "All Dates";
    const sortedDates = notes.map((n) => new Date(n.createdAt)).sort((a, b) => a - b);
    const fromDate = sortedDates[0].toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const toDate = sortedDates[sortedDates.length - 1].toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${fromDate} – ${toDate}`;
  };

  const normalizeDescription = (text) =>
    (text || "")
      .replace(/\r/g, "")
      .replace(
        /\s+(?=(S\s*[–-]\s*Subjective:|O\s*[–-]\s*Objective:|A\s*[–-]\s*Assessment:|P\s*[–-]\s*Plan:|D\s*[–-]\s*Data:|A\s*[–-]\s*Action:|R\s*[–-]\s*Response:|CLINICAL SUMMARY:|ASSESSMENT:|INTERVENTIONS:|RESIDENT RESPONSE:|CLINICAL JUSTIFICATION:|PLAN:))/gi,
        "\n"
      )
      .trim();

  const parseSections = (text) => {
    const lines = normalizeDescription(text)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const sections = [];
    let current = null;
    const headingRegex =
      /^([A-Za-z][A-Za-z\s]{1,40}|[SOAPDR]\s*[–-]\s*[A-Za-z\s]{2,40})\s*:\s*(.*)$/;
    for (const line of lines) {
      const m = line.match(headingRegex);
      if (m) {
        if (current) sections.push(current);
        current = {
          title: m[1].replace(/\s+/g, " ").toUpperCase(),
          body: m[2] ? [m[2].trim()] : [],
        };
      } else if (current) {
        current.body.push(line);
      } else {
        current = { title: "NOTE", body: [line] };
      }
    }
    if (current) sections.push(current);
    if (sections.length === 0) {
      return [{ title: "NOTE", body: [normalizeDescription(text) || "No details provided."] }];
    }
    return sections.map((s) => ({ ...s, body: [s.body.join(" ").trim()] }));
  };

  // Title
  currentPage.drawText("Progress Notes", {
    x: margin,
    y: currentY,
    size: FS.title,
    font: boldFont,
    color: colorText,
  });
  currentY -= SP.afterTitle;

  // Subtitle
  let residentName = "All Residents";
  if (filters.residentId) {
    const filtered = notes.find((n) => n.residentId === filters.residentId);
    if (filtered) residentName = getResidentDisplayName(filtered);
  } else if (notes.length > 0) {
    const firstResidentId = notes[0].residentId;
    const allSameResident = notes.every((n) => n.residentId === firstResidentId);
    if (allSameResident) residentName = getResidentDisplayName(notes[0]);
  }
  currentPage.drawText(`Resident: ${residentName} | Date Range: ${formatRange()}`, {
    x: margin,
    y: currentY,
    size: FS.subtitle,
    font,
    color: colorMuted,
  });
  currentY -= SP.afterSubtitle;

  // Summary strip
  const summary = {
    total: notes.length,
    behavior: notes.filter((n) => n.type === "Behavior").length,
    care: notes.filter((n) => n.type === "Care").length,
    critical: notes.filter((n) => n.type === "Incident").length,
  };
  const summaryHeaders = ["Total Notes", "Behavior", "Care", "Critical"];
  const summaryValues = [summary.total, summary.behavior, summary.care, summary.critical];
  const cellW = contentWidth / 4;
  const headerH = 18;
  const valueH = 20;
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerH,
    width: contentWidth,
    height: headerH,
    color: colorSage,
  });
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerH - valueH,
    width: contentWidth,
    height: valueH,
    borderColor: colorBorder,
    borderWidth: 1,
  });
  for (let i = 0; i < 4; i += 1) {
    const cx = margin + i * cellW;
    if (i > 0) {
      currentPage.drawLine({
        start: { x: cx, y: currentY - headerH - valueH },
        end: { x: cx, y: currentY },
        thickness: 0.8,
        color: colorBorder,
      });
    }
    const h = summaryHeaders[i];
    const hWidth = boldFont.widthOfTextAtSize(h, FS.summaryHeader);
    currentPage.drawText(h, {
      x: cx + (cellW - hWidth) / 2,
      y: currentY - 11,
      size: FS.summaryHeader,
      font: boldFont,
      color: rgb(0.35, 0.37, 0.38),
    });
    const v = String(summaryValues[i]);
    const vWidth = boldFont.widthOfTextAtSize(v, FS.summaryValue);
    currentPage.drawText(v, {
      x: cx + (cellW - vWidth) / 2,
      y: currentY - headerH - 11,
      size: FS.summaryValue,
      font: boldFont,
      color: colorText,
    });
  }
  currentY -= headerH + valueH + SP.afterSummary;

  // Group by date
  const byDate = new Map();
  for (const note of notes) {
    const key = new Date(note.createdAt).toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(note);
  }
  const sortedDateKeys = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  for (const dateKey of sortedDateKeys) {
    ensureSpace(SP.beforeDateHeading + SP.minBeforeDate);
    currentY -= SP.beforeDateHeading;
    currentPage.drawText(formatDateLabel(dateKey), {
      x: margin,
      y: currentY,
      size: FS.dateHeading,
      font: boldFont,
      color: colorText,
    });
    currentY -= SP.afterDateLabel;

    for (const note of byDate.get(dateKey)) {
      const sections = parseSections(note.description);
      const timeLabel = new Date(note.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const staffName =
        (note.staff && (note.staff.name || note.staff.email)) || note.staffId || "Unknown";
      const headerText = `${timeLabel} | ${note.type} Support Note | Staff: ${staffName}`;

      const innerW = contentWidth - SP.wrapPadX;
      let cardH = SP.cardHeaderH + 10;
      for (const sec of sections) {
        const bodyLines = wrapText({
          text: sec.body[0] || "",
          maxWidth: innerW,
          font,
          fontSize: FS.body,
        });
        cardH +=
          SP.beforeSectionHeading +
          SP.sectionTitleBodyGap +
          Math.max(1, bodyLines.length) * SP.bodyLine +
          SP.betweenSections;
      }
      ensureSpace(cardH + SP.cardBottomPad + 4);

      const cardTopY = currentY - SP.cardTopPad;
      const cardBottomY = cardTopY - cardH;
      currentPage.drawRectangle({
        x: margin,
        y: cardBottomY,
        width: contentWidth,
        height: cardH,
        borderColor: colorBorder,
        borderWidth: 1,
      });
      currentPage.drawRectangle({
        x: margin,
        y: cardTopY - SP.cardHeaderH,
        width: contentWidth,
        height: SP.cardHeaderH,
        color: rgb(0.95, 0.96, 0.95),
      });
      currentPage.drawText(headerText, {
        x: margin + SP.cardInnerPadX,
        y: cardTopY - SP.cardHeaderH / 2 - FS.cardHeader * 0.35,
        size: FS.cardHeader,
        font: boldFont,
        color: colorText,
      });

      let sectionY = cardTopY - SP.cardHeaderH - 10;
      for (const sec of sections) {
        sectionY -= SP.beforeSectionHeading;
        const bodyLines = wrapText({
          text: sec.body[0] || "",
          maxWidth: innerW,
          font,
          fontSize: FS.body,
        });
        currentPage.drawText(sec.title, {
          x: margin + SP.cardInnerPadX,
          y: sectionY,
          size: FS.sectionTitle,
          font: boldFont,
          color: colorText,
        });
        sectionY -= SP.sectionTitleBodyGap;
        for (const line of bodyLines) {
          currentPage.drawText(line, {
            x: margin + SP.cardInnerPadX,
            y: sectionY,
            size: FS.body,
            font,
            color: rgb(0.22, 0.24, 0.26),
          });
          sectionY -= SP.bodyLine;
        }
        sectionY -= SP.betweenSections;
      }

      currentY = cardBottomY - SP.cardBottomPad;
    }
  }

  letterheadPdf.stampPageNumbers(pdfDoc, font, margin);

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

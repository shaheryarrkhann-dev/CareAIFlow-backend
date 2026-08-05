const {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  exportNotesToPdf,
  generateNoteWithAI,
} = require("../../services/note/note.service");
const { logNoteAction } = require("../../services/compliance/audit.service");

/**
 * Create new note
 * POST /api/notes
 */
async function createNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, residentName, type, description } = req.body;

    // Get tenantId from query or body (for SUPER_ADMIN) or use user's tenant
    // For SUPER_ADMIN: allow tenantId in query or body, fallback to user's tenant
    // For others: use user's tenant (enforced by middleware)
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    const note = await createNote(
      {
        residentId: residentId.trim(),
        residentName: residentName?.trim() || null,
        type,
        description: description.trim(),
      },
      req.user,
      tenantIdFromQuery
    );

    // Log audit event
    logNoteAction({
      action: "NOTE_CREATED",
      userId: req.user.id,
      tenantId: note.tenantId,
      resourceId: note.id,
      req,
      metadata: {
        residentId: note.residentId,
        type: note.type,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Note created successfully",
      note,
    });
  } catch (err) {
    console.error("Create note error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create note",
    });
  }
}

/**
 * Get notes with filtering
 * GET /api/notes
 */
async function getNotesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      page = 1,
      limit = 10,
      residentId,
      type,
      dateFrom,
      dateTo,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 10, 100), // Max 100
      ...(residentId && { residentId }),
      ...(type && { type }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      // tenantId from query param (enforced by middleware for non-SUPER_ADMIN)
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const result = await getNotes(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get notes error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve notes",
    });
  }
}

/**
 * Get note by ID with version history
 * GET /api/notes/:id
 */
async function getNoteByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const note = await getNoteById(id, req.user);

    return res.status(200).json({
      success: true,
      note,
    });
  } catch (err) {
    console.error("Get note by ID error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message || "Note not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve note",
    });
  }
}

/**
 * Update note (creates version)
 * PUT /api/notes/:id
 */
async function updateNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { description } = req.body;

    // Validation done in routes via express-validator
    const note = await updateNote(id, description.trim(), req.user);

    // Log audit event
    logNoteAction({
      action: "NOTE_UPDATED",
      userId: req.user.id,
      tenantId: note.tenantId,
      resourceId: note.id,
      req,
      metadata: {
        residentId: note.residentId,
        type: note.type,
        version: note.currentVersion,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Note updated successfully",
      note,
    });
  } catch (err) {
    console.error("Update note error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied") ||
      err.message.includes("only edit your own")
    ) {
      return res.status(403).json({
        success: false,
        message: err.message || "Access denied",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update note",
    });
  }
}

/**
 * Export notes to PDF
 * GET /api/notes/export
 */
async function exportNotesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      noteId,
      noteIds,
      residentId,
      type,
      dateFrom,
      dateTo,
      tenantId,
      facilityId,
    } =
      req.query;

    const parsedNoteIds =
      typeof noteIds === "string" && noteIds.trim().length > 0
        ? noteIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : [];

    // tenantId from query param (for SUPER_ADMIN) - enforced by middleware
    const filters = {
      ...(noteId && { noteId }),
      ...(parsedNoteIds.length > 0 && { noteIds: parsedNoteIds }),
      ...(residentId && { residentId }),
      ...(type && { type }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
      ...(facilityId && { facilityId }),
    };

    const pdfBuffer = await exportNotesToPdf(req.user, filters);

    // Log audit event
    logNoteAction({
      action: "NOTE_EXPORTED",
      userId: req.user.id,
      tenantId:
        req.user.role === "SUPER_ADMIN" && filters.tenantId
          ? filters.tenantId
          : req.user.tenantId,
      req,
      metadata: {
        filters: {
          residentId: filters.residentId,
          noteId: filters.noteId,
          type: filters.type,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
        fileName: `progress-notes-${
          new Date().toISOString().split("T")[0]
        }.pdf`,
      },
    });

    // Set response headers for PDF download
    const fileName = `progress-notes-${
      new Date().toISOString().split("T")[0]
    }.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Export notes error:", err);
    if (err.message.includes("No notes found")) {
      return res.status(404).json({
        success: false,
        message: err.message || "No notes found to export",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export notes",
    });
  }
}

/**
 * Delete note (soft delete)
 * DELETE /api/notes/:id
 */
async function deleteNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    const note = await deleteNote(id, req.user);

    // Log audit event
    logNoteAction({
      action: "NOTE_DELETED",
      userId: req.user.id,
      tenantId: note.tenantId,
      resourceId: note.id,
      req,
      metadata: {
        residentId: note.residentId,
        type: note.type,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Note deleted successfully",
      note,
    });
  } catch (err) {
    console.error("Delete note error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied") ||
      err.message.includes("only delete your own")
    ) {
      return res.status(403).json({
        success: false,
        message: err.message || "Access denied",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete note",
    });
  }
}

/**
 * Generate note with AI
 * POST /api/notes/generate
 */
async function generateNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { prompt, type } = req.body;

    // Generate note using AI
    const generatedDescription = await generateNoteWithAI(prompt, type);

    return res.status(200).json({
      success: true,
      message: "Note generated successfully",
      data: {
        description: generatedDescription,
        type,
        prompt,
      },
    });
  } catch (err) {
    console.error("Generate note error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate note",
    });
  }
}

module.exports = {
  createNote: createNoteHandler,
  getNotes: getNotesHandler,
  getNoteById: getNoteByIdHandler,
  updateNote: updateNoteHandler,
  deleteNote: deleteNoteHandler,
  exportNotes: exportNotesHandler,
  generateNote: generateNoteHandler,
};

const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const noteController = require("../../controllers/note/note.controller");
const {
  createNoteValidator,
  updateNoteValidator,
  getNotesValidator,
  exportNotesValidator,
  noteIdValidator,
  generateNoteValidator,
} = require("../../validators/note.validators");

// All routes require authentication and PROGRESS_NOTES:view (aligned with frontend Progress Notes)
router.use(authenticate());
router.use(requirePermission("PROGRESS_NOTES", "view"));

/**
 * POST /api/notes
 * Create new progress note
 * Roles: All authenticated users (STAFF, ADMIN, GUARDIAN, SUPER_ADMIN)
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(createNoteValidator),
  noteController.createNote
);

/**
 * POST /api/notes/generate
 * Generate progress note using AI
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.post(
  "/generate",
  validate(generateNoteValidator),
  noteController.generateNote
);

/**
 * GET /api/notes/export
 * Export notes to PDF
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 * tenantId can be in query param for SUPER_ADMIN
 */
router.get(
  "/export",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(exportNotesValidator),
  noteController.exportNotes
);

/**
 * GET /api/notes
 * Get notes with filtering
 * Roles: All authenticated users
 * Query params: page, limit, residentId, type, dateFrom, dateTo, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getNotesValidator),
  noteController.getNotes
);

/**
 * GET /api/notes/:id
 * Get note by ID with version history
 * Roles: All authenticated users
 */
router.get("/:id", validate(noteIdValidator), noteController.getNoteById);

/**
 * PUT /api/notes/:id
 * Update note (creates new version)
 * Roles: All authenticated users
 * STAFF can only edit their own notes
 */
router.put("/:id", validate(updateNoteValidator), noteController.updateNote);

/**
 * DELETE /api/notes/:id
 * Delete note (soft delete - preserves note and versions for compliance)
 * Only administrators
 */
router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(noteIdValidator),
  noteController.deleteNote
);

module.exports = router;

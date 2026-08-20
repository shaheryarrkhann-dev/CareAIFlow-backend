const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const behavioralController = require("../../controllers/behavioral/behavioral.controller");
const {
  createBehavioralLogValidator,
  createBehavioralLogsBatchValidator,
  updateBehavioralLogValidator,
  getBehavioralLogsValidator,
  behavioralLogIdValidator,
  generateBehavioralNoteValidator,
  generateSummaryValidator,
  generateOutcomeValidator,
  updateBehavioralNoteValidator,
  behavioralNoteIdValidator,
  getBehavioralNotesValidator,
  getBehavioralDashboardValidator,
  getBehaviorTrendsValidator,
  exportBehavioralReportValidator,
} = require("../../validators/behavioral.validators");

// All routes require authentication and BEHAVIORAL:view (aligned with frontend Behavioral section)
router.use(authenticate());
router.use(requirePermission("BEHAVIORAL", "view"));
router.use(
  require("../../middlewares/plan-entitlement.middleware").requirePlanModule(
    "advancedCareBilling",
  ),
);

/**
 * POST /api/behavioral/logs
 * Create new behavioral log entry
 * Roles: All authenticated users (STAFF, ADMIN, GUARDIAN, SUPER_ADMIN)
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 */
router.post(
  "/logs",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(createBehavioralLogValidator),
  behavioralController.createBehavioralLog
);

/**
 * POST /api/behavioral/logs/batch
 * Create multiple behavioral log entries in batch
 * Roles: All authenticated users (STAFF, ADMIN, GUARDIAN, SUPER_ADMIN)
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 * Returns PDF as base64 in response
 */
router.post(
  "/logs/batch",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(createBehavioralLogsBatchValidator),
  behavioralController.createBehavioralLogsBatch
);

/**
 * POST /api/behavioral/logs/generate-summary
 * Generate summary for a service entry using AI
 * Roles: All authenticated users
 */
router.post(
  "/logs/generate-summary",
  validate(generateSummaryValidator),
  behavioralController.generateSummary
);

/**
 * POST /api/behavioral/logs/generate-interventions
 * Generate interventions for a custom behavior using AI
 * Roles: All authenticated users
 */
router.post(
  "/logs/generate-interventions",
  behavioralController.generateInterventions
);

/**
 * POST /api/behavioral/logs/generate-outcome
 * Generate outcome paragraph based on observed behaviors (and optional interventions)
 * Roles: All authenticated users
 */
router.post(
  "/logs/generate-outcome",
  validate(generateOutcomeValidator),
  behavioralController.generateOutcome
);

/**
 * GET /api/behavioral/logs
 * Get behavioral logs with filtering
 * Roles: All authenticated users
 * Query params: page, limit, residentId, behaviorType, severity, dateFrom, dateTo, staffId, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/logs",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getBehavioralLogsValidator),
  behavioralController.getBehavioralLogs
);

/**
 * GET /api/behavioral/logs/:id/pdf
 * Generate PDF for behavioral log(s) by ID
 * Roles: All authenticated users
 * Supports single ID or comma-separated IDs
 */
router.get(
  "/logs/:id/pdf",
  validate(behavioralLogIdValidator),
  behavioralController.generateLogPdf
);

/**
 * GET /api/behavioral/logs/:id
 * Get behavioral log by ID
 * Roles: All authenticated users
 */
router.get(
  "/logs/:id",
  validate(behavioralLogIdValidator),
  behavioralController.getBehavioralLogById
);

/**
 * PUT /api/behavioral/logs/:id
 * Update behavioral log
 * Roles: All authenticated users
 * STAFF can only edit within 24 hours
 */
router.put(
  "/logs/:id",
  validate(updateBehavioralLogValidator),
  behavioralController.updateBehavioralLog
);

/**
 * DELETE /api/behavioral/logs/:id
 * Delete behavioral log (soft delete)
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.delete(
  "/logs/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(behavioralLogIdValidator),
  behavioralController.deleteBehavioralLog
);

/**
 * GET /api/behavioral/dashboard
 * Get behavioral dashboard summary
 * Roles: All authenticated users
 * Query params: residentId, month, year, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/dashboard",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getBehavioralDashboardValidator),
  behavioralController.getBehavioralDashboard
);

/**
 * POST /api/behavioral/notes/generate
 * Generate behavioral note using AI
 * Roles: All authenticated users
 * Must be defined BEFORE /notes/:id route to avoid route conflicts
 */
router.post(
  "/notes/generate",
  enforceTenantIsolation("tenantId"), // Validates tenantId from body if provided
  validate(generateBehavioralNoteValidator),
  behavioralController.generateBehavioralNote
);

/**
 * GET /api/behavioral/notes
 * Get behavioral notes with filtering and pagination
 * Roles: All authenticated users
 * Query params: page, limit, residentId, startDate, endDate, tenantId (SUPER_ADMIN only)
 * Must be defined BEFORE /notes/:id route to avoid route conflicts
 */
router.get(
  "/notes",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getBehavioralNotesValidator),
  behavioralController.getBehavioralNotes
);

/**
 * POST /api/behavioral/notes/:id/regenerate
 * Regenerate behavioral note using AI
 * Roles: All authenticated users
 * Must be defined BEFORE /notes/:id route to avoid route conflicts
 */
router.post(
  "/notes/:id/regenerate",
  validate(behavioralNoteIdValidator),
  behavioralController.regenerateBehavioralNote
);

/**
 * GET /api/behavioral/notes/:id
 * Get behavioral note by ID with version history
 * Roles: All authenticated users
 */
router.get(
  "/notes/:id",
  validate(behavioralNoteIdValidator),
  behavioralController.getBehavioralNoteById
);

/**
 * PUT /api/behavioral/notes/:id
 * Update behavioral note (manual edit)
 * Roles: All authenticated users
 */
router.put(
  "/notes/:id",
  validate(updateBehavioralNoteValidator),
  behavioralController.updateBehavioralNote
);

/**
 * GET /api/behavioral/trends
 * Get behavior trends analysis
 * Roles: All authenticated users
 * Query params: residentId, startDate, endDate, type, tenantId (SUPER_ADMIN only)
 * type: 'comprehensive', 'frequency', 'severity', 'triggers', 'escalations'
 */
router.get(
  "/trends",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getBehaviorTrendsValidator),
  behavioralController.getBehaviorTrends
);

/**
 * GET /api/behavioral/export
 * Export behavioral report to PDF
 * Roles: All authenticated users
 * Must be defined BEFORE /:id routes to avoid route conflicts
 * Query params: residentId, behaviorType, severity, dateFrom, dateTo, tenantId (SUPER_ADMIN only)
 * Note: Will be fully implemented in Phase 9
 */
router.get(
  "/export",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(exportBehavioralReportValidator),
  behavioralController.exportBehavioralReport
);

module.exports = router;

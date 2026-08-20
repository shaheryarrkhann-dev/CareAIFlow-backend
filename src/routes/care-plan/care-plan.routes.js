const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const carePlanController = require("../../controllers/care-plan/care-plan.controller");
const {
  createCarePlanValidator,
  updateCarePlanValidator,
  carePlanIdValidator,
  getCarePlansValidator,
  residentIdValidator,
  addProblemValidator,
  updateProblemValidator,
  problemIdValidator,
  addGoalValidator,
  updateGoalValidator,
  goalIdValidator,
  addInterventionValidator,
  updateInterventionValidator,
  interventionIdValidator,
  versionIdValidator,
  compareVersionsValidator,
  rollbackToVersionValidator,
  getAlertsValidator,
  alertIdValidator,
  scheduleReviewReminderValidator,
  detectProblemsValidator,
  generateDraftValidator,
  detectProblemsFromNotesValidator,
} = require("../../validators/care-plan.validators");

// All routes require authentication and CARE_PLANS:view (aligned with frontend Care Plans)
router.use(authenticate());
router.use(requirePermission("CARE_PLANS", "view"));
router.use(
  require("../../middlewares/plan-entitlement.middleware").requirePlanModule(
    "advancedCareBilling",
  ),
);

/**
 * POST /api/care-plans
 * Create new care plan
 * Roles: All authenticated users (STAFF, ADMIN, GUARDIAN, SUPER_ADMIN)
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(createCarePlanValidator),
  carePlanController.createCarePlanHandler
);

/**
 * GET /api/care-plans
 * Get care plans with filtering
 * Roles: All authenticated users
 * Query params: page, limit, residentId, status, createdBy, dateFrom, dateTo, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getCarePlansValidator),
  carePlanController.getCarePlansHandler
);

/**
 * GET /api/care-plans/dashboard/resident/:residentId
 * Get care plan dashboard for resident
 * Roles: All authenticated users
 * Must be defined BEFORE /resident/:residentId/active route to avoid route conflicts
 */
router.get(
  "/dashboard/resident/:residentId",
  validate(residentIdValidator),
  carePlanController.getCarePlanDashboardHandler
);

/**
 * GET /api/care-plans/statistics
 * Get care plan statistics
 * Roles: All authenticated users
 * Query params: startDate, endDate, tenantId (SUPER_ADMIN only)
 * Must be defined BEFORE /resident/:residentId route to avoid route conflicts
 */
router.get(
  "/statistics",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  carePlanController.getCarePlanStatisticsHandler
);

/**
 * GET /api/care-plans/resident/:residentId/active
 * Get active care plan for resident
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/resident/:residentId/active",
  validate(residentIdValidator),
  carePlanController.getActiveCarePlanHandler
);

/**
 * GET /api/care-plans/resident/:residentId/export-summary
 * Export care plan summary for resident
 * Roles: All authenticated users
 * Query params: startDate, endDate (optional)
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/resident/:residentId/export-summary",
  validate(residentIdValidator),
  carePlanController.exportCarePlanSummaryHandler
);

/**
 * GET /api/care-plans/:id/export
 * Export care plan to PDF
 * Roles: All authenticated users
 * Query params: includeVersionHistory (optional, default: false)
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/:id/export",
  validate(carePlanIdValidator),
  carePlanController.exportCarePlanHandler
);

/**
 * GET /api/care-plans/:id/export-versions
 * Export version history to PDF
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/:id/export-versions",
  validate(carePlanIdValidator),
  carePlanController.exportVersionHistoryHandler
);

/**
 * GET /api/care-plans/:id/goal-progress
 * Get goal progress tracking
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/:id/goal-progress",
  validate(carePlanIdValidator),
  carePlanController.getGoalProgressHandler
);

/**
 * GET /api/care-plans/:id/intervention-compliance
 * Get intervention compliance
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/:id/intervention-compliance",
  validate(carePlanIdValidator),
  carePlanController.getInterventionComplianceHandler
);

/**
 * GET /api/care-plans/:id
 * Get care plan by ID
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  validate(carePlanIdValidator),
  carePlanController.getCarePlanByIdHandler
);

/**
 * PUT /api/care-plans/:id
 * Update care plan
 * Roles: All authenticated users
 */
router.put(
  "/:id",
  validate(updateCarePlanValidator),
  carePlanController.updateCarePlanHandler
);

/**
 * DELETE /api/care-plans/:id
 * Archive care plan (soft delete)
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(carePlanIdValidator),
  carePlanController.archiveCarePlanHandler
);

/**
 * POST /api/care-plans/:id/problems
 * Add problem to care plan
 * Roles: All authenticated users
 */
router.post(
  "/:id/problems",
  validate(addProblemValidator),
  carePlanController.addProblemHandler
);

/**
 * PUT /api/care-plans/problems/:problemId
 * Update problem
 * Roles: All authenticated users
 */
router.put(
  "/problems/:problemId",
  validate(updateProblemValidator),
  carePlanController.updateProblemHandler
);

/**
 * DELETE /api/care-plans/problems/:problemId
 * Remove problem (soft delete)
 * Roles: All authenticated users
 */
router.delete(
  "/problems/:problemId",
  requireAdminOrSuperAdminForDelete(),
  validate(problemIdValidator),
  carePlanController.removeProblemHandler
);

/**
 * POST /api/care-plans/problems/:problemId/goals
 * Add goal to problem
 * Roles: All authenticated users
 */
router.post(
  "/problems/:problemId/goals",
  validate(addGoalValidator),
  carePlanController.addGoalHandler
);

/**
 * PUT /api/care-plans/goals/:goalId
 * Update goal
 * Roles: All authenticated users
 */
router.put(
  "/goals/:goalId",
  validate(updateGoalValidator),
  carePlanController.updateGoalHandler
);

/**
 * POST /api/care-plans/goals/:goalId/interventions
 * Add intervention to goal
 * Roles: All authenticated users
 */
router.post(
  "/goals/:goalId/interventions",
  validate(addInterventionValidator),
  carePlanController.addInterventionHandler
);

/**
 * PUT /api/care-plans/interventions/:interventionId
 * Update intervention
 * Roles: All authenticated users
 */
router.put(
  "/interventions/:interventionId",
  validate(updateInterventionValidator),
  carePlanController.updateInterventionHandler
);

/**
 * DELETE /api/care-plans/interventions/:interventionId
 * Remove intervention (soft delete)
 * Roles: All authenticated users
 */
router.delete(
  "/interventions/:interventionId",
  requireAdminOrSuperAdminForDelete(),
  validate(interventionIdValidator),
  carePlanController.removeInterventionHandler
);

/**
 * GET /api/care-plans/:id/versions
 * Get versions for care plan
 * Roles: All authenticated users
 */
router.get(
  "/:id/versions",
  validate(carePlanIdValidator),
  carePlanController.getVersionsHandler
);

/**
 * GET /api/care-plans/versions/:versionId
 * Get version by ID
 * Roles: All authenticated users
 * Must be defined BEFORE /versions/compare route to avoid route conflicts
 */
router.get(
  "/versions/:versionId",
  validate(versionIdValidator),
  carePlanController.getVersionByIdHandler
);

/**
 * GET /api/care-plans/versions/compare
 * Compare two versions
 * Roles: All authenticated users
 * Query params: versionId1, versionId2
 * Must be defined AFTER /versions/:versionId route to avoid route conflicts
 */
router.get(
  "/versions/compare",
  validate(compareVersionsValidator),
  carePlanController.compareVersionsHandler
);

/**
 * POST /api/care-plans/:id/rollback
 * Rollback to version
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.post(
  "/:id/rollback",
  validate(rollbackToVersionValidator),
  carePlanController.rollbackToVersionHandler
);

/**
 * GET /api/care-plans/alerts
 * Get alerts
 * Roles: All authenticated users
 * Query params: page, limit, carePlanId, alertType, isDismissed, dateFrom, dateTo, tenantId (SUPER_ADMIN only)
 * Must be defined BEFORE /alerts/:alertId route to avoid route conflicts
 */
router.get(
  "/alerts",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getAlertsValidator),
  carePlanController.getAlertsHandler
);

/**
 * PUT /api/care-plans/alerts/:alertId/dismiss
 * Dismiss alert
 * Roles: All authenticated users
 */
router.put(
  "/alerts/:alertId/dismiss",
  validate(alertIdValidator),
  carePlanController.dismissAlertHandler
);

/**
 * POST /api/care-plans/:id/schedule-review
 * Schedule review reminder
 * Roles: All authenticated users
 */
router.post(
  "/:id/schedule-review",
  validate(scheduleReviewReminderValidator),
  carePlanController.scheduleReviewReminderHandler
);

/**
 * POST /api/care-plans/ai/detect-problems
 * Detect problems from assessment using AI
 * Roles: All authenticated users
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 * Must be defined BEFORE /ai/generate-draft route to avoid route conflicts
 */
router.post(
  "/ai/detect-problems",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(detectProblemsValidator),
  carePlanController.detectProblemsHandler
);

/**
 * POST /api/care-plans/ai/detect-problems-from-notes
 * Detect problems from progress notes using AI
 * Roles: All authenticated users
 * Must be defined BEFORE /ai/generate-draft route to avoid route conflicts
 */
router.post(
  "/ai/detect-problems-from-notes",
  validate(detectProblemsFromNotesValidator),
  carePlanController.detectProblemsFromNotesHandler
);

/**
 * POST /api/care-plans/ai/generate-draft
 * Generate care plan draft using AI
 * Roles: All authenticated users
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 */
router.post(
  "/ai/generate-draft",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(generateDraftValidator),
  carePlanController.generateDraftHandler
);

/**
 * POST /api/care-plans/:id/ai/suggest-updates
 * Suggest care plan updates using AI
 * Roles: All authenticated users
 */
router.post(
  "/:id/ai/suggest-updates",
  validate(carePlanIdValidator),
  carePlanController.suggestUpdatesHandler
);

module.exports = router;


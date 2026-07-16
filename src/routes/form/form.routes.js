const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const {
  enforceTenantIsolation,
} = require("../../middlewares/tenant.middleware");
const formController = require("../../controllers/form/form.controller");
const draftController = require("../../controllers/form/draft.controller");

// All routes require authentication and FORMS:view (aligned with frontend Forms)
router.use(authenticate());
router.use(requirePermission("FORMS", "view"));

/**
 * POST /api/forms/generate-schema
 * Generate form schema from embeddings using AI. Requires FORMS:create
 */
router.post(
  "/generate-schema",
  requirePermission("FORMS", "create"),
  enforceTenantIsolation("tenantId"),
  formController.generateSchema,
);

/**
 * GET /api/forms/schemas
 * Get all form schemas for tenant
 * Roles: All authenticated users
 */
router.get(
  "/schemas",
  enforceTenantIsolation("tenantId"),
  formController.getSchemas,
);

/**
 * GET /api/forms/schemas/:id
 * Get single form schema by ID
 * Roles: All authenticated users
 */
router.get(
  "/schemas/:id",
  enforceTenantIsolation("tenantId"),
  formController.getSchemaById,
);

/**
 * DELETE /api/forms/schemas/:id
 * Delete form schema by ID. Requires FORMS:delete
 * Warning: This will also delete all associated form responses
 */
router.delete(
  "/schemas/:id",
  requirePermission("FORMS", "delete"),
  enforceTenantIsolation("tenantId"),
  formController.deleteFormSchema,
);

/**
 * POST /api/forms/:formId/submit
 * Submit form data (creates dynamic table if needed)
 * Roles: All authenticated users (STAFF, ADMIN, GUARDIAN)
 */
router.post("/:formId/submit", formController.submitForm);

/**
 * GET /api/forms/responses
 * Get ALL form submissions across all forms
 * STAFF/GUARDIAN: see only their own submissions across all forms
 * ADMIN: see all submissions for their tenant across all forms
 * SUPER_ADMIN: see all submissions (optionally filter by tenantId)
 */
router.get("/responses", formController.getResponses);

/**
 * GET /api/forms/:formId/responses
 * Get form submissions for a specific form
 * GUARDIAN: see only their own submissions
 * STAFF/ADMIN/SUPER_ADMIN: see all submissions for tenant
 */
router.get(
  "/:formId/responses",
  enforceTenantIsolation("tenantId"),
  formController.getResponses,
);

/**
 * GET /api/forms/:formId/user/:userId/response
 * Get specific user's form response
 * STAFF/GUARDIAN: can only view their own response
 * ADMIN/SUPER_ADMIN: can view any user's response in their tenant
 */
router.get(
  "/:formId/user/:userId/response",
  enforceTenantIsolation("tenantId"),
  formController.getUserResponse,
);

/**
 * PUT /api/forms/:formId/user/:userId/response/:responseId
 * Update specific user's form response
 * STAFF/GUARDIAN: can only update their own response
 * ADMIN/SUPER_ADMIN: can update any user's response in their tenant
 */
router.put(
  "/:formId/user/:userId/response/:responseId",
  enforceTenantIsolation("tenantId"),
  formController.updateUserResponse,
);

/**
 * DELETE /api/forms/:formId/user/:userId/response/:responseId
 * Delete specific user's form response
 * STAFF/GUARDIAN: can only delete their own response
 * ADMIN/SUPER_ADMIN: can delete any user's response in their tenant
 */
router.delete(
  "/:formId/user/:userId/response/:responseId",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  formController.deleteUserResponse,
);

/**
 * GET /api/forms/:formId/table-schema
 * Get database table schema for a form (gated by FORMS:view at router level)
 */
router.get(
  "/:formId/table-schema",
  enforceTenantIsolation("tenantId"),
  formController.getFormTableSchema,
);

/**
 * POST /api/forms/:formId/draft
 * Save form draft (partial/incomplete form data)
 * Roles: All authenticated users
 */
router.post("/:formId/draft", draftController.saveFormDraft);

/**
 * GET /api/forms/:formId/drafts
 * Get all drafts for current user for a specific form
 * Roles: All authenticated users
 */
router.get("/:formId/drafts", draftController.getDrafts);

/**
 * GET /api/forms/drafts
 * Get all drafts for current user (all forms)
 * Roles: All authenticated users
 */
router.get("/drafts", draftController.getDrafts);

/**
 * GET /api/forms/:formId/draft/:draftId
 * Get specific draft by ID
 * Roles: All authenticated users (only their own drafts)
 */
router.get("/:formId/draft/:draftId", draftController.getDraft);

/**
 * PUT /api/forms/:formId/draft/:draftId
 * Update existing draft
 * Roles: All authenticated users (only their own drafts)
 */
router.put("/:formId/draft/:draftId", draftController.updateFormDraft);

/**
 * DELETE /api/forms/:formId/draft/:draftId
 * Delete draft
 * Roles: All authenticated users (only their own drafts)
 */
router.delete(
  "/:formId/draft/:draftId",
  requireAdminOrSuperAdminForDelete(),
  draftController.deleteFormDraft
);

module.exports = router;

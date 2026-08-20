const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const careLibraryController = require("../../controllers/care-plan/care-library.controller");
const {
  createLibraryItemValidator,
  updateLibraryItemValidator,
  libraryItemIdValidator,
  getLibraryItemsValidator,
  applyLibraryItemValidator,
} = require("../../validators/care-library.validators");

// All routes require authentication and CARE_PLANS:view (aligned with frontend Care Library)
router.use(authenticate());
router.use(requirePermission("CARE_PLANS", "view"));
router.use(
  require("../../middlewares/plan-entitlement.middleware").requirePlanModule(
    "advancedCareBilling",
  ),
);

/**
 * POST /api/care-library
 * Create new library item
 * Roles: ADMIN, SUPER_ADMIN only
 * tenantId can be in query param for SUPER_ADMIN, otherwise uses user's tenant
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(createLibraryItemValidator),
  careLibraryController.createLibraryItemHandler
);

/**
 * GET /api/care-library
 * Get library items with filtering
 * Roles: All authenticated users
 * Query params: page, limit, type, category, search, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getLibraryItemsValidator),
  careLibraryController.getLibraryItemsHandler
);

/**
 * GET /api/care-library/:id
 * Get library item by ID
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  validate(libraryItemIdValidator),
  careLibraryController.getLibraryItemByIdHandler
);

/**
 * PUT /api/care-library/:id
 * Update library item
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.put(
  "/:id",
  validate(updateLibraryItemValidator),
  careLibraryController.updateLibraryItemHandler
);

/**
 * DELETE /api/care-library/:id
 * Delete library item (soft delete)
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(libraryItemIdValidator),
  careLibraryController.deleteLibraryItemHandler
);

/**
 * POST /api/care-library/:id/apply
 * Apply library item to care plan
 * Roles: All authenticated users
 */
router.post(
  "/:id/apply",
  validate(applyLibraryItemValidator),
  careLibraryController.applyLibraryItemHandler
);

/**
 * POST /api/care-library/:id/duplicate
 * Duplicate library item
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.post(
  "/:id/duplicate",
  validate(libraryItemIdValidator),
  careLibraryController.duplicateLibraryItemHandler
);

module.exports = router;


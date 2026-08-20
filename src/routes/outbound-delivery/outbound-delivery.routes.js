const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const outboundDeliveryController = require("../../controllers/outbound-delivery/outbound-delivery.controller");

router.use(authenticate());

const allowedRoles = ["SUPER_ADMIN", "ADMIN", "STAFF", "GUARDIAN"];

/**
 * GET /api/outbound-deliveries
 * List sent emails and faxes for the current tenant.
 */
router.get(
  "/",
  authorize(...allowedRoles),
  outboundDeliveryController.listDeliveries
);

/**
 * GET /api/outbound-deliveries/:id/attachment/view-url
 * Presigned URL to view the sent PDF inline.
 */
router.get(
  "/:id/attachment/view-url",
  authorize(...allowedRoles),
  outboundDeliveryController.getAttachmentViewUrl
);

/**
 * GET /api/outbound-deliveries/:id
 * Get a single delivery record.
 */
router.get(
  "/:id",
  authorize(...allowedRoles),
  outboundDeliveryController.getDeliveryById
);

/**
 * DELETE /api/outbound-deliveries/:id
 */
router.delete(
  "/:id",
  authorize(...allowedRoles),
  outboundDeliveryController.deleteDelivery
);

module.exports = router;

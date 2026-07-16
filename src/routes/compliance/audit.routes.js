const express = require('express');
const router = express.Router();
const auditController = require('../../controllers/compliance/audit.controller');
const authenticate = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

/**
 * All audit routes require ADMINISTRATION:view_audit permission (aligned with frontend Audit Trail)
 */
router.use(authenticate());
router.use(requirePermission('ADMINISTRATION', 'view_audit'));

/** Audit Trail UI/API: Super Admin and tenant Admin only (not Staff with view_audit). */
router.use((req, res, next) => {
  const role = req.user?.role;
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Audit Trail is restricted to Super Admin and Admin users.",
    });
  }
  next();
});

/**
 * @route   GET /api/audit/logs
 * @desc    Get audit logs with filtering and pagination
 * @access  ADMIN, SUPER_ADMIN
 */
router.get('/logs', auditController.getAuditLogs);

/**
 * @route   GET /api/audit/logs/:id
 * @desc    Get a specific audit log by ID
 * @access  ADMIN, SUPER_ADMIN
 */
router.get('/logs/:id', auditController.getAuditLogById);

/**
 * @route   GET /api/audit/stats
 * @desc    Get audit log statistics
 * @access  ADMIN, SUPER_ADMIN
 */
router.get('/stats', auditController.getAuditStats);

/**
 * @route   GET /api/audit/user/:userId
 * @desc    Get audit logs for a specific user
 * @access  ADMIN, SUPER_ADMIN
 */
router.get('/user/:userId', auditController.getUserAuditLogs);

/**
 * @route   GET /api/audit/security-events
 * @desc    Get security-related audit events
 * @access  ADMIN, SUPER_ADMIN
 */
router.get('/security-events', auditController.getSecurityEvents);

/**
 * @route   GET /api/audit/export/pdf
 * @desc    Export audit trail to PDF
 * @access  ADMIN, SUPER_ADMIN
 */
router.get('/export/pdf', auditController.exportAuditTrailPdf);

module.exports = router;


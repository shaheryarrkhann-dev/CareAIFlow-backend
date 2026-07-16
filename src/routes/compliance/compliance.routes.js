/**
 * Compliance API Routes
 * WAC/RCW compliance management and HITL review
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/auth.middleware');
const complianceAdminController = require('../../controllers/compliance/complianceAdmin.controller');
const { triggerManualUpdate } = require('../../jobs/regulationMonitoring.job');

// All compliance routes require authentication
router.use(authenticate);

// HITL Admin Review Routes
router.get('/pending-review', complianceAdminController.getPendingReviewSchemas);
router.get('/schema/:schemaId', complianceAdminController.getSchemaForReview);
router.post('/schema/:schemaId/approve', complianceAdminController.approveSchema);
router.post('/schema/:schemaId/reject', complianceAdminController.rejectSchema);
router.post('/schema/:schemaId/revalidate', complianceAdminController.revalidateSchema);

// Compliance Statistics
router.get('/stats', complianceAdminController.getComplianceStats);

// Regulation Management (SUPER_ADMIN only)
router.post('/regulations/update', async (req, res) => {
  try {
    // Only SUPER_ADMIN can trigger manual updates
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN access required' });
    }

    console.log(`[COMPLIANCE-API] Manual regulation update triggered by user ${req.user.userId}`);

    const result = await triggerManualUpdate();

    if (result.success) {
      res.json({
        message: 'Regulation update completed successfully',
        updateResults: result.updateResults,
        schemasMarked: result.schemasMarked
      });
    } else {
      res.status(500).json({
        error: 'Regulation update failed',
        details: result.error
      });
    }
  } catch (error) {
    console.error('[COMPLIANCE-API] Error triggering regulation update:', error);
    res.status(500).json({ error: 'Failed to trigger regulation update' });
  }
});

module.exports = router;


const assistedActivationService = require("../../services/onboarding/assisted-activation.service");
const auditService = require("../../services/compliance/audit.service");

/**
 * POST /api/admin/assisted-activation
 * SUPER_ADMIN provisions a customer with an active plan (no Stripe).
 */
async function createAssistedActivation(req, res, next) {
  try {
    const result = await assistedActivationService.createAssistedActivation(
      req.body || {},
      req.user,
    );
    await auditService.createAuditLog({
      action: "ASSISTED_ACTIVATION_CREATED",
      resource: "saas_subscription",
      resourceId: result.subscription?.id,
      req,
      statusCode: 201,
      metadata: {
        targetUserId: result.user?.id,
        targetEmail: result.user?.email,
        planKey: result.subscription?.planKey,
        billingPeriod: result.subscription?.billingPeriod,
        createdUser: result.createdUser,
      },
    });
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAssistedActivation,
};

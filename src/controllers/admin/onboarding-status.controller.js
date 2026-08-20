const onboardingStatusService = require("../../services/admin/onboarding-status.service");

/**
 * GET /api/admin/onboarding-status?email=
 */
async function getOnboardingStatus(req, res, next) {
  try {
    const email = req.query.email || req.body?.email;
    const result = await onboardingStatusService.getOnboardingStatusByEmail(
      email,
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOnboardingStatus,
};

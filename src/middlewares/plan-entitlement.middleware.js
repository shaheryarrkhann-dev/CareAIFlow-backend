const {
  getPlanEntitlement,
  normalizePlanKey,
} = require("../config/planEntitlements");
const saasSubscriptionService = require("../services/stripe/saas-subscription.service");
const prisma = require("../lib/prisma");

/**
 * Resolve plan key for the authenticated user (subscription owner or tenant admin).
 */
async function resolveUserPlanKey(user) {
  if (!user?.id) return null;

  const mine = await saasSubscriptionService.getLatestForUser(user.id);
  if (mine?.planKey) return normalizePlanKey(mine.planKey);

  if (user.tenantId) {
    const linked = await prisma.saasSubscription.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: "desc" },
      select: { planKey: true },
    });
    if (linked?.planKey) return normalizePlanKey(linked.planKey);

    const admins = await prisma.userTenant.findMany({
      where: {
        tenantId: user.tenantId,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
      },
      select: { userId: true },
    });
    for (const row of admins) {
      const sub = await saasSubscriptionService.getLatestForUser(row.userId);
      if (sub?.planKey) return normalizePlanKey(sub.planKey);
    }
  }

  return null;
}

/**
 * Require a plan module flag (e.g. aiAdmissions, advancedCareBilling).
 * SUPER_ADMIN bypasses. Users without a SaaS subscription are treated as
 * Starter (locked out of Pro modules).
 */
function requirePlanModule(moduleFlag) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (req.user.role === "SUPER_ADMIN") {
        return next();
      }

      const planKey = await resolveUserPlanKey(req.user);
      const entitlement = getPlanEntitlement(planKey || "starter");
      const allowed = Boolean(entitlement?.moduleFlags?.[moduleFlag]);

      if (!allowed) {
        return res.status(403).json({
          success: false,
          code: "PLAN_MODULE_REQUIRED",
          moduleFlag,
          planKey: entitlement?.planKey || planKey || "starter",
          message: `This feature requires a higher CareAIFlow plan (${moduleFlag}). Upgrade on Subscription to continue.`,
        });
      }

      req.planEntitlement = entitlement;
      return next();
    } catch (err) {
      console.error("[requirePlanModule]", err);
      return res.status(500).json({
        success: false,
        message: "Could not verify plan entitlements",
      });
    }
  };
}

module.exports = {
  requirePlanModule,
  resolveUserPlanKey,
};

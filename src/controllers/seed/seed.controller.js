/**
 * Temporary seed controller — remove with /api/seed routes when production is seeded.
 */
const { seedPermissionsAndTemplates } = require("../../services/seed/seedPermissionsAndTemplates.service");
const { SYSTEM_ROLE_TEMPLATES } = require("../../services/seed/rolePermissionCatalog.data");

function seedInfo(req, res) {
  const templates = SYSTEM_ROLE_TEMPLATES.map((t) => t.name);
  return res.json({
    success: true,
    temporary: true,
    message:
      "One-time DB seed for permissions and staff-category role templates. Remove /api/seed after use.",
    endpoints: {
      dryRun:
        "GET or POST /api/seed/permissions-and-templates?dryRun=true (requires secret in production)",
      apply:
        "POST /api/seed/permissions-and-templates (requires X-Seed-Secret in production)",
      alias: "POST /api/seed/roles (same as above)",
    },
    roleTemplatesSeeded: templates,
    notSeeded: ["Admin (use legacy User.role ADMIN on invite, not a custom template)"],
    onApplyAlso: 'Removes or deactivates old "Admin" system template if it exists from a previous seed.',
    auth:
      process.env.NODE_ENV === "production"
        ? "Set SEED_API_SECRET on server; send header X-Seed-Secret or ?secret="
        : "Local: optional SEED_API_SECRET; if unset, no secret required",
  });
}

/**
 * POST or GET /api/seed/permissions-and-templates (or /api/seed/roles)
 * Query or body: dryRun=true to simulate without writing.
 */
async function seedPermissionsAndTemplatesHandler(req, res, next) {
  try {
    const dryRun =
      req.query.dryRun === "true" ||
      req.query.dryRun === "1" ||
      (req.body && (req.body.dryRun === true || req.body.dryRun === "true"));
    const result = await seedPermissionsAndTemplates({ dryRun });
    if (!result.success) {
      return res.status(500).json(result);
    }
    return res.json({
      ...result,
      message: dryRun
        ? "Dry run only — no database changes."
        : result.excludesAdminCustomRole
          ? `Seeded staff roles only: ${(result.roleTemplatesSeeded || []).join(", ")}. Admin custom role is not seeded (use legacy ADMIN at invite). Refresh Invite Member.`
          : "Permissions and role templates seeded. Refresh Invite Member to see roles.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  seedInfo,
  seedPermissionsAndTemplates: seedPermissionsAndTemplatesHandler,
};

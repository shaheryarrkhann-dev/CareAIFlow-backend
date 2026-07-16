/**
 * Temporary seed controller for permissions and role templates.
 * No auth required. Remove this and the route when no longer needed.
 */
const { seedPermissionsAndTemplates } = require("../../services/seed/seedPermissionsAndTemplates.service");

/**
 * POST or GET /api/seed/permissions-and-templates
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
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  seedPermissionsAndTemplates: seedPermissionsAndTemplatesHandler,
};

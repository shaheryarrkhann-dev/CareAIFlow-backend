/**
 * Temporary seed API (no auth). Remove when no longer needed.
 * POST or GET /api/seed/permissions-and-templates
 * - dryRun: query ?dryRun=true or body { dryRun: true } to simulate without writing.
 */
const express = require("express");
const router = express.Router();
const seedController = require("../../controllers/seed/seed.controller");

router.post("/permissions-and-templates", seedController.seedPermissionsAndTemplates);
router.get("/permissions-and-templates", seedController.seedPermissionsAndTemplates);

module.exports = router;

/**
 * TEMPORARY seed API — run permissions + role templates on live without SSH/npm on the host.
 * Remove this router from app.js and delete SEED_API_SECRET when done.
 *
 * POST|GET /api/seed/permissions-and-templates
 *   ?dryRun=true  — preview only
 *   Header: X-Seed-Secret: <SEED_API_SECRET>  (required in production)
 *
 * GET /api/seed — usage info (no secret required)
 */
const express = require("express");
const router = express.Router();
const seedController = require("../../controllers/seed/seed.controller");
const { requireSeedApiSecret } = require("../../middlewares/seed-api-auth.middleware");

router.get("/", seedController.seedInfo);

router.post(
  "/permissions-and-templates",
  requireSeedApiSecret,
  seedController.seedPermissionsAndTemplates
);
router.get(
  "/permissions-and-templates",
  requireSeedApiSecret,
  seedController.seedPermissionsAndTemplates
);

/** Alias — same as permissions-and-templates */
router.post("/roles", requireSeedApiSecret, seedController.seedPermissionsAndTemplates);
router.get("/roles", requireSeedApiSecret, seedController.seedPermissionsAndTemplates);

module.exports = router;

const express = require("express");
const router = express.Router();
const validate = require("../../middlewares/validate.middleware");
const { leadSubmitLimiter } = require("../../middlewares/rateLimit.middleware");
const leadController = require("../../controllers/public/lead.controller");
const { submitLeadValidator } = require("../../validators/public-lead.validators");

/**
 * POST /api/public/leads
 * Public marketing lead / demo request from landing site.
 */
router.post(
  "/",
  leadSubmitLimiter,
  validate(submitLeadValidator),
  leadController.submitLead,
);

module.exports = router;

const { validationResult } = require("express-validator");
const leadService = require("../../services/leads/lead.service");

function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const err = new Error(first.msg || "Validation error");
    err.status = 400;
    throw err;
  }
}

/**
 * POST /api/public/leads
 */
async function submitLead(req, res, next) {
  try {
    assertValid(req);
    const result = await leadService.createLeadInquiry(req.body);
    return res.status(201).json({
      success: true,
      message: "Request received. Our team will follow up shortly.",
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitLead,
};

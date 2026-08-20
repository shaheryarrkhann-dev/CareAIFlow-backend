const leadService = require("../../services/leads/lead.service");

/**
 * GET /api/admin/leads
 */
async function listLeads(req, res, next) {
  try {
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const status = req.query.status;
    const result = await leadService.listLeadInquiries({ page, pageSize, status });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listLeads,
};

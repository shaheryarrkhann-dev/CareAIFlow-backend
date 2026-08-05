const outboundDeliveryService = require("../../services/outbound-delivery/outbound-delivery.service");
const { resolveActiveTenantId } = require("../../lib/resolveActiveTenantId");

function resolveTenantId(req) {
  return resolveActiveTenantId(req);
}

/**
 * GET /api/outbound-deliveries
 * Query: page, limit, type (email|fax|all), search
 */
exports.listDeliveries = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { page, limit, type, search } = req.query;

    const result = await outboundDeliveryService.listOutboundDeliveries(
      tenantId,
      { page, limit, type, search }
    );

    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/outbound-deliveries/:id
 */
exports.getDeliveryById = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const delivery = await outboundDeliveryService.getOutboundDeliveryById(
      req.params.id,
      tenantId
    );

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found.",
      });
    }

    return res.json({ success: true, delivery });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/outbound-deliveries/:id/attachment/view-url
 */
exports.getAttachmentViewUrl = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const result = await outboundDeliveryService.getAttachmentViewUrl(
      req.params.id,
      tenantId
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found for this delivery.",
      });
    }

    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/outbound-deliveries/:id
 */
exports.deleteDelivery = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const deleted = await outboundDeliveryService.deleteOutboundDelivery(
      req.params.id,
      tenantId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found.",
      });
    }

    return res.json({
      success: true,
      message: "Delivery deleted successfully.",
    });
  } catch (err) {
    next(err);
  }
};

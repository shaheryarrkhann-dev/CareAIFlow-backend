const {
  generateInvoiceForResident,
  generateInvoicesForMonth,
  getInvoices,
  getInvoiceById,
  updateInvoiceStatus,
} = require("../../services/billing/invoice.service");
const { logBillingAction } = require("../../services/compliance/audit.service");

/**
 * Generate invoice for resident
 * POST /api/invoices/generate
 */
async function generateInvoiceHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, month, tenantId } = req.body;

    // Determine tenantId
    let finalTenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && tenantId) {
      finalTenantId = tenantId;
    }

    if (!finalTenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    if (!residentId) {
      return res.status(400).json({
        success: false,
        message: "residentId is required",
      });
    }

    if (!month) {
      return res.status(400).json({
        success: false,
        message: "month is required",
      });
    }

    // Prepare user object with tenantIdFromQuery for SUPER_ADMIN
    const userForService = {
      ...req.user,
      tenantIdFromQuery: req.user.role === "SUPER_ADMIN" ? tenantId : undefined,
    };

    const invoice = await generateInvoiceForResident(
      residentId,
      new Date(month),
      userForService
    );

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_GENERATED",
        userId: req.user.id,
        tenantId: invoice.tenantId,
        resourceId: invoice.id,
        req,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          residentId: invoice.residentId,
          month: invoice.month.toISOString().slice(0, 7),
          amount: invoice.amount.toString(),
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for invoice generation:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Invoice generated successfully",
      invoice,
    });
  } catch (err) {
    console.error("Generate invoice error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("does not belong") ||
      err.message.includes("already exists") ||
      err.message.includes("not active") ||
      err.message.includes("does not have an active billing tier")
    ) {
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to generate invoice",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate invoice",
    });
  }
}

/**
 * Generate invoices for all residents for a month
 * POST /api/invoices/generate-month
 */
async function generateInvoicesForMonthHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { month, tenantId } = req.body;

    // Determine tenantId
    let finalTenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && tenantId) {
      finalTenantId = tenantId;
    }

    if (!finalTenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    if (!month) {
      return res.status(400).json({
        success: false,
        message: "month is required",
      });
    }

    const result = await generateInvoicesForMonth(
      new Date(month),
      finalTenantId,
      req.user
    );

    // Log audit event for bulk generation
    try {
      await logBillingAction({
        action: "INVOICE_GENERATED",
        userId: req.user.id,
        tenantId: finalTenantId,
        req,
        metadata: {
          month: new Date(month).toISOString().slice(0, 7),
          generated: result.generated,
          skipped: result.skipped,
          errors: result.errors.length,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for bulk invoice generation:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      ...result,
    });
  } catch (err) {
    console.error("Generate invoices for month error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate invoices",
    });
  }
}

/**
 * Get invoices
 * GET /api/invoices
 */
async function getInvoicesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Determine tenantId
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const filters = {
      page: req.query.page ? Number.parseInt(req.query.page, 10) : undefined,
      limit: req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined,
      month: req.query.month,
      status: req.query.status,
      residentId: req.query.residentId,
      billingTierId: req.query.billingTierId,
    };

    const result = await getInvoices(tenantId, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get invoices error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve invoices",
    });
  }
}

/**
 * Get invoice by ID
 * GET /api/invoices/:id
 */
async function getInvoiceByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    // Determine tenantId
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const invoice = await getInvoiceById(id, tenantId);

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (err) {
    console.error("Get invoice by ID error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message || "Invoice not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve invoice",
    });
  }
}

/**
 * Update invoice status
 * PATCH /api/invoices/:id/status
 */
async function updateInvoiceStatusHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "status is required",
      });
    }

    const invoice = await updateInvoiceStatus(id, status, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_STATUS_CHANGED",
        userId: req.user.id,
        tenantId: invoice.tenantId,
        resourceId: invoice.id,
        req,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          oldStatus: invoice.oldStatus,
          newStatus: status,
          paidAt: invoice.paidAt,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for invoice status change:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice status updated successfully",
      invoice,
    });
  } catch (err) {
    console.error("Update invoice status error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("Invalid invoice status")
    ) {
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to update invoice status",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update invoice status",
    });
  }
}

module.exports = {
  generateInvoice: generateInvoiceHandler,
  generateInvoicesForMonth: generateInvoicesForMonthHandler,
  getInvoices: getInvoicesHandler,
  getInvoiceById: getInvoiceByIdHandler,
  updateInvoiceStatus: updateInvoiceStatusHandler,
};

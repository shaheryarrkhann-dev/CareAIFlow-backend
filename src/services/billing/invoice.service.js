const prisma = require("../../lib/prisma");
const { Prisma } = require("@prisma/client");
const { getBillingTierById } = require("./billing-tier.service");
const { getResidentData } = require("../../utils/billing.utils");

/**
 * Generate invoice number
 * Format: INV-YYYY-MM-XXX (e.g., INV-2025-01-001)
 * @param {string} tenantId - Tenant ID
 * @param {Date} month - Billing month (first day of month)
 * @returns {Promise<string>} Invoice number
 */
async function generateInvoiceNumber(tenantId, month) {
  // Format month as YYYY-MM
  // billingMonth is already UTC, extract year and month
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth() + 1; // getUTCMonth() returns 0-11, we need 1-12
  const yearMonth = `${year}-${String(monthIndex).padStart(2, "0")}`; // e.g., "2025-12"

  // Count existing invoices for this tenant and month
  const existingCount = await prisma.invoice.count({
    where: {
      tenantId,
      month: {
        gte: new Date(yearMonth + "-01"),
        lt: new Date(
          new Date(yearMonth + "-01").setMonth(
            new Date(yearMonth + "-01").getMonth() + 1
          )
        ),
      },
    },
  });

  // Generate sequence number (1-based, 3 digits)
  const sequence = existingCount + 1;
  const sequenceStr = String(sequence).padStart(3, "0");

  return `INV-${yearMonth}-${sequenceStr}`;
}

/**
 * Generate invoice for a single resident
 * @param {string} residentId - Resident UUID
 * @param {Date} month - Billing month (first day of month)
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created invoice
 */
async function generateInvoiceForResident(residentId, month, user) {
  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN") {
    if (!user.tenantIdFromQuery && !user.tenantId) {
      throw new Error("tenantId is required for SUPER_ADMIN");
    }
    tenantId = user.tenantIdFromQuery || user.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Normalize month to first day of month in UTC
  // Use local year/month to preserve the intended month (avoid timezone shifts)
  const monthDate = month instanceof Date ? month : new Date(month);
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const billingMonth = new Date(Date.UTC(year, monthIndex, 1));

  // Check if invoice already exists for this resident and month
  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      tenantId,
      residentId,
      month: billingMonth,
    },
  });

  if (existingInvoice) {
    throw new Error(
      `Invoice already exists for this resident for ${billingMonth
        .toISOString()
        .slice(0, 7)}`
    );
  }

  // Get active billing tier for resident
  const activeBilling = await prisma.residentBilling.findFirst({
    where: {
      tenantId,
      residentId,
      isActive: true,
    },
    include: {
      billingTier: true,
    },
  });

  if (!activeBilling) {
    throw new Error("Resident does not have an active billing tier assignment");
  }

  // Validate that billing tier is active during the billing month
  // Normalize dates to UTC for consistent comparison
  const tierStartDate = new Date(activeBilling.startDate);
  const tierStartMonth = new Date(
    Date.UTC(tierStartDate.getUTCFullYear(), tierStartDate.getUTCMonth(), 1)
  );

  const tierEndDate = activeBilling.endDate
    ? new Date(activeBilling.endDate)
    : null;
  const tierEndMonth = tierEndDate
    ? new Date(
        Date.UTC(tierEndDate.getUTCFullYear(), tierEndDate.getUTCMonth(), 1)
      )
    : null;

  // Check if billing month is before tier start month
  if (billingMonth < tierStartMonth) {
    throw new Error(
      `Billing tier was not active on ${billingMonth
        .toISOString()
        .slice(0, 7)}. Tier started on ${tierStartDate
        .toISOString()
        .slice(0, 10)}`
    );
  }

  // Check if billing month is after tier end month (if tier has ended)
  if (tierEndMonth && billingMonth > tierEndMonth) {
    throw new Error(
      `Billing tier was not active on ${billingMonth
        .toISOString()
        .slice(0, 7)}. Tier ended on ${tierEndDate.toISOString().slice(0, 10)}`
    );
  }

  // Get resident data for name
  let residentName = activeBilling.residentName;
  try {
    const residentData = await getResidentData(residentId, tenantId);
    residentName = residentData.name;
  } catch (err) {
    // Use cached name if resident not found
    console.warn(
      `Could not fetch resident data for ${residentId}: ${err.message}`
    );
  }

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(tenantId, billingMonth);

  // Calculate due date (1st day of next month)
  // billingMonth is already UTC, so calculate from it
  const dueDate = new Date(billingMonth);
  dueDate.setUTCMonth(dueDate.getUTCMonth() + 1); // First day of next month (due date)

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      residentId,
      residentName,
      residentBillingId: activeBilling.id,
      billingTierId: activeBilling.billingTierId,
      amount: activeBilling.billingTier.monthlyRate,
      month: billingMonth,
      status: "Pending",
      dueDate,
      generatedBy: user.id || "System",
    },
    include: {
      billingTier: {
        select: {
          id: true,
          name: true,
          monthlyRate: true,
          description: true,
        },
      },
      residentBilling: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  // Note: Audit logging is handled in controllers for user-initiated actions
  // For cron/system-generated invoices, audit should be logged in the cron job itself
  return invoice;
}

/**
 * Generate pro-rated invoice for resident from start date to end of current month
 * @param {string} residentId - Resident UUID
 * @param {string} residentBillingId - Resident billing record ID
 * @param {Date} startDate - Start date for tier assignment
 * @param {Object} billingTier - Billing tier object with monthlyRate
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created invoice
 */
async function generateProRatedInvoiceForResident(
  residentId,
  residentBillingId,
  startDate,
  billingTier,
  user
) {
  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN") {
    if (!user.tenantIdFromQuery && !user.tenantId) {
      throw new Error("tenantId is required for SUPER_ADMIN");
    }
    tenantId = user.tenantIdFromQuery || user.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Normalize start date
  const tierStartDate = new Date(startDate);
  const startYear = tierStartDate.getFullYear();
  const startMonth = tierStartDate.getMonth();
  const startDay = tierStartDate.getDate();

  // Get current month (first day of current month in UTC)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const billingMonth = new Date(Date.UTC(currentYear, currentMonth, 1));

  // Check if invoice already exists for this resident and month
  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      tenantId,
      residentId,
      month: billingMonth,
    },
  });

  if (existingInvoice) {
    // Invoice already exists, skip generation
    return null;
  }

  // Calculate pro-rated amount
  // Get last day of current month
  const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0));
  const totalDaysInMonth = lastDayOfMonth.getUTCDate();

  // Calculate days from start date to end of month (inclusive)
  // If start date is in a different month, use current month's start day
  const actualStartDay =
    startYear === currentYear && startMonth === currentMonth ? startDay : 1;
  const daysInMonth = totalDaysInMonth - actualStartDay + 1;

  // Calculate daily rate
  const monthlyRate = Number(billingTier.monthlyRate);
  const dailyRate = monthlyRate / totalDaysInMonth;

  // Calculate pro-rated amount
  const proRatedAmount = dailyRate * daysInMonth;
  const roundedAmount = Math.round(proRatedAmount * 100) / 100; // Round to 2 decimal places

  // Get resident data for name
  let residentName = null;
  try {
    const residentData = await getResidentData(residentId, tenantId);
    residentName = residentData.name;
  } catch (err) {
    console.warn(
      `Could not fetch resident data for ${residentId}: ${err.message}`
    );
  }

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(tenantId, billingMonth);

  // Calculate due date (1st day of next month)
  const dueDate = new Date(billingMonth);
  dueDate.setUTCMonth(dueDate.getUTCMonth() + 1); // First day of next month (due date)

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      residentId,
      residentName,
      residentBillingId,
      billingTierId: billingTier.id,
      amount: new Prisma.Decimal(roundedAmount),
      month: billingMonth,
      status: "Pending",
      dueDate,
      generatedBy: user.id || "System",
      notes: `Pro-rated invoice from ${startDate
        .toISOString()
        .slice(0, 10)} to end of month (${daysInMonth} days)`,
    },
    include: {
      billingTier: {
        select: {
          id: true,
          name: true,
          monthlyRate: true,
          description: true,
        },
      },
      residentBilling: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  // Note: Audit logging for pro-rated invoices is handled in controllers
  // when tier is assigned (resident.controller.js logs RESIDENT_TIER_ASSIGNED)
  // The invoice generation itself is logged separately in the controller if needed
  return invoice;
}

/**
 * Generate invoices for all active residents for a month
 * @param {Date} month - Billing month (first day of month)
 * @param {string} tenantId - Tenant ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Generation results
 */
async function generateInvoicesForMonth(month, tenantId, user) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Normalize month to first day of month in UTC
  // Use local year/month to preserve the intended month (avoid timezone shifts)
  const monthDate = month instanceof Date ? month : new Date(month);
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const billingMonth = new Date(Date.UTC(year, monthIndex, 1));

  // Get all active resident billings for this tenant
  const activeResidentBillings = await prisma.residentBilling.findMany({
    where: {
      tenantId,
      isActive: true,
    },
    include: {
      billingTier: true,
    },
  });

  if (activeResidentBillings.length === 0) {
    return {
      success: true,
      message: "No active residents with billing tiers found",
      generated: 0,
      skipped: 0,
      errors: [],
      invoices: [],
    };
  }

  const results = {
    generated: 0,
    skipped: 0,
    errors: [],
    invoices: [],
  };

  // Generate invoice for each resident
  for (const residentBilling of activeResidentBillings) {
    try {
      // Check if invoice already exists
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          tenantId,
          residentId: residentBilling.residentId,
          month: billingMonth,
        },
      });

      if (existingInvoice) {
        results.skipped++;
        continue;
      }

      // Validate tier is active during the billing month
      // Normalize dates to UTC for consistent comparison
      const tierStartDate = new Date(residentBilling.startDate);
      const tierStartMonth = new Date(
        Date.UTC(tierStartDate.getUTCFullYear(), tierStartDate.getUTCMonth(), 1)
      );

      const tierEndDate = residentBilling.endDate
        ? new Date(residentBilling.endDate)
        : null;
      const tierEndMonth = tierEndDate
        ? new Date(
            Date.UTC(tierEndDate.getUTCFullYear(), tierEndDate.getUTCMonth(), 1)
          )
        : null;

      if (billingMonth < tierStartMonth) {
        results.skipped++;
        continue; // Tier not active yet
      }

      if (tierEndMonth && billingMonth > tierEndMonth) {
        results.skipped++;
        continue; // Tier already ended
      }

      // Generate invoice
      const invoice = await generateInvoiceForResident(
        residentBilling.residentId,
        billingMonth,
        { ...user, tenantId }
      );

      results.generated++;
      results.invoices.push(invoice);
    } catch (err) {
      results.errors.push({
        residentId: residentBilling.residentId,
        error: err.message,
      });
    }
  }

  return {
    success: true,
    message: `Generated ${results.generated} invoice(s), skipped ${results.skipped}`,
    ...results,
  };
}

/**
 * Get invoices with filtering
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Invoices with pagination
 */
async function getInvoices(tenantId, filters = {}) {
  const { page, limit, month, status, residentId, billingTierId } = filters;

  const where = {
    tenantId,
  };

  // Filter by month
  if (month) {
    const billingMonth = new Date(month);
    billingMonth.setDate(1);
    billingMonth.setHours(0, 0, 0, 0);
    const nextMonth = new Date(billingMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    where.month = {
      gte: billingMonth,
      lt: nextMonth,
    };
  }

  // Filter by status
  if (status) {
    where.status = status;
  }

  // Filter by resident
  if (residentId) {
    where.residentId = residentId;
  }

  // Filter by billing tier
  if (billingTierId) {
    where.billingTierId = billingTierId;
  }

  // Pagination
  const skip = page && limit ? (page - 1) * limit : undefined;
  const take = limit;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take,
      include: {
        billingTier: {
          select: {
            id: true,
            name: true,
            monthlyRate: true,
            description: true,
          },
        },
        residentBilling: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    invoices,
    pagination:
      page && limit
        ? {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          }
        : { total },
  };
}

/**
 * Get invoice by ID
 * @param {string} id - Invoice ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Invoice
 */
async function getInvoiceById(id, tenantId) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      tenantId,
    },
    include: {
      billingTier: {
        select: {
          id: true,
          name: true,
          monthlyRate: true,
          description: true,
        },
      },
      residentBilling: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  return invoice;
}

/**
 * Update invoice status
 * @param {string} id - Invoice ID
 * @param {string} status - New status (Pending, Paid, Overdue)
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Updated invoice with oldStatus property
 */
async function updateInvoiceStatus(id, status, user) {
  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN") {
    // For SUPER_ADMIN, get invoice first to determine tenantId
    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });
    if (!invoice) {
      throw new Error("Invoice not found");
    }
    tenantId = invoice.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Validate status
  if (!["Pending", "Paid", "Overdue"].includes(status)) {
    throw new Error(
      "Invalid invoice status. Must be: Pending, Paid, or Overdue"
    );
  }

  // Check if invoice exists and capture old status
  const existingInvoice = await getInvoiceById(id, tenantId);
  const oldStatus = existingInvoice.status;

  // Prepare update data
  const updateData = {
    status,
  };

  // If marking as paid, set paidAt and paidBy
  if (status === "Paid" && existingInvoice.status !== "Paid") {
    updateData.paidAt = new Date();
    updateData.paidBy = user.id;
  }

  // If unmarking as paid, clear paidAt and paidBy
  if (status !== "Paid" && existingInvoice.status === "Paid") {
    updateData.paidAt = null;
    updateData.paidBy = null;
  }

  // Update invoice
  const updatedInvoice = await prisma.invoice.update({
    where: { id },
    data: updateData,
    include: {
      billingTier: {
        select: {
          id: true,
          name: true,
          monthlyRate: true,
          description: true,
        },
      },
      residentBilling: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  // Add oldStatus to response for audit logging
  updatedInvoice.oldStatus = oldStatus;

  return updatedInvoice;
}

module.exports = {
  generateInvoiceForResident,
  generateProRatedInvoiceForResident,
  generateInvoicesForMonth,
  getInvoices,
  getInvoiceById,
  updateInvoiceStatus,
};

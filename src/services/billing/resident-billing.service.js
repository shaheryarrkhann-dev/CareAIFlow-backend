const prisma = require("../../lib/prisma");
const { getBillingTierById } = require("./billing-tier.service");
const { getResidentData } = require("../../utils/billing.utils");
const { generateProRatedInvoiceForResident } = require("./invoice.service");

/**
 * Assign billing tier to resident
 * @param {string} residentId - Resident UUID
 * @param {string} billingTierId - Billing tier ID
 * @param {Date} startDate - Start date for tier assignment
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created/updated resident billing record
 */
async function assignTierToResident(
  residentId,
  billingTierId,
  startDate,
  user
) {
  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN") {
    // For SUPER_ADMIN, tenantId must be provided in user.tenantIdFromQuery or user.tenantId
    tenantId = user.tenantIdFromQuery || user.tenantId;
    if (!tenantId) {
      throw new Error("tenantId is required for SUPER_ADMIN");
    }
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Validate resident exists
  const residentData = await getResidentData(residentId, tenantId);

  // Validate billing tier exists and belongs to tenant
  await getBillingTierById(billingTierId, tenantId);

  // Check if resident already has an active tier assignment
  const existingActive = await prisma.residentBilling.findFirst({
    where: {
      tenantId,
      residentId,
      isActive: true,
    },
  });

  // If there's an active tier, deactivate it (set endDate)
  if (existingActive) {
    await prisma.residentBilling.update({
      where: { id: existingActive.id },
      data: {
        isActive: false,
        endDate: startDate || new Date(), // End previous tier on start date of new tier
      },
    });
  }

  // Get billing tier details for invoice generation
  const billingTier = await getBillingTierById(billingTierId, tenantId);

  // Create new resident billing record
  const residentBilling = await prisma.residentBilling.create({
    data: {
      tenantId,
      residentId,
      residentName: residentData.name,
      billingTierId,
      startDate: startDate || new Date(),
      isActive: true,
      createdBy: user.id,
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
    },
  });

  // Auto-generate pro-rated invoice from start date to end of current month
  try {
    const invoice = await generateProRatedInvoiceForResident(
      residentId,
      residentBilling.id,
      startDate || new Date(),
      billingTier,
      user
    );

    // Add invoice to return object if generated
    if (invoice) {
      residentBilling.invoice = invoice;
    }
  } catch (err) {
    // Log error but don't fail the tier assignment
    console.error(
      `Failed to generate pro-rated invoice for resident ${residentId}:`,
      err.message
    );
  }

  return residentBilling;
}

/**
 * Update resident tier assignment (end current tier)
 * @param {string} residentId - Resident UUID
 * @param {Date} endDate - End date for tier assignment
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Updated resident billing record
 */
async function updateResidentTier(residentId, endDate, user) {
  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN") {
    // For SUPER_ADMIN, require tenantId
    if (!user.tenantIdFromQuery && !user.tenantId) {
      throw new Error("tenantId is required for SUPER_ADMIN");
    }
    tenantId = user.tenantIdFromQuery || user.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Find active tier assignment
  const existingActive = await prisma.residentBilling.findFirst({
    where: {
      tenantId,
      residentId,
      isActive: true,
    },
  });

  if (!existingActive) {
    throw new Error(
      "No active billing tier assignment found for this resident"
    );
  }

  // Update to deactivate
  const updated = await prisma.residentBilling.update({
    where: { id: existingActive.id },
    data: {
      isActive: false,
      endDate: endDate || new Date(),
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
    },
  });

  return updated;
}

/**
 * Get resident billing information
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Resident billing information
 */
async function getResidentBilling(residentId, tenantId) {
  // Get current active billing tier assignment
  const activeBilling = await prisma.residentBilling.findFirst({
    where: {
      tenantId,
      residentId,
      isActive: true,
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
    },
  });

  // Get billing history (all assignments)
  const billingHistory = await prisma.residentBilling.findMany({
    where: {
      tenantId,
      residentId,
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
    },
    orderBy: {
      startDate: "desc",
    },
  });

  // Get resident data for name
  let residentName = null;
  try {
    const residentData = await getResidentData(residentId, tenantId);
    residentName = residentData.name;
  } catch (err) {
    // If resident not found, use name from billing record if available
    if (activeBilling) {
      residentName = activeBilling.residentName;
    } else {
      // Log but don't fail - billing record might exist even if resident was deleted
      console.warn(
        `Could not fetch resident data for ${residentId}: ${err.message}`
      );
    }
    // Intentionally empty catch - we handle it above with fallback
  }

  return {
    residentId,
    residentName,
    activeBilling,
    billingHistory,
  };
}

module.exports = {
  assignTierToResident,
  updateResidentTier,
  getResidentBilling,
};

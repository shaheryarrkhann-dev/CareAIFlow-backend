const prisma = require("../../lib/prisma");
const { Prisma } = require("@prisma/client");
const { getResidentData } = require("../../utils/billing.utils");
const { getTierById } = require("./claims-tier.service");
const { getProviderSettings } = require("./claims-provider.service");
const {
  mapResidentToBillingFields,
  getPreviousBillingData,
} = require("./claims-mapping.service");
const {
  createOrUpdateResidentSheet,
  addRowToSheet,
  updateRowInSheet,
  deleteRowFromSheet,
} = require("./claims-excel.service");

/**
 * Determine tenantId from user object
 * @param {Object} user - Current user
 * @param {Object} data - Optional data object with tenantId
 * @returns {string} Tenant ID
 */
function determineTenantId(user, data = {}) {
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN" && data.tenantId) {
    tenantId = data.tenantId;
  }
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  return tenantId;
}

/**
 * Calculate claim billed amount from units and tier unit cost
 * @param {number} units - Number of units
 * @param {number} tierUnitCost - Tier unit cost
 * @returns {number} Claim billed amount
 */
function calculateClaimBilledAmount(units, tierUnitCost) {
  if (!units || !tierUnitCost) {
    return null;
  }
  return new Prisma.Decimal(units * Number(tierUnitCost));
}

/**
 * Create a new claims billing record
 * @param {Object} data - Billing record data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created billing record
 */
async function createClaimsRecord(data, user) {
  const tenantId = determineTenantId(user, data);
  const {
    residentId,
    billingMonth,
    tierId,
    units,
    serviceFromDate,
    serviceToDate,
    // Provider fields
    providerName,
    providerId,
    tinSsnEin,
    billingProviderNpi,
    billingProviderTaxonomy,
    billingProviderStreet,
    billingProviderCity,
    billingProviderState,
    billingProviderZip,
    // Service fields
    serviceCode,
    modifier1,
    modifier2,
    // Client fields
    clientAddress,
    clientCity,
    clientState,
    clientZip,
    placeOfService,
    clientId,
    clientLastName,
    clientFirstName,
    clientGender,
    clientDob,
    diagnosisCode,
    // MCO fields
    originalClaimId,
    frequencyCode,
  } = data;

  // Validate resident exists
  const residentData = await getResidentData(residentId, tenantId);

  // Normalize billing month to first day of month (use UTC to avoid timezone shifts)
  const monthDate =
    billingMonth instanceof Date ? billingMonth : new Date(billingMonth);
  const year = monthDate.getUTCFullYear();
  const monthIndex = monthDate.getUTCMonth();
  const normalizedBillingMonth = new Date(Date.UTC(year, monthIndex, 1));

  // Check if record already exists for this resident and month (use range for robust comparison)
  const startOfNextMonth = new Date(Date.UTC(year, monthIndex + 1, 1));
  const existingRecord = await prisma.claimsBillingRecord.findFirst({
    where: {
      tenantId,
      residentId,
      billingMonth: {
        gte: normalizedBillingMonth,
        lt: startOfNextMonth,
      },
    },
  });

  if (existingRecord) {
    throw new Error(
      `Billing record already exists for this resident for ${normalizedBillingMonth
        .toISOString()
        .slice(0, 7)}`
    );
  }

  // Get tier data if tierId provided
  let tierData = null;
  let tierUnitCost = null;
  if (tierId) {
    tierData = await getTierById(tierId, tenantId);
    tierUnitCost = tierData.unitCost;
  }

  // Calculate claim billed amount
  const claimBilledAmount = calculateClaimBilledAmount(units, tierUnitCost);

  // Get provider settings to auto-fill if not provided
  const providerSettings = await getProviderSettings(tenantId);

  // Get tier sheet name (use tier name, fallback if no tier)
  const excelSheetName = tierData?.name || "No Tier";

  // Get the next row index for this resident and tier combination
  const lastRecord = await prisma.claimsBillingRecord.findFirst({
    where: {
      tenantId,
      residentId,
      tierId: tierId || null,
    },
    orderBy: {
      rowIndex: "desc",
    },
  });
  const rowIndex = lastRecord ? lastRecord.rowIndex + 1 : 1;

  // Create the billing record
  const record = await prisma.claimsBillingRecord.create({
    data: {
      tenantId,
      residentId,
      billingMonth: normalizedBillingMonth,
      rowIndex,
      excelSheetName,
      // Provider fields (use provided or from settings)
      providerName: providerName || providerSettings?.providerName || null,
      providerId: providerId || providerSettings?.providerId || null,
      tinSsnEin: tinSsnEin || providerSettings?.tinSsnEin || null,
      billingProviderNpi:
        billingProviderNpi || providerSettings?.billingProviderNpi || null,
      billingProviderTaxonomy:
        billingProviderTaxonomy ||
        providerSettings?.billingProviderTaxonomy ||
        null,
      billingProviderStreet:
        billingProviderStreet ||
        providerSettings?.billingProviderStreet ||
        null,
      billingProviderCity:
        billingProviderCity || providerSettings?.billingProviderCity || null,
      billingProviderState:
        billingProviderState || providerSettings?.billingProviderState || null,
      billingProviderZip:
        billingProviderZip || providerSettings?.billingProviderZip || null,
      // Service fields
      tierId: tierId || null,
      tierUnitCost: tierUnitCost ? new Prisma.Decimal(tierUnitCost) : null,
      serviceCode: serviceCode || tierData?.serviceCode || "S5126",
      modifier1:
        modifier1 !== undefined ? modifier1 : tierData?.modifier1 || null,
      modifier2:
        modifier2 !== undefined ? modifier2 : tierData?.modifier2 || null,
      units: units || null,
      claimBilledAmount,
      // Client fields
      clientAddress: clientAddress || null,
      clientCity: clientCity || null,
      clientState: clientState || null,
      clientZip: clientZip || null,
      placeOfService: placeOfService || null,
      clientId: clientId || null,
      clientLastName: clientLastName || null,
      clientFirstName: clientFirstName || null,
      clientGender: clientGender || null,
      clientDob: clientDob ? new Date(clientDob) : null,
      diagnosisCode: diagnosisCode || null,
      // Service dates
      serviceFromDate: serviceFromDate ? new Date(serviceFromDate) : null,
      serviceToDate: serviceToDate ? new Date(serviceToDate) : null,
      // MCO fields (empty by default)
      originalClaimId: originalClaimId || null,
      frequencyCode: frequencyCode || null,
      // Billing status (system-only; default PENDING)
      billingStatus: data.billingStatus || "PENDING",
      paidAmount:
        data.paidAmount != null ? new Prisma.Decimal(data.paidAmount) : null,
      paidAt: data.paidAt ? new Date(data.paidAt) : null,
      // Metadata
      createdBy: user.id || null,
    },
    include: {
      tier: {
        select: {
          id: true,
          name: true,
          tierNumber: true,
          unitCost: true,
        },
      },
    },
  });

  // Create or update Excel sheet
  await createOrUpdateResidentSheet(residentId, tenantId, record);
  await addRowToSheet(residentId, tenantId, record);

  return record;
}

/**
 * Update an existing claims billing record
 * @param {string} id - Record ID
 * @param {Object} data - Update data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Updated billing record
 */
async function updateClaimsRecord(id, data, user) {
  const tenantId = determineTenantId(user, data);

  // Check if record exists
  const existingRecord = await getClaimsRecord(id, tenantId);

  // Build update data object first (needed for tier updates)
  const updateData = {};

  // Get tier data if tierId is being updated
  let tierData = null;
  let tierUnitCost = null;
  if (data.tierId !== undefined) {
    if (data.tierId) {
      tierData = await getTierById(data.tierId, tenantId);
      tierUnitCost = tierData.unitCost;
      // Update excelSheetName if tier changed
      updateData.excelSheetName = tierData.name || "No Tier";
    } else {
      tierUnitCost = null;
      updateData.excelSheetName = "No Tier";
    }
  } else if (existingRecord.tierId) {
    tierData = await getTierById(existingRecord.tierId, tenantId);
    tierUnitCost = tierData.unitCost;
  }

  // Calculate claim billed amount if units or tier changed
  const units = data.units !== undefined ? data.units : existingRecord.units;
  const finalTierUnitCost =
    data.tierId !== undefined
      ? tierUnitCost
      : existingRecord.tierUnitCost
      ? Number(existingRecord.tierUnitCost)
      : null;
  const claimBilledAmount = calculateClaimBilledAmount(
    units,
    finalTierUnitCost
  );

  // Provider fields
  if (data.providerName !== undefined)
    updateData.providerName = data.providerName;
  if (data.providerId !== undefined) updateData.providerId = data.providerId;
  if (data.tinSsnEin !== undefined) updateData.tinSsnEin = data.tinSsnEin;
  if (data.billingProviderNpi !== undefined)
    updateData.billingProviderNpi = data.billingProviderNpi;
  if (data.billingProviderTaxonomy !== undefined)
    updateData.billingProviderTaxonomy = data.billingProviderTaxonomy;
  if (data.billingProviderStreet !== undefined)
    updateData.billingProviderStreet = data.billingProviderStreet;
  if (data.billingProviderCity !== undefined)
    updateData.billingProviderCity = data.billingProviderCity;
  if (data.billingProviderState !== undefined)
    updateData.billingProviderState = data.billingProviderState;
  if (data.billingProviderZip !== undefined)
    updateData.billingProviderZip = data.billingProviderZip;

  // Service fields
  if (data.tierId !== undefined) updateData.tierId = data.tierId || null;
  if (data.tierUnitCost !== undefined || tierUnitCost !== null) {
    updateData.tierUnitCost = tierUnitCost
      ? new Prisma.Decimal(tierUnitCost)
      : null;
  }
  if (data.serviceCode !== undefined) updateData.serviceCode = data.serviceCode;
  if (data.modifier1 !== undefined) updateData.modifier1 = data.modifier1;
  if (data.modifier2 !== undefined) updateData.modifier2 = data.modifier2;
  if (data.units !== undefined) updateData.units = data.units;
  if (claimBilledAmount !== null)
    updateData.claimBilledAmount = claimBilledAmount;

  // Client fields
  if (data.clientAddress !== undefined)
    updateData.clientAddress = data.clientAddress;
  if (data.clientCity !== undefined) updateData.clientCity = data.clientCity;
  if (data.clientState !== undefined) updateData.clientState = data.clientState;
  if (data.clientZip !== undefined) updateData.clientZip = data.clientZip;
  if (data.placeOfService !== undefined)
    updateData.placeOfService = data.placeOfService;
  if (data.clientId !== undefined) updateData.clientId = data.clientId;
  if (data.clientLastName !== undefined)
    updateData.clientLastName = data.clientLastName;
  if (data.clientFirstName !== undefined)
    updateData.clientFirstName = data.clientFirstName;
  if (data.clientGender !== undefined)
    updateData.clientGender = data.clientGender;
  if (data.clientDob !== undefined)
    updateData.clientDob = data.clientDob ? new Date(data.clientDob) : null;
  if (data.diagnosisCode !== undefined)
    updateData.diagnosisCode = data.diagnosisCode;

  // Service dates
  if (data.serviceFromDate !== undefined)
    updateData.serviceFromDate = data.serviceFromDate
      ? new Date(data.serviceFromDate)
      : null;
  if (data.serviceToDate !== undefined)
    updateData.serviceToDate = data.serviceToDate
      ? new Date(data.serviceToDate)
      : null;

  // MCO fields
  if (data.originalClaimId !== undefined)
    updateData.originalClaimId = data.originalClaimId;
  if (data.frequencyCode !== undefined)
    updateData.frequencyCode = data.frequencyCode;

  // Billing status (system-only)
  if (data.billingStatus !== undefined)
    updateData.billingStatus = data.billingStatus;
  if (data.paidAmount !== undefined)
    updateData.paidAmount =
      data.paidAmount != null ? new Prisma.Decimal(data.paidAmount) : null;
  if (data.paidAt !== undefined)
    updateData.paidAt = data.paidAt ? new Date(data.paidAt) : null;
  // Auto-set paidAt when marking as PAID and not explicitly provided
  if (
    data.billingStatus === "PAID" &&
    data.paidAt === undefined &&
    !existingRecord.paidAt
  ) {
    updateData.paidAt = new Date();
  }

  // Metadata
  updateData.updatedBy = user.id || null;

  // Update the record
  const updatedRecord = await prisma.claimsBillingRecord.update({
    where: { id },
    data: updateData,
    include: {
      tier: {
        select: {
          id: true,
          name: true,
          tierNumber: true,
          unitCost: true,
        },
      },
    },
  });

  // If tier changed, we need to handle moving the row to the new sheet
  // For now, we'll update the row in the original sheet (the excelSheetName field tracks the original)
  // The rowIndex should remain the same for the original sheet
  const sheetNameToUse =
    existingRecord.excelSheetName || existingRecord.tier?.name || "No Tier";
  const recordForExcel = {
    ...updatedRecord,
    excelSheetName: sheetNameToUse, // Use original sheet name for update
  };

  // Update Excel sheet row
  await updateRowInSheet(
    existingRecord.residentId,
    tenantId,
    recordForExcel,
    existingRecord.rowIndex
  );

  return updatedRecord;
}

/**
 * Get a single claims billing record by ID
 * @param {string} id - Record ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Billing record
 */
async function getClaimsRecord(id, tenantId) {
  const record = await prisma.claimsBillingRecord.findFirst({
    where: {
      id,
      tenantId,
    },
    include: {
      tier: {
        select: {
          id: true,
          name: true,
          tierNumber: true,
          unitCost: true,
          modifier1: true,
          modifier2: true,
          serviceCode: true,
        },
      },
    },
  });

  // Return null if record not found (not an error - just empty data)
  return record;
}

/**
 * Get claims billing records with filtering and pagination
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Records with pagination
 */
async function getClaimsRecords(tenantId, filters = {}) {
  const {
    page,
    limit,
    residentId,
    billingMonth,
    tierId,
    search,
    billingStatus,
  } = filters;

  const where = {
    tenantId,
  };

  // Filter by resident
  if (residentId) {
    where.residentId = residentId;
  }

  // Filter by billing status (UNPAID = PENDING | PARTIAL | OVERDUE)
  if (billingStatus) {
    if (billingStatus === "UNPAID") {
      where.billingStatus = { in: ["PENDING", "PARTIAL", "OVERDUE"] };
    } else if (
      ["PENDING", "PAID", "PARTIAL", "OVERDUE"].includes(billingStatus)
    ) {
      where.billingStatus = billingStatus;
    }
  }

  // Filter by billing month
  if (billingMonth) {
    const monthDate =
      billingMonth instanceof Date ? billingMonth : new Date(billingMonth);
    const year = monthDate.getFullYear();
    const monthIndex = monthDate.getMonth();
    const normalizedMonth = new Date(Date.UTC(year, monthIndex, 1));
    const nextMonth = new Date(Date.UTC(year, monthIndex + 1, 1));

    where.billingMonth = {
      gte: normalizedMonth,
      lt: nextMonth,
    };
  }

  // Filter by tier
  if (tierId) {
    where.tierId = tierId;
  }

  // Search filter (client name, provider name)
  if (search) {
    where.OR = [
      { clientFirstName: { contains: search, mode: "insensitive" } },
      { clientLastName: { contains: search, mode: "insensitive" } },
      { providerName: { contains: search, mode: "insensitive" } },
    ];
  }

  // Pagination
  const skip = page && limit ? (page - 1) * limit : undefined;
  const take = limit;

  const [records, total] = await Promise.all([
    prisma.claimsBillingRecord.findMany({
      where,
      skip,
      take,
      include: {
        tier: {
          select: {
            id: true,
            name: true,
            tierNumber: true,
            unitCost: true,
          },
        },
      },
      orderBy: {
        billingMonth: "desc",
      },
    }),
    prisma.claimsBillingRecord.count({ where }),
  ]);

  return {
    records,
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
 * Get billing history for a specific resident
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of billing records
 */
async function getClaimsHistory(residentId, tenantId) {
  const records = await prisma.claimsBillingRecord.findMany({
    where: {
      tenantId,
      residentId,
    },
    include: {
      tier: {
        select: {
          id: true,
          name: true,
          tierNumber: true,
          unitCost: true,
        },
      },
    },
    orderBy: {
      billingMonth: "desc",
    },
  });

  return records;
}

/**
 * Delete a claims billing record
 * @param {string} id - Record ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Deleted record
 */
async function deleteClaimsRecord(id, user) {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only an administrator can delete this.");
  }

  const tenantId = determineTenantId(user);

  // Check if record exists
  const record = await getClaimsRecord(id, tenantId);

  // Check if this is the last billing record for this resident
  const remainingRecords = await prisma.claimsBillingRecord.findMany({
    where: {
      tenantId,
      residentId: record.residentId,
    },
  });

  const isLastRecord = remainingRecords.length === 1;

  // Delete the row from Excel before deleting the record
  try {
    if (isLastRecord) {
      // If this is the last record, delete the entire Excel file
      const { deleteExcelFileFromS3 } = require("./claims-excel.service");
      await deleteExcelFileFromS3(record.residentId, tenantId);
    } else {
      // Otherwise, just delete the row
      await deleteRowFromSheet(record.residentId, tenantId, record.rowIndex);
    }
  } catch (excelError) {
    // Log error but don't fail the deletion if Excel operation fails
    console.error(
      `Failed to delete Excel row/file for record ${id}:`,
      excelError
    );
    // Continue with database deletion even if Excel deletion fails
  }

  // Delete the record from database
  const deletedRecord = await prisma.claimsBillingRecord.delete({
    where: { id },
  });

  return deletedRecord;
}

module.exports = {
  createClaimsRecord,
  updateClaimsRecord,
  getClaimsRecord,
  getClaimsRecords,
  getClaimsHistory,
  deleteClaimsRecord,
};

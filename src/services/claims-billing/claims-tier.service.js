const prisma = require("../../lib/prisma");
const { Prisma } = require("@prisma/client");

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
 * Get tier by ID
 * @param {string} id - Tier ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Tier details
 */
async function getTierById(id, tenantId) {
  const tier = await prisma.claimsBillingTier.findFirst({
    where: {
      id,
      tenantId,
    },
  });

  // Return null if tier not found (not an error - just empty data)
  return tier;
}

/**
 * Seed default tiers for a tenant (12 tiers: 6 Regular + 6 ILOS)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Created tiers
 */
async function seedClaimsBillingTiers(tenantId) {
  // Check if tiers already exist
  const existingCount = await prisma.claimsBillingTier.count({
    where: { tenantId },
  });

  if (existingCount > 0) {
    // Tiers already exist, return existing ones
    return prisma.claimsBillingTier.findMany({
      where: { tenantId },
      orderBy: [{ tierNumber: "asc" }, { isILOS: "asc" }],
    });
  }

  // Standard tier configuration
  const tierConfig = [
    // Regular Tiers
    { tierNumber: 1, isILOS: false, name: "Tier 1", modifier1: null, modifier2: null, unitCost: 36.3 },
    { tierNumber: 2, isILOS: false, name: "Tier 2", modifier1: "TF", modifier2: null, unitCost: 98.01 },
    { tierNumber: 3, isILOS: false, name: "Tier 3", modifier1: "HE", modifier2: null, unitCost: 194.81 },
    { tierNumber: 4, isILOS: false, name: "Tier 4", modifier1: "TG", modifier2: null, unitCost: 303.71 },
    { tierNumber: 5, isILOS: false, name: "Tier 5", modifier1: "HK", modifier2: null, unitCost: 424.71 },
    { tierNumber: 6, isILOS: false, name: "Tier 6", modifier1: "HI", modifier2: null, unitCost: 528.0 },
    // ILOS Tiers
    { tierNumber: 1, isILOS: true, name: "ILOS T1", modifier1: "SE", modifier2: null, unitCost: 36.3 },
    { tierNumber: 2, isILOS: true, name: "ILOS T2", modifier1: "TF", modifier2: "SE", unitCost: 98.01 },
    { tierNumber: 3, isILOS: true, name: "ILOS T3", modifier1: "HE", modifier2: "SE", unitCost: 194.81 },
    { tierNumber: 4, isILOS: true, name: "ILOS T4", modifier1: "TG", modifier2: "SE", unitCost: 303.71 },
    { tierNumber: 5, isILOS: true, name: "ILOS T5", modifier1: "HK", modifier2: "SE", unitCost: 424.71 },
    { tierNumber: 6, isILOS: true, name: "ILOS T6", modifier1: "HI", modifier2: "SE", unitCost: 528.0 },
  ];

  // Create all tiers
  const createdTiers = await Promise.all(
    tierConfig.map((config) =>
      prisma.claimsBillingTier.create({
        data: {
          tenantId,
          tierNumber: config.tierNumber,
          isILOS: config.isILOS,
          name: config.name,
          unitCost: new Prisma.Decimal(config.unitCost),
          modifier1: config.modifier1,
          modifier2: config.modifier2,
          serviceCode: "S5126",
          isActive: true,
        },
      })
    )
  );

  return createdTiers;
}

/**
 * Get all tiers for a tenant (auto-seeds if not exist)
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Tiers with pagination
 */
async function getTiers(tenantId, filters = {}) {
  // Auto-seed tiers if they don't exist (lazy loading)
  await seedClaimsBillingTiers(tenantId);

  const { page, limit, isActive, tierNumber, isILOS } = filters;

  const where = {
    tenantId,
  };

  // Filter by active status
  if (isActive !== undefined) {
    where.isActive = isActive === true || isActive === "true";
  }

  // Filter by tier number
  if (tierNumber !== undefined) {
    where.tierNumber = tierNumber;
  }

  // Filter by ILOS status
  if (isILOS !== undefined) {
    where.isILOS = isILOS === true || isILOS === "true";
  }

  // Pagination
  const skip = page && limit ? (page - 1) * limit : undefined;
  const take = limit;

  const [tiers, total] = await Promise.all([
    prisma.claimsBillingTier.findMany({
      where,
      skip,
      take,
      orderBy: [
        { tierNumber: "asc" },
        { isILOS: "asc" },
      ],
    }),
    prisma.claimsBillingTier.count({ where }),
  ]);

  return {
    tiers,
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
 * Get tier fields for auto-fill (unit cost, modifiers, service code)
 * @param {string} tierId - Tier ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Tier fields for auto-fill
 */
async function getTierFields(tierId, tenantId) {
  const tier = await getTierById(tierId, tenantId);

  return {
    tierUnitCost: tier.unitCost,
    serviceCode: tier.serviceCode,
    modifier1: tier.modifier1,
    modifier2: tier.modifier2,
  };
}

/**
 * Create a new claims billing tier
 * @param {Object} data - Tier data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created tier
 */
async function createTier(data, user) {
  const tenantId = determineTenantId(user, data);
  const { tierNumber, isILOS, name, unitCost, modifier1, modifier2, serviceCode, isActive } = data;

  // Validate tier number is between 1-6
  if (tierNumber < 1 || tierNumber > 6) {
    throw new Error("Tier number must be between 1 and 6");
  }

  // Validate unit cost is positive
  if (unitCost <= 0) {
    throw new Error("Unit cost must be greater than 0");
  }

  // Check if tier with same tierNumber and isILOS already exists
  const existingTier = await prisma.claimsBillingTier.findFirst({
    where: {
      tenantId,
      tierNumber,
      isILOS: isILOS ?? false,
    },
  });

  if (existingTier) {
    const tierType = isILOS ? "ILOS" : "Regular";
    throw new Error(`${tierType} Tier ${tierNumber} already exists for this tenant`);
  }

  const tier = await prisma.claimsBillingTier.create({
    data: {
      tenantId,
      tierNumber,
      isILOS: isILOS ?? false,
      name: name.trim(),
      unitCost: new Prisma.Decimal(unitCost),
      modifier1: modifier1 || null,
      modifier2: modifier2 || null,
      serviceCode: serviceCode || "S5126",
      isActive: isActive ?? true,
    },
  });

  return tier;
}

/**
 * Update a claims billing tier
 * @param {string} id - Tier ID
 * @param {Object} data - Update data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Updated tier
 */
async function updateTier(id, data, user) {
  const tenantId = determineTenantId(user, data);

  // Check if tier exists
  await getTierById(id, tenantId);

  const { name, unitCost, modifier1, modifier2, serviceCode, isActive } = data;

  // Validate unit cost if provided
  if (unitCost !== undefined && unitCost <= 0) {
    throw new Error("Unit cost must be greater than 0");
  }

  // Build update data
  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (unitCost !== undefined) updateData.unitCost = new Prisma.Decimal(unitCost);
  if (modifier1 !== undefined) updateData.modifier1 = modifier1 || null;
  if (modifier2 !== undefined) updateData.modifier2 = modifier2 || null;
  if (serviceCode !== undefined) updateData.serviceCode = serviceCode;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updatedTier = await prisma.claimsBillingTier.update({
    where: { id },
    data: updateData,
  });

  return updatedTier;
}

/**
 * Delete a claims billing tier
 * @param {string} id - Tier ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Deleted tier
 */
async function deleteTier(id, user) {
  const tenantId = determineTenantId(user);

  // Check if tier exists
  await getTierById(id, tenantId);

  // Check if tier is used in any billing records
  const recordCount = await prisma.claimsBillingRecord.count({
    where: {
      tierId: id,
    },
  });

  if (recordCount > 0) {
    throw new Error(
      `Cannot delete tier. It is used in ${recordCount} billing record(s).`
    );
  }

  const deletedTier = await prisma.claimsBillingTier.delete({
    where: { id },
  });

  return deletedTier;
}

module.exports = {
  getTierById,
  getTiers,
  getTierFields,
  seedClaimsBillingTiers,
  createTier,
  updateTier,
  deleteTier,
};


const prisma = require("../../lib/prisma");

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
 * Get provider settings for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object|null>} Provider settings or null if not set
 */
async function getProviderSettings(tenantId) {
  const settings = await prisma.claimsProviderSettings.findUnique({
    where: {
      tenantId,
    },
  });

  return settings;
}

/**
 * Create or update provider settings
 * @param {Object} data - Provider settings data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created or updated provider settings
 */
async function updateProviderSettings(data, user) {
  const tenantId = determineTenantId(user, data);
  const {
    providerName,
    providerId,
    tinSsnEin,
    billingProviderNpi,
    billingProviderTaxonomy,
    billingProviderStreet,
    billingProviderCity,
    billingProviderState,
    billingProviderZip,
  } = data;

  // Validate required fields
  if (!providerName || !tinSsnEin || !billingProviderNpi || !billingProviderTaxonomy) {
    throw new Error("Provider name, TIN/SSN/EIN, NPI, and Taxonomy are required");
  }

  if (!billingProviderStreet || !billingProviderCity || !billingProviderState || !billingProviderZip) {
    throw new Error("Provider address fields are required");
  }

  // Check if settings already exist
  const existingSettings = await getProviderSettings(tenantId);

  if (existingSettings) {
    // Update existing settings
    const updatedSettings = await prisma.claimsProviderSettings.update({
      where: {
        tenantId,
      },
      data: {
        providerName: providerName.trim(),
        providerId: providerId?.trim() || null,
        tinSsnEin: tinSsnEin.trim(),
        billingProviderNpi: billingProviderNpi.trim(),
        billingProviderTaxonomy: billingProviderTaxonomy.trim(),
        billingProviderStreet: billingProviderStreet.trim(),
        billingProviderCity: billingProviderCity.trim(),
        billingProviderState: billingProviderState.trim(),
        billingProviderZip: billingProviderZip.trim(),
      },
    });

    return updatedSettings;
  } else {
    // Create new settings
    const newSettings = await prisma.claimsProviderSettings.create({
      data: {
        tenantId,
        providerName: providerName.trim(),
        providerId: providerId?.trim() || null,
        tinSsnEin: tinSsnEin.trim(),
        billingProviderNpi: billingProviderNpi.trim(),
        billingProviderTaxonomy: billingProviderTaxonomy.trim(),
        billingProviderStreet: billingProviderStreet.trim(),
        billingProviderCity: billingProviderCity.trim(),
        billingProviderState: billingProviderState.trim(),
        billingProviderZip: billingProviderZip.trim(),
      },
    });

    return newSettings;
  }
}

module.exports = {
  getProviderSettings,
  updateProviderSettings,
};


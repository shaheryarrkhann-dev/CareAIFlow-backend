const crypto = require("node:crypto");
const prisma = require("../../lib/prisma");
const facilityService = require("./facility.service");
const { uploadVisitorQrLogoToS3 } = require("../../utils/s3.util");

const TOKEN_BYTES = 32; // 256 bits entropy; hex output = 64 chars (never log plain token)

/**
 * Generate a secure random token for QR sign-in links.
 * Do not log or expose this value; it is the sole secret for the public sign-in URL.
 * @returns {string} Hex-encoded token (64 chars)
 */
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Resolve and validate facility for tenant. Throws if facility not found or not owned by tenant.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID (required for QR config operations)
 * @returns {Promise<{ id: string, tenantId: string }>}
 */
async function resolveFacility(tenantId, facilityId) {
  if (!facilityId) throw new Error("facilityId is required");
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  return { id: facility.id, tenantId: facility.tenantId };
}

/**
 * Get or create QR config for a facility. Creates config with new token if none exists.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object>} FacilityQRConfig with facility relation
 */
async function getOrCreateConfig(tenantId, facilityId) {
  await resolveFacility(tenantId, facilityId);

  let config = await prisma.facilityQRConfig.findUnique({
    where: { facilityId },
    include: { facility: { select: { id: true, name: true, tenantId: true } } },
  });

  if (!config) {
    config = await prisma.facilityQRConfig.create({
      data: {
        facilityId,
        token: generateToken(),
      },
      include: { facility: { select: { id: true, name: true, tenantId: true } } },
    });
  }

  return config;
}

/**
 * Regenerate the QR token for a facility. Invalidates any existing QR codes.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object>} Updated FacilityQRConfig with facility relation
 */
async function regenerateToken(tenantId, facilityId) {
  await resolveFacility(tenantId, facilityId);

  const config = await prisma.facilityQRConfig.findUnique({
    where: { facilityId },
  });

  if (!config) {
    return getOrCreateConfig(tenantId, facilityId);
  }

  return prisma.facilityQRConfig.update({
    where: { facilityId },
    data: { token: generateToken() },
    include: { facility: { select: { id: true, name: true, tenantId: true } } },
  });
}

/**
 * Get QR config by token (for public sign-in flow). Does not expose resident data.
 * @param {string} token - QR token from link
 * @returns {Promise<Object|null>} Config with facility id/name/tenantId, or null if not found
 */
async function getConfigByToken(token) {
  if (!token || typeof token !== "string" || !token.trim()) return null;

  const config = await prisma.facilityQRConfig.findUnique({
    where: { token: token.trim() },
    include: {
      facility: {
        select: { id: true, name: true, tenantId: true },
      },
    },
  });

  return config;
}

/**
 * Get QR config by facility (for admin logo fetch). Does not create.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object|null>} FacilityQRConfig or null
 */
async function getConfigByFacility(tenantId, facilityId) {
  await resolveFacility(tenantId, facilityId);
  return prisma.facilityQRConfig.findUnique({
    where: { facilityId },
  });
}

function getResidentDisplayName(r) {
  if (!r) return "";
  const preferred =
    r.residentIdentificationPreferredName || r.residentPreferredName;
  const fullLegal =
    r.residentIdentificationFullLegalName || r.residentFullLegalName;
  return (preferred || fullLegal || "").trim();
}

/**
 * Get public config by token for visitor sign-in page. Returns display-only data.
 * No resident directory is exposed; visitors enter the person's name in a free-text field.
 * @param {string} token - QR token from link
 * @returns {Promise<Object|null>} { facilityDisplayName, logoUrl, instructionText, disclaimerText, layoutOption } or null
 */
async function getPublicConfigByToken(token) {
  const config = await getConfigByToken(token);
  if (!config || !config.facility) return null;

  return {
    facilityDisplayName:
      config.facilityDisplayName || config.facility.name || "Visitor Sign-In",
    logoUrl: config.logoUrl || null,
    logoS3Key: config.logoS3Key || null,
    instructionText: config.instructionText || "Scan to Sign In",
    disclaimerText: config.disclaimerText || null,
    layoutOption: config.layoutOption || "default",
    // No personVisitedOptions - residents are not listed publicly; visitor types the name.
  };
}

/**
 * Upload logo for facility QR and set logoS3Key. Clears logoUrl so uploaded logo is used.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @param {Object} file - Multer file { buffer, mimetype, originalname }
 * @returns {Promise<Object>} Updated FacilityQRConfig with facility relation
 */
async function uploadLogo(tenantId, facilityId, file) {
  if (!file?.buffer) throw new Error("File is required");
  await resolveFacility(tenantId, facilityId);

  const { s3Key } = await uploadVisitorQrLogoToS3({
    tenantId,
    facilityId,
    buffer: file.buffer,
    mimeType: file.mimetype || "image/png",
    fileName: file.originalname || "logo.png",
  });

  const config = await prisma.facilityQRConfig.findUnique({
    where: { facilityId },
  });

  const data = {
    logoS3Key: s3Key,
    logoUrl: null,
  };

  if (config) {
    return prisma.facilityQRConfig.update({
      where: { facilityId },
      data,
      include: { facility: { select: { id: true, name: true, tenantId: true } } },
    });
  }

  return prisma.facilityQRConfig.create({
    data: {
      facilityId,
      token: generateToken(),
      ...data,
    },
    include: { facility: { select: { id: true, name: true, tenantId: true } } },
  });
}

/**
 * Update customization fields for a facility's QR template.
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @param {Object} data - { instructionText?, disclaimerText?, layoutOption?, facilityDisplayName?, logoUrl?, logoS3Key? }
 * @returns {Promise<Object>} Updated FacilityQRConfig
 */
async function updateCustomization(tenantId, facilityId, data) {
  await resolveFacility(tenantId, facilityId);

  const config = await prisma.facilityQRConfig.findUnique({
    where: { facilityId },
  });

  const payload = {};
  if (data.instructionText !== undefined) payload.instructionText = data.instructionText?.trim() || null;
  if (data.disclaimerText !== undefined) payload.disclaimerText = data.disclaimerText?.trim() || null;
  if (data.layoutOption !== undefined) payload.layoutOption = data.layoutOption?.trim() || null;
  if (data.facilityDisplayName !== undefined) payload.facilityDisplayName = data.facilityDisplayName?.trim() || null;
  if (data.logoUrl !== undefined) {
    payload.logoUrl = data.logoUrl?.trim() || null;
    if (payload.logoUrl) payload.logoS3Key = null;
  }
  if (data.logoS3Key !== undefined) payload.logoS3Key = data.logoS3Key?.trim() || null;

  if (config) {
    return prisma.facilityQRConfig.update({
      where: { facilityId },
      data: payload,
      include: { facility: { select: { id: true, name: true, tenantId: true } } },
    });
  }

  return prisma.facilityQRConfig.create({
    data: {
      facilityId,
      token: generateToken(),
      ...payload,
    },
    include: { facility: { select: { id: true, name: true, tenantId: true } } },
  });
}

module.exports = {
  getOrCreateConfig,
  getConfigByFacility,
  regenerateToken,
  getConfigByToken,
  getPublicConfigByToken,
  updateCustomization,
  uploadLogo,
  generateToken,
};

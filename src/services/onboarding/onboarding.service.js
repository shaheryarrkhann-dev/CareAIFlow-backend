const prisma = require("../../lib/prisma");
const facilityFolderService = require("../facility/facility-folder.service");
const saasSubscriptionService = require("../stripe/saas-subscription.service");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../../utils/jwt.util");

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Self-serve org bootstrap: Tenant + first Facility + owner ADMIN link + subscription tenantId.
 * Idempotent if the user already owns a tenant.
 */
async function bootstrapOrganization(userId, input) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user || !user.isActive) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  if (!user.isEmailVerified) {
    throw Object.assign(new Error("Verify your email before creating an organization"), {
      status: 403,
    });
  }

  // Already bootstrapped — return existing workspace (idempotent)
  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });
    const facility = await prisma.facility.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "asc" },
    });
    const tokens = await issueTenantSession(user, user.tenantId);
    return {
      alreadyExists: true,
      tenant,
      facility,
      ...tokens,
    };
  }

  const subscription = await saasSubscriptionService.getLatestForUser(userId);
  if (!subscription || !ACTIVE_SUB_STATUSES.has(subscription.status)) {
    throw Object.assign(
      new Error("Complete payment before creating your organization"),
      { status: 403 },
    );
  }

  const name = String(input.name || "").trim();
  const slug = String(input.slug || "").trim().toLowerCase();
  if (!name || !slug) {
    throw Object.assign(new Error("Organization name and slug are required"), {
      status: 400,
    });
  }
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2 || slug.length > 50) {
    throw Object.assign(
      new Error(
        "Slug must be 2–50 characters — lowercase letters, numbers, and hyphens only",
      ),
      { status: 400 },
    );
  }

  const facilityName = String(input.facilityName || "").trim() || name;
  if (!facilityName) {
    throw Object.assign(new Error("Facility name is required"), { status: 400 });
  }

  const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
  if (existingSlug) {
    throw Object.assign(new Error("Organization slug already exists"), {
      status: 409,
    });
  }

  let capacityVal = null;
  if (
    input.capacity !== undefined &&
    input.capacity !== null &&
    input.capacity !== ""
  ) {
    const n = parseInt(String(input.capacity), 10);
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      throw Object.assign(new Error("Capacity must be a non-negative integer"), {
        status: 400,
      });
    }
    capacityVal = n;
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name,
        slug,
        isActive: true,
      },
    });

    const facility = await tx.facility.create({
      data: {
        tenantId: tenant.id,
        name: facilityName,
        licenseNumber: input.licenseNumber?.trim() || null,
        address: input.address?.trim() || null,
        capacity: capacityVal,
        licenseExpirationDate: input.licenseExpirationDate
          ? new Date(input.licenseExpirationDate)
          : null,
        contactInformation: input.contactInformation?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        website: input.website?.trim() || null,
        profilePhotoUrl: input.profilePhotoUrl?.trim() || null,
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        tenantId: tenant.id,
        role: "ADMIN",
      },
    });

    await tx.userTenant.upsert({
      where: {
        userId_tenantId: { userId, tenantId: tenant.id },
      },
      create: {
        userId,
        tenantId: tenant.id,
        role: "ADMIN",
        isPrimary: true,
      },
      update: {
        role: "ADMIN",
        isPrimary: true,
      },
    });

    await tx.saasSubscription.updateMany({
      where: { userId, tenantId: null },
      data: { tenantId: tenant.id },
    });

    return { tenant, facility, user: updatedUser };
  });

  try {
    await facilityFolderService.ensureDefaultFacilityFolders(
      result.facility.id,
    );
  } catch (folderErr) {
    console.error(
      "[bootstrapOrganization] Failed to create default facility folders:",
      folderErr?.message,
    );
  }

  const tokens = await issueTenantSession(result.user, result.tenant.id);

  return {
    alreadyExists: false,
    tenant: result.tenant,
    facility: result.facility,
    ...tokens,
  };
}

async function issueTenantSession(user, tenantId) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: "ADMIN",
    tenantId,
  });
  const refreshToken = signRefreshToken({
    sub: user.id,
    tenantId,
  });
  const decoded = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      tenantId,
      expiresAt,
    },
  });

  const { passwordHash: _, ...userWithoutPassword } = user;
  return {
    accessToken,
    refreshToken,
    user: { ...userWithoutPassword, tenantId, role: "ADMIN" },
  };
}

module.exports = {
  bootstrapOrganization,
};

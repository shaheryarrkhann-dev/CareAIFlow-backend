const crypto = require("crypto");

/**
 * Store hashes of invite / verification / reset tokens (brief: never store raw).
 * Lookups accept hash or legacy plaintext during transition.
 */
function hashToken(rawToken) {
  return crypto
    .createHash("sha256")
    .update(String(rawToken || ""), "utf8")
    .digest("hex");
}

async function storeAuthToken(prisma, { rawToken, userId, expiresAt }) {
  const token = hashToken(rawToken);
  return prisma.passwordResetToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
}

async function findAuthToken(prisma, rawToken, options = {}) {
  if (!rawToken) return null;
  const hashed = hashToken(rawToken);
  const include = options.include || undefined;
  let row = await prisma.passwordResetToken.findUnique({
    where: { token: hashed },
    ...(include ? { include } : {}),
  });
  if (row) return row;
  // Legacy rows stored the JWT / raw token plaintext
  return prisma.passwordResetToken.findUnique({
    where: { token: String(rawToken) },
    ...(include ? { include } : {}),
  });
}

module.exports = {
  hashToken,
  storeAuthToken,
  findAuthToken,
};

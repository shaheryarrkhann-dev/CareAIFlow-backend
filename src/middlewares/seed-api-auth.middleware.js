/**
 * Protects temporary /api/seed routes. Set SEED_API_SECRET on the server, call once, then remove routes + secret.
 *
 * - Production (NODE_ENV=production): SEED_API_SECRET is required; requests must send it.
 * - Development: if SEED_API_SECRET is unset, routes are open (local convenience).
 */
function requireSeedApiSecret(req, res, next) {
  const secret = process.env.SEED_API_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProduction) {
      return res.status(503).json({
        success: false,
        message:
          "SEED_API_SECRET is not configured. Set it in the server environment, redeploy, then call this endpoint with header X-Seed-Secret or query ?secret=.",
      });
    }
    return next();
  }

  const provided =
    req.get("x-seed-secret") ||
    req.query.secret ||
    (req.body && req.body.secret);

  if (!provided || provided !== secret) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing seed secret. Use header X-Seed-Secret or query ?secret=.",
    });
  }

  return next();
}

module.exports = { requireSeedApiSecret };

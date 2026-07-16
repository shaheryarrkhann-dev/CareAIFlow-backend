const axios = require("axios");

// v3 is the current unified endpoint per https://ipgeolocation.io/documentation/ip-location-api.html
const BASE_URL = "https://api.ipgeolocation.io/v3/ipgeo";
const LOOKUP_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;

function shouldLogIpGeoDebug() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.IP_GEOLOCATION_DEBUG === "1" ||
    process.env.IP_GEOLOCATION_DEBUG === "true"
  );
}

/** @type {Map<string, { summary: string; expires: number }>} */
const cache = new Map();

/**
 * Strip IPv4-mapped IPv6 prefix (::ffff:x.x.x.x)
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  const t = String(ip).trim();
  if (t.startsWith("::ffff:")) return t.slice(7);
  return t;
}

/**
 * Skip loopback, private, and link-local IPs (no meaningful geo; saves API credits).
 * @param {string} ip
 * @returns {boolean}
 */
function isPublicIpForGeolocation(ip) {
  const t = normalizeIp(ip);
  if (!t) return false;
  if (t === "127.0.0.1" || t === "::1") return false;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)) return false;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(t)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(t)) return false;
  if (t.startsWith("fe80:") || t.startsWith("fc") || t.startsWith("fd")) return false;
  return true;
}

function pruneCache() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const keys = [...cache.keys()];
  for (let i = 0; i < 300 && keys.length; i++) {
    cache.delete(keys[i]);
  }
}

/**
 * Returns a short label like "Seattle, Washington, United States" using
 * [ipgeolocation.io](https://ipgeolocation.io/pricing.html) when IP_GEOLOCATION_KEY is set.
 * @param {string|null|undefined} ip
 * @returns {Promise<string|null>}
 */
async function lookupIpGeolocationSummary(ip) {
  const apiKey = process.env.IP_GEOLOCATION_KEY;
  if (!apiKey || !ip) return null;

  const normalized = normalizeIp(ip);
  if (!isPublicIpForGeolocation(normalized)) return null;

  const cached = cache.get(normalized);
  if (cached && cached.expires > Date.now()) {
    if (shouldLogIpGeoDebug() && cached.summary) {
      console.log(
        `[ip-geolocation] ${normalized} → ${cached.summary} (cache)`
      );
    }
    return cached.summary;
  }

  try {
    const { data, status } = await axios.get(BASE_URL, {
      params: { apiKey, ip: normalized },
      timeout: LOOKUP_TIMEOUT_MS,
      validateStatus: () => true,
    });

    if (status !== 200 || !data || typeof data !== "object") {
      if (shouldLogIpGeoDebug()) {
        console.log(
          `[ip-geolocation] ${normalized}: HTTP ${status} — check API key or quota`
        );
      }
      return null;
    }

    if (data.message && String(data.message).toLowerCase().includes("invalid")) {
      if (shouldLogIpGeoDebug()) {
        console.log(`[ip-geolocation] ${normalized}: ${data.message}`);
      }
      return null;
    }

    const loc = data.location || {};
    const parts = [loc.city, loc.state_prov, loc.country_name].filter(
      (p) => p != null && String(p).trim() !== ""
    );
    const summary = parts.length ? parts.join(", ").slice(0, 500) : null;

    if (summary) {
      cache.set(normalized, { summary, expires: Date.now() + CACHE_TTL_MS });
      pruneCache();
    }

    if (shouldLogIpGeoDebug()) {
      if (summary) {
        console.log(`[ip-geolocation] ${normalized} → ${summary}`);
      } else if (status === 200) {
        console.log(
          `[ip-geolocation] ${normalized} → (no city/region/country in response)`
        );
      }
    }

    return summary;
  } catch (err) {
    console.warn("[ip-geolocation] lookup failed:", err?.message || err);
    return null;
  }
}

module.exports = {
  lookupIpGeolocationSummary,
  normalizeIp,
  isPublicIpForGeolocation,
};

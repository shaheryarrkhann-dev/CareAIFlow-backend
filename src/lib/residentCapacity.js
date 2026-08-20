/**
 * Per-facility active resident enrollment limits.
 * Default 6; Super Admin may raise a facility to 7 or 8.
 */

const {
  getResidentCapacityPerFacility,
} = require("../config/onboardingLaunchConfig");

const ALLOWED_RESIDENT_CAPACITY_LIMITS = Object.freeze([6, 7, 8]);

/**
 * @param {unknown} value
 * @returns {number} One of 6 | 7 | 8 (falls back to env default, then 6)
 */
function normalizeResidentCapacityLimit(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (ALLOWED_RESIDENT_CAPACITY_LIMITS.includes(n)) return n;
  const envDefault = getResidentCapacityPerFacility();
  if (ALLOWED_RESIDENT_CAPACITY_LIMITS.includes(envDefault)) return envDefault;
  return 6;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isAllowedResidentCapacityLimit(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return ALLOWED_RESIDENT_CAPACITY_LIMITS.includes(n);
}

module.exports = {
  ALLOWED_RESIDENT_CAPACITY_LIMITS,
  normalizeResidentCapacityLimit,
  isAllowedResidentCapacityLimit,
};

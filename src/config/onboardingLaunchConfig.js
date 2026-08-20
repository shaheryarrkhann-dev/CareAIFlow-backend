/**
 * Launch / commercial knobs for onboarding.
 * Defaults keep TEST mode usable; live cutover is env-only (no code rewrite).
 *
 * Do not invent trial length or capacity policy — owner sets env when ready.
 */

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

function envInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return defaultValue;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

/** When false, self-serve Stripe Checkout is blocked; use assisted Path A. */
function isSelfServeCheckoutEnabled() {
  return envBool("SELF_SERVE_CHECKOUT_ENABLED", true);
}

/** 0 = no trial UI / no trial period. */
function getTrialDays() {
  return Math.max(0, envInt("TRIAL_DAYS", 0));
}

/**
 * AFH resident capacity per facility (brief: default 6, optionally 7 by policy).
 */
function getResidentCapacityPerFacility() {
  const n = envInt("RESIDENT_CAPACITY_PER_FACILITY", 6);
  return n > 0 ? n : 6;
}

/** Days after last session activity before paused-onboarding reminder. */
function getOnboardingPauseReminderDays() {
  return Math.max(1, envInt("ONBOARDING_PAUSE_REMINDER_DAYS", 3));
}

function getStripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return key ? "unknown" : "unset";
}

function getLaunchConfigPublic() {
  return {
    selfServeCheckoutEnabled: isSelfServeCheckoutEnabled(),
    trialDays: getTrialDays(),
    residentCapacityPerFacility: getResidentCapacityPerFacility(),
    stripeMode: getStripeMode(),
    extraFacilityMonthlyUsd: 170,
  };
}

module.exports = {
  isSelfServeCheckoutEnabled,
  getTrialDays,
  getResidentCapacityPerFacility,
  getOnboardingPauseReminderDays,
  getStripeMode,
  getLaunchConfigPublic,
};

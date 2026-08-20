/**
 * CareAIFlow plan entitlements — sourced from Subscription Onboarding Brief
 * + Website Pricing section.
 *
 * Resident capacity comes from RESIDENT_CAPACITY_PER_FACILITY (default 6).
 * Do not invent policy here; change only when commercial docs / env are updated.
 */

const {
  getResidentCapacityPerFacility,
} = require("./onboardingLaunchConfig");

const PLAN_KEYS = ["starter", "professional", "multi-home"];

/** @typedef {'starter'|'professional'|'multi-home'} PlanKey */

function buildPlanEntitlements() {
  const capacity = getResidentCapacityPerFacility();
  return {
    starter: {
      facilityLimit: 1,
      maxResidentsPerFacility: capacity,
      monthlyPriceUsd: 199,
      displayName: "Starter",
      extraFacilityAllowed: false,
      moduleFlags: {
        coreWorkflows: true,
        documentationExports: true,
        aiAdmissions: false,
        advancedCareBilling: false,
        expandedCompliance: false,
        multiHomeOverview: false,
        emar: false,
      },
      featureHighlights: [
        "1 facility",
        `Up to ${capacity} residents`,
        "Resident records, storage & core workflows",
        "Documentation exports",
        "Core AFH daily workflows",
      ],
    },
    professional: {
      facilityLimit: 1,
      maxResidentsPerFacility: capacity,
      monthlyPriceUsd: 269,
      displayName: "Professional",
      extraFacilityAllowed: false,
      moduleFlags: {
        coreWorkflows: true,
        documentationExports: true,
        aiAdmissions: true,
        advancedCareBilling: true,
        expandedCompliance: true,
        multiHomeOverview: false,
        emar: false,
      },
      featureHighlights: [
        "1 facility",
        `Up to ${capacity} residents`,
        "Everything in Starter",
        "AI admissions & form extraction",
        "Advanced care & billing workflows",
        "Expanded compliance / audit access",
        "Documentation exports",
      ],
    },
    "multi-home": {
      facilityLimit: 2,
      maxResidentsPerFacility: capacity,
      monthlyPriceUsd: 399,
      displayName: "Multi-Home",
      extraFacilityAllowed: true,
      moduleFlags: {
        coreWorkflows: true,
        documentationExports: true,
        aiAdmissions: true,
        advancedCareBilling: true,
        expandedCompliance: true,
        multiHomeOverview: true,
        emar: false,
      },
      featureHighlights: [
        "Up to 2 facilities included",
        `Up to ${capacity} residents per facility`,
        "Everything in Professional",
        "Centralized multi-home overview",
        "Switch between homes in one login",
        "Role-based visibility across facilities",
        "AI admissions, billing & advanced workflows",
        "Add more facilities later (+$170/mo each)",
      ],
    },
  };
}

/** Default AFH capacity guidance from onboarding brief (env-overridable). */
function DEFAULT_FACILITY_CAPACITY() {
  return getResidentCapacityPerFacility();
}
const OPTIONAL_FACILITY_CAPACITY = 7;

function normalizePlanKey(planKey) {
  if (!planKey) return null;
  const key = String(planKey).toLowerCase().replace(/_/g, "-");
  if (key === "pro") return "professional";
  return PLAN_KEYS.includes(key) ? key : null;
}

/**
 * Resolve entitlement package for a plan.
 * @param {string|null|undefined} planKey
 */
function getPlanEntitlement(planKey) {
  const key = normalizePlanKey(planKey);
  if (!key) return null;
  const entitlements = buildPlanEntitlements();
  return { planKey: key, ...entitlements[key] };
}

function includedFacilityLimit(planKey) {
  const e = getPlanEntitlement(planKey);
  return e ? e.facilityLimit : 0;
}

function maxResidentsPerFacility(planKey) {
  const e = getPlanEntitlement(planKey);
  return e ? e.maxResidentsPerFacility : getResidentCapacityPerFacility();
}

function getPublicPlanCatalog() {
  const entitlements = buildPlanEntitlements();
  return PLAN_KEYS.map((key) => {
    const e = entitlements[key];
    return {
      key,
      name: e.displayName,
      monthlyPrice: e.monthlyPriceUsd,
      facilityLimit: e.facilityLimit,
      maxResidentsPerFacility: e.maxResidentsPerFacility,
      extraFacilityAllowed: e.extraFacilityAllowed,
      features: e.featureHighlights,
      recommended: key === "professional",
      moduleFlags: e.moduleFlags,
    };
  });
}

module.exports = {
  PLAN_KEYS,
  get PLAN_ENTITLEMENTS() {
    return buildPlanEntitlements();
  },
  get DEFAULT_FACILITY_CAPACITY() {
    return DEFAULT_FACILITY_CAPACITY();
  },
  OPTIONAL_FACILITY_CAPACITY,
  normalizePlanKey,
  getPlanEntitlement,
  includedFacilityLimit,
  maxResidentsPerFacility,
  getPublicPlanCatalog,
};

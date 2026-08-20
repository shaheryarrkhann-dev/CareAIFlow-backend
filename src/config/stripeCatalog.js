/**
 * CareAIFlow SaaS subscription catalog (Stripe test mode).
 * Price IDs come from env (preferred) with hard-coded fallbacks for local defaults.
 *
 * Annual = 10 months paid (2 months free), billed yearly.
 */

const DEFAULT_PRICES = {
  starter: {
    monthly: "price_1Tyvcu2M5r1l2YoyfHFfe1R8",
    annual: "price_1Tyvcr2M5r1l2YoyuTtPv1qE",
  },
  professional: {
    monthly: "price_1Tyvdf2M5r1l2YoyzZkX2uwL",
    annual: "price_1Tyvcs2M5r1l2Yoy1tlYSAuR",
  },
  multiHome: {
    monthly: "price_1Tyvdg2M5r1l2Yoywx7qajL9",
    annual: "price_1Tyvct2M5r1l2Yoy0OzkQVdt",
  },
  extraFacility: {
    monthly: "price_1Tyvdh2M5r1l2Yoy8jwyWWyi",
    annual: "price_1Tyvdh2M5r1l2YoyM0dAkHHg",
  },
};

function envPrice(name, fallback) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

const STRIPE_CATALOG = {
  products: {
    starter: "prod_UytPp3Gb4xmNUB",
    professional: "prod_UytP6DYkEyO0ID",
    multiHome: "prod_UytPeU4CjgjsoJ",
    extraFacility: "prod_UytPv42owvHw0x",
  },
  prices: {
    starter: {
      monthly: envPrice(
        "STRIPE_PRICE_STARTER_MONTHLY",
        DEFAULT_PRICES.starter.monthly,
      ),
      annual: envPrice(
        "STRIPE_PRICE_STARTER_ANNUAL",
        DEFAULT_PRICES.starter.annual,
      ),
      lookupKeys: {
        monthly: "careaiflow_starter_monthly",
        annual: "careaiflow_starter_annual",
      },
    },
    professional: {
      monthly: envPrice(
        "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
        DEFAULT_PRICES.professional.monthly,
      ),
      annual: envPrice(
        "STRIPE_PRICE_PROFESSIONAL_ANNUAL",
        DEFAULT_PRICES.professional.annual,
      ),
      lookupKeys: {
        monthly: "careaiflow_professional_monthly",
        annual: "careaiflow_professional_annual",
      },
    },
    multiHome: {
      monthly: envPrice(
        "STRIPE_PRICE_MULTI_HOME_MONTHLY",
        DEFAULT_PRICES.multiHome.monthly,
      ),
      annual: envPrice(
        "STRIPE_PRICE_MULTI_HOME_ANNUAL",
        DEFAULT_PRICES.multiHome.annual,
      ),
      lookupKeys: {
        monthly: "careaiflow_multi_home_monthly",
        annual: "careaiflow_multi_home_annual",
      },
    },
    extraFacility: {
      monthly: envPrice(
        "STRIPE_PRICE_EXTRA_FACILITY_MONTHLY",
        DEFAULT_PRICES.extraFacility.monthly,
      ),
      annual: envPrice(
        "STRIPE_PRICE_EXTRA_FACILITY_ANNUAL",
        DEFAULT_PRICES.extraFacility.annual,
      ),
      lookupKeys: {
        monthly: "careaiflow_extra_facility_monthly",
        annual: "careaiflow_extra_facility_annual",
      },
    },
  },
};

/**
 * @param {"starter"|"professional"|"multi-home"|"extra-facility"} planKey
 * @param {"monthly"|"annual"} period
 * @returns {string|null}
 */
function getStripePriceId(planKey, period = "monthly") {
  const map = {
    starter: STRIPE_CATALOG.prices.starter,
    professional: STRIPE_CATALOG.prices.professional,
    "multi-home": STRIPE_CATALOG.prices.multiHome,
    multiHome: STRIPE_CATALOG.prices.multiHome,
    "extra-facility": STRIPE_CATALOG.prices.extraFacility,
    extraFacility: STRIPE_CATALOG.prices.extraFacility,
  };
  const entry = map[planKey];
  if (!entry) return null;
  return entry[period] || null;
}

module.exports = {
  STRIPE_CATALOG,
  getStripePriceId,
};

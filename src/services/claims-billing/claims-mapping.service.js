const { getResidentData } = require("../../utils/billing.utils");
const prisma = require("../../lib/prisma");

/**
 * Map resident data to billing fields
 * Maps from Resident model fields to billing fields
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Mapped billing fields from resident data
 */
async function mapResidentToBillingFields(residentId, tenantId) {
  // Get resident data (now returns Resident model)
  const residentData = await getResidentData(residentId, tenantId);
  const resident = residentData.residentData || residentData.formData || {};

  // Map Resident model fields to billing fields
  const mappedFields = {};

  // Client Name Fields - Use client fields if filled (client may differ from resident)
  if (resident.clientFirstName || resident.client_first_name) {
    mappedFields.clientFirstName =
      resident.clientFirstName || resident.client_first_name;
  }
  if (resident.clientLastName || resident.client_last_name) {
    mappedFields.clientLastName =
      resident.clientLastName || resident.client_last_name;
  }
  if (!mappedFields.clientFirstName || !mappedFields.clientLastName) {
    const fullName =
      resident.residentFullLegalName ||
      resident.residentPreferredName ||
      resident.residentIdentificationFullLegalName ||
      resident.residentIdentificationPreferredName ||
      "";
    if (fullName) {
      const nameParts = fullName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        if (!mappedFields.clientLastName)
          mappedFields.clientLastName = nameParts[nameParts.length - 1];
        if (!mappedFields.clientFirstName)
          mappedFields.clientFirstName = nameParts.slice(0, -1).join(" ");
      } else if (nameParts.length === 1 && !mappedFields.clientFirstName) {
        mappedFields.clientFirstName = nameParts[0];
      }
    }
  }

  // Fallback to legacy form data fields if Resident model doesn't have name split
  if (!mappedFields.clientFirstName && !mappedFields.clientLastName) {
    if (
      resident.first_name ||
      resident.firstName ||
      resident.client_first_name
    ) {
      mappedFields.clientFirstName =
        resident.first_name || resident.firstName || resident.client_first_name;
    }
    if (resident.last_name || resident.lastName || resident.client_last_name) {
      mappedFields.clientLastName =
        resident.last_name || resident.lastName || resident.client_last_name;
    }
  }

  // Client Gender - Map from residentGenderSex (support old and new schema)
  if (resident.residentGenderSex || resident.residentIdentificationGender) {
    mappedFields.clientGender =
      resident.residentGenderSex || resident.residentIdentificationGender;
  } else if (
    resident.gender ||
    resident.sex ||
    resident.client_gender ||
    resident.client_sex
  ) {
    // Fallback to legacy form data
    mappedFields.clientGender =
      resident.gender ||
      resident.sex ||
      resident.client_gender ||
      resident.client_sex;
  }

  // Client DOB - Map from residentDateOfBirth (support old and new schema)
  const dobValue =
    resident.residentDateOfBirth || resident.residentIdentificationDateOfBirth;
  if (dobValue) {
    mappedFields.clientDob = new Date(dobValue);
  } else if (
    resident.date_of_birth ||
    resident.dob ||
    resident.birthdate ||
    resident.client_dob ||
    resident.client_birthdate
  ) {
    const legacyDob =
      resident.date_of_birth ||
      resident.dob ||
      resident.birthdate ||
      resident.client_dob ||
      resident.client_birthdate;
    if (legacyDob) {
      mappedFields.clientDob = new Date(legacyDob);
    }
  }

  // Client Address Fields - From client info (client may differ from resident) or legacy form data
  if (
    resident.clientAddress ||
    resident.client_address ||
    resident.address ||
    resident.street_address ||
    resident.client_street_address
  ) {
    mappedFields.clientAddress =
      resident.clientAddress ||
      resident.client_address ||
      resident.address ||
      resident.street_address ||
      resident.client_street_address;
  }
  if (resident.clientCity || resident.client_city || resident.city) {
    mappedFields.clientCity =
      resident.clientCity || resident.client_city || resident.city;
  }
  if (resident.clientState || resident.client_state || resident.state) {
    mappedFields.clientState =
      resident.clientState || resident.client_state || resident.state;
  }
  if (
    resident.clientZip ||
    resident.client_zip ||
    resident.zip_code ||
    resident.zip ||
    resident.postal_code ||
    resident.client_zip_code
  ) {
    mappedFields.clientZip =
      resident.clientZip ||
      resident.client_zip ||
      resident.zip_code ||
      resident.zip ||
      resident.postal_code ||
      resident.client_zip_code;
  }

  // Client ID - Priority: client_id (from form) > Medicaid ID > Resident ID > Legacy fields
  if (
    resident.clientId ||
    resident.client_id ||
    resident.residentMedicaidDshsId ||
    resident.medicalProvidersHealthInsuranceMedicaidClientId ||
    resident.medicalProvidersMedicaidIdClientId
  ) {
    mappedFields.clientId =
      resident.clientId ||
      resident.client_id ||
      resident.residentMedicaidDshsId ||
      resident.medicalProvidersHealthInsuranceMedicaidClientId ||
      resident.medicalProvidersMedicaidIdClientId;
  } else if (residentId) {
    mappedFields.clientId = residentId;
  } else if (
    resident.client_id ||
    resident.providerone_client_id ||
    resident.provider_one_id
  ) {
    mappedFields.clientId =
      resident.client_id ||
      resident.providerone_client_id ||
      resident.provider_one_id;
  }

  // Diagnosis Code - Use diagnosis_code if filled, else from resident diagnosis fields
  if (resident.diagnosisCode || resident.diagnosis_code) {
    mappedFields.diagnosisCode =
      resident.diagnosisCode || resident.diagnosis_code;
  } else if (
    resident.medicalPrimaryDiagnosis ||
    resident.diagnosisPrimaryDiagnosis ||
    resident.diagnosesHealthConditionsDiagnoses
  ) {
    mappedFields.diagnosisCode =
      resident.medicalPrimaryDiagnosis ||
      resident.diagnosisPrimaryDiagnosis ||
      resident.diagnosesHealthConditionsDiagnoses;
  } else if (
    resident.diagnosis_code ||
    resident.primary_diagnosis ||
    resident.icd10_code
  ) {
    // Fallback to legacy form data
    mappedFields.diagnosisCode =
      resident.diagnosis_code ||
      resident.primary_diagnosis ||
      resident.icd10_code;
  }

  // Place of Service - From client info or legacy form data
  if (
    resident.placeOfService ||
    resident.place_of_service ||
    resident.place_of_service ||
    resident.pos ||
    resident.service_location
  ) {
    mappedFields.placeOfService =
      resident.placeOfService ||
      resident.place_of_service ||
      resident.place_of_service ||
      resident.pos ||
      resident.service_location;
  }

  return {
    residentId,
    residentName: residentData.name,
    mappedFields,
    formData: resident, // Include full resident data for reference (backward compatibility)
  };
}

/**
 * Get previous billing data for a resident (for auto-fill)
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object|null>} Previous billing record or null
 */
async function getPreviousBillingData(residentId, tenantId) {
  // Get the most recent billing record for this resident
  const previousRecord = await prisma.claimsBillingRecord.findFirst({
    where: {
      tenantId,
      residentId,
    },
    orderBy: {
      billingMonth: "desc",
    },
  });

  if (!previousRecord) {
    return null;
  }

  // Return fields that can be reused (non-monthly fields)
  return {
    // Provider fields (usually don't change)
    providerName: previousRecord.providerName,
    providerId: previousRecord.providerId,
    tinSsnEin: previousRecord.tinSsnEin,
    billingProviderNpi: previousRecord.billingProviderNpi,
    billingProviderTaxonomy: previousRecord.billingProviderTaxonomy,
    billingProviderStreet: previousRecord.billingProviderStreet,
    billingProviderCity: previousRecord.billingProviderCity,
    billingProviderState: previousRecord.billingProviderState,
    billingProviderZip: previousRecord.billingProviderZip,
    // Client fields (usually don't change)
    clientAddress: previousRecord.clientAddress,
    clientCity: previousRecord.clientCity,
    clientState: previousRecord.clientState,
    clientZip: previousRecord.clientZip,
    placeOfService: previousRecord.placeOfService,
    clientId: previousRecord.clientId,
    clientLastName: previousRecord.clientLastName,
    clientFirstName: previousRecord.clientFirstName,
    clientGender: previousRecord.clientGender,
    clientDob: previousRecord.clientDob,
    diagnosisCode: previousRecord.diagnosisCode,
    // Tier (might be the same)
    tierId: previousRecord.tierId,
  };
}

/**
 * Merge billing data from multiple sources (resident, previous billing, tier)
 * Priority: User input > Selected Tier > Provider Settings > Previous billing > Resident data
 * @param {Object} residentData - Data from resident form
 * @param {Object} previousData - Data from previous billing record
 * @param {Object} tierData - Data from tier selection
 * @param {Object} providerSettings - Provider settings
 * @param {Object} userInput - User-entered data (takes highest priority)
 * @returns {Object} Merged billing data
 */
function mergeBillingData(
  residentData,
  previousData,
  tierData,
  providerSettings,
  userInput = {}
) {
  const merged = {};

  // Priority: User input > Selected Tier > Provider Settings > Previous billing > Resident data

  // Provider fields: User input > Provider settings > Previous billing
  merged.providerName =
    userInput.providerName ||
    providerSettings?.providerName ||
    previousData?.providerName ||
    null;
  merged.providerId =
    userInput.providerId ||
    providerSettings?.providerId ||
    previousData?.providerId ||
    null;
  merged.tinSsnEin =
    userInput.tinSsnEin ||
    providerSettings?.tinSsnEin ||
    previousData?.tinSsnEin ||
    null;
  merged.billingProviderNpi =
    userInput.billingProviderNpi ||
    providerSettings?.billingProviderNpi ||
    previousData?.billingProviderNpi ||
    null;
  merged.billingProviderTaxonomy =
    userInput.billingProviderTaxonomy ||
    providerSettings?.billingProviderTaxonomy ||
    previousData?.billingProviderTaxonomy ||
    null;
  merged.billingProviderStreet =
    userInput.billingProviderStreet ||
    providerSettings?.billingProviderStreet ||
    previousData?.billingProviderStreet ||
    null;
  merged.billingProviderCity =
    userInput.billingProviderCity ||
    providerSettings?.billingProviderCity ||
    previousData?.billingProviderCity ||
    null;
  merged.billingProviderState =
    userInput.billingProviderState ||
    providerSettings?.billingProviderState ||
    previousData?.billingProviderState ||
    null;
  merged.billingProviderZip =
    userInput.billingProviderZip ||
    providerSettings?.billingProviderZip ||
    previousData?.billingProviderZip ||
    null;

  // Client fields: User input > Resident data > Previous billing > Fallback
  merged.clientAddress =
    userInput.clientAddress ||
    residentData?.mappedFields?.clientAddress ||
    previousData?.clientAddress ||
    null;
  merged.clientCity =
    userInput.clientCity ||
    residentData?.mappedFields?.clientCity ||
    previousData?.clientCity ||
    null;
  merged.clientState =
    userInput.clientState ||
    residentData?.mappedFields?.clientState ||
    previousData?.clientState ||
    null;
  merged.clientZip =
    userInput.clientZip ||
    residentData?.mappedFields?.clientZip ||
    previousData?.clientZip ||
    null;
  merged.placeOfService =
    userInput.placeOfService ||
    residentData?.mappedFields?.placeOfService ||
    previousData?.placeOfService ||
    null;

  // Client ID: Use resident's filled client_id (Medicaid ID etc.) when available, else residentId
  // Priority: Resident form client_id > residentId > User input > Previous billing
  merged.clientId =
    residentData?.mappedFields?.clientId ||
    residentData?.residentId ||
    userInput.clientId ||
    previousData?.clientId ||
    null;

  merged.clientLastName =
    userInput.clientLastName ||
    residentData?.mappedFields?.clientLastName ||
    previousData?.clientLastName ||
    null;
  merged.clientFirstName =
    userInput.clientFirstName ||
    residentData?.mappedFields?.clientFirstName ||
    previousData?.clientFirstName ||
    null;
  merged.clientGender =
    userInput.clientGender ||
    residentData?.mappedFields?.clientGender ||
    previousData?.clientGender ||
    null;
  merged.clientDob =
    userInput.clientDob ||
    residentData?.mappedFields?.clientDob ||
    previousData?.clientDob ||
    null;
  merged.diagnosisCode =
    userInput.diagnosisCode ||
    residentData?.mappedFields?.diagnosisCode ||
    previousData?.diagnosisCode ||
    null;

  // Tier fields: User input > Tier data > Previous billing
  if (userInput.tierId || tierData) {
    // If user selected a tier, use tier data
    const selectedTier = tierData;
    if (selectedTier) {
      merged.tierId = selectedTier.id;
      merged.tierUnitCost = selectedTier.unitCost;
      merged.serviceCode = selectedTier.serviceCode || "S5126";
      merged.modifier1 = selectedTier.modifier1;
      merged.modifier2 = selectedTier.modifier2;
    } else if (userInput.tierId) {
      // User input tier ID but no tier data provided
      merged.tierId = userInput.tierId;
    }
  } else if (previousData?.tierId) {
    merged.tierId = previousData.tierId;
  }

  // Service fields: User input > Calculated > Previous billing
  merged.units = userInput.units || previousData?.units || null;
  merged.serviceFromDate =
    userInput.serviceFromDate || previousData?.serviceFromDate || null;
  merged.serviceToDate =
    userInput.serviceToDate || previousData?.serviceToDate || null;

  // Calculate Claim Billed Amount = Units × Tier Unit Cost
  // Only calculate if both units and tier unit cost are available
  if (merged.units && merged.tierUnitCost) {
    try {
      const { Prisma } = require("@prisma/client");
      const units =
        typeof merged.units === "number"
          ? merged.units
          : parseInt(merged.units);

      // Handle Prisma Decimal or regular number
      let unitCost;
      if (
        merged.tierUnitCost &&
        typeof merged.tierUnitCost === "object" &&
        merged.tierUnitCost.toNumber
      ) {
        unitCost = merged.tierUnitCost.toNumber();
      } else {
        unitCost = parseFloat(merged.tierUnitCost);
      }

      if (!isNaN(units) && !isNaN(unitCost) && units > 0 && unitCost > 0) {
        merged.claimBilledAmount = new Prisma.Decimal(units * unitCost);
      }
    } catch (error) {
      console.error("Error calculating claim billed amount:", error);
      // Fall through to use user input or previous data
    }
  }

  // Use user input or previous data if calculation didn't happen
  if (!merged.claimBilledAmount) {
    if (userInput.claimBilledAmount) {
      merged.claimBilledAmount = userInput.claimBilledAmount;
    } else if (previousData?.claimBilledAmount) {
      merged.claimBilledAmount = previousData.claimBilledAmount;
    }
  }

  // MCO fields: Always empty (left for MCO to fill)
  merged.originalClaimId = null;
  merged.frequencyCode = null;

  return merged;
}

/**
 * Get pre-filled billing form data
 * Combines resident data, previous billing, provider settings, and tier data
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {string} tierId - Optional tier ID for auto-fill
 * @returns {Promise<Object>} Pre-filled form data
 */
async function getPrefilledBillingData(residentId, tenantId, tierId = null) {
  // Get all data sources
  const [residentData, previousData, providerSettings, tierData] =
    await Promise.all([
      mapResidentToBillingFields(residentId, tenantId).catch(() => null),
      getPreviousBillingData(residentId, tenantId).catch(() => null),
      getProviderSettings(tenantId).catch(() => null),
      tierId
        ? getTierData(tierId, tenantId).catch(() => null)
        : Promise.resolve(null),
    ]);

  // Merge all data sources
  const prefilledData = mergeBillingData(
    residentData,
    previousData,
    tierData,
    providerSettings
  );

  // Ensure clientId is always set (use residentId as final fallback)
  // This ensures the field is always populated even if all other sources fail
  if (!prefilledData.clientId && residentId) {
    prefilledData.clientId = residentId;
  }

  // Include resident's default tier (from resident form) for auto-selection in billing creation
  const defaultTierId = residentData?.formData?.claimsBillingTierId || null;

  return {
    residentId,
    residentName: residentData?.residentName || null,
    defaultTierId,
    prefilledFields: prefilledData,
    sources: {
      hasResidentData: !!residentData,
      hasPreviousBilling: !!previousData,
      hasProviderSettings: !!providerSettings,
      hasTierData: !!tierData,
    },
  };
}

/**
 * Get tier data for auto-fill
 * @param {string} tierId - Tier ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Tier data
 */
async function getTierData(tierId, tenantId) {
  if (!tierId) return null;
  const { getTierById } = require("./claims-tier.service");
  try {
    return await getTierById(tierId, tenantId);
  } catch (error) {
    console.error(`Error getting tier ${tierId}:`, error);
    return null;
  }
}

/**
 * Get provider settings
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object|null>} Provider settings
 */
async function getProviderSettings(tenantId) {
  const {
    getProviderSettings: getProviderSettingsService,
  } = require("./claims-provider.service");
  try {
    return await getProviderSettingsService(tenantId);
  } catch (error) {
    // Provider settings might not exist yet, return null
    return null;
  }
}

/**
 * Validate billing fields
 * @param {Object} data - Billing data to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateBillingFields(data) {
  const errors = [];

  // Required fields validation
  if (!data.residentId) {
    errors.push("Resident ID is required");
  }

  if (!data.billingMonth) {
    errors.push("Billing month is required");
  }

  // Validate service dates if provided
  if (data.serviceFromDate && data.serviceToDate) {
    const fromDate = new Date(data.serviceFromDate);
    const toDate = new Date(data.serviceToDate);
    if (toDate < fromDate) {
      errors.push("Service To Date must be after Service From Date");
    }
  }

  // Validate units if provided
  if (data.units !== undefined && data.units !== null) {
    if (data.units < 1) {
      errors.push("Units must be at least 1");
    }
  }

  // Validate dates format
  if (data.clientDob) {
    const dob = new Date(data.clientDob);
    if (isNaN(dob.getTime())) {
      errors.push("Client DOB must be a valid date");
    }
  }

  if (data.serviceFromDate) {
    const fromDate = new Date(data.serviceFromDate);
    if (isNaN(fromDate.getTime())) {
      errors.push("Service From Date must be a valid date");
    }
  }

  if (data.serviceToDate) {
    const toDate = new Date(data.serviceToDate);
    if (isNaN(toDate.getTime())) {
      errors.push("Service To Date must be a valid date");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  mapResidentToBillingFields,
  getPreviousBillingData,
  mergeBillingData,
  validateBillingFields,
  getPrefilledBillingData,
};

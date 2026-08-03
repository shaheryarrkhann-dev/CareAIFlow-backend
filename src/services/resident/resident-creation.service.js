const prisma = require("../../lib/prisma");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Convert field name from resident_fields.json format to Prisma model field name
 * @param {string} fieldName - Field name from resident_fields.json (snake_case)
 * @returns {string} Prisma model field name (camelCase)
 */
function toPrismaFieldName(fieldName) {
  // Map resident_fields.json field names to Prisma schema field names
  // Some fields in resident_fields.json use payer_* prefix but database uses insurance_* prefix
  const fieldNameMapping = {
    // Payer fields: resident_fields.json uses payer_* but schema uses insurance_* for some
    payer_primary_payer: "insurancePrimaryPayer",
    payer_insurance_carrier: "insuranceCarrier",
    payer_policy_member_number: "insurancePolicyMemberNumber",
    payer_authorization_claim_number: "insuranceAuthorizationClaimNumber",
    payer_authorization_start_date: "insuranceAuthorizationStartDate",
    payer_authorization_end_date: "insuranceAuthorizationEndDate",
    payer_approved_tier_daily_rate: "payerApprovedTierDailyRate",
    payer_responsible_party_payment: "insuranceResponsiblePartyPayment",
    // Diagnosis fields
    diagnosis_primary_diagnosis: "diagnosisPrimaryDiagnosis",
    diagnosis_secondary_diagnoses: "diagnosisSecondaryDiagnoses",
    diagnosis_chronic_conditions: "diagnosisChronicConditions",

    // Care Provider fields: resident_fields.json uses care_provider_* but schema uses medical_*
    care_provider_primary_care_name: "medicalPrimaryCareProviderName",
    care_provider_primary_care_clinic: "medicalPrimaryCareClinic",
    care_provider_primary_care_phone: "medicalPrimaryCareProviderPhone",

    // Emergency / Legal Contacts (new schema)
    emergency_legal_contacts_primary_contact_name:
      "emergencyLegalContactsPrimaryContactName",
    emergency_legal_contacts_primary_contact_relationship:
      "emergencyLegalContactsPrimaryContactRelationship",
    emergency_legal_contacts_primary_contact_phone:
      "emergencyLegalContactsPrimaryContactPhone",
    emergency_legal_contacts_secondary_contact_name:
      "emergencyLegalContactsSecondaryContactName",
    emergency_legal_contacts_secondary_contact_phone:
      "emergencyLegalContactsSecondaryContactPhone",
    emergency_legal_contacts_legal_guardian_poa_exists:
      "emergencyLegalContactsGuardianPoaExists",
    emergency_legal_contacts_legal_guardian_poa_name:
      "emergencyLegalContactsGuardianPoaName",
    emergency_legal_contacts_legal_guardian_poa_contact_info:
      "emergencyLegalContactsGuardianPoaContactInfo",
    emergency_legal_contacts_legal_guardian_poa_copy_on_file:
      "emergencyLegalContactsGuardianPoaCopyOnFile",
    // Intake form §2 additions — "legal_guardian_poa_*" keys drop the "Legal"
    // prefix in the column name, matching the existing entries above.
    emergency_legal_contacts_legal_guardian_poa_type:
      "emergencyLegalContactsGuardianPoaType",
    emergency_legal_contacts_legal_guardian_poa_phone:
      "emergencyLegalContactsGuardianPoaPhone",
    emergency_legal_contacts_legal_guardian_poa_email:
      "emergencyLegalContactsGuardianPoaEmail",
    emergency_legal_contacts_legal_guardian_poa_copy_attached:
      "emergencyLegalContactsGuardianPoaCopyAttached",

    // medical_providers_health_coverage_*
    medical_providers_health_coverage_primary_care_provider_name:
      "medicalProvidersPrimaryCareProviderName",
    medical_providers_health_coverage_primary_care_provider_phone:
      "medicalProvidersPrimaryCareProviderPhone",
    medical_providers_health_coverage_mental_health_provider:
      "medicalProvidersMentalHealthProvider",
    medical_providers_health_coverage_preferred_hospital_er:
      "medicalProvidersPreferredHospitalEr",
    medical_providers_health_coverage_pharmacy_name:
      "medicalProvidersPharmacyName",
    medical_providers_health_coverage_pharmacy_phone:
      "medicalProvidersPharmacyPhone",
    medical_providers_health_coverage_health_insurance_payor_type:
      "medicalProvidersHealthInsurancePayorType",
    medical_providers_health_coverage_health_insurance_medicaid_client_id:
      "medicalProvidersHealthInsuranceMedicaidClientId",
    medical_providers_health_coverage_health_insurance_authorized_tier:
      "medicalProvidersHealthInsuranceAuthorizedTier",

    // Claims billing tier (optional - pre-fills tier when creating billing records)
    claims_billing_tier_id: "claimsBillingTierId",
    // Client information (client may differ from resident)
    client_id: "clientId",
    client_address: "clientAddress",
    client_city: "clientCity",
    client_state: "clientState",
    client_zip: "clientZip",
    place_of_service: "placeOfService",
    client_first_name: "clientFirstName",
    client_last_name: "clientLastName",
    diagnosis_code: "diagnosisCode",

    // diagnoses_health_conditions
    diagnoses_health_conditions_allergies: "diagnosesHealthConditionsAllergies",

    // functional_status_adls
    functional_status_adls_toileting_status:
      "functionalStatusAdlsToiletingStatus",

    // service_plan_ncp
    service_plan_ncp_on_file: "servicePlanNcpOnFile",
    service_plan_ncp_most_recent_date: "servicePlanNcpMostRecentDate",
    service_plan_ncp_services_authorized: "servicePlanNcpServicesAuthorized",

    // financial_case_management
    financial_case_management_case_manager_phone:
      "financialCaseManagementCaseManagerPhone",
    financial_case_management_case_manager_email:
      "financialCaseManagementCaseManagerEmail",
  };

  // If field has a mapping, use it
  if (fieldNameMapping[fieldName]) {
    return fieldNameMapping[fieldName];
  }

  // Otherwise, convert snake_case to camelCase
  return fieldName
    .split("_")
    .map((word, index) => {
      if (index === 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
}

/**
 * Create a new resident record using Prisma ORM
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID creating the resident
 * @param {Object} params.residentData - Resident data with resident_fields.json field names
 * @returns {Promise<Object>} Created resident record
 */
async function createResident({ tenantId, userId, residentData }) {
  // Intake form §1 collects first/middle/last separately. Compose the legal name
  // when only the parts were supplied so downstream consumers (NCP extraction,
  // care plans, billing, PDF reports) keep reading a single full name.
  const composedName = [
    residentData.resident_identification_first_name,
    residentData.resident_identification_middle_name,
    residentData.resident_identification_last_name,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();

  if (composedName && !residentData.resident_identification_full_legal_name) {
    residentData.resident_identification_full_legal_name = composedName;
  }

  // Validate required fields (support both old and new schema field names)
  const fullName =
    residentData.resident_identification_full_legal_name ||
    residentData.resident_full_legal_name;
  const dob =
    residentData.resident_identification_date_of_birth ||
    residentData.resident_date_of_birth;
  const admissionDate =
    residentData.resident_identification_admission_date ||
    residentData.admission_date;

  if (!fullName || !dob || !admissionDate) {
    const missing = [];
    if (!fullName)
      missing.push(
        "resident_full_legal_name or resident_identification_full_legal_name"
      );
    if (!dob)
      missing.push(
        "resident_date_of_birth or resident_identification_date_of_birth"
      );
    if (!admissionDate)
      missing.push("admission_date or resident_identification_admission_date");
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }

  // Validate billing/compliance risk: If DOB and Payer info are missing, flag as risk
  const hasDob = !!dob;
  const hasPayerInfo =
    !!residentData.medical_providers_health_coverage_health_insurance_payor_type ||
    !!residentData.payer_primary_payer ||
    !!residentData.payer_secondary_payer ||
    !!residentData.payer_insurance_carrier ||
    !!residentData.payer_policy_member_number ||
    !!residentData.payer_authorization_claim_number;
  if (!hasDob && !hasPayerInfo) {
    console.warn(
      "[Resident-Creation] ⚠️  Billing/Compliance Risk: Date of Birth and Payer information are both missing"
    );
  }

  // Load resident_fields.json to get field types for proper conversion
  const fieldsJsonPath = path.join(__dirname, "../../../resident_fields.json");
  const fieldsSchema = JSON.parse(fs.readFileSync(fieldsJsonPath, "utf8"));

  // OLD FIELD MAPPING LOGIC (COMMENTED OUT - No backward compatibility needed)
  // If needed in future, uncomment and implement field mapping:
  // - medical_allergies → allergies_medication_allergies
  // - diet_food_allergies → allergies_food_allergies
  // - admission_previous_living_arrangement → external_facility_previous_living
  // - admission_referral_source → external_facility_referring_facility

  // Convert field names to Prisma model field names (camelCase)
  const prismaData = {
    tenantId,
    userId,
  };

  // Process all submitted fields - use resident_fields.json schema directly
  // Only process fields that exist in resident_fields.json to ensure schema compliance
  Object.keys(residentData).forEach((fieldName) => {
    const value = residentData[fieldName];

    // Skip null, undefined, or empty values
    if (value !== null && value !== undefined && value !== "") {
      // Only process fields that exist in resident_fields.json schema (strict validation)
      // Exception: claims_billing_tier_id is allowed for tier pre-fill in billing creation
      if (
        !fieldsSchema.hasOwnProperty(fieldName) &&
        fieldName !== "claims_billing_tier_id"
      ) {
        console.warn(
          `[Resident-Creation] Skipping field "${fieldName}" - not in resident_fields.json schema`
        );
        return;
      }

      const prismaFieldName = toPrismaFieldName(fieldName);
      const fieldTypeDefinition = fieldsSchema[fieldName];

      if (fieldTypeDefinition) {
        // Handle arrays first - check if value is an array
        if (Array.isArray(value)) {
          if (Array.isArray(fieldTypeDefinition)) {
            // Field expects array (like diagnosis_secondary_diagnoses) - store as JSON
            prismaData[prismaFieldName] = value;
          } else {
            // Field expects string but got array - convert to JSON string
            // This handles cases where AI extraction returns structured data for string fields
            prismaData[prismaFieldName] = JSON.stringify(value);
            console.log(
              `[Resident-Creation] Converted array to JSON string for field "${fieldName}"`
            );
          }
        } else if (
          typeof fieldTypeDefinition === "boolean" &&
          typeof value !== "boolean"
        ) {
          const lowerValue = String(value).toLowerCase().trim();
          if (
            lowerValue === "true" ||
            lowerValue === "yes" ||
            lowerValue === "1" ||
            lowerValue === "checked"
          ) {
            prismaData[prismaFieldName] = true;
          } else if (
            lowerValue === "false" ||
            lowerValue === "no" ||
            lowerValue === "0" ||
            lowerValue === "unchecked"
          ) {
            prismaData[prismaFieldName] = false;
          }
        } else if (
          typeof fieldTypeDefinition === "number" &&
          typeof value !== "number"
        ) {
          const numValue = Number(value);
          if (!Number.isNaN(numValue)) {
            prismaData[prismaFieldName] = numValue;
          }
        } else if (
          typeof fieldTypeDefinition === "string" &&
          fieldTypeDefinition.includes("YYYY-MM-DD")
        ) {
          // Date field - convert to Date object
          if (typeof value === "string") {
            const dateValue = new Date(value);
            if (!Number.isNaN(dateValue.getTime())) {
              prismaData[prismaFieldName] = dateValue;
            }
          } else if (value instanceof Date) {
            prismaData[prismaFieldName] = value;
          }
        } else if (Array.isArray(fieldTypeDefinition)) {
          // Field expects array but value is not an array
          console.warn(
            `[Resident-Creation] Field "${fieldName}" expects array but got ${typeof value}, skipping`
          );
        } else {
          // String or other types - direct assignment
          prismaData[prismaFieldName] = value;
        }
      }
    }
  });

  // Handle claims_billing_tier_id: empty string should become null
  if (prismaData.claimsBillingTierId === "") {
    prismaData.claimsBillingTierId = null;
  }

  // Backward compatibility: populate old columns when we have new schema data
  const newToOldMap = {
    residentIdentificationFullLegalName: "residentFullLegalName",
    residentIdentificationPreferredName: "residentPreferredName",
    residentIdentificationDateOfBirth: "residentDateOfBirth",
    residentIdentificationGender: "residentGenderSex",
    residentIdentificationSsn: "residentSsn",
    residentIdentificationAdmissionDate: "admissionDate",
    residentIdentificationRoomNumber: "admissionRoomNumber",
    residentIdentificationResidentStatus: "admissionStatus",
    emergencyLegalContactsPrimaryContactName: "emergencyPrimaryContactName",
    emergencyLegalContactsPrimaryContactRelationship:
      "emergencyPrimaryContactRelationship",
    emergencyLegalContactsPrimaryContactPhone: "emergencyPrimaryContactPhone",
    emergencyLegalContactsSecondaryContactName: "emergencySecondaryContactName",
    emergencyLegalContactsSecondaryContactPhone:
      "emergencySecondaryContactPhone",
  };
  Object.entries(newToOldMap).forEach(([newKey, oldKey]) => {
    if (prismaData[newKey] !== undefined && prismaData[newKey] !== null) {
      prismaData[oldKey] = prismaData[newKey];
    }
  });

  // Create resident using Prisma ORM
  const resident = await prisma.resident.create({
    data: prismaData,
  });

  // Return the created resident
  return resident;
}

/**
 * Update an existing resident record using Prisma ORM
 * @param {Object} params
 * @param {string} params.residentId - Resident ID to update
 * @param {string} params.tenantId - Tenant ID (for access control)
 * @param {Object} params.user - Current user (for permission checks)
 * @param {Object} params.residentData - Resident data with resident_fields.json field names (partial update)
 * @returns {Promise<Object>} Updated resident record
 */
async function updateResident({ residentId, tenantId, user, residentData }) {
  if (!residentId) {
    throw new Error("Resident ID is required");
  }

  // Get existing resident to verify it exists and user has access
  const { getResidentById } = require("./resident.service");
  const existingResident = await getResidentById(residentId, user);

  // Check permissions - STAFF/GUARDIAN can only update residents they created
  if (user.role === "STAFF" || user.role === "GUARDIAN") {
    if (existingResident.userId !== user.id) {
      throw new Error("You can only update residents you created");
    }
  }

  // Load resident_fields.json to get field types for proper conversion
  const fieldsJsonPath = path.join(__dirname, "../../../resident_fields.json");
  const fieldsSchema = JSON.parse(fs.readFileSync(fieldsJsonPath, "utf8"));

  // Convert field names to Prisma model field names (camelCase)
  const prismaData = {};

  // Process all submitted fields - use resident_fields.json schema directly
  // Only process fields that exist in resident_fields.json to ensure schema compliance
  Object.keys(residentData).forEach((fieldName) => {
    const value = residentData[fieldName];

    // Skip null, undefined, or empty values (for partial updates, empty strings are allowed to clear fields)
    if (value !== null && value !== undefined) {
      // Only process fields that exist in resident_fields.json schema (strict validation)
      // Exception: claims_billing_tier_id is allowed for tier pre-fill in billing creation
      if (
        !fieldsSchema.hasOwnProperty(fieldName) &&
        fieldName !== "claims_billing_tier_id"
      ) {
        console.warn(
          `[Resident-Update] Skipping field "${fieldName}" - not in resident_fields.json schema`
        );
        return;
      }

      const prismaFieldName = toPrismaFieldName(fieldName);
      const fieldTypeDefinition = fieldsSchema[fieldName];

      if (fieldTypeDefinition) {
        // Handle arrays first - check if value is an array
        if (Array.isArray(value)) {
          if (Array.isArray(fieldTypeDefinition)) {
            // Field expects array (like diagnosis_secondary_diagnoses) - store as JSON
            prismaData[prismaFieldName] = value;
          } else {
            // Field expects string but got array - convert to JSON string
            prismaData[prismaFieldName] = JSON.stringify(value);
            console.log(
              `[Resident-Update] Converted array to JSON string for field "${fieldName}"`
            );
          }
        } else if (
          typeof fieldTypeDefinition === "boolean" &&
          typeof value !== "boolean"
        ) {
          const lowerValue = String(value).toLowerCase().trim();
          if (
            lowerValue === "true" ||
            lowerValue === "yes" ||
            lowerValue === "1" ||
            lowerValue === "checked"
          ) {
            prismaData[prismaFieldName] = true;
          } else if (
            lowerValue === "false" ||
            lowerValue === "no" ||
            lowerValue === "0" ||
            lowerValue === "unchecked"
          ) {
            prismaData[prismaFieldName] = false;
          }
        } else if (
          typeof fieldTypeDefinition === "number" &&
          typeof value !== "number"
        ) {
          const numValue = Number(value);
          if (!Number.isNaN(numValue)) {
            prismaData[prismaFieldName] = numValue;
          }
        } else if (
          typeof fieldTypeDefinition === "string" &&
          fieldTypeDefinition.includes("YYYY-MM-DD")
        ) {
          // Date field - convert to Date object
          if (typeof value === "string") {
            const dateValue = new Date(value);
            if (!Number.isNaN(dateValue.getTime())) {
              prismaData[prismaFieldName] = dateValue;
            }
          } else if (value instanceof Date) {
            prismaData[prismaFieldName] = value;
          }
        } else if (Array.isArray(fieldTypeDefinition)) {
          // Field expects array but value is not an array
          console.warn(
            `[Resident-Update] Field "${fieldName}" expects array but got ${typeof value}, skipping`
          );
        } else {
          // String or other types - direct assignment (including empty strings to clear fields)
          prismaData[prismaFieldName] = value;
        }
      }
    }
  });

  // Handle claims_billing_tier_id: empty string should become null
  if (prismaData.claimsBillingTierId === "") {
    prismaData.claimsBillingTierId = null;
  }

  // If no fields to update, return existing resident
  if (Object.keys(prismaData).length === 0) {
    return existingResident;
  }

  // Backward compatibility: populate old columns when updating new schema fields
  const newToOldMap = {
    residentIdentificationFullLegalName: "residentFullLegalName",
    residentIdentificationPreferredName: "residentPreferredName",
    residentIdentificationDateOfBirth: "residentDateOfBirth",
    residentIdentificationGender: "residentGenderSex",
    residentIdentificationSsn: "residentSsn",
    residentIdentificationAdmissionDate: "admissionDate",
    residentIdentificationRoomNumber: "admissionRoomNumber",
    residentIdentificationResidentStatus: "admissionStatus",
    emergencyLegalContactsPrimaryContactName: "emergencyPrimaryContactName",
    emergencyLegalContactsPrimaryContactRelationship:
      "emergencyPrimaryContactRelationship",
    emergencyLegalContactsPrimaryContactPhone: "emergencyPrimaryContactPhone",
    emergencyLegalContactsSecondaryContactName: "emergencySecondaryContactName",
    emergencyLegalContactsSecondaryContactPhone:
      "emergencySecondaryContactPhone",
  };
  Object.entries(newToOldMap).forEach(([newKey, oldKey]) => {
    if (prismaData[newKey] !== undefined && prismaData[newKey] !== null) {
      prismaData[oldKey] = prismaData[newKey];
    }
  });

  // Update resident using Prisma ORM
  const updatedResident = await prisma.resident.update({
    where: { id: residentId },
    data: prismaData,
  });

  // Return the updated resident
  return updatedResident;
}

module.exports = {
  createResident,
  updateResident,
};

const { body, param, query, custom } = require("express-validator");

/**
 * Create resident validation
 * Validates fields from resident_fields.json schema
 */
const createResidentValidator = [
  // Required fields
  body("resident_full_legal_name")
    .trim()
    .notEmpty()
    .withMessage("Resident full legal name is required")
    .isLength({ max: 200 })
    .withMessage("Resident full legal name must not exceed 200 characters"),

  body("resident_date_of_birth")
    .notEmpty()
    .withMessage("Resident date of birth is required")
    .isISO8601()
    .withMessage(
      "Resident date of birth must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  body("admission_date")
    .notEmpty()
    .withMessage("Admission date is required")
    .isISO8601()
    .withMessage("Admission date must be a valid ISO 8601 date (YYYY-MM-DD)"),

  // Optional enum validations
  body("admission_type")
    .optional()
    .trim()
    .isIn(["Long-term", "Respite", "Short-term", "Other"])
    .withMessage(
      "Admission type must be one of: Long-term, Respite, Short-term, Other"
    ),

  body("admission_status")
    .optional()
    .trim()
    .isIn(["Active", "Discharged", "Deceased"])
    .withMessage(
      "Admission status must be one of: Active, Discharged, Deceased"
    ),

  body("care_needs_fall_risk")
    .optional()
    .trim()
    .isIn(["Low", "Medium", "High"])
    .withMessage("Fall risk must be one of: Low, Medium, High"),

  body("emergency_code_status")
    .optional()
    .trim()
    .isIn(["Full Code", "DNR", "DNI"])
    .withMessage("Code status must be one of: Full Code, DNR, DNI"),

  body("emergency_poa_type")
    .optional()
    .trim()
    .isIn(["Medical", "Financial", "Both"])
    .withMessage("POA type must be one of: Medical, Financial, Both"),

  body("payer_primary_payer")
    .optional()
    .trim()
    .isIn(["Private Pay", "Medicaid", "VA"])
    .withMessage("Primary payer must be one of: Private Pay, Medicaid, VA"),

  // Conditional validation: If Code Status is DNR or DNI, POLST is required
  body("emergency_polst_on_file").custom((value, { req }) => {
    const codeStatus = req.body.emergency_code_status;
    if ((codeStatus === "DNR" || codeStatus === "DNI") && !value) {
      throw new Error("POLST is required when Code Status is DNR or DNI");
    }
    return true;
  }),

  // Optional date fields
  body("resident_photo_date_taken")
    .optional()
    .isISO8601()
    .withMessage("Photo date taken must be a valid ISO 8601 date (YYYY-MM-DD)"),

  body("payer_authorization_start_date")
    .optional()
    .isISO8601()
    .withMessage(
      "Authorization start date must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  body("payer_authorization_end_date")
    .optional()
    .isISO8601()
    .withMessage(
      "Authorization end date must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  body("diagnosis_last_review_date")
    .optional()
    .isISO8601()
    .withMessage(
      "Diagnosis last review date must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  // Optional numeric fields
  body("payer_approved_hours")
    .optional()
    .isNumeric()
    .withMessage("Approved hours must be a number")
    .toFloat(),

  // Optional array fields
  body("diagnosis_secondary_diagnoses")
    .optional()
    .isArray()
    .withMessage("Secondary diagnoses must be an array"),

  // Optional boolean fields (will be handled by service layer conversion)
  body("resident_photo_verified").optional().isBoolean(),
  body("resident_need_interpreter").optional().isBoolean(),
  body("emergency_poa_on_file").optional().isBoolean(),
  body("emergency_guardian_appointed").optional().isBoolean(),
  body("emergency_advanced_directive_on_file").optional().isBoolean(),
  body("emergency_polst_on_file").optional().isBoolean(),
  body("diagnosis_dementia_diagnosis").optional().isBoolean(),

  // Tenant ID (optional for SUPER_ADMIN)
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update resident validation
 * Similar to create but all fields are optional
 */
const updateResidentValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),

  // Optional enum validations (same as create)
  body("admission_type")
    .optional()
    .trim()
    .isIn(["Long-term", "Respite", "Short-term", "Other"])
    .withMessage(
      "Admission type must be one of: Long-term, Respite, Short-term, Other"
    ),

  body("admission_status")
    .optional()
    .trim()
    .isIn(["Active", "Discharged", "Deceased"])
    .withMessage(
      "Admission status must be one of: Active, Discharged, Deceased"
    ),

  body("care_needs_fall_risk")
    .optional()
    .trim()
    .isIn(["Low", "Medium", "High"])
    .withMessage("Fall risk must be one of: Low, Medium, High"),

  body("emergency_code_status")
    .optional()
    .trim()
    .isIn(["Full Code", "DNR", "DNI"])
    .withMessage("Code status must be one of: Full Code, DNR, DNI"),

  body("emergency_poa_type")
    .optional()
    .trim()
    .isIn(["Medical", "Financial", "Both"])
    .withMessage("POA type must be one of: Medical, Financial, Both"),

  body("payer_primary_payer")
    .optional()
    .trim()
    .isIn(["Private Pay", "Medicaid", "VA"])
    .withMessage("Primary payer must be one of: Private Pay, Medicaid, VA"),

  // Conditional validation: If Code Status is DNR or DNI, POLST is required
  body("emergency_polst_on_file")
    .optional()
    .custom((value, { req }) => {
      const codeStatus = req.body.emergency_code_status;
      if ((codeStatus === "DNR" || codeStatus === "DNI") && !value) {
        throw new Error("POLST is required when Code Status is DNR or DNI");
      }
      return true;
    }),

  // Optional date fields
  body("resident_date_of_birth")
    .optional()
    .isISO8601()
    .withMessage(
      "Resident date of birth must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  body("admission_date")
    .optional()
    .isISO8601()
    .withMessage("Admission date must be a valid ISO 8601 date (YYYY-MM-DD)"),

  body("resident_photo_date_taken")
    .optional()
    .isISO8601()
    .withMessage("Photo date taken must be a valid ISO 8601 date (YYYY-MM-DD)"),

  body("payer_authorization_start_date")
    .optional()
    .isISO8601()
    .withMessage(
      "Authorization start date must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  body("payer_authorization_end_date")
    .optional()
    .isISO8601()
    .withMessage(
      "Authorization end date must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  body("diagnosis_last_review_date")
    .optional()
    .isISO8601()
    .withMessage(
      "Diagnosis last review date must be a valid ISO 8601 date (YYYY-MM-DD)"
    ),

  // Optional numeric fields
  body("payer_approved_hours")
    .optional()
    .isNumeric()
    .withMessage("Approved hours must be a number")
    .toFloat(),

  // Optional array fields
  body("diagnosis_secondary_diagnoses")
    .optional()
    .isArray()
    .withMessage("Secondary diagnoses must be an array"),

  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get resident by ID validation
 */
const getResidentByIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
];

/**
 * Submit e-signature validation (id param; file + legalText validated in controller)
 */
const submitESignatureValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
];

/**
 * Update resident status validation
 */
const updateResidentStatusValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
  body("status")
    .trim()
    .notEmpty()
    .withMessage("status is required")
    .isIn(["ACTIVE", "INACTIVE", "Active", "Inactive"])
    .withMessage("status must be ACTIVE or INACTIVE"),
];

module.exports = {
  createResidentValidator,
  updateResidentValidator,
  getResidentByIdValidator,
  submitESignatureValidator,
  updateResidentStatusValidator,
};

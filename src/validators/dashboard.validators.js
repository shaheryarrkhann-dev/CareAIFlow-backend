const { query } = require("express-validator");

const getHomeDashboardValidator = [
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
  query("residentId")
    .optional()
    .isUUID()
    .withMessage("residentId must be a valid UUID"),
  query("staffUserId")
    .optional()
    .isUUID()
    .withMessage("staffUserId must be a valid UUID"),
  query("facilityId")
    .optional()
    .isUUID()
    .withMessage("facilityId must be a valid UUID"),
];

module.exports = {
  getHomeDashboardValidator,
};

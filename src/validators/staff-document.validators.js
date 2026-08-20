const { param, query } = require("express-validator");

const staffIdParam = [
  param("staffId").isUUID().withMessage("Staff ID must be a valid UUID"),
];

const documentIdParam = [
  param("id").isUUID().withMessage("Document ID must be a valid UUID"),
];

const listDocumentsValidator = [
  query("folderId")
    .optional()
    .isUUID()
    .withMessage("Folder ID must be a valid UUID"),
  query("documentType")
    .optional()
    .isIn(["LICENSE", "CERTIFICATION", "TRAINING"])
    .withMessage("documentType must be LICENSE, CERTIFICATION, or TRAINING"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
];

module.exports = {
  staffIdParam,
  documentIdParam,
  listDocumentsValidator,
};

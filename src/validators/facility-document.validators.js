const { param, query } = require("express-validator");

const documentIdParam = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Document ID is required")
    .isUUID()
    .withMessage("Document ID must be a valid UUID"),
];

const listDocumentsValidator = [
  query("folderId")
    .optional()
    .isUUID()
    .withMessage("Folder ID must be a valid UUID"),
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
  documentIdParam,
  listDocumentsValidator,
};

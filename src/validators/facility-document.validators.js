const { body, param, query } = require("express-validator");

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

const updateDocumentValidator = [
  ...documentIdParam,
  body("expirationDate")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const raw = String(value).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new Error("expirationDate must be a valid date (YYYY-MM-DD)");
      }
      const d = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) {
        throw new Error("expirationDate must be a valid date (YYYY-MM-DD)");
      }
      return true;
    }),
];

module.exports = {
  documentIdParam,
  listDocumentsValidator,
  updateDocumentValidator,
};

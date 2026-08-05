const { body, param, query } = require("express-validator");

const residentIdParam = [
  param("residentId")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
];

const documentIdParam = [
  ...residentIdParam,
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Document ID is required")
    .isUUID()
    .withMessage("Document ID must be a valid UUID"),
];

const listDocumentsValidator = [
  ...residentIdParam,
  query("folderId")
    .optional()
    .isUUID()
    .withMessage("Folder ID must be a valid UUID"),
  query("category")
    .optional()
    .isIn(["LEGAL", "MEDICAL", "EXTERNAL_REPORT", "OTHER"])
    .withMessage("Category must be one of: LEGAL, MEDICAL, EXTERNAL_REPORT, OTHER"),
  query("pinned")
    .optional()
    .isIn(["true", "false"])
    .withMessage("Pinned must be true or false"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("tag")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Tag must not exceed 100 characters"),
];

const updateDocumentValidator = [
  ...documentIdParam,
  body("tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array"),
  body("tags.*")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Each tag must not exceed 100 characters"),
  body("category")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      if (["LEGAL", "MEDICAL", "EXTERNAL_REPORT", "OTHER"].includes(value)) return true;
      throw new Error("Category must be one of: LEGAL, MEDICAL, EXTERNAL_REPORT, OTHER");
    }),
  body("isPinned")
    .optional()
    .isBoolean()
    .withMessage("isPinned must be a boolean"),
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
  residentIdParam,
  documentIdParam,
  listDocumentsValidator,
  updateDocumentValidator,
};

const { body, param } = require("express-validator");

const createDrillValidator = [
  body("drillType")
    .isIn(["REGULAR", "ANNUAL_FULL"])
    .withMessage("Drill type must be Full evacuation (annually) or Partial evacuation (every 60 days)."),
  body("scheduledDate")
    .trim()
    .notEmpty()
    .withMessage("Date of drill is required.")
    .matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/)
    .withMessage("Date of drill must be a valid date (e.g. YYYY-MM-DD).")
    .toDate(),
  body("notes")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 100000 })
    .withMessage("Notes cannot exceed 100,000 characters."),
];

const completeDrillValidator = [
  param("id").isUUID().withMessage("Invalid drill ID"),
  body("completedDate").optional().isISO8601().toDate(),
  body("completedBy").optional().trim().isLength({ max: 255 }),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 100000 }).withMessage("Notes cannot exceed 100,000 characters."),
];

const drillIdParam = [param("id").isUUID().withMessage("Invalid drill ID")];

module.exports = {
  createDrillValidator,
  completeDrillValidator,
  drillIdParam,
};

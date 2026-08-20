const { body, param, query } = require("express-validator");

const createTaskValidator = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("dueDate").notEmpty().isISO8601().withMessage("Valid due date is required"),
  body("priority")
    .optional()
    .isIn(["LOW", "MEDIUM", "HIGH"])
    .withMessage("Priority must be LOW, MEDIUM, or HIGH"),
  body("assigneeId").optional({ nullable: true }).isUUID(),
  body("assigneeRole").optional({ nullable: true }).isString(),
  body("description").optional({ nullable: true }).isString(),
];

const updateTaskValidator = [
  param("id").isUUID().withMessage("Valid task ID is required"),
  body("title").optional().trim().notEmpty(),
  body("dueDate").optional().isISO8601(),
  body("priority")
    .optional()
    .isIn(["LOW", "MEDIUM", "HIGH"]),
  body("status")
    .optional()
    .isIn(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  body("assigneeId").optional({ nullable: true }).isUUID(),
  body("assigneeRole").optional({ nullable: true }).isString(),
  body("description").optional({ nullable: true }).isString(),
];

const taskIdValidator = [
  param("id").isUUID().withMessage("Valid task ID is required"),
];

const listTasksValidator = [
  query("view")
    .optional()
    .isIn(["my", "facility", "overdue"]),
  query("status")
    .optional()
    .isIn(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  query("priority")
    .optional()
    .isIn(["LOW", "MEDIUM", "HIGH"]),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
];

module.exports = {
  createTaskValidator,
  updateTaskValidator,
  taskIdValidator,
  listTasksValidator,
};

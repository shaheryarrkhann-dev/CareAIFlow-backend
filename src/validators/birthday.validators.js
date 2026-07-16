const { query, param } = require("express-validator");

const upcomingBirthdaysValidator = [
  query("range")
    .optional()
    .isIn(["week", "month"])
    .withMessage("range must be 'week' or 'month'"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("tenantId").optional().isUUID().withMessage("Invalid tenantId"),
];

const listNotificationsValidator = [
  query("unreadOnly").optional().isIn(["true", "false", "0", "1"]),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
];

const notificationIdValidator = [
  param("id").isUUID().withMessage("Invalid notification ID"),
];

module.exports = {
  upcomingBirthdaysValidator,
  listNotificationsValidator,
  notificationIdValidator,
};

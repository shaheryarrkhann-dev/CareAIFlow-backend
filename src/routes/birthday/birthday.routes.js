const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");
const birthdayController = require("../../controllers/birthday/birthday.controller");
const {
  upcomingBirthdaysValidator,
  listNotificationsValidator,
  notificationIdValidator,
} = require("../../validators/birthday.validators");

router.use(authenticate());

// Birthday list endpoints
router.get(
  "/upcoming",
  validate(upcomingBirthdaysValidator),
  birthdayController.getUpcoming
);

router.get("/today", birthdayController.getToday);

router.get("/config", birthdayController.getConfig);

// Birthday notification endpoints
router.get(
  "/notifications",
  validate(listNotificationsValidator),
  birthdayController.listNotifications
);

router.patch(
  "/notifications/:id/read",
  validate(notificationIdValidator),
  birthdayController.markRead
);

// Manual trigger for testing (admin only)
router.post("/trigger-cron", birthdayController.triggerCron);

module.exports = router;

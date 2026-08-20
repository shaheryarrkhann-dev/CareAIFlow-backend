const { validationResult } = require("express-validator");
const {
  getUpcomingBirthdays,
  getTodaysBirthdays,
  getReminderConfig,
  getNotifications,
  markNotificationRead,
  processBirthdayReminders,
} = require("../../services/birthday/birthday.service");

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    res.status(400).json({
      success: false,
      message: first.msg || "Validation failed",
    });
    return true;
  }
  return false;
}

async function getUpcoming(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN" && req.query.tenantId
        ? req.query.tenantId
        : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }

    const range = req.query.range || "week"; // "week" or "month"
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    const result = await getUpcomingBirthdays(tenantId, { range, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get upcoming birthdays error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get upcoming birthdays",
    });
  }
}

async function getToday(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN" && req.query.tenantId
        ? req.query.tenantId
        : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }

    const birthdays = await getTodaysBirthdays(tenantId);

    return res.status(200).json({
      success: true,
      birthdays,
      count: birthdays.length,
    });
  } catch (err) {
    console.error("Get today birthdays error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get today's birthdays",
    });
  }
}

async function getConfig(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN" && req.query.tenantId
        ? req.query.tenantId
        : req.user.tenantId;

    const config = await getReminderConfig(tenantId);

    return res.status(200).json({
      success: true,
      config,
    });
  } catch (err) {
    console.error("Get birthday config error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get birthday config",
    });
  }
}

async function listNotifications(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === "1";
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    const notifications = await getNotifications(req.user, { unreadOnly, limit });

    return res.status(200).json({ success: true, notifications });
  } catch (err) {
    console.error("List birthday notifications error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to list birthday notifications",
    });
  }
}

async function markRead(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    await markNotificationRead(req.params.id, req.user);

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    console.error("Mark birthday notification read error:", err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update notification",
    });
  }
}

async function triggerCron(req, res) {
  try {
    if (!req.user || (req.user.role !== "SUPER_ADMIN" && req.user.role !== "ADMIN")) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const result = await processBirthdayReminders();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Trigger birthday cron error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to trigger birthday reminders",
    });
  }
}

module.exports = {
  getUpcoming,
  getToday,
  getConfig,
  listNotifications,
  markRead,
  triggerCron,
};

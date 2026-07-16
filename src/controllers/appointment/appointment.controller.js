const { validationResult } = require("express-validator");
const {
  createAppointment,
  getAppointmentById,
  listAppointments,
  getCalendarAppointments,
  updateAppointment,
  deleteAppointment,
  getNotifications,
  markNotificationRead,
  exportAppointments,
} = require("../../services/appointment/appointment.service");
const { logAppointmentAction } = require("../../services/compliance/audit.service");

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

async function create(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN" ? req.query.tenantId || req.body.tenantId : null;
    const appointment = await createAppointment(req.body, req.user, tenantIdFromQuery);

    await logAppointmentAction({
      action: "APPOINTMENT_CREATED",
      userId: req.user.id,
      tenantId: appointment.tenantId,
      resourceId: appointment.id,
      req,
      metadata: { title: appointment.title, appointmentType: appointment.appointmentType },
    });

    return res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      appointment,
    });
  } catch (err) {
    console.error("Create appointment error:", err);
    const status = err.message?.includes("not found") ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to create appointment",
    });
  }
}

async function calendar(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN" ? req.query.tenantId : null;
    const result = await getCalendarAppointments(
      req.query.view || "day",
      req.query.date,
      req.user,
      tenantIdFromQuery
    );
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Calendar appointments error:", err);
    const status = err.message?.includes("Invalid date") ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to load calendar appointments",
    });
  }
}

async function list(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      residentId: req.query.residentId,
      staffId: req.query.staffId,
      facilityId: req.query.facilityId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      type: req.query.type,
      status: req.query.status,
      tenantId: req.user.role === "SUPER_ADMIN" ? req.query.tenantId : undefined,
    };
    const result = await listAppointments(filters, req.user);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("List appointments error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to list appointments",
    });
  }
}

async function getById(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const appointment = await getAppointmentById(req.params.id, req.user);
    return res.status(200).json({ success: true, appointment });
  } catch (err) {
    console.error("Get appointment error:", err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get appointment",
    });
  }
}

async function update(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const appointment = await updateAppointment(req.params.id, req.body, req.user);

    await logAppointmentAction({
      action: "APPOINTMENT_UPDATED",
      userId: req.user.id,
      tenantId: appointment.tenantId,
      resourceId: appointment.id,
      req,
      metadata: { title: appointment.title },
    });

    return res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
      appointment,
    });
  } catch (err) {
    console.error("Update appointment error:", err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update appointment",
    });
  }
}

async function remove(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const { id, tenantId } = await deleteAppointment(req.params.id, req.user);

    await logAppointmentAction({
      action: "APPOINTMENT_DELETED",
      userId: req.user.id,
      tenantId,
      resourceId: id,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Appointment deleted successfully",
    });
  } catch (err) {
    console.error("Delete appointment error:", err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete appointment",
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
    console.error("List notifications error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to list notifications",
    });
  }
}

async function markNotificationReadHandler(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    await markNotificationRead(req.params.id, req.user);
    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    console.error("Mark notification read error:", err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update notification",
    });
  }
}

async function exportHandler(req, res) {
  if (handleValidationErrors(req, res)) return;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const format = (req.query.format || "csv").toLowerCase();
    const tenantId =
      req.user.role === "SUPER_ADMIN" ? req.query.tenantId : undefined;
    const result = await exportAppointments(req.user, {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      format: format === "pdf" ? "pdf" : "csv",
      tenantId,
    });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    return res.send(result.buffer);
  } catch (err) {
    console.error("Export appointments error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export appointments",
    });
  }
}

module.exports = {
  create,
  list,
  calendar,
  getById,
  update,
  remove,
  listNotifications,
  markNotificationReadHandler,
  export: exportHandler,
};

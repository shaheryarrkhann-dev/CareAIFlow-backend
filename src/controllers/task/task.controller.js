const taskService = require("../../services/task/task.service");

async function create(req, res) {
  try {
    const task = await taskService.createTask(
      req.user.tenantId,
      req.user.id,
      req.body
    );
    res.status(201).json({ success: true, task });
  } catch (err) {
    console.error("[Task] Create error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

async function update(req, res) {
  try {
    const task = await taskService.updateTask(
      req.params.id,
      req.user.tenantId,
      req.body
    );
    res.json({ success: true, task });
  } catch (err) {
    if (err.message === "Task not found") {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error("[Task] Update error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

async function remove(req, res) {
  try {
    await taskService.deleteTask(req.params.id, req.user.tenantId);
    res.json({ success: true, message: "Task deleted" });
  } catch (err) {
    if (err.message === "Task not found") {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error("[Task] Delete error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getById(req, res) {
  try {
    const task = await taskService.getTaskById(
      req.params.id,
      req.user.tenantId
    );
    res.json({ success: true, task });
  } catch (err) {
    if (err.message === "Task not found") {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error("[Task] GetById error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

async function list(req, res) {
  try {
    const { view, status, priority, page, limit } = req.query;
    const result = await taskService.listTasks(req.user.tenantId, {
      view: view || "facility",
      status,
      priority,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      userId: req.user.id,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[Task] List error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

async function stats(req, res) {
  try {
    const result = await taskService.getTaskStats(
      req.user.tenantId,
      req.user.id
    );
    res.json({ success: true, stats: result });
  } catch (err) {
    console.error("[Task] Stats error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { create, update, remove, getById, list, stats };

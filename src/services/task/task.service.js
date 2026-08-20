const prisma = require("../../lib/prisma");

/**
 * Create a new task.
 */
async function createTask(tenantId, createdById, data) {
  return prisma.task.create({
    data: {
      tenantId,
      createdById,
      title: data.title,
      description: data.description || null,
      dueDate: new Date(data.dueDate),
      priority: data.priority || "MEDIUM",
      status: "PENDING",
      assigneeId: data.assigneeId || null,
      assigneeRole: data.assigneeRole || null,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, role: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * Update a task.
 */
async function updateTask(taskId, tenantId, data) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId, deletedAt: null },
  });
  if (!task) throw new Error("Task not found");

  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId || null;
  if (data.assigneeRole !== undefined) updateData.assigneeRole = data.assigneeRole || null;

  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "COMPLETED") {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }
  }

  return prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true, email: true, role: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * Soft delete a task.
 */
async function deleteTask(taskId, tenantId) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId, deletedAt: null },
  });
  if (!task) throw new Error("Task not found");

  return prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Get a single task by ID.
 */
async function getTaskById(taskId, tenantId) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId, deletedAt: null },
    include: {
      assignee: { select: { id: true, name: true, email: true, role: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!task) throw new Error("Task not found");
  return task;
}

/**
 * List tasks with filters.
 * @param {string} tenantId
 * @param {object} options - { view, status, priority, page, limit, userId }
 *   view: "my" | "facility" | "overdue"
 */
async function listTasks(tenantId, options = {}) {
  const {
    view = "facility",
    status,
    priority,
    page = 1,
    limit = 50,
    userId,
  } = options;

  const where = { ...(tenantId ? { tenantId } : {}), deletedAt: null };

  if (view === "my" && userId) {
    where.assigneeId = userId;
  } else if (view === "overdue") {
    where.dueDate = { lt: new Date() };
    where.status = { not: "COMPLETED" };
  }

  if (status) where.status = status;
  if (priority) where.priority = priority;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignee: {
          select: { id: true, name: true, email: true, role: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    tasks,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get task stats for a tenant (counts by status).
 */
async function getTaskStats(tenantId, userId) {
  const baseWhere = { ...(tenantId ? { tenantId } : {}), deletedAt: null };

  const [pending, inProgress, completed, overdue, myTasks] = await Promise.all([
    prisma.task.count({ where: { ...baseWhere, status: "PENDING" } }),
    prisma.task.count({ where: { ...baseWhere, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { ...baseWhere, status: "COMPLETED" } }),
    prisma.task.count({
      where: {
        ...baseWhere,
        dueDate: { lt: new Date() },
        status: { not: "COMPLETED" },
      },
    }),
    userId
      ? prisma.task.count({
          where: { ...baseWhere, assigneeId: userId, status: { not: "COMPLETED" } },
        })
      : 0,
  ]);

  return { pending, inProgress, completed, overdue, myTasks };
}

/**
 * Get overdue tasks for all tenants (used by cron).
 */
async function getOverdueTasks() {
  return prisma.task.findMany({
    where: {
      deletedAt: null,
      dueDate: { lt: new Date() },
      status: { not: "COMPLETED" },
    },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });
}

module.exports = {
  createTask,
  updateTask,
  deleteTask,
  getTaskById,
  listTasks,
  getTaskStats,
  getOverdueTasks,
};

const cron = require("node-cron");
const { getOverdueTasks } = require("../services/task/task.service");
const {
  sendPushToUser,
} = require("../services/firebase/firebase-push.service");

async function runOverdueTaskCheck() {
  console.log("\n[CRON] Overdue task reminder check...");
  const start = Date.now();
  try {
    const overdueTasks = await getOverdueTasks();
    let notified = 0;

    for (const task of overdueTasks) {
      // Notify assignee if assigned
      if (task.assigneeId) {
        try {
          await sendPushToUser(task.assigneeId, {
            title: "Overdue Task",
            body: `"${task.title}" was due ${task.dueDate.toLocaleDateString()}`,
            data: { type: "task_overdue", taskId: task.id },
          });
          notified++;
        } catch (err) {
          console.error(
            `[overdue-task] Push failed for user ${task.assigneeId}:`,
            err.message
          );
        }
      }

      // Also notify creator if different from assignee
      if (task.createdById && task.createdById !== task.assigneeId) {
        try {
          await sendPushToUser(task.createdById, {
            title: "Overdue Task",
            body: `"${task.title}" assigned to ${
              task.assignee?.name || "unassigned"
            } is overdue`,
            data: { type: "task_overdue", taskId: task.id },
          });
          notified++;
        } catch (err) {
          console.error(
            `[overdue-task] Push failed for creator ${task.createdById}:`,
            err.message
          );
        }
      }
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    if (overdueTasks.length > 0) {
      console.log(
        `   Found ${overdueTasks.length} overdue task(s), sent ${notified} notification(s).`
      );
    }
    console.log(`[CRON] Overdue task check completed in ${duration}s.\n`);
  } catch (err) {
    console.error("[CRON] Overdue task check failed:", err.message);
  }
}

function initializeOverdueTaskCron() {
  // Run daily at 8:00 AM UTC (1 hour after birthday cron)
  const cronExpression = "0 8 * * *";
  console.log("[CRON] Overdue task reminder cron scheduled:");
  console.log(`   Schedule: Daily at 8:00 AM UTC`);
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runOverdueTaskCheck(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runOverdueTaskCheck };
}

module.exports = {
  initializeOverdueTaskCron,
  runOverdueTaskCheck,
};

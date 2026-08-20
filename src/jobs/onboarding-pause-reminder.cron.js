const {
  getOnboardingPauseReminderDays,
} = require("../config/onboardingLaunchConfig");
const prisma = require("../lib/prisma");
const {
  sendOnboardingPausedReminderEmail,
} = require("../utils/email.util");

/**
 * Email owners whose onboarding is still in progress after N days.
 * Tracks last reminder in session.draftJson.onboardingPauseReminderAt.
 */
async function runOnboardingPauseReminders() {
  const days = getOnboardingPauseReminderDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sessions = await prisma.onboardingSession.findMany({
    where: {
      status: { in: ["in_progress", "minimum_complete"] },
      completedAt: null,
      updatedAt: { lt: cutoff },
    },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          role: true,
        },
      },
    },
  });

  let sent = 0;
  const frontend = String(
    process.env.FRONTEND_URL || "http://localhost:5173",
  ).replace(/\/$/, "");

  for (const session of sessions) {
    const user = session.user;
    if (!user?.isActive || user.role === "SUPER_ADMIN" || !user.email) {
      continue;
    }
    const draft =
      session.draftJson && typeof session.draftJson === "object"
        ? session.draftJson
        : {};
    if (draft.onboardingPauseReminderAt) {
      const last = new Date(draft.onboardingPauseReminderAt);
      if (Date.now() - last.getTime() < days * 24 * 60 * 60 * 1000) {
        continue;
      }
    }

    try {
      await sendOnboardingPausedReminderEmail(
        user.email,
        user.name,
        `${frontend}/onboarding`,
      );
      await prisma.onboardingSession.update({
        where: { id: session.id },
        data: {
          draftJson: {
            ...draft,
            onboardingPauseReminderAt: new Date().toISOString(),
          },
        },
      });
      sent += 1;
    } catch (err) {
      console.error(
        "[onboarding-pause-reminder] failed for",
        user.email,
        err.message,
      );
    }
  }

  return { scanned: sessions.length, sent, days };
}

function initializeOnboardingPauseReminderCron() {
  const enabled =
    String(process.env.ONBOARDING_PAUSE_REMINDER_CRON || "true").toLowerCase() !==
    "false";
  if (!enabled) {
    console.log("[onboarding-pause-reminder] cron disabled");
    return;
  }

  // Daily ~10:00 UTC
  const DAY_MS = 24 * 60 * 60 * 1000;
  const run = async () => {
    try {
      const result = await runOnboardingPauseReminders();
      console.log("[onboarding-pause-reminder]", result);
    } catch (err) {
      console.error("[onboarding-pause-reminder] cron error:", err.message);
    }
  };

  // First run after 5 minutes, then daily
  setTimeout(() => {
    run();
    setInterval(run, DAY_MS);
  }, 5 * 60 * 1000);

  console.log(
    `[onboarding-pause-reminder] scheduled (every ${getOnboardingPauseReminderDays()}d idle)`,
  );
}

module.exports = {
  runOnboardingPauseReminders,
  initializeOnboardingPauseReminderCron,
};

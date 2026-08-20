const prisma = require("../../lib/prisma");

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Canonical step keys (map 1:1 to frontend routes). */
const STEPS = {
  VERIFY_EMAIL: "verify_email",
  PLAN: "plan",
  CONFIRM: "confirm",
  SUCCESS: "success",
  ORGANIZATION: "organization",
  FACILITY: "facility",
  MULTI_HOME: "multi_home",
  ADD_FACILITY: "add_facility",
  PATH: "path",
  INVITE: "invite",
  CHECKLIST: "checklist",
  READY: "ready",
  COMPLETE: "complete",
};

const STEP_TO_ROUTE = {
  [STEPS.VERIFY_EMAIL]: "/onboarding/verify-email",
  [STEPS.PLAN]: "/onboarding/plan",
  [STEPS.CONFIRM]: "/onboarding/confirm",
  [STEPS.SUCCESS]: "/onboarding/success",
  [STEPS.ORGANIZATION]: "/onboarding/organization",
  [STEPS.FACILITY]: "/onboarding/facility",
  [STEPS.MULTI_HOME]: "/onboarding/multi-home",
  [STEPS.ADD_FACILITY]: "/onboarding/facility/add",
  [STEPS.PATH]: "/onboarding/path",
  [STEPS.INVITE]: "/onboarding/invite",
  [STEPS.CHECKLIST]: "/onboarding/checklist",
  [STEPS.READY]: "/onboarding/ready",
  [STEPS.COMPLETE]: "/dashboard",
};

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function hasSentInvite(draft) {
  return (
    Array.isArray(draft.pendingInvites) &&
    draft.pendingInvites.some((i) => i?.status === "sent")
  );
}

/**
 * Resolve next step from live user/subscription/facility facts + session soft progress.
 */
function resolveProgress({
  user,
  subscription,
  facilityCount,
  session,
}) {
  const draft = asObject(session?.draftJson);
  const checklist = asObject(session?.checklistJson);
  const origin = session?.origin || draft.origin || "self_serve";
  const planKey = subscription?.planKey || draft.planKey || null;

  const gates = {
    emailVerified: Boolean(user?.isEmailVerified),
    hasPaidSubscription: Boolean(
      subscription && ACTIVE_SUB_STATUSES.has(subscription.status),
    ),
    hasOrganization: Boolean(user?.tenantId),
    hasFacility: facilityCount > 0,
  };

  const minimumComplete =
    gates.emailVerified &&
    gates.hasPaidSubscription &&
    gates.hasOrganization &&
    gates.hasFacility;

  let nextStep = STEPS.COMPLETE;
  let required = true;

  if (!gates.emailVerified) {
    nextStep = STEPS.VERIFY_EMAIL;
  } else if (!gates.hasPaidSubscription) {
    if (origin === "assisted" && !draft.planConfirmed) {
      nextStep = STEPS.CONFIRM;
    } else if (draft.stripeCheckoutSessionId && !subscription) {
      nextStep = STEPS.SUCCESS;
    } else {
      nextStep = STEPS.PLAN;
    }
  } else if (!gates.hasOrganization) {
    nextStep = STEPS.ORGANIZATION;
  } else if (!gates.hasFacility) {
    nextStep = STEPS.FACILITY;
  } else if (planKey === "multi-home" && facilityCount < 2) {
    if (draft.multiHomeFacilitiesNow == null) {
      nextStep = STEPS.MULTI_HOME;
    } else if (
      draft.multiHomeFacilitiesNow === 2 &&
      !draft.multiHomeSecondSkipped
    ) {
      nextStep = STEPS.ADD_FACILITY;
    } else if (!session?.startingPath && !draft.startingPath) {
      // ONB-11 — choose start path (recommended; does not block product)
      nextStep = STEPS.PATH;
      required = false;
    } else if (!session?.inviteSkippedAt && !hasSentInvite(draft)) {
      nextStep = STEPS.INVITE;
      required = false;
    } else if (!checklist.completed) {
      nextStep = STEPS.CHECKLIST;
      required = false;
    } else {
      nextStep = STEPS.READY;
      required = false;
    }
  } else if (!session?.startingPath && !draft.startingPath) {
    nextStep = STEPS.PATH;
    required = false;
  } else if (!session?.inviteSkippedAt && !hasSentInvite(draft)) {
    nextStep = STEPS.INVITE;
    required = false;
  } else if (!checklist.completed) {
    nextStep = STEPS.CHECKLIST;
    required = false;
  } else if (session?.status !== "complete") {
    nextStep = STEPS.READY;
    required = false;
  } else {
    nextStep = STEPS.COMPLETE;
    required = false;
  }

  let status = session?.status || "in_progress";
  if (session?.status === "complete" || session?.completedAt) {
    status = "complete";
    nextStep = STEPS.COMPLETE;
    required = false;
  } else if (minimumComplete) {
    status = "minimum_complete";
  } else {
    status = "in_progress";
  }

  const startingPath = session?.startingPath || draft.startingPath || null;

  return {
    nextStep,
    nextRoute: STEP_TO_ROUTE[nextStep] || "/dashboard",
    required,
    status,
    minimumComplete,
    gates,
    planKey,
    origin,
    startingPath,
  };
}

async function ensureSession(userId, { origin } = {}) {
  const existing = await prisma.onboardingSession.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  return prisma.onboardingSession.create({
    data: {
      userId,
      origin: origin || "self_serve",
      status: "in_progress",
      currentStep: STEPS.VERIFY_EMAIL,
      draftJson: {},
    },
  });
}

function superAdminSessionState() {
  return {
    success: true,
    session: {
      id: null,
      origin: "platform",
      status: "complete",
      currentStep: STEPS.COMPLETE,
      startingPath: "manual",
      inviteSkippedAt: null,
      checklist: { completed: true },
      draft: {},
      completedAt: null,
      updatedAt: null,
    },
    progress: {
      nextStep: STEPS.COMPLETE,
      nextRoute: STEP_TO_ROUTE[STEPS.COMPLETE],
      required: false,
      minimumComplete: true,
      gates: {
        emailVerified: true,
        hasPaidSubscription: true,
        hasOrganization: true,
        hasFacility: true,
      },
      planKey: null,
      facilityCount: 0,
      subscriptionBypassed: true,
    },
  };
}

async function loadContext(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }

  if (user.role === "SUPER_ADMIN") {
    return { user, subscription: null, facilityCount: 0, session: null };
  }

  const subscription = await prisma.saasSubscription.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  let facilityCount = 0;
  if (user.tenantId) {
    facilityCount = await prisma.facility.count({
      where: { tenantId: user.tenantId },
    });
  }

  const session = await ensureSession(userId, {
    origin: subscription ? "self_serve" : undefined,
  });

  return { user, subscription, facilityCount, session };
}

/**
 * GET resolved onboarding payload for the authenticated user.
 */
async function getSessionState(userId) {
  const ctx = await loadContext(userId);
  if (ctx.user.role === "SUPER_ADMIN") {
    return superAdminSessionState();
  }
  const progress = resolveProgress(ctx);

  // Persist computed status / step when they drift (do not invent startingPath)
  if (
    ctx.session.status !== progress.status ||
    ctx.session.currentStep !== progress.nextStep
  ) {
    await prisma.onboardingSession.update({
      where: { id: ctx.session.id },
      data: {
        status: progress.status,
        currentStep: progress.nextStep,
        tenantId: ctx.user.tenantId || ctx.session.tenantId,
      },
    });
  }

  const draft = asObject(ctx.session.draftJson);

  return {
    success: true,
    session: {
      id: ctx.session.id,
      origin: progress.origin,
      status: progress.status,
      currentStep: progress.nextStep,
      startingPath: progress.startingPath,
      inviteSkippedAt: ctx.session.inviteSkippedAt,
      checklist: asObject(ctx.session.checklistJson),
      draft: {
        ...draft,
        startingPath: draft.startingPath || progress.startingPath || null,
      },
      completedAt: ctx.session.completedAt,
      updatedAt: ctx.session.updatedAt,
    },
    progress: {
      nextStep: progress.nextStep,
      nextRoute: progress.nextRoute,
      required: progress.required,
      minimumComplete: progress.minimumComplete,
      gates: progress.gates,
      planKey: progress.planKey,
      facilityCount: ctx.facilityCount,
    },
  };
}

/**
 * PATCH merge draft + soft progress flags.
 */
async function patchSession(userId, body = {}) {
  const ctx = await loadContext(userId);
  if (ctx.user.role === "SUPER_ADMIN") {
    return superAdminSessionState();
  }
  const currentDraft = asObject(ctx.session.draftJson);
  const patchDraft = asObject(body.draft);
  const nextDraft = { ...currentDraft, ...patchDraft };

  const data = {
    draftJson: nextDraft,
    tenantId: ctx.user.tenantId || body.tenantId || ctx.session.tenantId,
  };

  if (body.origin === "assisted" || body.origin === "self_serve" || body.origin === "invite") {
    data.origin = body.origin;
  }

  if (typeof body.startingPath === "string" && body.startingPath.trim()) {
    data.startingPath = body.startingPath.trim();
    nextDraft.startingPath = data.startingPath;
    data.draftJson = nextDraft;
  }

  if (body.skipInvite === true) {
    data.inviteSkippedAt = new Date();
  }

  if (body.checklist && typeof body.checklist === "object") {
    data.checklistJson = {
      ...asObject(ctx.session.checklistJson),
      ...body.checklist,
    };
  }

  if (typeof body.currentStep === "string" && body.currentStep.trim()) {
    data.currentStep = body.currentStep.trim();
  }

  await prisma.onboardingSession.update({
    where: { id: ctx.session.id },
    data,
  });

  return getSessionState(userId);
}

/**
 * Mark onboarding complete (optional tasks finished or user entered product).
 */
async function completeSession(userId) {
  const ctx = await loadContext(userId);
  if (ctx.user.role === "SUPER_ADMIN") {
    return superAdminSessionState();
  }
  const progress = resolveProgress(ctx);

  if (!progress.minimumComplete) {
    throw Object.assign(
      new Error(
        "Finish email verification, subscription, organization, and first facility before completing onboarding.",
      ),
      { status: 400 },
    );
  }

  await prisma.onboardingSession.update({
    where: { id: ctx.session.id },
    data: {
      status: "complete",
      currentStep: STEPS.COMPLETE,
      completedAt: new Date(),
      checklistJson: {
        ...asObject(ctx.session.checklistJson),
        completed: true,
      },
      inviteSkippedAt: ctx.session.inviteSkippedAt || new Date(),
    },
  });

  return getSessionState(userId);
}

module.exports = {
  STEPS,
  STEP_TO_ROUTE,
  getSessionState,
  patchSession,
  completeSession,
  ensureSession,
};

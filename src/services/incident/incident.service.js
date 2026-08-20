const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");
const { evaluateIncidentCompliance } = require("./incidentCompliance.service");
const { generateAiIncidentDraft } = require("./incident-ai.service");

const INCIDENT_TYPES = new Set([
  "Accident",
  "MedicationError",
  "Behavioral",
  "Complaint",
  "SuspectedAbuseOrNeglect",
  "Other",
]);

const STATUSES = new Set(["Open", "InReview", "Closed"]);
const SEVERITIES = new Set(["Low", "Medium", "High"]);
const COMPLIANCE_STATUSES = new Set(["PENDING", "PASS", "FAIL"]);
const VALID_STATUS_TRANSITIONS = {
  Open: new Set(["InReview", "Closed"]),
  InReview: new Set(["Open", "Closed"]),
  Closed: new Set(["InReview"]),
};

function normalizeBodyMapPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .slice(0, 50)
    .map((point) => {
      const xPct = Number(point?.xPct);
      const yPct = Number(point?.yPct);
      const view = point?.view === "back" ? "back" : point?.view === "front" ? "front" : null;
      if (!Number.isFinite(xPct) || !Number.isFinite(yPct) || !view) return null;
      const normalizedXPct = Math.max(0, Math.min(100, Number(xPct.toFixed(2))));
      const normalizedYPct = Math.max(0, Math.min(100, Number(yPct.toFixed(2))));
      return {
        id: String(point?.id || `${view}-${normalizedXPct}-${normalizedYPct}`),
        view,
        xPct: normalizedXPct,
        yPct: normalizedYPct,
        injuryType: point?.injuryType ? String(point.injuryType).slice(0, 120) : null,
        severity: ["Low", "Medium", "High"].includes(point?.severity) ? point.severity : null,
        notes: point?.notes ? String(point.notes).slice(0, 1000) : null,
        createdAt: point?.createdAt ? String(point.createdAt) : null,
      };
    })
    .filter(Boolean);
}

function resolveTenantId(data, requestingUser) {
  if (requestingUser.role === "SUPER_ADMIN") {
    const tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("tenantId is required when creating incident report as SUPER_ADMIN");
    }
    return tenantId;
  }
  const tenantId = requestingUser.tenantId;
  if (!tenantId) {
    throw new Error("You must belong to a tenant to manage incident reports");
  }
  return tenantId;
}

async function getResidentName(residentId, tenantId) {
  try {
    const user = { tenantId, role: "ADMIN" };
    const resident = await getResidentById(residentId, user);
    return resident.name || null;
  } catch {
    return null;
  }
}

function normalizePayload(incoming) {
  const base = typeof incoming === "object" && incoming !== null ? incoming : {};
  return {
    reportedByStaffId: base.reportedByStaffId ?? null,
    reportedByStaffName: base.reportedByStaffName ?? null,
    reviewedByStaffId: base.reviewedByStaffId ?? null,
    reviewedByStaffName: base.reviewedByStaffName ?? null,
    witnessDetails: base.witnessDetails ?? null,
    otherResidentsInvolved: base.otherResidentsInvolved ?? null,
    witnessed: typeof base.witnessed === "boolean" ? base.witnessed : null,
    witnessedBy: base.witnessedBy ?? null,
    abuseReportedToLocalOfficeDate: base.abuseReportedToLocalOfficeDate ?? null,
    description: typeof base.description === "string" ? base.description : "",
    injuriesDescription: base.injuriesDescription ?? null,
    staffActions: base.staffActions ?? null,
    bodyMapVersion: "v1",
    bodyMapNotes: base.bodyMapNotes ?? null,
    bodyMapPoints: normalizeBodyMapPoints(base.bodyMapPoints),
    bodyMapImageDataUrl: base.bodyMapImageDataUrl ?? null,
    notifications: base.notifications && typeof base.notifications === "object"
      ? base.notifications
      : {},
    followUpPlan: base.followUpPlan ?? null,
    incidentReviewNotes: base.incidentReviewNotes ?? null,
    staffSignature: base.staffSignature ?? null,
    providerSignature: base.providerSignature ?? null,
    completedByName: base.completedByName ?? null,
    completedBySignature: base.completedBySignature ?? null,
    completedDate: base.completedDate ?? null,
    completedTime: base.completedTime ?? null,
    providerDateOfReview: base.providerDateOfReview ?? null,
    providerDateSigned: base.providerDateSigned ?? null,
    closureNotes: base.closureNotes ?? null,
    outcomeSummary: base.outcomeSummary ?? null,
    internalNotes: base.internalNotes ?? null,
    activityLog: Array.isArray(base.activityLog) ? base.activityLog : [],
    compliance: base.compliance && typeof base.compliance === "object" ? base.compliance : null,
    guidedResponses:
      base.guidedResponses && typeof base.guidedResponses === "object"
        ? Object.fromEntries(
            Object.entries(base.guidedResponses)
              .slice(0, 20)
              .map(([k, v]) => [String(k).slice(0, 80), String(v || "").slice(0, 2000)]),
          )
        : {},
  };
}

function canTransitionStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  return Boolean(VALID_STATUS_TRANSITIONS[currentStatus]?.has(nextStatus));
}

function appendActivity(payload, entry) {
  const log = Array.isArray(payload.activityLog) ? [...payload.activityLog] : [];
  log.push({
    at: new Date().toISOString(),
    ...entry,
  });
  return { ...payload, activityLog: log };
}

function classifySeverity(incidentType, payload) {
  const description = String(payload?.description || "").toLowerCase();
  const injuries = String(payload?.injuriesDescription || "").toLowerCase();
  const context = `${description} ${injuries}`;

  if (incidentType === "SuspectedAbuseOrNeglect") {
    return { severity: "High", reason: "Auto-classified High for suspected abuse or neglect incidents." };
  }
  if (incidentType === "MedicationError") {
    if (context.includes("hospital") || context.includes("911") || context.includes("er")) {
      return { severity: "High", reason: "Auto-classified High for medication incident with emergency escalation signals." };
    }
    return { severity: "Medium", reason: "Auto-classified Medium for medication error incident type." };
  }
  if (
    context.includes("fracture") ||
    context.includes("unconscious") ||
    context.includes("head injury") ||
    context.includes("bleeding heavily")
  ) {
    return { severity: "High", reason: "Auto-classified High based on serious injury keywords." };
  }
  if (
    context.includes("injury") ||
    context.includes("bruise") ||
    context.includes("cut") ||
    context.includes("fall") ||
    context.includes("aggression")
  ) {
    return { severity: "Medium", reason: "Auto-classified Medium based on incident narrative and injury context." };
  }
  return { severity: "Low", reason: "Auto-classified Low due to no high-risk indicators detected." };
}

/**
 * @param {object} data
 * @param {object} requestingUser
 */
async function createIncidentReport(data, requestingUser) {
  const tenantId = resolveTenantId(data, requestingUser);

  const residentId = String(data.residentId || "").trim();
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error("Resident not found or does not belong to your organization");
  }

  const incidentType = String(data.incidentType || "").trim();
  if (!INCIDENT_TYPES.has(incidentType)) {
    throw new Error("Invalid incident type");
  }

  const status = data.status ? String(data.status).trim() : "Open";
  if (!STATUSES.has(status)) {
    throw new Error("Invalid status");
  }
  const incidentTypeOtherText = String(data.incidentTypeOtherText || "").trim() || null;
  if (incidentType === "Other" && !incidentTypeOtherText) {
    throw new Error("incidentTypeOtherText is required when incidentType is Other");
  }
  if (data.severity !== undefined && data.severity !== null) {
    const severity = String(data.severity).trim();
    if (!SEVERITIES.has(severity)) {
      throw new Error("Invalid severity");
    }
  }
  if (data.complianceStatus !== undefined && data.complianceStatus !== null) {
    const complianceStatus = String(data.complianceStatus).trim();
    if (!COMPLIANCE_STATUSES.has(complianceStatus)) {
      throw new Error("Invalid compliance status");
    }
  }

  if (!data.occurredAt) {
    throw new Error("occurredAt is required");
  }

  const residentName = await getResidentName(residentId, tenantId);
  const staff = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: { name: true },
  });

  let payload = normalizePayload(data.payload);
  if (!payload.description || !String(payload.description).trim()) {
    throw new Error("Description of incident and injuries is required");
  }

  const computedSeverity = classifySeverity(incidentType, payload);
  let severity = computedSeverity.severity;
  let severityReason = computedSeverity.reason;
  if (data.severity !== undefined && data.severity !== null) {
    const requestedSeverity = String(data.severity).trim();
    if (!SEVERITIES.has(requestedSeverity)) {
      throw new Error("Invalid severity");
    }
    if (requestedSeverity !== computedSeverity.severity) {
      const overrideReason = String(data.severityReason || "").trim();
      if (!overrideReason) {
        throw new Error("severityReason is required when overriding auto-classified severity");
      }
      severity = requestedSeverity;
      severityReason = overrideReason;
    } else {
      severity = requestedSeverity;
      severityReason = String(data.severityReason || "").trim() || computedSeverity.reason;
    }
  }

  payload = appendActivity(payload, {
    userId: requestingUser.id,
    userName: staff?.name || requestingUser.name || "User",
    action: "created",
    note: "Incident report created",
  });

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.incidentReport.create({
      data: {
        tenantId,
        residentId,
        residentName,
        occurredAt: new Date(data.occurredAt),
        incidentType,
        incidentTypeOtherText,
        status,
        severity,
        severityReason,
        complianceStatus: data.complianceStatus
          ? String(data.complianceStatus).trim()
          : "PENDING",
        complianceCheckedAt: data.complianceCheckedAt ? new Date(data.complianceCheckedAt) : null,
        aiMeta: data.aiMeta && typeof data.aiMeta === "object" ? data.aiMeta : null,
        location: data.location?.trim() || null,
        payload,
        staffId: requestingUser.id,
        staffName: staff?.name || null,
        createdBy: requestingUser.id,
      },
    });
    await tx.incidentActivity.create({
      data: {
        incidentId: created.id,
        tenantId,
        action: "CREATED",
        actorUserId: requestingUser.id,
        actorUserName: staff?.name || requestingUser.name || "User",
        note: "Incident report created",
      },
    });
    return created;
  });

  return report;
}

/**
 * @param {object} user
 * @param {object} query
 */
async function listIncidentReports(user, query) {
  const tenantId =
    user.role === "SUPER_ADMIN" ? query.tenantId || user.tenantId : user.tenantId;
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || "20"), 10) || 20));
  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    deletedAt: null,
  };

  if (query.residentId) {
    where.residentId = String(query.residentId).trim();
  }
  if (query.incidentType) {
    where.incidentType = String(query.incidentType).trim();
  }
  if (query.status) {
    where.status = String(query.status).trim();
  }
  if (query.severity) {
    where.severity = String(query.severity).trim();
  }
  if (query.complianceStatus) {
    where.complianceStatus = String(query.complianceStatus).trim();
  }
  if (query.dateFrom || query.dateTo) {
    where.occurredAt = {};
    if (query.dateFrom) {
      const d = new Date(query.dateFrom);
      d.setHours(0, 0, 0, 0);
      where.occurredAt.gte = d;
    }
    if (query.dateTo) {
      const d = new Date(query.dateTo);
      d.setHours(23, 59, 59, 999);
      where.occurredAt.lte = d;
    }
  }

  const searchRaw = query.search ? String(query.search).trim() : "";
  if (searchRaw) {
    where.OR = [
      { residentName: { contains: searchRaw, mode: "insensitive" } },
      { location: { contains: searchRaw, mode: "insensitive" } },
      { incidentType: { contains: searchRaw, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.incidentReport.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.incidentReport.count({ where }),
  ]);

  return {
    reports: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getIncidentReportById(id, user) {
  const report = await prisma.incidentReport.findFirst({
    where: { id, deletedAt: null },
  });
  if (!report) {
    throw new Error("Incident report not found");
  }
  if (user.role !== "SUPER_ADMIN" && report.tenantId !== user.tenantId) {
    throw new Error("Access denied");
  }
  return report;
}

async function updateIncidentReport(id, data, requestingUser) {
  const existing = await getIncidentReportById(id, requestingUser);

  const canUpdate =
    requestingUser.role === "ADMIN" ||
    requestingUser.role === "SUPER_ADMIN" ||
    existing.createdBy === requestingUser.id ||
    requestingUser.role === "STAFF";

  if (!canUpdate) {
    throw new Error("You do not have permission to update this incident report");
  }

  const prevPayload = normalizePayload(existing.payload);
  const incomingPayload =
    data.payload !== undefined ? normalizePayload(data.payload) : {};
  let payload = { ...prevPayload, ...incomingPayload };
  payload.activityLog = Array.isArray(prevPayload.activityLog)
    ? [...prevPayload.activityLog]
    : [];

  const staff = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: { name: true },
  });
  const staffLabel = staff?.name || requestingUser.name || "User";

  if (data.status !== undefined && String(data.status).trim() !== existing.status) {
    const nextStatus = String(data.status).trim();
    if (!canTransitionStatus(existing.status, nextStatus)) {
      throw new Error(`Invalid status transition from ${existing.status} to ${nextStatus}`);
    }
    payload = appendActivity(payload, {
      userId: requestingUser.id,
      userName: staffLabel,
      action: "status_change",
      note: `Status: ${existing.status} -> ${nextStatus}`,
    });
  }

  const prevInternal = prevPayload.internalNotes || "";
  const nextInternal = payload.internalNotes || "";
  if (nextInternal !== prevInternal) {
    payload = appendActivity(payload, {
      userId: requestingUser.id,
      userName: staffLabel,
      action: "internal_note",
      note: "Internal notes updated",
    });
  }

  const updateData = {};

  if (data.residentId !== undefined) {
    const residentId = String(data.residentId).trim();
    const ok = await validateResidentId(residentId, existing.tenantId);
    if (!ok) throw new Error("Resident not found");
    updateData.residentId = residentId;
    updateData.residentName = await getResidentName(residentId, existing.tenantId);
  }

  if (data.occurredAt !== undefined) {
    updateData.occurredAt = new Date(data.occurredAt);
  }
  if (data.incidentType !== undefined) {
    const incidentType = String(data.incidentType).trim();
    if (!INCIDENT_TYPES.has(incidentType)) throw new Error("Invalid incident type");
    updateData.incidentType = incidentType;
  }
  if (data.incidentTypeOtherText !== undefined) {
    updateData.incidentTypeOtherText = String(data.incidentTypeOtherText || "").trim() || null;
  }
  const nextIncidentType = updateData.incidentType || existing.incidentType;
  const nextIncidentTypeOtherText =
    updateData.incidentTypeOtherText !== undefined
      ? updateData.incidentTypeOtherText
      : existing.incidentTypeOtherText;
  if (nextIncidentType === "Other" && !nextIncidentTypeOtherText) {
    throw new Error("incidentTypeOtherText is required when incidentType is Other");
  }
  if (data.status !== undefined) {
    const status = String(data.status).trim();
    if (!STATUSES.has(status)) throw new Error("Invalid status");
    updateData.status = status;
  }
  if (data.severity !== undefined) {
    if (data.severity === null || data.severity === "") {
      updateData.severity = null;
    } else {
      const severity = String(data.severity).trim();
      if (!SEVERITIES.has(severity)) throw new Error("Invalid severity");
      const mergedPayload = data.payload !== undefined ? payload : prevPayload;
      const nextTypeForSeverity = updateData.incidentType || existing.incidentType;
      const computedSeverity = classifySeverity(nextTypeForSeverity, mergedPayload);
      if (severity !== computedSeverity.severity) {
        const overrideReason = String(data.severityReason || "").trim();
        if (!overrideReason) {
          throw new Error("severityReason is required when overriding auto-classified severity");
        }
        updateData.severity = severity;
        updateData.severityReason = overrideReason;
      } else {
        updateData.severity = severity;
        if (!updateData.severityReason) {
          updateData.severityReason = computedSeverity.reason;
        }
      }
    }
  }
  if (data.severityReason !== undefined) {
    updateData.severityReason = String(data.severityReason || "").trim() || null;
  }
  if (data.complianceStatus !== undefined) {
    const complianceStatus = String(data.complianceStatus).trim();
    if (!COMPLIANCE_STATUSES.has(complianceStatus)) throw new Error("Invalid compliance status");
    updateData.complianceStatus = complianceStatus;
    updateData.complianceCheckedAt = new Date();
  }
  if (data.aiMeta !== undefined) {
    updateData.aiMeta = data.aiMeta && typeof data.aiMeta === "object" ? data.aiMeta : null;
  }
  if (data.location !== undefined) {
    updateData.location = data.location?.trim() || null;
  }

  if (data.severity === undefined && (data.incidentType !== undefined || data.payload !== undefined)) {
    const computedSeverity = classifySeverity(updateData.incidentType || existing.incidentType, payload);
    updateData.severity = computedSeverity.severity;
    updateData.severityReason = computedSeverity.reason;
  }

  updateData.payload = payload;
  const targetStatus = updateData.status || existing.status;
  if (targetStatus === "Closed" && !data.forceComplianceOverride) {
    const candidateReport = {
      ...existing,
      ...updateData,
      status: targetStatus,
      payload: updateData.payload,
      incidentType: updateData.incidentType || existing.incidentType,
      incidentTypeOtherText:
        updateData.incidentTypeOtherText !== undefined
          ? updateData.incidentTypeOtherText
          : existing.incidentTypeOtherText,
      severity:
        updateData.severity !== undefined
          ? updateData.severity
          : existing.severity,
    };
    const compliance = evaluateIncidentCompliance(candidateReport, { mode: "preSubmit" });
    if (compliance.status === "FAIL") {
      const issueSummary = compliance.errors
        .slice(0, 3)
        .map((issue) => issue.message)
        .join("; ");
      throw new Error(`Cannot move incident to Closed. Compliance checks failed: ${issueSummary}`);
    }
  }
  updateData.staffId = requestingUser.id;
  updateData.staffName = staff?.name || null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.incidentReport.update({
      where: { id },
      data: updateData,
    });
    await tx.incidentActivity.create({
      data: {
        incidentId: id,
        tenantId: existing.tenantId,
        action:
          updateData.status && updateData.status !== existing.status ? "STATUS_CHANGED" : "UPDATED",
        actorUserId: requestingUser.id,
        actorUserName: staffLabel,
        note:
          updateData.status && updateData.status !== existing.status
            ? `Status changed from ${existing.status} to ${updateData.status}`
            : "Incident report updated",
      },
    });
    if (nextInternal !== prevInternal) {
      await tx.incidentActivity.create({
        data: {
          incidentId: id,
          tenantId: existing.tenantId,
          action: "INTERNAL_NOTE_UPDATED",
          actorUserId: requestingUser.id,
          actorUserName: staffLabel,
          note: "Internal notes updated",
        },
      });
    }
    return updated;
  });
}

async function generateIncidentAiDraft(data, requestingUser) {
  const tenantId = resolveTenantId(data, requestingUser);
  const combinedText = [data.freeText, data.notes].filter(Boolean).join("\n\n").trim();
  if (!combinedText) {
    throw new Error("Either freeText or notes is required");
  }

  const aiResult = await generateAiIncidentDraft(combinedText, data.residentCondition);
  const nowIso = new Date().toISOString();

  return {
    tenantId,
    sourceText: combinedText,
    draft: {
      incidentType: aiResult.incidentType,
      incidentTypeOtherText: aiResult.incidentTypeOtherText || null,
      severity: aiResult.severity,
      severityReason: aiResult.severityReason || null,
      occurredAt: aiResult.occurredAt || null,
      location: aiResult.location || null,
      payload: {
        description: aiResult.payload.description,
        injuriesDescription: aiResult.payload.injuriesDescription || null,
        staffActions: aiResult.payload.staffActions || null,
        otherResidentsInvolved: aiResult.payload.otherResidentsInvolved || null,
        witnessed: aiResult.payload.witnessed ?? null,
        witnessedBy: aiResult.payload.witnessedBy || null,
        witnessDetails: aiResult.payload.witnessDetails || null,
        followUpPlan: aiResult.payload.followUpPlan || null,
        abuseReportedToLocalOfficeDate: aiResult.payload.abuseReportedToLocalOfficeDate || null,
        bodyMapNotes:
          aiResult.payload.bodyMapNotes && typeof aiResult.payload.bodyMapNotes === "string"
            ? aiResult.payload.bodyMapNotes
            : null,
        markerDefaults:
          aiResult.payload.markerDefaults && typeof aiResult.payload.markerDefaults === "object"
            ? aiResult.payload.markerDefaults
            : null,
        notifications: aiResult.payload.notifications || {},
        guidedResponses:
          aiResult.payload.guidedResponses && typeof aiResult.payload.guidedResponses === "object"
            ? aiResult.payload.guidedResponses
            : {},
      },
      aiMeta: {
        model: "gpt-4.1-mini",
        generatedAt: nowIso,
        requiresUserApproval: true,
        confidence: aiResult.confidence || {},
        missingFields: aiResult.missingFields || [],
      },
    },
  };
}

async function runIncidentComplianceCheck(id, requestingUser, options = {}) {
  const existing = await getIncidentReportById(id, requestingUser);
  const staff = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: { name: true },
  });
  const actorName = staff?.name || requestingUser.name || "User";
  const mode = options.mode === "draft" ? "draft" : "preSubmit";
  const result = evaluateIncidentCompliance(
    {
      ...existing,
      payload: normalizePayload(existing.payload),
    },
    { mode },
  );
  const nextPayload = {
    ...normalizePayload(existing.payload),
    compliance: result,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.incidentReport.update({
      where: { id },
      data: {
        complianceStatus: result.status,
        complianceCheckedAt: new Date(result.checkedAt),
        payload: nextPayload,
        staffId: requestingUser.id,
        staffName: actorName,
      },
    });
    await tx.incidentActivity.create({
      data: {
        incidentId: id,
        tenantId: existing.tenantId,
        action: "COMPLIANCE_CHECKED",
        actorUserId: requestingUser.id,
        actorUserName: actorName,
        note: `Compliance check result: ${result.status}`,
        metadata: {
          mode: result.mode,
          errors: result.errors.length,
          warnings: result.warnings.length,
          scorePercent: result.score.percent,
        },
      },
    });
    return record;
  });

  return { report: updated, compliance: result };
}

async function listIncidentActivity(id, requestingUser) {
  const report = await getIncidentReportById(id, requestingUser);
  return prisma.incidentActivity.findMany({
    where: { incidentId: report.id, tenantId: report.tenantId },
    orderBy: { createdAt: "desc" },
  });
}

async function softDeleteIncidentReport(id, requestingUser) {
  const existing = await getIncidentReportById(id, requestingUser);
  const canDelete =
    requestingUser.role === "ADMIN" ||
    requestingUser.role === "SUPER_ADMIN" ||
    existing.createdBy === requestingUser.id;

  if (!canDelete) {
    throw new Error("You do not have permission to delete this incident report");
  }

  return prisma.incidentReport.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

module.exports = {
  createIncidentReport,
  listIncidentReports,
  getIncidentReportById,
  updateIncidentReport,
  softDeleteIncidentReport,
  generateIncidentAiDraft,
  runIncidentComplianceCheck,
  listIncidentActivity,
  classifySeverity,
  INCIDENT_TYPES: [...INCIDENT_TYPES],
  STATUSES: [...STATUSES],
};

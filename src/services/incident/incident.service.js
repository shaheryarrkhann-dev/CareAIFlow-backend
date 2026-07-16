const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");

const INCIDENT_TYPES = new Set([
  "Accident",
  "MedicationError",
  "Behavioral",
  "Complaint",
  "SuspectedAbuseOrNeglect",
]);

const STATUSES = new Set(["Open", "InReview", "Closed"]);

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
    witnessDetails: base.witnessDetails ?? null,
    otherResidentsInvolved: base.otherResidentsInvolved ?? null,
    witnessed: typeof base.witnessed === "boolean" ? base.witnessed : null,
    witnessedBy: base.witnessedBy ?? null,
    abuseReportedToLocalOfficeDate: base.abuseReportedToLocalOfficeDate ?? null,
    description: typeof base.description === "string" ? base.description : "",
    injuriesDescription: base.injuriesDescription ?? null,
    staffActions: base.staffActions ?? null,
    bodyMapNotes: base.bodyMapNotes ?? null,
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
  };
}

function appendActivity(payload, entry) {
  const log = Array.isArray(payload.activityLog) ? [...payload.activityLog] : [];
  log.push({
    at: new Date().toISOString(),
    ...entry,
  });
  return { ...payload, activityLog: log };
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

  payload = appendActivity(payload, {
    userId: requestingUser.id,
    userName: staff?.name || requestingUser.name || "User",
    action: "created",
    note: "Incident report created",
  });

  const report = await prisma.incidentReport.create({
    data: {
      tenantId,
      residentId,
      residentName,
      occurredAt: new Date(data.occurredAt),
      incidentType,
      status,
      location: data.location?.trim() || null,
      payload,
      staffId: requestingUser.id,
      staffName: staff?.name || null,
      createdBy: requestingUser.id,
    },
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
    payload = appendActivity(payload, {
      userId: requestingUser.id,
      userName: staffLabel,
      action: "status_change",
      note: `Status: ${existing.status} → ${String(data.status).trim()}`,
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
  if (data.status !== undefined) {
    const status = String(data.status).trim();
    if (!STATUSES.has(status)) throw new Error("Invalid status");
    updateData.status = status;
  }
  if (data.location !== undefined) {
    updateData.location = data.location?.trim() || null;
  }

  updateData.payload = payload;
  updateData.staffId = requestingUser.id;
  updateData.staffName = staff?.name || null;

  return prisma.incidentReport.update({
    where: { id },
    data: updateData,
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
  INCIDENT_TYPES: [...INCIDENT_TYPES],
  STATUSES: [...STATUSES],
};

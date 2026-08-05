const {
  evaluateResident,
  evaluateStaff,
  evaluateFacility,
} = require("./document-compliance-evaluation.service");
const { invalidateEntity } = require("./document-compliance-cache.service");
const {
  handleDocumentComplianceSideEffects,
} = require("./document-compliance-side-effects.service");

async function safeEvaluate(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("[document-compliance] evaluation failed:", err?.message);
    return null;
  }
}

async function afterResidentDocumentChange(
  tenantId,
  residentId,
  user,
  options = {}
) {
  await invalidateEntity(tenantId, "resident", residentId);
  const evaluation = await safeEvaluate(() =>
    evaluateResident(tenantId, residentId, user, { forceRefresh: true })
  );
  if (evaluation) {
    await handleDocumentComplianceSideEffects(evaluation, {
      tenantId,
      user,
      trigger: options.trigger || "document_change",
      req: options.req,
    });
  }
  return evaluation;
}

async function afterStaffDocumentChange(tenantId, staffId, user, options = {}) {
  await invalidateEntity(tenantId, "staff", staffId);
  const evaluation = await safeEvaluate(() =>
    evaluateStaff(tenantId, staffId, { forceRefresh: true })
  );
  if (evaluation) {
    await handleDocumentComplianceSideEffects(evaluation, {
      tenantId,
      user,
      trigger: options.trigger || "document_change",
      req: options.req,
    });
  }
  return evaluation;
}

async function afterFacilityDocumentChange(
  tenantId,
  facilityId,
  user,
  options = {}
) {
  const facility = await require("../facility/facility.service").getOrCreateFacility(
    tenantId,
    facilityId
  );
  await invalidateEntity(tenantId, "facility", facility.id);
  const evaluation = await safeEvaluate(() =>
    evaluateFacility(tenantId, facilityId, { forceRefresh: true })
  );
  if (evaluation) {
    await handleDocumentComplianceSideEffects(evaluation, {
      tenantId,
      user,
      trigger: options.trigger || "document_change",
      req: options.req,
    });
  }
  return evaluation;
}

module.exports = {
  afterResidentDocumentChange,
  afterStaffDocumentChange,
  afterFacilityDocumentChange,
};

const {
  notifyDocumentComplianceGap,
} = require("./document-compliance-notification.service");
const {
  logDocumentComplianceEvaluation,
} = require("./document-compliance-audit.service");

/**
 * After evaluation: audit trail + in-app notifications for gaps.
 */
async function handleDocumentComplianceSideEffects(evaluation, context = {}) {
  if (!evaluation) return;

  const { tenantId, user, trigger = "document_change", req } = context;

  await logDocumentComplianceEvaluation(evaluation, {
    tenantId,
    userId: user?.id,
    userName: user?.name,
    userEmail: user?.email,
    userRole: user?.role,
    trigger,
    req,
  }).catch((err) => {
    console.error("[document-compliance-audit]", err?.message);
  });

  if (tenantId) {
    await notifyDocumentComplianceGap(tenantId, evaluation).catch((err) => {
      console.error("[document-compliance-notify]", err?.message);
    });
  }
}

module.exports = {
  handleDocumentComplianceSideEffects,
};

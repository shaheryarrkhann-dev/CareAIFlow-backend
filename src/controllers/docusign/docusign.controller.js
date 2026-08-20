const docusignService = require("../../services/docusign/docusign.service");
const { generateAdmissionAgreement } = require("../../services/docusign/admission-agreement.service");
const { getResidentById } = require("../../services/resident/resident.service");
const { createAuditLog } = require("../../services/compliance/audit.service");
const logAction = (data) => createAuditLog(data).catch(() => {});

/**
 * POST /api/docusign/envelopes
 * Send a document to DocuSign for signing
 */
async function sendEnvelope(req, res) {
  try {
    const {
      residentId,
      signerName,
      signerEmail,
      documentName = "Admission Agreement",
    } = req.body;

    const tenantId = req.user.tenantId;
    const createdBy = req.user.id;

    if (!residentId || !signerName || !signerEmail) {
      return res.status(400).json({
        success: false,
        message: "residentId, signerName, and signerEmail are required",
      });
    }

    // Validate resident belongs to this tenant
    const resident = await getResidentById(residentId, req.user);
    if (!resident) {
      return res.status(404).json({ success: false, message: "Resident not found" });
    }

    // Use uploaded PDF if provided, otherwise generate the full Admission Agreement
    let documentBuffer;
    let tabPosition;
    if (req.file) {
      documentBuffer = req.file.buffer;
    } else {
      // Generate a proper Admission Agreement PDF with platform letterhead
      const result = await generateAdmissionAgreement(resident, tenantId, documentName);
      documentBuffer = result.pdfBuffer;
      tabPosition = result.tabPosition;
    }

    const envelope = await docusignService.createEnvelope({
      residentId,
      tenantId,
      signerName,
      signerEmail,
      documentBuffer,
      documentName,
      createdBy,
      tabPosition,
    });

    // Audit log
    logAction({
      action: "DOCUSIGN_ENVELOPE_SENT",
      resource: "DOCUSIGN",
      userId: createdBy,
      tenantId,
      resourceId: envelope.id,
      metadata: {
        envelopeId: envelope.envelopeId,
        residentId,
        signerEmail,
        documentName,
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `Signing request sent to ${signerEmail}`,
      envelope,
    });
  } catch (error) {
    console.error("[DocuSign] sendEnvelope error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send signing request",
    });
  }
}

/**
 * GET /api/docusign/envelopes
 * List all envelopes for the current tenant
 */
async function getEnvelopes(req, res) {
  try {
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;

    const { page, limit, status, residentId } = req.query;

    const result = await docusignService.listEnvelopes(tenantId, {
      page,
      limit,
      status,
      residentId,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[DocuSign] getEnvelopes error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/docusign/envelopes/:envelopeId
 * Get a single envelope and sync its status from DocuSign
 */
async function getEnvelopeById(req, res) {
  try {
    const { envelopeId } = req.params;
    const tenantId = req.user.tenantId;

    // Sync latest status from DocuSign
    const envelope = await docusignService.getEnvelopeStatus(envelopeId, tenantId);

    return res.json({ success: true, envelope });
  } catch (error) {
    console.error("[DocuSign] getEnvelopeById error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/docusign/envelopes/:envelopeId/void
 * Void (cancel) an envelope
 */
async function voidEnvelope(req, res) {
  try {
    const { envelopeId } = req.params;
    const { reason } = req.body;
    const tenantId = req.user.tenantId;

    const envelope = await docusignService.voidEnvelope(
      envelopeId,
      tenantId,
      reason || "Voided by administrator"
    );

    logAction({
      action: "DOCUSIGN_ENVELOPE_VOIDED",
      resource: "DOCUSIGN",
      userId: req.user.id,
      tenantId,
      resourceId: envelope.id,
      metadata: { envelopeId, reason },
    }).catch(() => {});

    return res.json({ success: true, message: "Envelope voided", envelope });
  } catch (error) {
    console.error("[DocuSign] voidEnvelope error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/docusign/webhook
 * DocuSign Connect webhook — receives envelope status events
 * No JWT auth — verified via HMAC header
 */
async function handleWebhook(req, res) {
  try {
    // Acknowledge immediately so DocuSign doesn't retry
    res.status(200).send("OK");

    const body = req.body;

    // DocuSign Connect JSON format: { event: "envelope-completed", data: { envelopeId: "..." } }
    const envelopeId = body?.data?.envelopeId || body?.envelopeId;

    // Map DocuSign event names to our status values
    const eventStatusMap = {
      "envelope-sent": "sent",
      "envelope-delivered": "delivered",
      "envelope-completed": "completed",
      "envelope-declined": "declined",
      "envelope-voided": "voided",
    };

    const event = body?.event || "";
    const status = eventStatusMap[event];

    console.log("[DocuSign Webhook] event:", event, "envelopeId:", envelopeId, "→ status:", status);

    if (!envelopeId || !status) {
      // Ignore recipient-level events (recipient-sent, recipient-delivered, etc.)
      console.log("[DocuSign Webhook] Skipping non-envelope event:", event);
      return;
    }

    await docusignService.handleWebhookEvent({ envelopeId, status });
  } catch (error) {
    console.error("[DocuSign Webhook] Error:", error.message);
  }
}

module.exports = {
  sendEnvelope,
  getEnvelopes,
  getEnvelopeById,
  voidEnvelope,
  handleWebhook,
};

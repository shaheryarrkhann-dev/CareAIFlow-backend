const docusign = require("docusign-esign");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const prisma = require("../../lib/prisma");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY;
const USER_ID = process.env.DOCUSIGN_USER_ID;
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;
const BASE_URL = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";
const OAUTH_URL = process.env.DOCUSIGN_OAUTH_URL || "account-d.docusign.com";
// Load private key — supports file path (e.g. ./docusign_private.key) or raw PEM value.
// Empty / missing env is allowed so the API can boot locally without DocuSign configured.
function loadPrivateKey() {
  const raw = (process.env.DOCUSIGN_PRIVATE_KEY || "").trim();
  if (!raw) {
    console.warn("⚠️  DOCUSIGN_PRIVATE_KEY not set — DocuSign features disabled");
    return null;
  }
  if (raw.startsWith("-----")) {
    // Raw PEM — replace literal \n with real newlines
    return raw.replace(/\\n/g, "\n");
  }
  // Treat as file path
  const keyPath = path.resolve(process.cwd(), raw);
  if (!fs.existsSync(keyPath) || fs.statSync(keyPath).isDirectory()) {
    console.warn(`⚠️  DOCUSIGN_PRIVATE_KEY path invalid (${keyPath}) — DocuSign features disabled`);
    return null;
  }
  return fs.readFileSync(keyPath, "utf8");
}
const PRIVATE_KEY = loadPrivateKey();

// Token cache — reuse until 5 min before expiry
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Get a valid DocuSign access token via JWT Grant
 * Caches the token and refreshes when near expiry
 */
async function getAccessToken() {
  if (!PRIVATE_KEY || !INTEGRATION_KEY || !USER_ID) {
    throw new Error(
      "DocuSign is not configured. Set DOCUSIGN_PRIVATE_KEY, DOCUSIGN_INTEGRATION_KEY, and DOCUSIGN_USER_ID."
    );
  }

  const now = Date.now();
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(OAUTH_URL);

  const scopes = ["signature", "impersonation"];
  const privateKeyBuffer = Buffer.from(PRIVATE_KEY, "utf8");

  let results;
  try {
    results = await apiClient.requestJWTUserToken(
      INTEGRATION_KEY,
      USER_ID,
      scopes,
      privateKeyBuffer,
      3600 // 1 hour
    );
  } catch (err) {
    const body = err.response?.body || err.body || err.message;
    console.error("[DocuSign] JWT token error:", JSON.stringify(body));
    throw new Error(`DocuSign auth failed: ${JSON.stringify(body)}`);
  }

  cachedToken = results.body.access_token;
  // Cache for 55 minutes (5 min buffer before expiry)
  tokenExpiresAt = now + 55 * 60 * 1000;

  return cachedToken;
}

/**
 * Build a configured DocuSign API client with a valid token
 */
async function getApiClient() {
  const accessToken = await getAccessToken();
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(BASE_URL);
  apiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);
  return apiClient;
}

/**
 * Send a document to DocuSign for signing
 * @param {Object} params
 * @param {string} params.residentId
 * @param {string} params.tenantId
 * @param {string} params.signerName - Full name of the signer
 * @param {string} params.signerEmail - Email of the signer
 * @param {Buffer} params.documentBuffer - PDF document as buffer
 * @param {string} params.documentName - Display name of the document
 * @param {string} params.createdBy - User ID who is sending
 * @returns {Promise<Object>} Created DocuSignEnvelope record
 */
async function createEnvelope({
  residentId,
  tenantId,
  signerName,
  signerEmail,
  documentBuffer,
  documentName,
  createdBy,
  tabPosition,
}) {
  const apiClient = await getApiClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  // Build the document
  const document = new docusign.Document();
  document.documentBase64 = documentBuffer.toString("base64");
  document.name = documentName;
  document.fileExtension = "pdf";
  document.documentId = "1";

  // Build the signer with a signature tab at the bottom of the last page
  const signer = new docusign.Signer();
  signer.email = signerEmail;
  signer.name = signerName;
  signer.recipientId = "1";
  signer.routingOrder = "1";

  // Signature tab — absolute pixel position computed by the PDF generator.
  // DocuSign coordinate origin: top-left of page, Y increases downward, 1 unit = 1pt at 72 DPI.
  // documentId + tabLabel are REQUIRED for absolute positioning (DocuSign silently drops the tab without them).
  const signHere = new docusign.SignHere();
  signHere.documentId  = "1";
  signHere.tabLabel    = "Signature";
  signHere.pageNumber  = String(tabPosition?.pageNumber  ?? 1);
  signHere.xPosition   = String(tabPosition?.xPosition   ?? 100);
  signHere.yPosition   = String(tabPosition?.yPosition   ?? 350);

  const tabs = new docusign.Tabs();
  tabs.signHereTabs = [signHere];
  signer.tabs = tabs;

  // Build envelope definition
  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.emailSubject = `Please sign: ${documentName}`;
  envelopeDefinition.documents = [document];
  envelopeDefinition.recipients = new docusign.Recipients();
  envelopeDefinition.recipients.signers = [signer];
  envelopeDefinition.status = "sent"; // "sent" = immediately sends the email

  // Create the envelope via DocuSign API
  const results = await envelopesApi.createEnvelope(ACCOUNT_ID, {
    envelopeDefinition,
  });

  const envelopeId = results.envelopeId;

  // Save to our DB
  const envelope = await prisma.docuSignEnvelope.create({
    data: {
      envelopeId,
      residentId,
      tenantId,
      status: "sent",
      signerName,
      signerEmail,
      documentName,
      createdBy,
    },
  });

  return envelope;
}

/**
 * Get envelope status — syncs with DocuSign and updates local DB
 * @param {string} envelopeId - DocuSign envelope ID
 * @param {string} tenantId
 * @returns {Promise<Object>} Updated DocuSignEnvelope record
 */
async function getEnvelopeStatus(envelopeId, tenantId) {
  const apiClient = await getApiClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const dsEnvelope = await envelopesApi.getEnvelope(ACCOUNT_ID, envelopeId, null);

  const statusMap = {
    sent: "sent",
    delivered: "delivered",
    completed: "completed",
    declined: "declined",
    voided: "voided",
  };

  const status = statusMap[dsEnvelope.status] || dsEnvelope.status;

  // Update local record
  const updated = await prisma.docuSignEnvelope.update({
    where: { envelopeId },
    data: {
      status,
      ...(status === "completed" && {
        completedAt: dsEnvelope.completedDateTime
          ? new Date(dsEnvelope.completedDateTime)
          : new Date(),
      }),
    },
  });

  return updated;
}

/**
 * Download the signed document from DocuSign and save to S3
 * Called after webhook confirms completion
 * @param {string} envelopeId
 * @param {string} tenantId
 * @param {string} residentId
 * @returns {Promise<{url: string, s3Key: string}>}
 */
async function downloadAndStoreSignedDocument(envelopeId, tenantId, residentId) {
  const apiClient = await getApiClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  // Download the combined signed PDF
  const pdfBuffer = await envelopesApi.getDocument(
    ACCOUNT_ID,
    envelopeId,
    "combined",
    null
  );

  const timestamp = Date.now();
  const fileName = `signed_${envelopeId}_${timestamp}.pdf`;
  const s3Key = `${tenantId}/residents/${residentId}/docusign/${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
      Metadata: {
        tenantId,
        residentId,
        envelopeId,
        type: "docusign-signed-document",
        uploadedAt: new Date().toISOString(),
      },
    })
  );

  const url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return { url, s3Key };
}

/**
 * List envelopes for a tenant with optional filters
 * @param {string} tenantId
 * @param {Object} filters - page, limit, status, residentId
 * @returns {Promise<Object>} Paginated envelope list
 */
async function listEnvelopes(tenantId, filters = {}) {
  const { page = 1, limit = 50, status, residentId } = filters;
  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    deletedAt: null,
    ...(status && { status }),
    ...(residentId && { residentId }),
  };

  const [envelopes, total] = await Promise.all([
    prisma.docuSignEnvelope.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.docuSignEnvelope.count({ where }),
  ]);

  return {
    envelopes,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single envelope by ID
 * @param {string} envelopeId
 * @param {string} tenantId
 */
async function getEnvelopeById(envelopeId, tenantId) {
  const envelope = await prisma.docuSignEnvelope.findFirst({
    where: { envelopeId, tenantId, deletedAt: null },
  });

  if (!envelope) {
    throw new Error("Envelope not found");
  }

  return envelope;
}

/**
 * Void (cancel) an envelope
 * @param {string} envelopeId
 * @param {string} tenantId
 * @param {string} voidReason
 */
async function voidEnvelope(envelopeId, tenantId, voidReason = "Voided by administrator") {
  // Check exists in our DB
  await getEnvelopeById(envelopeId, tenantId);

  const apiClient = await getApiClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const envelope = new docusign.Envelope();
  envelope.status = "voided";
  envelope.voidedReason = voidReason;

  await envelopesApi.update(ACCOUNT_ID, envelopeId, { envelope });

  const updated = await prisma.docuSignEnvelope.update({
    where: { envelopeId },
    data: { status: "voided" },
  });

  return updated;
}

/**
 * Handle DocuSign webhook event — update status and store signed doc
 * @param {Object} eventData - Parsed webhook XML/JSON body
 */
async function handleWebhookEvent(eventData) {
  const envelopeId = eventData.envelopeId;
  const status = eventData.status;

  if (!envelopeId) return;

  // Find our record
  const envelope = await prisma.docuSignEnvelope.findUnique({
    where: { envelopeId },
  });

  if (!envelope) return; // Not our envelope

  const updateData = { status };

  if (status === "completed") {
    updateData.completedAt = new Date();
    updateData.signedAt = new Date();

    try {
      // Download and store the signed PDF
      const { url, s3Key } = await downloadAndStoreSignedDocument(
        envelopeId,
        envelope.tenantId,
        envelope.residentId
      );

      updateData.signedDocumentUrl = url;
      updateData.signedDocumentS3Key = s3Key;

      // Update resident's eSignature fields
      await prisma.resident.update({
        where: { id: envelope.residentId },
        data: {
          eSignatureUrl: url,
          eSignatureS3Key: s3Key,
          eSignatureSignedAt: new Date(),
          eSignatureLegalText: `Signed via DocuSign. Envelope ID: ${envelopeId}`,
        },
      });
    } catch (err) {
      console.error("[DocuSign] Failed to download signed document:", err.message);
    }
  }

  await prisma.docuSignEnvelope.update({
    where: { envelopeId },
    data: updateData,
  });
}

module.exports = {
  createEnvelope,
  getEnvelopeStatus,
  listEnvelopes,
  getEnvelopeById,
  voidEnvelope,
  handleWebhookEvent,
};

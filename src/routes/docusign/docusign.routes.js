const express = require("express");
const router = express.Router();
const multer = require("multer");

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const docusignController = require("../../controllers/docusign/docusign.controller");

// Multer — accept optional PDF upload (in-memory, max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted"), false);
    }
  },
});

/**
 * POST /api/docusign/webhook
 * DocuSign Connect webhook — must be BEFORE auth middleware
 * DocuSign posts here when envelope status changes
 */
router.post("/webhook", docusignController.handleWebhook);

// All routes below require authentication
router.use(authenticate());
router.use(requirePermission("RESIDENTS", "view"));

/**
 * POST /api/docusign/envelopes
 * Send a document for signing via DocuSign
 * Body: { residentId, signerName, signerEmail, documentName? }
 * Optional file: PDF document (if not provided, a basic one is generated)
 */
router.post(
  "/envelopes",
  upload.single("document"),
  docusignController.sendEnvelope
);

/**
 * GET /api/docusign/envelopes
 * List all envelopes for the current tenant
 * Query: page, limit, status, residentId
 */
router.get("/envelopes", docusignController.getEnvelopes);

/**
 * GET /api/docusign/envelopes/:envelopeId
 * Get single envelope + sync status from DocuSign
 */
router.get("/envelopes/:envelopeId", docusignController.getEnvelopeById);

/**
 * POST /api/docusign/envelopes/:envelopeId/void
 * Void (cancel) an envelope
 * Body: { reason? }
 */
router.post("/envelopes/:envelopeId/void", docusignController.voidEnvelope);

module.exports = router;

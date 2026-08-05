const express = require('express');
const multer = require('multer');
const router = express.Router();

const authenticate = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const { sendReportPdfEmailValidator } = require('../../validators/document-email.validators');
const { sendReportPdfFaxValidator } = require('../../validators/document-fax.validators');
const documentEmailController = require('../../controllers/pdf/document-email.controller');
const documentFaxController = require('../../controllers/pdf/document-fax.controller');
const {
  fillTemplate,
  fillAllTemplates,
  getTemplateDetails,
  getUserFilledPdfs,
  remapTemplate,
  regenerateTemplate,
  updateTemplateMapping,
  convertDocxToPdfHandler
} = require('../../controllers/pdf/pdf.controller');

// Multer for DOCX/DOC upload (convert to PDF)
const uploadDocx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword' // .doc
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx or .doc files are allowed'), false);
    }
  }
});

// All routes require authentication
router.use(authenticate());

/**
 * POST /api/pdfs/send-report-email
 * Send an exported PDF to recipient(s) via SendGrid / SMTP.
 */
router.post(
  '/send-report-email',
  authorize('SUPER_ADMIN', 'ADMIN', 'STAFF', 'GUARDIAN'),
  validate(sendReportPdfEmailValidator),
  documentEmailController.sendReportEmail
);

/**
 * GET /api/pdfs/ifax-configured
 * Whether IFAX_API_KEY is set (authenticated clients only).
 */
router.get(
  '/ifax-configured',
  authorize('SUPER_ADMIN', 'ADMIN', 'STAFF', 'GUARDIAN'),
  documentFaxController.ifaxConfigured
);

/**
 * POST /api/pdfs/send-report-fax
 * Send exported PDF via iFax.
 */
router.post(
  '/send-report-fax',
  authorize('SUPER_ADMIN', 'ADMIN', 'STAFF', 'GUARDIAN'),
  validate(sendReportPdfFaxValidator),
  documentFaxController.sendReportFax
);

/**
 * POST /api/pdfs/convert-docx-to-pdf
 * Convert uploaded DOCX/DOC file to PDF (returns PDF file)
 * Body: file (multipart/form-data)
 * Roles: ADMIN, STAFF, GUARDIAN
 */
router.post(
  '/convert-docx-to-pdf',
  authorize('ADMIN', 'STAFF', 'GUARDIAN'),
  uploadDocx.single('file'),
  (err, req, res, next) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ success: false, message: err.message || 'Upload error' });
  },
  convertDocxToPdfHandler
);

/**
 * POST /api/pdfs/fill/:templateId
 * Fill a specific PDF template with form data
 * Roles: ADMIN, STAFF, GUARDIAN (tenant users)
 */
router.post(
  '/fill/:templateId',
  authorize('ADMIN', 'STAFF', 'GUARDIAN'),
  fillTemplate
);

/**
 * POST /api/pdfs/fill-all
 * Fill all PDF templates for tenant with form data
 * Roles: ADMIN, STAFF, GUARDIAN (tenant users)
 */
router.post(
  '/fill-all',
  authorize('ADMIN', 'STAFF', 'GUARDIAN'),
  fillAllTemplates
);

/**
 * GET /api/pdfs/templates/:templateId
 * Get template details including field mappings
 * Roles: ADMIN, STAFF, GUARDIAN, SUPER_ADMIN
 */
router.get(
  '/templates/:templateId',
  authorize('SUPER_ADMIN', 'ADMIN', 'STAFF', 'GUARDIAN'),
  getTemplateDetails
);

/**
 * GET /api/pdfs/users/:userId/filled-pdfs
 * Get all filled PDFs for a specific user
 * Roles: ADMIN, STAFF, GUARDIAN, SUPER_ADMIN
 */
router.get(
  '/users/:userId/filled-pdfs',
  authorize('SUPER_ADMIN', 'ADMIN', 'STAFF', 'GUARDIAN'),
  getUserFilledPdfs
);

/**
 * POST /api/pdfs/templates/:templateId/remap
 * Remap template's field mapping to current schema
 */
router.post(
  '/templates/:templateId/remap',
  authorize('SUPER_ADMIN', 'ADMIN'),
  remapTemplate
);

/**
 * POST /api/pdfs/templates/:templateId/regenerate
 * Regenerate field mapping for existing template using AI detection
 */
router.post(
  '/templates/:templateId/regenerate',
  authorize('SUPER_ADMIN', 'ADMIN'),
  regenerateTemplate
);

/**
 * PUT /api/pdfs/templates/:templateId/field-mapping
 * Manually update field mapping coordinates
 */
router.put(
  '/templates/:templateId/field-mapping',
  authorize('SUPER_ADMIN', 'ADMIN'),
  updateTemplateMapping
);

module.exports = router;


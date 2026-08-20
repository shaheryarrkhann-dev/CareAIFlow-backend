const { fillPdfTemplate, fillAllTenantPdfTemplates, getPdfTemplateById, remapTemplateFieldMapping, regenerateTemplateFieldMapping, updateTemplateFieldMapping } = require('../../services/pdf/pdf.service');
const { convertDocxToPdf } = require('../../utils/docx-to-pdf.util');

/**
 * Fill a specific PDF template with form data
 * POST /api/pdfs/fill/:templateId
 */
async function fillTemplate(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const { templateId } = req.params;
    const formData = req.body;

    if (!formData || Object.keys(formData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Form data is required to fill the PDF template'
      });
    }

    const result = await fillPdfTemplate({
      templateId,
      tenantId,
      userId: req.user.id,
      formData
    });

    return res.status(201).json({
      success: true,
      message: 'PDF template filled successfully',
      ...result
    });
  } catch (err) {
    console.error('Fill template error:', err);
    const statusCode = err.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Failed to fill PDF template'
    });
  }
}

/**
 * Fill all PDF templates for tenant with form data
 * POST /api/pdfs/fill-all
 */
async function fillAllTemplates(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const formData = req.body;

    if (!formData || Object.keys(formData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Form data is required to fill PDF templates'
      });
    }

    const result = await fillAllTenantPdfTemplates({
      tenantId,
      userId: req.user.id,
      formData
    });

    return res.status(201).json({
      success: true,
      message: `Successfully filled ${result.successfulFills} of ${result.totalTemplates} PDF templates`,
      ...result
    });
  } catch (err) {
    console.error('Fill all templates error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fill PDF templates'
    });
  }
}

/**
 * Get template details
 * GET /api/pdfs/templates/:templateId
 */
async function getTemplateDetails(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.role === 'SUPER_ADMIN' ? (req.query.tenantId || req.user.tenantId) : req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'tenantId is required' });
    }

    const { templateId } = req.params;
    const template = await getPdfTemplateById(templateId, tenantId);

    return res.status(200).json({
      success: true,
      template: {
        id: template.id,
        fileName: template.fileName,
        displayName: template.displayName,
        description: template.description,
        s3Url: template.s3Url,
        fieldMapping: template.fieldMapping,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
      }
    });
  } catch (err) {
    console.error('Get template details error:', err);
    const statusCode = err.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Failed to retrieve template details'
    });
  }
}

/**
 * Get all filled PDFs for a specific user
 * GET /api/pdfs/users/:userId/filled-pdfs
 */
async function getUserFilledPdfs(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    const { userId } = req.params;

    // Get pagination parameters from query
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    // Import S3 list function
    const { listUserFilledPdfs } = require('../../utils/s3.util');
    const result = await listUserFilledPdfs({ tenantId, userId, limit, offset });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Get user filled PDFs error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to retrieve filled PDFs'
    });
  }
}

/**
 * Regenerate field mapping for an existing PDF template
 * POST /api/pdfs/templates/:templateId/regenerate
 */
async function regenerateTemplate(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const tenantId = req.user.tenantId;
    const { templateId } = req.params;
    const result = await regenerateTemplateFieldMapping({ templateId, tenantId });
    const status = result.success ? 200 : 400;
    return res.status(status).json(result);
  } catch (err) {
    console.error('Regenerate template error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to regenerate template mapping' });
  }
}

/**
 * Remap template field mapping to current schema
 * POST /api/pdfs/templates/:templateId/remap
 */
async function remapTemplate(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const tenantId = req.user.tenantId;
    const { templateId } = req.params;
    const result = await remapTemplateFieldMapping({ templateId, tenantId });
    const status = result.success ? 200 : 400;
    return res.status(status).json(result);
  } catch (err) {
    console.error('Remap template error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to remap template' });
  }
}

/**
 * Update template field mapping manually
 * PUT /api/pdfs/templates/:templateId/field-mapping
 */
async function updateTemplateMapping(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const tenantId = req.user.tenantId;
    const { templateId } = req.params;
    const { fieldMapping } = req.body;

    if (!fieldMapping) {
      return res.status(400).json({ success: false, message: 'fieldMapping is required' });
    }

    const result = await updateTemplateFieldMapping({ templateId, tenantId, fieldMapping });
    const status = result.success ? 200 : 400;
    return res.status(status).json(result);
  } catch (err) {
    console.error('Update template mapping error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update template mapping' });
  }
}

/**
 * Convert uploaded DOCX/DOC file to PDF and return as download
 * POST /api/pdfs/convert-docx-to-pdf
 * Body: file (multipart/form-data, .docx or .doc, max 50MB)
 */
async function convertDocxToPdfHandler(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send a .docx or .doc file in the "file" field.'
      });
    }

    const pdfBuffer = await convertDocxToPdf(req.file.buffer);
    const baseName = (req.file.originalname || 'document').replace(/\.[^.]+$/, '');
    const pdfFileName = `${baseName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pdfFileName)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Convert DOCX to PDF error:', err);
    const message = err.message || 'Failed to convert document to PDF. Ensure LibreOffice is installed.';
    const statusCode = message.includes('LibreOffice') || message.includes('not found') ? 503 : 500;
    return res.status(statusCode).json({
      success: false,
      message
    });
  }
}

module.exports = {
  fillTemplate,
  fillAllTemplates,
  getTemplateDetails,
  getUserFilledPdfs,
  remapTemplate,
  regenerateTemplate,
  updateTemplateMapping,
  convertDocxToPdfHandler
};


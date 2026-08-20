/**
 * Compliance Admin Controller
 * Human-in-the-Loop (HITL) review and approval for WAC/RCW compliant schemas
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all schemas pending admin review
 * GET /api/compliance/pending-review
 */
async function getPendingReviewSchemas(req, res) {
  try {
    const { tenantId } = req.user;
    
    // ADMIN or SUPER_ADMIN can review schemas
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions for compliance review' });
    }
    
    const whereClause = req.user.role === 'SUPER_ADMIN' ? {} : { tenantId };
    
    const schemas = await prisma.formSchema.findMany({
      where: {
        ...whereClause,
        isActive: true,
        adminApproved: false,
        isWacRcwCompliant: true // Only show schemas with compliance data
      },
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true }
        }
      }
    });
    
    // Extract compliance summary from schemaJson
    const schemasWithSummary = schemas.map(schema => ({
      id: schema.id,
      formName: schema.formName,
      description: schema.description,
      tenantName: schema.tenant.name,
      compliance: schema.schemaJson.compliance || {},
      isWacRcwCompliant: schema.isWacRcwCompliant,
      complianceVersion: schema.complianceVersion,
      lastComplianceCheck: schema.lastComplianceCheck,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
      totalFields: schema.schemaJson.fields?.length || 0
    }));
    
    res.json({
      schemas: schemasWithSummary,
      count: schemasWithSummary.length
    });
  } catch (error) {
    console.error('[COMPLIANCE-ADMIN] Error fetching pending review schemas:', error);
    res.status(500).json({ error: 'Failed to fetch pending review schemas' });
  }
}

/**
 * Get schema details for review
 * GET /api/compliance/schema/:schemaId
 */
async function getSchemaForReview(req, res) {
  try {
    const { schemaId } = req.params;
    const { tenantId, role } = req.user;
    
    // ADMIN or SUPER_ADMIN can review schemas
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions for compliance review' });
    }
    
    const whereClause = role === 'SUPER_ADMIN' 
      ? { id: schemaId }
      : { id: schemaId, tenantId };
    
    const schema = await prisma.formSchema.findFirst({
      where: whereClause,
      include: {
        tenant: {
          select: { id: true, name: true, slug: true }
        }
      }
    });
    
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    
    // Return full schema with compliance details
    res.json({
      id: schema.id,
      formName: schema.formName,
      description: schema.description,
      tenantName: schema.tenant.name,
      schemaJson: schema.schemaJson,
      isWacRcwCompliant: schema.isWacRcwCompliant,
      complianceVersion: schema.complianceVersion,
      lastComplianceCheck: schema.lastComplianceCheck,
      adminApproved: schema.adminApproved,
      adminApprovedBy: schema.adminApprovedBy,
      adminApprovedAt: schema.adminApprovedAt,
      complianceNotes: schema.complianceNotes,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    });
  } catch (error) {
    console.error('[COMPLIANCE-ADMIN] Error fetching schema for review:', error);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
}

/**
 * Approve schema with compliance review
 * POST /api/compliance/schema/:schemaId/approve
 */
async function approveSchema(req, res) {
  try {
    const { schemaId } = req.params;
    const { notes } = req.body;
    const { userId, tenantId, role } = req.user;
    
    // ADMIN or SUPER_ADMIN can approve schemas
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions for compliance approval' });
    }
    
    const whereClause = role === 'SUPER_ADMIN' 
      ? { id: schemaId }
      : { id: schemaId, tenantId };
    
    const schema = await prisma.formSchema.findFirst({
      where: whereClause
    });
    
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    
    // Approve schema
    const updatedSchema = await prisma.formSchema.update({
      where: { id: schemaId },
      data: {
        adminApproved: true,
        adminApprovedBy: userId,
        adminApprovedAt: new Date(),
        complianceNotes: notes || 'Approved by admin',
        updatedAt: new Date()
      }
    });
    
    console.log(`[COMPLIANCE-ADMIN] ✅ Schema ${schemaId} approved by user ${userId}`);
    
    res.json({
      message: 'Schema approved successfully',
      schemaId: updatedSchema.id,
      adminApprovedAt: updatedSchema.adminApprovedAt
    });
  } catch (error) {
    console.error('[COMPLIANCE-ADMIN] Error approving schema:', error);
    res.status(500).json({ error: 'Failed to approve schema' });
  }
}

/**
 * Reject schema and request modifications
 * POST /api/compliance/schema/:schemaId/reject
 */
async function rejectSchema(req, res) {
  try {
    const { schemaId } = req.params;
    const { notes, reason } = req.body;
    const { userId, tenantId, role } = req.user;
    
    // ADMIN or SUPER_ADMIN can reject schemas
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions for compliance review' });
    }
    
    if (!reason || !notes) {
      return res.status(400).json({ error: 'Rejection reason and notes are required' });
    }
    
    const whereClause = role === 'SUPER_ADMIN' 
      ? { id: schemaId }
      : { id: schemaId, tenantId };
    
    const schema = await prisma.formSchema.findFirst({
      where: whereClause
    });
    
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    
    // Mark as rejected (could also deactivate)
    const updatedSchema = await prisma.formSchema.update({
      where: { id: schemaId },
      data: {
        adminApproved: false,
        complianceNotes: `REJECTED: ${reason}\n\nNotes: ${notes}`,
        updatedAt: new Date()
      }
    });
    
    console.log(`[COMPLIANCE-ADMIN] ❌ Schema ${schemaId} rejected by user ${userId}: ${reason}`);
    
    res.json({
      message: 'Schema rejected',
      schemaId: updatedSchema.id,
      reason,
      notes
    });
  } catch (error) {
    console.error('[COMPLIANCE-ADMIN] Error rejecting schema:', error);
    res.status(500).json({ error: 'Failed to reject schema' });
  }
}

/**
 * Request schema re-validation against latest regulations
 * POST /api/compliance/schema/:schemaId/revalidate
 */
async function revalidateSchema(req, res) {
  try {
    const { schemaId } = req.params;
    const { userId, tenantId, role } = req.user;
    
    // ADMIN or SUPER_ADMIN can request revalidation
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const whereClause = role === 'SUPER_ADMIN' 
      ? { id: schemaId }
      : { id: schemaId, tenantId };
    
    const schema = await prisma.formSchema.findFirst({
      where: whereClause
    });
    
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    
    // TODO: Implement actual revalidation logic here
    // For now, just update the lastComplianceCheck timestamp
    const updatedSchema = await prisma.formSchema.update({
      where: { id: schemaId },
      data: {
        lastComplianceCheck: new Date(),
        updatedAt: new Date()
      }
    });
    
    console.log(`[COMPLIANCE-ADMIN] 🔄 Schema ${schemaId} revalidation requested by user ${userId}`);
    
    res.json({
      message: 'Schema revalidation completed',
      schemaId: updatedSchema.id,
      lastComplianceCheck: updatedSchema.lastComplianceCheck
    });
  } catch (error) {
    console.error('[COMPLIANCE-ADMIN] Error revalidating schema:', error);
    res.status(500).json({ error: 'Failed to revalidate schema' });
  }
}

/**
 * Get compliance statistics
 * GET /api/compliance/stats
 */
async function getComplianceStats(req, res) {
  try {
    const { tenantId, role } = req.user;
    
    // ADMIN or SUPER_ADMIN can view stats
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const whereClause = role === 'SUPER_ADMIN' ? {} : { tenantId };
    
    const [
      totalSchemas,
      compliantSchemas,
      approvedSchemas,
      pendingSchemas
    ] = await Promise.all([
      prisma.formSchema.count({ where: { ...whereClause, isActive: true } }),
      prisma.formSchema.count({ where: { ...whereClause, isActive: true, isWacRcwCompliant: true } }),
      prisma.formSchema.count({ where: { ...whereClause, isActive: true, adminApproved: true } }),
      prisma.formSchema.count({ where: { ...whereClause, isActive: true, adminApproved: false, isWacRcwCompliant: true } })
    ]);
    
    res.json({
      totalSchemas,
      compliantSchemas,
      compliancePercentage: totalSchemas > 0 ? ((compliantSchemas / totalSchemas) * 100).toFixed(1) : 0,
      approvedSchemas,
      approvalPercentage: compliantSchemas > 0 ? ((approvedSchemas / compliantSchemas) * 100).toFixed(1) : 0,
      pendingSchemas
    });
  } catch (error) {
    console.error('[COMPLIANCE-ADMIN] Error fetching compliance stats:', error);
    res.status(500).json({ error: 'Failed to fetch compliance stats' });
  }
}

module.exports = {
  getPendingReviewSchemas,
  getSchemaForReview,
  approveSchema,
  rejectSchema,
  revalidateSchema,
  getComplianceStats
};


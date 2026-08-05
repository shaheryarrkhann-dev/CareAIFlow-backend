const prisma = require('../../lib/prisma');

/**
 * Clean up master form fields when a PDF template is deleted
 * Only removes fields that are not used by any other PDF templates
 */
async function cleanupMasterFormFields({ tenantId, deletedPdfTemplate }) {
  try {
    console.log(`[FIELD-CLEANUP] Starting cleanup for tenant ${tenantId} after deleting PDF: ${deletedPdfTemplate.fileName}`);

    // Get the master form for this tenant
    const masterForm = await prisma.formSchema.findFirst({
      where: {
        tenantId,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!masterForm) {
      console.log('[FIELD-CLEANUP] No master form found for this tenant');
      return {
        fieldsRemoved: 0,
        message: 'No master form found'
      };
    }

    // FIRST: Check if this is the last PDF template - if so, delete master form regardless of field mappings
    const remainingPdfTemplates = await prisma.pdfTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        id: { not: deletedPdfTemplate.id } // Exclude the deleted one
      }
    });

    console.log(`[FIELD-CLEANUP] Found ${remainingPdfTemplates.length} remaining PDF templates`);

    // If this is the last PDF template, delete the entire master form regardless of field mappings
    if (remainingPdfTemplates.length === 0) {
      console.log(`[FIELD-CLEANUP] ⚠️  This is the last PDF template - deleting entire master form schema`);

      // Delete the master form schema completely
      await prisma.formSchema.delete({
        where: {
          id: masterForm.id
        }
      });

      // Try to drop the dynamic table if it exists
      const tableName = `tenant_${tenantId.replace(/-/g, '_')}_form_${masterForm.id.replace(/-/g, '_')}`;

      try {
        const tableExists = await prisma.$queryRawUnsafe(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${tableName}'
          );
        `);

        if (tableExists[0].exists) {
          await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
          console.log(`[FIELD-CLEANUP] Dropped dynamic table: ${tableName}`);
        }
      } catch (tableError) {
        console.error('[FIELD-CLEANUP] Could not drop dynamic table:', tableError.message);
        // Don't fail the cleanup if table drop fails
      }

      const currentFormFields = masterForm.schemaJson.fields || [];
      const removedCount = currentFormFields.length;

      console.log(`[FIELD-CLEANUP] ✅ Successfully deleted master form schema (was last PDF)`);

      return {
        fieldsRemoved: removedCount,
        fieldsStillInUse: 0,
        removedFieldNames: currentFormFields.map(f => f.name || ''),
        masterFormDeleted: true,
        message: `Deleted master form completely (was the last PDF)`,
        masterFormId: masterForm.id,
        tableName
      };
    }

    // SECOND: If other PDFs exist, check field mappings for selective cleanup
    const deletedPdfFields = deletedPdfTemplate.fieldMapping || [];

    if (!Array.isArray(deletedPdfFields) || deletedPdfFields.length === 0) {
      console.log('[FIELD-CLEANUP] Deleted PDF had no field mappings');
      return {
        fieldsRemoved: 0,
        message: 'Deleted PDF had no field mappings'
      };
    }

    console.log(`[FIELD-CLEANUP] Deleted PDF had ${deletedPdfFields.length} fields`);

    // Build a set of field names that are still used by other PDFs
    const fieldsInOtherPdfs = new Set();

    remainingPdfTemplates.forEach(template => {
      const templateFields = template.fieldMapping || [];
      if (Array.isArray(templateFields)) {
        templateFields.forEach(field => {
          const fieldName = getFieldName(field);
          if (fieldName) {
            fieldsInOtherPdfs.add(fieldName.toLowerCase());
          }
        });
      }
    });

    console.log(`[FIELD-CLEANUP] Fields still in use by other PDFs: ${fieldsInOtherPdfs.size}`);

    // Identify fields from deleted PDF that are NOT in other PDFs
    const fieldsToRemove = [];
    deletedPdfFields.forEach(field => {
      const fieldName = getFieldName(field);
      if (fieldName && !fieldsInOtherPdfs.has(fieldName.toLowerCase())) {
        fieldsToRemove.push(fieldName.toLowerCase());
      }
    });

    console.log(`[FIELD-CLEANUP] Fields to remove from master form: ${fieldsToRemove.length}`);

    if (fieldsToRemove.length === 0) {
      console.log('[FIELD-CLEANUP] All fields from deleted PDF are still used by other PDFs');
      return {
        fieldsRemoved: 0,
        message: 'All fields are still in use by other forms',
        fieldsStillInUse: deletedPdfFields.length
      };
    }

    // Get current master form fields
    const currentFormFields = masterForm.schemaJson.fields || [];

    // Filter out the fields that should be removed
    const updatedFields = currentFormFields.filter(field => {
      const fieldName = (field.name || '').toLowerCase();
      return !fieldsToRemove.includes(fieldName);
    });

    console.log(`[FIELD-CLEANUP] Master form fields before cleanup: ${currentFormFields.length}`);
    console.log(`[FIELD-CLEANUP] Master form fields after cleanup: ${updatedFields.length}`);

    // If no fields remain, delete the entire master form schema
    if (updatedFields.length === 0) {
      console.log(`[FIELD-CLEANUP] ⚠️  No fields remaining - deleting entire master form schema`);

      // Delete the master form schema completely
      await prisma.formSchema.delete({
        where: {
          id: masterForm.id
        }
      });

      // Try to drop the dynamic table if it exists
      const tableName = `tenant_${tenantId.replace(/-/g, '_')}_form_${masterForm.id.replace(/-/g, '_')}`;

      try {
        const tableExists = await prisma.$queryRawUnsafe(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${tableName}'
          );
        `);

        if (tableExists[0].exists) {
          await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
          console.log(`[FIELD-CLEANUP] Dropped dynamic table: ${tableName}`);
        }
      } catch (tableError) {
        console.error('[FIELD-CLEANUP] Could not drop dynamic table:', tableError.message);
        // Don't fail the cleanup if table drop fails
      }

      const removedCount = currentFormFields.length;

      console.log(`[FIELD-CLEANUP] ✅ Successfully deleted master form schema (was last PDF)`);

      return {
        fieldsRemoved: removedCount,
        fieldsStillInUse: 0,
        removedFieldNames: fieldsToRemove,
        masterFormDeleted: true,
        message: `Deleted master form completely (was the last PDF)`,
        masterFormId: masterForm.id,
        tableName
      };
    }

    // Update the master form with cleaned fields
    const updatedSchema = await prisma.formSchema.update({
      where: {
        id: masterForm.id
      },
      data: {
        schemaJson: {
          ...masterForm.schemaJson,
          fields: updatedFields
        },
        updatedAt: new Date()
      }
    });

    const removedCount = currentFormFields.length - updatedFields.length;

    console.log(`[FIELD-CLEANUP] ✅ Successfully removed ${removedCount} fields from master form`);

    return {
      fieldsRemoved: removedCount,
      fieldsStillInUse: deletedPdfFields.length - removedCount,
      removedFieldNames: fieldsToRemove,
      masterFormDeleted: false,
      message: `Removed ${removedCount} field(s) from master form`,
      masterFormId: updatedSchema.id
    };

  } catch (error) {
    console.error('[FIELD-CLEANUP] Error cleaning up master form fields:', error);
    throw new Error(`Failed to clean up master form fields: ${error.message}`);
  }
}

/**
 * Extract field name from field mapping object
 * Handles different field mapping formats
 */
function getFieldName(field) {
  if (typeof field === 'string') {
    return field;
  }
  if (typeof field === 'object' && field !== null) {
    return field.fieldName || field.name || field.label || null;
  }
  return null;
}

/**
 * Get fields that would be removed if a PDF is deleted (preview)
 * Useful for showing a confirmation dialog before deletion
 */
async function previewFieldCleanup({ tenantId, pdfTemplateId }) {
  try {
    // Get the PDF template to be deleted
    const pdfTemplate = await prisma.pdfTemplate.findFirst({
      where: {
        id: pdfTemplateId,
        tenantId
      }
    });

    if (!pdfTemplate) {
      throw new Error('PDF template not found');
    }

    // Get fields from this PDF
    const pdfFields = pdfTemplate.fieldMapping || [];

    if (!Array.isArray(pdfFields) || pdfFields.length === 0) {
      return {
        willRemoveFields: [],
        fieldsStillInUse: [],
        totalFieldsInPdf: 0
      };
    }

    // Get all other PDF templates for this tenant
    const otherPdfTemplates = await prisma.pdfTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        id: { not: pdfTemplateId }
      }
    });

    // Build a set of field names in other PDFs
    const fieldsInOtherPdfs = new Set();
    otherPdfTemplates.forEach(template => {
      const templateFields = template.fieldMapping || [];
      if (Array.isArray(templateFields)) {
        templateFields.forEach(field => {
          const fieldName = getFieldName(field);
          if (fieldName) {
            fieldsInOtherPdfs.add(fieldName.toLowerCase());
          }
        });
      }
    });

    // Categorize fields
    const willRemoveFields = [];
    const fieldsStillInUse = [];

    pdfFields.forEach(field => {
      const fieldName = getFieldName(field);
      if (fieldName) {
        if (fieldsInOtherPdfs.has(fieldName.toLowerCase())) {
          fieldsStillInUse.push(fieldName);
        } else {
          willRemoveFields.push(fieldName);
        }
      }
    });

    // Check if master form will be completely deleted
    const masterForm = await prisma.formSchema.findFirst({
      where: {
        tenantId,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    let willDeleteMasterForm = false;
    if (masterForm) {
      const currentFormFields = masterForm.schemaJson.fields || [];
      const fieldsAfterCleanup = currentFormFields.filter(field => {
        const fieldName = (field.name || '').toLowerCase();
        return !willRemoveFields.map(f => f.toLowerCase()).includes(fieldName);
      });
      willDeleteMasterForm = fieldsAfterCleanup.length === 0;
    }

    let message;
    if (willDeleteMasterForm) {
      message = '⚠️  Master form will be COMPLETELY DELETED (this is the last PDF)';
    } else if (willRemoveFields.length > 0) {
      message = `${willRemoveFields.length} field(s) will be removed from the master form`;
    } else {
      message = 'No fields will be removed (all are used by other forms)';
    }

    return {
      willRemoveFields,
      fieldsStillInUse,
      totalFieldsInPdf: pdfFields.length,
      willDeleteMasterForm,
      message
    };

  } catch (error) {
    console.error('[FIELD-CLEANUP] Error previewing field cleanup:', error);
    throw new Error(`Failed to preview field cleanup: ${error.message}`);
  }
}

module.exports = {
  cleanupMasterFormFields,
  previewFieldCleanup
};


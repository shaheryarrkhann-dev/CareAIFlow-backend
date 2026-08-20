/**
 * Migration script to update existing PDF templates with coordinate-accurate field detection
 * This script can be run to regenerate field mappings for existing PDFs using the new method
 */

const { PrismaClient } = require('@prisma/client');
const { downloadPdfFromS3 } = require('./src/utils/s3.util');
const { generateFieldMappingWithCoordinateAI } = require('./src/services/aiFieldDetectionCoordinate.service');

const prisma = new PrismaClient();

async function migratePdfTemplate(templateId, dryRun = true) {
  try {
    console.log(`\n🔄 Processing PDF template: ${templateId}`);

    // Get the PDF template
    const template = await prisma.pdfTemplate.findUnique({
      where: { id: templateId },
      include: {
        tenant: {
          select: { id: true, name: true }
        }
      }
    });

    if (!template) {
      console.log(`❌ Template ${templateId} not found`);
      return { success: false, error: 'Template not found' };
    }

    console.log(`📄 Template: ${template.displayName || template.fileName}`);
    console.log(`🏢 Tenant: ${template.tenant.name} (${template.tenantId})`);
    console.log(`📊 Current fields: ${template.fieldMapping?.length || 0}`);

    // Download PDF from S3
    console.log('📥 Downloading PDF from S3...');
    const pdfBuffer = await downloadPdfFromS3(template.s3Key);
    console.log(`✅ Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // Get current form schema for the tenant
    const formSchema = await prisma.formSchema.findFirst({
      where: {
        tenantId: template.tenantId,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`📋 Form schema: ${formSchema ? 'Found' : 'None'} (${formSchema?.schemaJson?.fields?.length || 0} fields)`);

    // Generate new field mapping using coordinate method
    console.log('🎯 Generating coordinate-accurate field mapping...');
    const startTime = Date.now();

    const newFieldMapping = await generateFieldMappingWithCoordinateAI({
      pdfBuffer,
      fileName: template.fileName,
      tenantId: template.tenantId,
      formSchema: formSchema?.schemaJson || null
    });

    const processingTime = Date.now() - startTime;
    console.log(`✅ Generated ${newFieldMapping.length} fields in ${processingTime}ms`);

    // Compare with existing mapping
    const oldMapping = template.fieldMapping || [];
    const comparison = compareFieldMappings(oldMapping, newFieldMapping);

    console.log('\n📊 Comparison Results:');
    console.log(`   Old method: ${oldMapping.length} fields`);
    console.log(`   New method: ${newFieldMapping.length} fields`);
    console.log(`   Common fields: ${comparison.common.length}`);
    console.log(`   New fields: ${comparison.newFields.length}`);
    console.log(`   Removed fields: ${comparison.removedFields.length}`);

    if (comparison.common.length > 0) {
      console.log('\n🔍 Coordinate Changes for Common Fields:');
      comparison.common.forEach(({ oldField, newField, changes }) => {
        if (changes.significantChange) {
          console.log(`   ${newField.fieldName}: ${changes.description}`);
        }
      });
    }

    if (comparison.newFields.length > 0) {
      console.log('\n➕ New Fields Detected:');
      comparison.newFields.forEach(field => {
        console.log(`   - ${field.fieldName} (${field.type}) at (${field.x}, ${field.y})`);
      });
    }

    if (comparison.removedFields.length > 0) {
      console.log('\n➖ Fields No Longer Detected:');
      comparison.removedFields.forEach(field => {
        console.log(`   - ${field.fieldName} (${field.type})`);
      });
    }

    // Update the template if not in dry run mode
    if (!dryRun) {
      console.log('\n💾 Updating PDF template with new field mapping...');
      
      await prisma.pdfTemplate.update({
        where: { id: templateId },
        data: {
          fieldMapping: newFieldMapping,
          updatedAt: new Date(),
          // Add metadata about the migration
          metadata: {
            ...template.metadata,
            coordinateMigration: {
              migratedAt: new Date().toISOString(),
              oldFieldCount: oldMapping.length,
              newFieldCount: newFieldMapping.length,
              processingTime: processingTime
            }
          }
        }
      });

      console.log('✅ Template updated successfully');
    } else {
      console.log('\n🔍 DRY RUN - No changes made to database');
      console.log('   Run with dryRun=false to apply changes');
    }

    return {
      success: true,
      templateId,
      oldFieldCount: oldMapping.length,
      newFieldCount: newFieldMapping.length,
      processingTime,
      comparison
    };

  } catch (error) {
    console.error(`❌ Error migrating template ${templateId}:`, error.message);
    return { success: false, error: error.message };
  }
}

function compareFieldMappings(oldMapping, newMapping) {
  const oldFieldMap = new Map(oldMapping.map(f => [f.fieldName?.toLowerCase(), f]));
  const newFieldMap = new Map(newMapping.map(f => [f.fieldName?.toLowerCase(), f]));

  const common = [];
  const newFields = [];
  const removedFields = [];

  // Find common and new fields
  for (const [fieldName, newField] of newFieldMap) {
    const oldField = oldFieldMap.get(fieldName);
    if (oldField) {
      // Common field - compare coordinates
      const xDiff = Math.abs((oldField.x || 0) - (newField.x || 0));
      const yDiff = Math.abs((oldField.y || 0) - (newField.y || 0));
      const significantChange = xDiff > 10 || yDiff > 10;

      common.push({
        oldField,
        newField,
        changes: {
          xDiff,
          yDiff,
          significantChange,
          description: significantChange 
            ? `moved by (${xDiff.toFixed(1)}, ${yDiff.toFixed(1)}) points`
            : 'minimal coordinate change'
        }
      });
    } else {
      newFields.push(newField);
    }
  }

  // Find removed fields
  for (const [fieldName, oldField] of oldFieldMap) {
    if (!newFieldMap.has(fieldName)) {
      removedFields.push(oldField);
    }
  }

  return { common, newFields, removedFields };
}

async function migrateAllTemplates(tenantId = null, dryRun = true) {
  try {
    console.log('🚀 Starting bulk PDF template migration to coordinate-accurate detection\n');

    const whereClause = tenantId ? { tenantId } : {};
    
    const templates = await prisma.pdfTemplate.findMany({
      where: {
        ...whereClause,
        isActive: true
      },
      include: {
        tenant: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`📋 Found ${templates.length} active PDF templates to migrate`);
    
    if (tenantId) {
      console.log(`🏢 Filtering by tenant: ${tenantId}`);
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      console.log(`\n📄 [${i + 1}/${templates.length}] Processing: ${template.displayName || template.fileName}`);

      const result = await migratePdfTemplate(template.id, dryRun);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      // Small delay to avoid overwhelming the API
      if (i < templates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n🎉 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📊 Total: ${templates.length}`);

    if (dryRun) {
      console.log('\n🔍 This was a DRY RUN - no changes were made');
      console.log('   Run with dryRun=false to apply changes');
    }

    return results;

  } catch (error) {
    console.error('❌ Bulk migration failed:', error.message);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'single':
        const templateId = args[1];
        const dryRun = args[2] !== 'apply';
        
        if (!templateId) {
          console.log('Usage: node migrate-to-coordinate-detection.js single <templateId> [apply]');
          process.exit(1);
        }

        await migratePdfTemplate(templateId, dryRun);
        break;

      case 'tenant':
        const tenantId = args[1];
        const tenantDryRun = args[2] !== 'apply';
        
        if (!tenantId) {
          console.log('Usage: node migrate-to-coordinate-detection.js tenant <tenantId> [apply]');
          process.exit(1);
        }

        await migrateAllTemplates(tenantId, tenantDryRun);
        break;

      case 'all':
        const allDryRun = args[1] !== 'apply';
        await migrateAllTemplates(null, allDryRun);
        break;

      default:
        console.log('PDF Template Migration to Coordinate-Accurate Detection\n');
        console.log('Usage:');
        console.log('  node migrate-to-coordinate-detection.js single <templateId> [apply]');
        console.log('  node migrate-to-coordinate-detection.js tenant <tenantId> [apply]');
        console.log('  node migrate-to-coordinate-detection.js all [apply]');
        console.log('\nOptions:');
        console.log('  apply    Actually update the database (default is dry run)');
        console.log('\nExamples:');
        console.log('  node migrate-to-coordinate-detection.js single abc123        # Dry run for one template');
        console.log('  node migrate-to-coordinate-detection.js single abc123 apply  # Apply changes');
        console.log('  node migrate-to-coordinate-detection.js tenant xyz789 apply  # Migrate all templates for tenant');
        console.log('  node migrate-to-coordinate-detection.js all apply            # Migrate all templates');
        break;
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  migratePdfTemplate,
  migrateAllTemplates,
  compareFieldMappings
};
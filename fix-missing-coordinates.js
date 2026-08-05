/**
 * Script to check and fix PDF templates with missing coordinates
 * This diagnoses why PDFs are not filling correctly
 */

const prisma = require('./src/lib/prisma');

async function checkTemplateCoordinates(tenantId) {
  try {
    console.log('🔍 Checking PDF Templates for Missing Coordinates\n');
    console.log('='.repeat(80));
    
    // Get all templates for tenant
    const templates = await prisma.pdfTemplate.findMany({
      where: {
        tenantId,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${templates.length} active PDF template(s)\n`);

    const issues = [];

    for (const template of templates) {
      console.log(`📄 Template: ${template.displayName || template.fileName}`);
      console.log(`   ID: ${template.id}`);
      console.log(`   Created: ${template.createdAt}`);
      
      const fieldMapping = template.fieldMapping || [];
      console.log(`   Field Mapping: ${fieldMapping.length} field(s)`);

      if (fieldMapping.length === 0) {
        console.log('   ❌ NO FIELD MAPPING - PDF will not fill!');
        issues.push({
          templateId: template.id,
          fileName: template.fileName,
          issue: 'NO_FIELD_MAPPING',
          solution: 'Regenerate with AI detection'
        });
      } else {
        // Check if fields have coordinates
        let hasCoordinates = 0;
        let missingCoordinates = 0;
        let interactiveOnly = 0;

        for (const field of fieldMapping) {
          if (typeof field.x === 'number' && typeof field.y === 'number') {
            hasCoordinates++;
          } else if (field.interactiveField === true) {
            interactiveOnly++;
          } else {
            missingCoordinates++;
          }
        }

        console.log(`   Fields with coordinates: ${hasCoordinates}`);
        console.log(`   Interactive fields: ${interactiveOnly}`);
        console.log(`   Missing coordinates: ${missingCoordinates}`);

        // Sample field
        if (fieldMapping.length > 0) {
          const sampleField = fieldMapping[0];
          console.log(`\n   Sample field:`);
          console.log(`   ${JSON.stringify(sampleField, null, 2).split('\n').join('\n   ')}`);
        }

        if (hasCoordinates === 0 && interactiveOnly === 0) {
          console.log('   ❌ MISSING COORDINATES - PDF will fill incorrectly!');
          issues.push({
            templateId: template.id,
            fileName: template.fileName,
            issue: 'MISSING_COORDINATES',
            solution: 'Re-upload with useHybridDetection=true'
          });
        } else if (hasCoordinates === 0 && interactiveOnly > 0) {
          console.log('   ⚠️  INTERACTIVE FIELDS ONLY - May work if PDF has AcroForms');
        } else if (hasCoordinates < fieldMapping.length) {
          console.log('   ⚠️  SOME FIELDS MISSING COORDINATES');
          issues.push({
            templateId: template.id,
            fileName: template.fileName,
            issue: 'PARTIAL_COORDINATES',
            solution: 'Regenerate field mapping'
          });
        } else {
          console.log('   ✅ All fields have coordinates - Should work!');
        }
      }

      console.log('\n' + '-'.repeat(80) + '\n');
    }

    // Summary
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(80));

    if (issues.length === 0) {
      console.log('✅ All templates have proper field mappings with coordinates!');
      console.log('   PDFs should fill correctly.');
    } else {
      console.log(`❌ Found ${issues.length} template(s) with issues:\n`);
      
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.fileName}`);
        console.log(`   Template ID: ${issue.templateId}`);
        console.log(`   Issue: ${issue.issue}`);
        console.log(`   Solution: ${issue.solution}`);
        console.log('');
      });

      console.log('\n🔧 HOW TO FIX:\n');
      console.log('Option 1: Re-upload PDF with Hybrid Detection');
      console.log('   curl -X POST http://localhost:4000/api/embeddings/upload \\');
      console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
      console.log('     -F "file=@your-form.pdf" \\');
      console.log('     -F "useHybridDetection=true"\n');
      
      console.log('Option 2: Regenerate Field Mapping for Existing Template');
      console.log('   curl -X POST http://localhost:4000/api/pdfs/templates/:templateId/regenerate \\');
      console.log('     -H "Authorization: Bearer YOUR_TOKEN"\n');
      
      console.log('Option 3: Manually Update Field Mapping');
      console.log('   curl -X PUT http://localhost:4000/api/pdfs/templates/:templateId/mapping \\');
      console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d @field-mapping.json\n');
    }

    // Generate fix script
    if (issues.length > 0) {
      console.log('\n💾 Generating Fix Script...\n');
      
      const fixScript = `
-- SQL Script to Check and Fix PDF Templates
-- Run this to see which templates need coordinate regeneration

-- Check all templates and their field mappings
SELECT 
  id,
  "fileName",
  "displayName",
  CASE 
    WHEN "fieldMapping" IS NULL THEN 'NO_MAPPING'
    WHEN jsonb_array_length("fieldMapping") = 0 THEN 'EMPTY_MAPPING'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements("fieldMapping") elem
      WHERE elem->>'x' IS NOT NULL AND elem->>'y' IS NOT NULL
    ) THEN 'HAS_COORDINATES'
    ELSE 'MISSING_COORDINATES'
  END as status,
  jsonb_array_length("fieldMapping") as field_count,
  "createdAt"
FROM "PdfTemplate"
WHERE "tenantId" = '${tenantId}'
  AND "isActive" = true
ORDER BY "createdAt" DESC;

-- For templates with issues, you can regenerate using the API
-- POST /api/pdfs/templates/:templateId/regenerate
`;

      const fs = require('fs');
      fs.writeFileSync('./check-templates.sql', fixScript);
      console.log('✅ SQL script saved to: check-templates.sql');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run check
if (require.main === module) {
  const tenantId = process.argv[2];
  
  if (!tenantId) {
    console.log('Usage: node fix-missing-coordinates.js <tenantId>');
    console.log('\nExample:');
    console.log('  node fix-missing-coordinates.js ddc9f0f6-d8e1-4d03-a2e8-7f44f5142003');
    process.exit(1);
  }

  checkTemplateCoordinates(tenantId)
    .then(() => {
      console.log('\n✅ Check complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { checkTemplateCoordinates };


/**
 * Quick script to check if PDF template has coordinates
 */

const prisma = require('./src/lib/prisma');

async function checkPdfTemplate(tenantId) {
  try {
    console.log('🔍 Checking PDF Template (not formSchema!)\n');
    
    // Get PDF templates
    const templates = await prisma.pdfTemplate.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (templates.length === 0) {
      console.log('❌ NO PDF TEMPLATES FOUND!');
      console.log('\n📝 You need to upload your PDF first:');
      console.log('   curl -X POST http://localhost:4000/api/embeddings/upload \\');
      console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
      console.log('     -F "file=@your-form.pdf" \\');
      console.log('     -F "useHybridDetection=true"');
      return;
    }

    console.log(`Found ${templates.length} PDF template(s)\n`);
    console.log('='.repeat(80));

    for (const template of templates) {
      console.log(`\n📄 ${template.displayName || template.fileName}`);
      console.log(`   ID: ${template.id}`);
      console.log(`   S3 Key: ${template.s3Key}`);
      console.log(`   Created: ${template.createdAt}`);

      const fieldMapping = template.fieldMapping || [];
      console.log(`\n   fieldMapping array: ${fieldMapping.length} field(s)`);

      if (fieldMapping.length === 0) {
        console.log('   ❌ EMPTY FIELD MAPPING - PDF will not fill!\n');
        continue;
      }

      // Check first field for coordinates
      const firstField = fieldMapping[0];
      console.log('\n   First field sample:');
      console.log('   ' + JSON.stringify(firstField, null, 2).split('\n').join('\n   '));

      // Check if has coordinates
      const hasX = typeof firstField.x === 'number';
      const hasY = typeof firstField.y === 'number';
      const hasWidth = typeof firstField.width === 'number';
      const hasHeight = typeof firstField.height === 'number';

      console.log('\n   Coordinate check:');
      console.log(`   - Has X: ${hasX ? '✅' : '❌'} ${hasX ? `(${firstField.x})` : ''}`);
      console.log(`   - Has Y: ${hasY ? '✅' : '❌'} ${hasY ? `(${firstField.y})` : ''}`);
      console.log(`   - Has Width: ${hasWidth ? '✅' : '❌'} ${hasWidth ? `(${firstField.width})` : ''}`);
      console.log(`   - Has Height: ${hasHeight ? '✅' : '❌'} ${hasHeight ? `(${firstField.height})` : ''}`);

      if (hasX && hasY) {
        console.log('\n   ✅ COORDINATES FOUND - This template should work!');
        
        // Count how many fields have coordinates
        const withCoords = fieldMapping.filter(f => 
          typeof f.x === 'number' && typeof f.y === 'number'
        ).length;
        console.log(`   ${withCoords}/${fieldMapping.length} fields have coordinates`);
      } else {
        console.log('\n   ❌ MISSING COORDINATES - This template WILL NOT FILL CORRECTLY!');
        console.log('\n   🔧 Fix: Re-upload PDF with hybrid detection:');
        console.log('      curl -X POST http://localhost:4000/api/embeddings/upload \\');
        console.log('        -H "Authorization: Bearer YOUR_TOKEN" \\');
        console.log(`        -F "file=@${template.fileName}" \\`);
        console.log('        -F "useHybridDetection=true"');
      }

      console.log('\n' + '='.repeat(80));
    }

    // Also check formSchema for comparison
    console.log('\n\n📋 Form Schema (for comparison - should NOT have coordinates)');
    console.log('='.repeat(80));
    
    const schemas = await prisma.formSchema.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 1
    });

    if (schemas.length > 0) {
      const schema = schemas[0];
      console.log(`\nSchema: ${schema.formName}`);
      const fields = schema.schemaJson?.fields || [];
      console.log(`Fields: ${fields.length}`);
      
      if (fields.length > 0) {
        console.log('\nFirst field sample:');
        console.log(JSON.stringify(fields[0], null, 2));
        console.log('\n✅ This is correct - formSchema should NOT have coordinates!');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const tenantId = process.argv[2];
  
  if (!tenantId) {
    console.log('Usage: node check-pdf-template.js <tenantId>');
    console.log('\nExample:');
    console.log('  node check-pdf-template.js ddc9f0f6-d8e1-4d03-a2e8-7f44f5142003');
    process.exit(1);
  }

  checkPdfTemplate(tenantId).catch(console.error);
}

module.exports = { checkPdfTemplate };

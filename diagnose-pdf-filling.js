/**
 * Diagnostic script to analyze PDF field detection and filling issues
 * This script will help identify why fields are not being filled properly
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Import detection services
const { generateFieldMappingWithCoordinateAI, extractPdfStructure } = require('./src/services/aiFieldDetectionCoordinate.service');
const { generateFieldMappingWithAI } = require('./src/services/aiFieldDetection.service');

async function diagnosePdfFilling(pdfPath) {
  try {
    console.log('🔍 PDF Filling Diagnostic Tool\n');
    console.log('=' .repeat(80));
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`❌ PDF file not found: ${pdfPath}`);
      console.log('📝 Please provide a valid PDF file path');
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);

    console.log(`📄 Analyzing: ${fileName}`);
    console.log(`📊 File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB\n`);

    // Step 1: Check for interactive form fields
    console.log('Step 1: Checking for Interactive Form Fields');
    console.log('-'.repeat(80));
    
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();
    const formFields = form.getFields();
    
    console.log(`Found ${formFields.length} interactive form fields`);
    
    if (formFields.length > 0) {
      console.log('\n✅ Interactive Fields Detected:');
      formFields.forEach((field, index) => {
        const fieldName = field.getName();
        const fieldType = field.constructor.name;
        console.log(`   ${index + 1}. ${fieldName} (${fieldType})`);
      });
      console.log('\n💡 Recommendation: This PDF has interactive fields. They should be filled directly.');
    } else {
      console.log('⚠️  No interactive fields found. Will need coordinate-based filling.\n');
    }

    // Step 2: Extract PDF structure (Text-based)
    console.log('\nStep 2: Extracting PDF Structure (Text-Based Method)');
    console.log('-'.repeat(80));
    
    let structureData = null;
    try {
      structureData = await extractPdfStructure(pdfBuffer);
      console.log(`✅ Extracted structure from ${structureData.length} page(s)`);
      
      structureData.forEach((page, idx) => {
        console.log(`\nPage ${idx + 1}:`);
        console.log(`   Dimensions: ${page.width} x ${page.height} points`);
        console.log(`   Text items: ${page.items.length}`);
        console.log(`   Lines detected: ${page.lines.length}`);
        
        // Show sample text content (first 200 characters)
        const sampleText = page.textContent.substring(0, 200);
        console.log(`   Sample text: ${sampleText}...`);
      });
    } catch (error) {
      console.log(`❌ Failed to extract PDF structure: ${error.message}`);
    }

    // Step 3: Run Coordinate-Accurate Detection
    console.log('\n\nStep 3: Running Coordinate-Accurate Field Detection (Text-Based)');
    console.log('-'.repeat(80));
    
    let coordinateFields = [];
    let coordinateError = null;
    const coordinateStart = Date.now();
    
    try {
      coordinateFields = await generateFieldMappingWithCoordinateAI({
        pdfBuffer,
        fileName,
        tenantId: 'diagnostic',
        formSchema: null
      });
      const coordinateTime = Date.now() - coordinateStart;
      console.log(`✅ Coordinate method completed in ${coordinateTime}ms`);
      console.log(`📝 Detected ${coordinateFields.length} fields\n`);
      
      if (coordinateFields.length > 0) {
        console.log('Detected Fields:');
        coordinateFields.forEach((field, idx) => {
          console.log(`   ${idx + 1}. ${field.fieldName} (${field.type})`);
          console.log(`      Label: "${field.label}"`);
          console.log(`      Position: (${field.x}, ${field.y}) - ${field.width}x${field.height}pts`);
          console.log(`      Page: ${field.page}`);
          if (field.schemaKey) {
            console.log(`      Schema Key: ${field.schemaKey}`);
          }
          console.log('');
        });
      }
    } catch (error) {
      coordinateError = error;
      const coordinateTime = Date.now() - coordinateStart;
      console.log(`❌ Coordinate method failed after ${coordinateTime}ms: ${error.message}`);
    }

    // Step 4: Run Vision-Based Detection (if coordinate method has issues)
    console.log('\nStep 4: Running Vision-Based Field Detection (Image-Based)');
    console.log('-'.repeat(80));
    
    let visionFields = [];
    let visionError = null;
    const visionStart = Date.now();
    
    try {
      visionFields = await generateFieldMappingWithAI({
        pdfBuffer,
        fileName,
        tenantId: 'diagnostic',
        formSchema: null
      });
      const visionTime = Date.now() - visionStart;
      console.log(`✅ Vision method completed in ${visionTime}ms`);
      console.log(`📝 Detected ${visionFields.length} fields\n`);
      
      if (visionFields.length > 0) {
        console.log('Detected Fields:');
        visionFields.forEach((field, idx) => {
          console.log(`   ${idx + 1}. ${field.fieldName} (${field.type})`);
          console.log(`      Label: "${field.label}"`);
          console.log(`      Position: (${field.x}, ${field.y}) - ${field.width}x${field.height}pts`);
          console.log(`      Page: ${field.page}`);
          console.log('');
        });
      }
    } catch (error) {
      visionError = error;
      const visionTime = Date.now() - visionStart;
      console.log(`❌ Vision method failed after ${visionTime}ms: ${error.message}`);
    }

    // Step 5: Compare Detection Methods
    console.log('\nStep 5: Comparison Analysis');
    console.log('='.repeat(80));
    
    console.log('\n📊 Detection Summary:');
    console.log(`   Interactive Fields: ${formFields.length} fields`);
    console.log(`   Coordinate-based:   ${coordinateFields.length} fields ${coordinateError ? '(FAILED)' : '(SUCCESS)'}`);
    console.log(`   Vision-based:       ${visionFields.length} fields ${visionError ? '(FAILED)' : '(SUCCESS)'}`);
    
    // Compare field coverage
    if (coordinateFields.length > 0 && visionFields.length > 0) {
      const coordFieldNames = new Set(coordinateFields.map(f => f.fieldName.toLowerCase()));
      const visionFieldNames = new Set(visionFields.map(f => f.fieldName.toLowerCase()));
      
      const commonFields = [...coordFieldNames].filter(name => visionFieldNames.has(name));
      const coordOnlyFields = [...coordFieldNames].filter(name => !visionFieldNames.has(name));
      const visionOnlyFields = [...visionFieldNames].filter(name => !coordFieldNames.has(name));
      
      console.log(`\n🔍 Field Detection Overlap:`);
      console.log(`   Common fields: ${commonFields.length}`);
      console.log(`   Coordinate-only: ${coordOnlyFields.length}`);
      console.log(`   Vision-only: ${visionOnlyFields.length}`);
      
      if (coordOnlyFields.length > 0) {
        console.log(`\n   📝 Fields only detected by Coordinate method:`);
        coordOnlyFields.forEach(name => console.log(`      - ${name}`));
      }
      
      if (visionOnlyFields.length > 0) {
        console.log(`\n   📝 Fields only detected by Vision method:`);
        visionOnlyFields.forEach(name => console.log(`      - ${name}`));
      }
    }

    // Step 6: Recommendations
    console.log('\n\n🎯 Recommendations & Next Steps');
    console.log('='.repeat(80));
    
    if (formFields.length > 0) {
      console.log('\n✅ This PDF has interactive form fields.');
      console.log('   Recommendation: Use direct field filling (already implemented)');
      console.log('   The fillPdfTemplate function will fill these fields automatically.');
    } else if (coordinateFields.length > visionFields.length) {
      console.log('\n✅ Coordinate-based detection performed better.');
      console.log('   Recommendation: Use coordinate-accurate method (text-based)');
      console.log('   Set useCoordinateDetection: true when uploading PDFs');
    } else if (visionFields.length > coordinateFields.length) {
      console.log('\n✅ Vision-based detection performed better.');
      console.log('   Recommendation: Use vision method for this form type');
      console.log('   Set useCoordinateDetection: false when uploading PDFs');
    } else if (coordinateFields.length > 0 && visionFields.length > 0) {
      console.log('\n🎯 Hybrid approach recommended!');
      console.log('   Both methods detected fields successfully.');
      console.log('   Recommendation: Combine results from both methods');
      console.log('   - Use coordinate method for standard text fields');
      console.log('   - Use vision method for checkboxes and complex layouts');
    } else {
      console.log('\n⚠️  Field detection challenges detected.');
      console.log('   Possible issues:');
      console.log('   - PDF may be a scanned image (no extractable text)');
      console.log('   - Form may have unusual layout');
      console.log('   - AI model may need better prompts for this form type');
    }

    // Step 7: Test Form Data Matching
    console.log('\n\n🧪 Testing Field Matching with Sample Data');
    console.log('-'.repeat(80));
    
    const sampleFormData = {
      'name': 'Test User',
      'first_name': 'John',
      'last_name': 'Doe',
      'date_of_birth': '1990-01-15',
      'address': '123 Main St',
      'phone': '555-1234',
      'email': 'test@example.com',
      'ssn': '123-45-6789',
      'emergency_contact': 'Jane Doe',
      'relationship': 'Spouse'
    };
    
    console.log('\nSample form data keys:');
    Object.keys(sampleFormData).forEach(key => console.log(`   - ${key}`));
    
    if (coordinateFields.length > 0) {
      console.log('\n📊 Field Matching Analysis (Coordinate Fields):');
      coordinateFields.forEach(field => {
        const normalizedFieldName = field.fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Find matching form data key
        const matchedKey = Object.keys(sampleFormData).find(key => {
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normalizedKey === normalizedFieldName || 
                 normalizedKey.includes(normalizedFieldName) || 
                 normalizedFieldName.includes(normalizedKey);
        });
        
        if (matchedKey) {
          console.log(`   ✅ "${field.fieldName}" → matches form data key "${matchedKey}"`);
        } else {
          console.log(`   ❌ "${field.fieldName}" → NO MATCH in form data`);
        }
      });
    }

    // Save diagnostic report
    const report = {
      fileName,
      timestamp: new Date().toISOString(),
      interactive: {
        fieldCount: formFields.length,
        fields: formFields.map(f => ({ name: f.getName(), type: f.constructor.name }))
      },
      coordinateDetection: {
        success: !coordinateError,
        fieldCount: coordinateFields.length,
        fields: coordinateFields,
        error: coordinateError?.message
      },
      visionDetection: {
        success: !visionError,
        fieldCount: visionFields.length,
        fields: visionFields,
        error: visionError?.message
      },
      structure: structureData ? {
        pageCount: structureData.length,
        pages: structureData.map(p => ({
          dimensions: { width: p.width, height: p.height },
          textItemCount: p.items.length,
          lineCount: p.lines.length
        }))
      } : null
    };

    const reportPath = './pdf-diagnostic-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n\n💾 Diagnostic report saved to: ${reportPath}`);

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ Diagnostic complete!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run diagnostic
if (require.main === module) {
  const pdfPath = process.argv[2] || './sample-form.pdf';
  console.log(`Running diagnostic on: ${pdfPath}\n`);
  diagnosePdfFilling(pdfPath).catch(console.error);
}

module.exports = { diagnosePdfFilling };


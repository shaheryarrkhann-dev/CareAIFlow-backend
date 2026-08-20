/**
 * Test script for hybrid field detection
 * Tests the new hybrid approach with a sample PDF
 */

const fs = require('fs');
const path = require('path');

// Import hybrid detection service
const { generateFieldMappingWithHybridAI, analyzePdfComplexity } = require('./src/services/aiFieldDetectionHybrid.service');

async function testHybridDetection(pdfPath) {
  try {
    console.log('🧪 Testing Hybrid Field Detection\n');
    console.log('=' .repeat(80));
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`❌ PDF file not found: ${pdfPath}`);
      console.log('📝 Please provide a valid PDF file path');
      console.log('\nUsage: node test-hybrid-detection.js <path-to-pdf>');
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);

    console.log(`📄 Testing with: ${fileName}`);
    console.log(`📊 File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB\n`);

    // Step 1: Analyze complexity
    console.log('Step 1: Analyzing PDF Complexity');
    console.log('-'.repeat(80));
    
    const complexity = await analyzePdfComplexity(pdfBuffer);
    
    console.log('Complexity Analysis:');
    console.log(`   Simple Form: ${complexity.simple ? 'Yes' : 'No'}`);
    console.log(`   Complex Form: ${complexity.complex ? 'Yes' : 'No'}`);
    console.log(`   Has Checkboxes: ${complexity.hasCheckboxes ? 'Yes' : 'No'}`);
    console.log(`   Has Underlines: ${complexity.hasUnderlines ? 'Yes' : 'No'}`);
    console.log(`   Has Tables/Grids: ${complexity.hasTablesOrGrid ? 'Yes' : 'No'}`);
    console.log(`   Recommended Method: ${complexity.recommendedMethod.toUpperCase()}`);
    
    // Step 2: Run hybrid detection
    console.log('\n\nStep 2: Running Hybrid Detection');
    console.log('-'.repeat(80));
    
    const startTime = Date.now();
    const fields = await generateFieldMappingWithHybridAI({
      pdfBuffer,
      fileName,
      tenantId: 'test',
      formSchema: null
    });
    const elapsedTime = Date.now() - startTime;
    
    console.log(`\n✅ Detection completed in ${elapsedTime}ms`);
    console.log(`📝 Total fields detected: ${fields.length}\n`);
    
    // Step 3: Display results
    console.log('Step 3: Detection Results');
    console.log('='.repeat(80));
    
    // Group by detection method
    const textFields = fields.filter(f => f.detectionMethod === 'text');
    const visionFields = fields.filter(f => f.detectionMethod === 'vision');
    const highConfidence = fields.filter(f => f.confidence === 'high');
    
    console.log(`\n📊 Detection Breakdown:`);
    console.log(`   Text-based fields: ${textFields.length}`);
    console.log(`   Vision-based fields: ${visionFields.length}`);
    console.log(`   High confidence: ${highConfidence.length}`);
    
    // Group by type
    const fieldsByType = {};
    fields.forEach(f => {
      fieldsByType[f.type] = (fieldsByType[f.type] || 0) + 1;
    });
    
    console.log(`\n📋 Fields by Type:`);
    Object.entries(fieldsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    // Display detailed field information
    console.log(`\n\n📄 Detailed Field Information:`);
    console.log('='.repeat(80));
    
    fields.forEach((field, idx) => {
      console.log(`\n${idx + 1}. ${field.fieldName} (${field.type})`);
      console.log(`   Label: "${field.label}"`);
      console.log(`   Position: (${field.x}, ${field.y}) - ${field.width}x${field.height}pts`);
      console.log(`   Page: ${field.page}`);
      console.log(`   Detection: ${field.detectionMethod.toUpperCase()}`);
      console.log(`   Confidence: ${field.confidence.toUpperCase()}`);
      
      if (field.schemaKey) {
        console.log(`   Schema Key: ${field.schemaKey}`);
      }
      
      if (field.alternateDetection) {
        console.log(`   Alternate: ${field.alternateDetection.method} (${field.alternateDetection.coordinates.x}, ${field.alternateDetection.coordinates.y})`);
      }
    });
    
    // Step 4: Test field matching
    console.log(`\n\n🧪 Testing Field Matching`);
    console.log('='.repeat(80));
    
    const sampleFormData = {
      'name': 'John Doe',
      'nickname': 'Johnny',
      'male': true,
      'female': false,
      'address': '123 Main St, City, State 12345',
      'ssn': '123-45-6789',
      'medicare_medicaid': 'A1234567',
      'date_of_birth': '1990-01-15',
      'admission_date': '2025-11-01',
      'allergies': 'None',
      'religious_preference': 'Christian',
      'pharmacy': 'Main Pharmacy',
      'phone': '555-1234',
      'preferred_hospital': 'City Hospital',
      'primary_insurance': 'Blue Cross'
    };
    
    console.log('\nSample form data keys:');
    Object.keys(sampleFormData).forEach(key => console.log(`   - ${key}: ${sampleFormData[key]}`));
    
    console.log('\n\n📊 Field Matching Results:');
    
    // Test matching
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    let matchedCount = 0;
    let unmatchedFields = [];
    
    fields.forEach(field => {
      const normalizedFieldName = normalize(field.fieldName || field.label);
      
      // Find matching form data key
      const matchedKey = Object.keys(sampleFormData).find(key => {
        const normalizedKey = normalize(key);
        return normalizedKey === normalizedFieldName || 
               normalizedKey.includes(normalizedFieldName) || 
               normalizedFieldName.includes(normalizedKey);
      });
      
      if (matchedKey) {
        console.log(`   ✅ "${field.fieldName}" → "${matchedKey}" = "${sampleFormData[matchedKey]}"`);
        matchedCount++;
      } else {
        console.log(`   ❌ "${field.fieldName}" → NO MATCH`);
        unmatchedFields.push(field.fieldName);
      }
    });
    
    console.log(`\n📈 Matching Statistics:`);
    console.log(`   Matched: ${matchedCount} / ${fields.length} (${(matchedCount/fields.length*100).toFixed(1)}%)`);
    console.log(`   Unmatched: ${unmatchedFields.length}`);
    
    if (unmatchedFields.length > 0) {
      console.log(`\n⚠️  Unmatched fields that won't be filled:`);
      unmatchedFields.forEach(name => console.log(`      - ${name}`));
    }
    
    // Save results
    const report = {
      fileName,
      timestamp: new Date().toISOString(),
      complexity,
      detectionTime: elapsedTime,
      fields,
      statistics: {
        totalFields: fields.length,
        textBasedFields: textFields.length,
        visionBasedFields: visionFields.length,
        highConfidence: highConfidence.length,
        fieldsByType: fieldsByType,
        matchedFields: matchedCount,
        unmatchedFields: unmatchedFields.length
      }
    };
    
    const reportPath = './hybrid-detection-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n\n💾 Test report saved to: ${reportPath}`);
    
    // Final summary
    console.log('\n\n' + '='.repeat(80));
    console.log('✅ Hybrid Detection Test Complete!');
    console.log('='.repeat(80));
    
    console.log(`\n📊 Summary:`);
    console.log(`   - Detection Time: ${elapsedTime}ms`);
    console.log(`   - Fields Detected: ${fields.length}`);
    console.log(`   - High Confidence: ${highConfidence.length} (${(highConfidence.length/fields.length*100).toFixed(1)}%)`);
    console.log(`   - Field Matching: ${matchedCount}/${fields.length} (${(matchedCount/fields.length*100).toFixed(1)}%)`);
    console.log(`   - Recommended Method: ${complexity.recommendedMethod.toUpperCase()}`);
    
    if (matchedCount / fields.length >= 0.8) {
      console.log(`\n✨ Excellent! ${(matchedCount/fields.length*100).toFixed(0)}% of fields matched successfully.`);
    } else if (matchedCount / fields.length >= 0.6) {
      console.log(`\n⚠️  Good, but ${unmatchedFields.length} fields didn't match. Check field names.`);
    } else {
      console.log(`\n⚠️  Warning: Low match rate. Consider adjusting field names or form data keys.`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run test
if (require.main === module) {
  const pdfPath = process.argv[2] || './sample-form.pdf';
  console.log(`Testing hybrid detection with: ${pdfPath}\n`);
  testHybridDetection(pdfPath).catch(console.error);
}

module.exports = { testHybridDetection };


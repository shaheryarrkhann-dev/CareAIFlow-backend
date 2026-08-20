/**
 * Comparison script: Vision-based vs Coordinate-accurate field detection
 * This script runs both methods and compares their results
 */

const fs = require('fs');
const path = require('path');

// Import both detection methods
const { detectFormFieldsWithAI } = require('./src/services/aiFieldDetection.service');
const { detectFormFieldsWithCoordinateAI } = require('./src/services/aiFieldDetectionCoordinate.service');

async function compareDetectionMethods() {
  try {
    console.log('🔬 Comparing PDF Field Detection Methods\n');

    const samplePdfPath = './sample-form.pdf';
    
    if (!fs.existsSync(samplePdfPath)) {
      console.log('❌ No sample PDF found at ./sample-form.pdf');
      console.log('📝 Please place a test PDF file at ./sample-form.pdf to run this comparison');
      return;
    }

    const pdfBuffer = fs.readFileSync(samplePdfPath);
    const fileName = path.basename(samplePdfPath);

    console.log(`📄 Testing with: ${fileName}`);
    console.log(`📊 File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB\n`);

    // Test 1: Vision-based method (existing)
    console.log('🖼️  Method 1: Vision-based Detection (Current)');
    console.log('=' .repeat(50));
    
    const visionStart = Date.now();
    let visionFields = [];
    let visionError = null;

    try {
      visionFields = await detectFormFieldsWithAI(pdfBuffer, fileName);
      const visionTime = Date.now() - visionStart;
      console.log(`✅ Vision method completed in ${visionTime}ms`);
      console.log(`📝 Detected ${visionFields.length} fields`);
    } catch (error) {
      visionError = error;
      const visionTime = Date.now() - visionStart;
      console.log(`❌ Vision method failed after ${visionTime}ms: ${error.message}`);
    }

    console.log('\n🎯 Method 2: Coordinate-accurate Detection (New)');
    console.log('=' .repeat(50));

    const coordinateStart = Date.now();
    let coordinateFields = [];
    let coordinateError = null;

    try {
      coordinateFields = await detectFormFieldsWithCoordinateAI(pdfBuffer, fileName);
      const coordinateTime = Date.now() - coordinateStart;
      console.log(`✅ Coordinate method completed in ${coordinateTime}ms`);
      console.log(`📝 Detected ${coordinateFields.length} fields`);
    } catch (error) {
      coordinateError = error;
      const coordinateTime = Date.now() - coordinateStart;
      console.log(`❌ Coordinate method failed after ${coordinateTime}ms: ${error.message}`);
    }

    // Comparison Analysis
    console.log('\n📊 Comparison Results');
    console.log('=' .repeat(80));

    if (!visionError && !coordinateError) {
      // Both methods succeeded - compare results
      console.log(`Vision Method:     ${visionFields.length} fields detected`);
      console.log(`Coordinate Method: ${coordinateFields.length} fields detected`);

      // Compare field names
      const visionFieldNames = new Set(visionFields.map(f => f.fieldName.toLowerCase()));
      const coordinateFieldNames = new Set(coordinateFields.map(f => f.fieldName.toLowerCase()));

      const commonFields = [...visionFieldNames].filter(name => coordinateFieldNames.has(name));
      const visionOnlyFields = [...visionFieldNames].filter(name => !coordinateFieldNames.has(name));
      const coordinateOnlyFields = [...coordinateFieldNames].filter(name => !visionFieldNames.has(name));

      console.log(`\n🔍 Field Detection Overlap:`);
      console.log(`   Common fields: ${commonFields.length}`);
      console.log(`   Vision-only fields: ${visionOnlyFields.length}`);
      console.log(`   Coordinate-only fields: ${coordinateOnlyFields.length}`);

      if (commonFields.length > 0) {
        console.log(`\n✅ Common fields detected by both methods:`);
        commonFields.forEach(name => console.log(`   - ${name}`));
      }

      if (visionOnlyFields.length > 0) {
        console.log(`\n🖼️  Fields detected only by Vision method:`);
        visionOnlyFields.forEach(name => console.log(`   - ${name}`));
      }

      if (coordinateOnlyFields.length > 0) {
        console.log(`\n🎯 Fields detected only by Coordinate method:`);
        coordinateOnlyFields.forEach(name => console.log(`   - ${name}`));
      }

      // Compare coordinate accuracy for common fields
      console.log(`\n📐 Coordinate Comparison for Common Fields:`);
      commonFields.forEach(fieldName => {
        const visionField = visionFields.find(f => f.fieldName.toLowerCase() === fieldName);
        const coordinateField = coordinateFields.find(f => f.fieldName.toLowerCase() === fieldName);

        if (visionField && coordinateField) {
          const xDiff = Math.abs(visionField.x - coordinateField.x);
          const yDiff = Math.abs(visionField.y - coordinateField.y);
          
          console.log(`   ${fieldName}:`);
          console.log(`     Vision:     (${visionField.x.toFixed(1)}, ${visionField.y.toFixed(1)})`);
          console.log(`     Coordinate: (${coordinateField.x.toFixed(1)}, ${coordinateField.y.toFixed(1)})`);
          console.log(`     Difference: (${xDiff.toFixed(1)}, ${yDiff.toFixed(1)}) points`);
        }
      });

    } else if (visionError && !coordinateError) {
      console.log('✅ Coordinate method succeeded where Vision method failed');
      console.log(`🎯 Coordinate method detected ${coordinateFields.length} fields`);
      console.log(`❌ Vision method error: ${visionError.message}`);
    } else if (!visionError && coordinateError) {
      console.log('✅ Vision method succeeded where Coordinate method failed');
      console.log(`🖼️  Vision method detected ${visionFields.length} fields`);
      console.log(`❌ Coordinate method error: ${coordinateError.message}`);
    } else {
      console.log('❌ Both methods failed');
      console.log(`Vision error: ${visionError?.message}`);
      console.log(`Coordinate error: ${coordinateError?.message}`);
    }

    // Performance and Cost Analysis
    console.log('\n💰 Performance & Cost Analysis:');
    console.log('Vision Method (Image-based):');
    console.log('   ❌ Requires PDF → Image conversion');
    console.log('   ❌ High-resolution images for accuracy');
    console.log('   ❌ Vision API tokens (expensive)');
    console.log('   ❌ Scaling/DPI conversion errors');
    console.log('   ❌ Slower processing');

    console.log('\nCoordinate Method (Text-based):');
    console.log('   ✅ Direct PDF structure extraction');
    console.log('   ✅ Native PDF coordinates (no scaling)');
    console.log('   ✅ Text-only API tokens (cheaper)');
    console.log('   ✅ No image conversion overhead');
    console.log('   ✅ Faster processing');
    console.log('   ✅ Consistent across devices');

    // Save comparison results
    const comparisonResults = {
      fileName,
      timestamp: new Date().toISOString(),
      visionMethod: {
        success: !visionError,
        error: visionError?.message || null,
        fieldCount: visionFields.length,
        fields: visionFields
      },
      coordinateMethod: {
        success: !coordinateError,
        error: coordinateError?.message || null,
        fieldCount: coordinateFields.length,
        fields: coordinateFields
      },
      analysis: {
        commonFields: commonFields || [],
        visionOnlyFields: visionOnlyFields || [],
        coordinateOnlyFields: coordinateOnlyFields || []
      }
    };

    const outputPath = './detection-method-comparison.json';
    fs.writeFileSync(outputPath, JSON.stringify(comparisonResults, null, 2));
    console.log(`\n💾 Comparison results saved to: ${outputPath}`);

    // Recommendation
    console.log('\n🎯 Recommendation:');
    if (!coordinateError && coordinateFields.length > 0) {
      console.log('✅ Use the Coordinate-accurate method for:');
      console.log('   - Better accuracy and consistency');
      console.log('   - Lower processing costs');
      console.log('   - Faster performance');
      console.log('   - No image conversion dependencies');
    } else if (!visionError && visionFields.length > 0) {
      console.log('⚠️  Fall back to Vision method if coordinate method fails');
    } else {
      console.log('❌ Both methods need refinement for this PDF type');
    }

  } catch (error) {
    console.error('❌ Comparison failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the comparison
if (require.main === module) {
  compareDetectionMethods().catch(console.error);
}

module.exports = { compareDetectionMethods };
/**
 * Test script for the new coordinate-accurate PDF field detection
 * This demonstrates the improved approach without image conversion
 */

const fs = require('fs');
const path = require('path');
const { 
  extractPdfStructure, 
  detectFormFieldsWithCoordinateAI 
} = require('./src/services/aiFieldDetectionCoordinate.service');

async function testCoordinateDetection() {
  try {
    console.log('🧪 Testing Coordinate-Accurate PDF Field Detection\n');

    // Look for a sample PDF in the current directory
    const samplePdfPath = './sample-form.pdf'; // You can place a test PDF here
    
    if (!fs.existsSync(samplePdfPath)) {
      console.log('❌ No sample PDF found at ./sample-form.pdf');
      console.log('📝 Please place a test PDF file at ./sample-form.pdf to run this test');
      return;
    }

    const pdfBuffer = fs.readFileSync(samplePdfPath);
    const fileName = path.basename(samplePdfPath);

    console.log(`📄 Testing with: ${fileName}`);
    console.log(`📊 File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB\n`);

    // Step 1: Extract PDF structure
    console.log('🔍 Step 1: Extracting PDF structure with native coordinates...');
    const startTime = Date.now();
    
    const structure = await extractPdfStructure(pdfBuffer);
    
    const structureTime = Date.now() - startTime;
    console.log(`✅ Structure extracted in ${structureTime}ms`);
    console.log(`📋 Found ${structure.length} pages`);
    
    // Log structure summary
    structure.forEach((page, index) => {
      console.log(`   Page ${index + 1}: ${page.items.length} text items, ${page.lines.length} lines, ${page.width}x${page.height}pts`);
    });

    console.log('\n🤖 Step 2: Detecting fields with coordinate-accurate AI...');
    const detectionStart = Date.now();
    
    const detectedFields = await detectFormFieldsWithCoordinateAI(pdfBuffer, fileName);
    
    const detectionTime = Date.now() - detectionStart;
    const totalTime = Date.now() - startTime;

    console.log(`✅ Field detection completed in ${detectionTime}ms`);
    console.log(`🎯 Total processing time: ${totalTime}ms`);
    console.log(`📝 Detected ${detectedFields.length} fields\n`);

    // Display detected fields
    if (detectedFields.length > 0) {
      console.log('🎯 Detected Fields (with precise coordinates):');
      console.log('=' .repeat(80));
      
      detectedFields.forEach((field, index) => {
        console.log(`${index + 1}. ${field.fieldName} (${field.type})`);
        console.log(`   Label: "${field.label}"`);
        console.log(`   Position: (${field.x}, ${field.y}) - ${field.width}x${field.height}pts`);
        console.log(`   Page: ${field.page}`);
        if (field.schemaKey) {
          console.log(`   Schema Key: ${field.schemaKey}`);
        }
        if (field.confidence) {
          console.log(`   Confidence: ${(field.confidence * 100).toFixed(1)}%`);
        }
        console.log('');
      });

      // Performance comparison note
      console.log('📊 Performance Benefits:');
      console.log(`   ✅ No image conversion required`);
      console.log(`   ✅ Native PDF coordinates (no scaling errors)`);
      console.log(`   ✅ Faster processing (${totalTime}ms total)`);
      console.log(`   ✅ Lower API costs (text-only tokens)`);
      console.log(`   ✅ Consistent across devices and renderers`);

      // Save results to JSON for inspection
      const outputPath = './coordinate-detection-results.json';
      const results = {
        fileName,
        processingTime: {
          structure: structureTime,
          detection: detectionTime,
          total: totalTime
        },
        pdfInfo: {
          pages: structure.length,
          totalTextItems: structure.reduce((sum, page) => sum + page.items.length, 0),
          totalLines: structure.reduce((sum, page) => sum + page.lines.length, 0)
        },
        detectedFields,
        structure: structure.map(page => ({
          page_index: page.page_index,
          dimensions: { width: page.width, height: page.height },
          textItemCount: page.items.length,
          lineCount: page.lines.length,
          sampleText: page.textContent.substring(0, 200) + '...'
        }))
      };

      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Results saved to: ${outputPath}`);

    } else {
      console.log('⚠️  No fields detected. This could mean:');
      console.log('   - The PDF has no fillable form fields');
      console.log('   - The PDF structure is complex and needs pattern refinement');
      console.log('   - The AI model needs better prompting for this specific form type');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testCoordinateDetection().catch(console.error);
}

module.exports = { testCoordinateDetection };
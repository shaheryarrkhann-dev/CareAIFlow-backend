/**
 * Simple test to verify pdfjs-dist import is working correctly
 */

async function testPdfjsImport() {
  try {
    console.log('🧪 Testing pdfjs-dist import...');
    
    // Test the import using dynamic import for ES modules
    const pdfjsLib = await import('pdfjs-dist');
    console.log('✅ pdfjs-dist imported successfully');
    console.log('📦 Version:', pdfjsLib.version || 'Version info not available');
    
    // Disable worker for Node.js
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = null;
      console.log('✅ Worker disabled for Node.js environment');
    }
    console.log('✅ Worker disabled for Node.js environment');
    
    // Test getDocument function exists
    if (typeof pdfjsLib.getDocument === 'function') {
      console.log('✅ getDocument function is available');
    } else {
      console.log('❌ getDocument function not found');
      return false;
    }
    
    // Test with a minimal PDF buffer (if available)
    const fs = require('fs');
    const path = require('path');
    
    // Look for any PDF file to test with
    const testFiles = ['./sample-form.pdf', './test.pdf', './example.pdf'];
    let testFile = null;
    
    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        testFile = file;
        break;
      }
    }
    
    if (testFile) {
      console.log(`📄 Testing with: ${testFile}`);
      const pdfBuffer = fs.readFileSync(testFile);
      
      const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
      console.log(`✅ PDF loaded successfully: ${pdf.numPages} pages`);
      
      // Test getting a page
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      console.log(`✅ Page 1 loaded: ${viewport.width}x${viewport.height} points`);
      
      // Test getting text content
      const textContent = await page.getTextContent();
      console.log(`✅ Text content extracted: ${textContent.items.length} text items`);
      
      console.log('\n🎉 All tests passed! pdfjs-dist is working correctly.');
      return true;
      
    } else {
      console.log('⚠️  No test PDF found, but import is working');
      console.log('   Place a PDF file (sample-form.pdf, test.pdf, or example.pdf) to test full functionality');
      return true;
    }
    
  } catch (error) {
    console.error('❌ pdfjs-dist test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testPdfjsImport().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });
}

module.exports = { testPdfjsImport };
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function testPositions(pdfPath) {
  try {
    // Load your PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const page = pages[0];
    
    const pageHeight = page.getHeight();
    const pageWidth = page.getWidth();
    
    console.log(`\n📄 PDF: ${pdfPath}`);
    console.log(`   Page Size: ${pageWidth} x ${pageHeight} points`);
    console.log(`   Page Size: ${(pageWidth/72).toFixed(2)} x ${(pageHeight/72).toFixed(2)} inches\n`);
    
    // Test positions - draw sample text to visualize
    const testFields = [
      { text: 'Field 1 (Top-Left)', x: 50, y: 50 },
      { text: 'Field 2 (Top-Center)', x: pageWidth/2 - 50, y: 50 },
      { text: 'Field 3 (Top-Right)', x: pageWidth - 200, y: 50 },
      { text: 'Field 4 (Middle)', x: 50, y: pageHeight/2 },
      { text: 'Field 5 (Bottom)', x: 50, y: pageHeight - 100 }
    ];
    
    testFields.forEach(field => {
      const yCoord = pageHeight - field.y - 20; // Convert to PDF coordinates
      page.drawText(field.text, {
        x: field.x,
        y: yCoord,
        size: 10,
        font: font,
        color: rgb(1, 0, 0)
      });
    });
    
    // Save test PDF
    const testBytes = await pdfDoc.save();
    const outputPath = 'test_positions_output.pdf';
    fs.writeFileSync(outputPath, testBytes);
    
    console.log(`✅ Test PDF created: ${outputPath}`);
    console.log('\nSuggested starting positions:');
    testFields.forEach((field, i) => {
      console.log(`   ${i+1}. x: ${field.x}, y: ${field.y}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Usage: node test-pdf-positions.js your-pdf.pdf
const pdfPath = process.argv[2] || 'Disclosure_of_Charges.pdf';
testPositions(pdfPath);


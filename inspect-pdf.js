const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function inspectPdf(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    console.log('\n📄 PDF Information:');
    console.log('='.repeat(60));
    console.log(`File: ${pdfPath}`);
    console.log(`Total Pages: ${pages.length}`);
    console.log('='.repeat(60));
    
    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      console.log(`\n📑 Page ${index}:`);
      console.log(`   Dimensions: ${width} x ${height} points`);
      console.log(`   Dimensions: ${(width/72).toFixed(2)} x ${(height/72).toFixed(2)} inches`);
      
      console.log('\n   Common Field Positions (for your reference):');
      console.log('   ┌────────────────────────────────────────────┐');
      console.log(`   │ Top-left:      x: 50,    y: 50             │`);
      console.log(`   │ Top-center:    x: ${Math.round(width/2-100)}, y: 50             │`);
      console.log(`   │ Top-right:     x: ${Math.round(width-250)}, y: 50             │`);
      console.log(`   │ Middle-left:   x: 50,    y: ${Math.round(height/2)}           │`);
      console.log(`   │ Bottom-left:   x: 50,    y: ${Math.round(height-100)}           │`);
      console.log('   └────────────────────────────────────────────┘');
    });
    
    console.log('\n💡 Tip: Use these positions as a starting point for your fieldMapping\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

const pdfPath = process.argv[2] || 'Disclosure_of_Charges.pdf';
inspectPdf(pdfPath);


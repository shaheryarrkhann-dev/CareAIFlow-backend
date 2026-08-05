# Field Position Helper Tool

This guide helps you determine the exact coordinates for PDF field positions.

---

## Method 1: Interactive PDF Inspector (Recommended)

Create a simple Node.js script to inspect your PDF:

### `inspect-pdf.js`

```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function inspectPdf(pdfPath) {
  try {
    // Load the PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    console.log('\n📄 PDF Information:');
    console.log('='.repeat(50));
    console.log(`Total Pages: ${pages.length}`);
    console.log('='.repeat(50));
    
    // Inspect each page
    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      console.log(`\nPage ${index}:`);
      console.log(`  Width:  ${width} points (${(width / 72).toFixed(2)} inches)`);
      console.log(`  Height: ${height} points (${(height / 72).toFixed(2)} inches)`);
      
      // Common positions for this page
      console.log('\n  Common Positions:');
      console.log('  ┌─────────────────────────────────────────────┐');
      console.log(`  │ Top-left:     x: 50,  y: 50                 │`);
      console.log(`  │ Top-center:   x: ${Math.round(width/2 - 100)}, y: 50                 │`);
      console.log(`  │ Top-right:    x: ${width - 250}, y: 50                 │`);
      console.log(`  │ Middle-left:  x: 50,  y: ${Math.round(height/2)}                │`);
      console.log(`  │ Middle-center:x: ${Math.round(width/2 - 100)}, y: ${Math.round(height/2)}                │`);
      console.log(`  │ Bottom-left:  x: 50,  y: ${height - 70}                │`);
      console.log('  └─────────────────────────────────────────────┘');
    });
    
    console.log('\n✅ Inspection complete!');
    
  } catch (error) {
    console.error('❌ Error inspecting PDF:', error.message);
  }
}

// Usage
const pdfPath = process.argv[2];
if (!pdfPath) {
  console.log('Usage: node inspect-pdf.js <path-to-pdf>');
  process.exit(1);
}

inspectPdf(pdfPath);
```

### How to Use:

```bash
node inspect-pdf.js employee_form.pdf
```

**Output Example:**
```
📄 PDF Information:
==================================================
Total Pages: 2
==================================================

Page 0:
  Width:  612 points (8.50 inches)
  Height: 792 points (11.00 inches)

  Common Positions:
  ┌─────────────────────────────────────────────┐
  │ Top-left:     x: 50,  y: 50                 │
  │ Top-center:   x: 206, y: 50                 │
  │ Top-right:    x: 362, y: 50                 │
  │ Middle-left:  x: 50,  y: 396                │
  │ Middle-center:x: 206, y: 396                │
  │ Bottom-left:  x: 50,  y: 722                │
  └─────────────────────────────────────────────┘
```

---

## Method 2: Visual Field Mapper

Create a tool that adds visual guides to your PDF:

### `map-fields.js`

```javascript
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function createFieldMap(inputPath, outputPath, fields) {
  try {
    // Load PDF
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    
    // Draw rectangles for each field
    for (const field of fields) {
      const page = pages[field.page];
      const pageHeight = page.getHeight();
      
      // Convert Y coordinate (from top to bottom-left origin)
      const yCoord = pageHeight - field.y - field.height;
      
      // Draw rectangle border
      page.drawRectangle({
        x: field.x,
        y: yCoord,
        width: field.width,
        height: field.height,
        borderColor: rgb(1, 0, 0),
        borderWidth: 2,
      });
      
      // Draw field name label
      page.drawText(field.fieldName, {
        x: field.x,
        y: yCoord + field.height + 5,
        size: 8,
        font: font,
        color: rgb(1, 0, 0),
      });
    }
    
    // Save mapped PDF
    const mappedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, mappedPdfBytes);
    
    console.log(`✅ Field map created: ${outputPath}`);
    console.log('   Review the PDF to verify field positions.');
    
  } catch (error) {
    console.error('❌ Error creating field map:', error.message);
  }
}

// Example usage
const fields = [
  {
    fieldName: 'employee_name',
    page: 0,
    x: 100,
    y: 200,
    width: 200,
    height: 20
  },
  {
    fieldName: 'department',
    page: 0,
    x: 100,
    y: 250,
    width: 150,
    height: 20
  }
];

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'mapped_' + inputPath;

if (!inputPath) {
  console.log('Usage: node map-fields.js <input-pdf> [output-pdf]');
  console.log('Edit the fields array in this script first!');
  process.exit(1);
}

createFieldMap(inputPath, outputPath, fields);
```

### How to Use:

1. Edit the `fields` array in the script
2. Run: `node map-fields.js employee_form.pdf mapped_form.pdf`
3. Open `mapped_form.pdf` to see red rectangles showing field positions
4. Adjust coordinates as needed and repeat

---

## Method 3: Trial PDF Fill Test

Test your field positions quickly:

### `test-fill.js`

```javascript
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function testFill(pdfPath, fieldMapping, testData) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    
    // Fill each field
    for (const field of fieldMapping) {
      const value = testData[field.fieldName];
      if (!value) continue;
      
      const page = pages[field.page];
      const pageHeight = page.getHeight();
      const yCoord = pageHeight - field.y - field.height;
      
      page.drawText(String(value), {
        x: field.x,
        y: yCoord,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: field.width
      });
    }
    
    // Save test PDF
    const filledBytes = await pdfDoc.save();
    const outputPath = 'test_filled_' + pdfPath;
    fs.writeFileSync(outputPath, filledBytes);
    
    console.log(`✅ Test PDF created: ${outputPath}`);
    console.log('   Review and adjust field positions as needed.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test data
const fieldMapping = [
  {
    fieldName: 'employee_name',
    page: 0,
    x: 100,
    y: 200,
    width: 200,
    height: 20
  },
  {
    fieldName: 'department',
    page: 0,
    x: 100,
    y: 250,
    width: 150,
    height: 20
  }
];

const testData = {
  employee_name: 'John Doe',
  department: 'Engineering'
};

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.log('Usage: node test-fill.js <pdf-path>');
  process.exit(1);
}

testFill(pdfPath, fieldMapping, testData);
```

---

## Method 4: Using Adobe Acrobat

1. Open PDF in Adobe Acrobat
2. Go to **View → Show/Hide → Rulers & Grids → Ruler**
3. Hover over the location where you want a field
4. Note the coordinates from the ruler
5. Remember: Adobe shows coordinates from bottom-left, our API uses top-left

**Conversion Formula:**
```
Our Y = PageHeight - Adobe_Y - FieldHeight
```

---

## Method 5: Online PDF Coordinate Finder

Use online tools:
1. **PDF-Lib Playground**: https://pdf-lib.js.org/
2. **PDFescape**: https://www.pdfescape.com/
3. **Sejda**: https://www.sejda.com/pdf-editor

---

## Field Position Template Generator

Automatically generate field mapping JSON:

### `generate-mapping.js`

```javascript
// Define your fields with human-readable positions
const fieldDefinitions = [
  { name: 'employee_name', label: 'Employee Name', section: 'top-left' },
  { name: 'department', label: 'Department', section: 'top-center' },
  { name: 'joining_date', label: 'Joining Date', section: 'top-right' },
  { name: 'salary', label: 'Salary', section: 'middle-left' },
  { name: 'manager', label: 'Manager', section: 'middle-center' },
];

// Define section coordinates
const sections = {
  'top-left': { x: 50, y: 50 },
  'top-center': { x: 206, y: 50 },
  'top-right': { x: 362, y: 50 },
  'middle-left': { x: 50, y: 200 },
  'middle-center': { x: 206, y: 200 },
  'middle-right': { x: 362, y: 200 },
  'bottom-left': { x: 50, y: 700 },
  'bottom-center': { x: 206, y: 700 },
  'bottom-right': { x: 362, y: 700 },
};

function generateMapping(fields, pageSize = { width: 612, height: 792 }) {
  const mapping = fields.map((field, index) => {
    const section = sections[field.section];
    return {
      fieldName: field.name,
      page: 0,
      x: section.x,
      y: section.y + (index * 30), // Stack fields vertically
      width: 200,
      height: 20,
      type: 'text'
    };
  });
  
  console.log(JSON.stringify(mapping, null, 2));
  return mapping;
}

generateMapping(fieldDefinitions);
```

**Output:**
```json
[
  {
    "fieldName": "employee_name",
    "page": 0,
    "x": 50,
    "y": 50,
    "width": 200,
    "height": 20,
    "type": "text"
  },
  {
    "fieldName": "department",
    "page": 0,
    "x": 206,
    "y": 80,
    "width": 200,
    "height": 20,
    "type": "text"
  }
]
```

---

## Common PDF Dimensions

| Page Size | Width (pts) | Height (pts) | Width (in) | Height (in) |
|-----------|-------------|--------------|------------|-------------|
| Letter | 612 | 792 | 8.5 | 11 |
| Legal | 612 | 1008 | 8.5 | 14 |
| A4 | 595 | 842 | 8.27 | 11.69 |
| A3 | 842 | 1191 | 11.69 | 16.54 |

---

## Field Size Guidelines

| Field Type | Recommended Width | Recommended Height |
|------------|-------------------|-------------------|
| Short text | 100-150 pts | 20 pts |
| Long text | 200-300 pts | 20 pts |
| Checkbox | 15-20 pts | 15-20 pts |
| Date | 100-120 pts | 20 pts |
| Number | 80-100 pts | 20 pts |
| Multi-line | 300+ pts | 60+ pts |

---

## Best Practices

1. **Start with a Grid System**
   - Divide page into sections
   - Use consistent spacing (e.g., 30 pts between fields)

2. **Leave Margins**
   - Minimum 50 pts from edges
   - Prevents text from being cut off

3. **Test Incrementally**
   - Test one field at a time
   - Verify before adding more fields

4. **Document Coordinates**
   - Keep notes on field positions
   - Makes updates easier later

5. **Use Consistent Sizing**
   - Same height for all fields in a section
   - Aligns better visually

---

## Quick Start Command

```bash
# Install dependencies
npm install pdf-lib

# Create test script
cat > test-positions.js << 'EOF'
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function test() {
  const pdf = await PDFDocument.load(fs.readFileSync('your-form.pdf'));
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  
  // Test position
  page.drawText('TEST', {
    x: 100,
    y: page.getHeight() - 200,
    size: 12,
    font,
    color: rgb(1, 0, 0)
  });
  
  fs.writeFileSync('test-output.pdf', await pdf.save());
  console.log('✅ Created test-output.pdf');
}

test();
EOF

# Run test
node test-positions.js
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Text appears off-page | Y coordinate too large | Reduce Y value |
| Text too high | Y coordinate too small | Increase Y value |
| Text cut off | Width too small | Increase width value |
| Wrong page | Incorrect page index | Verify page number (0-based) |
| Overlapping text | Fields too close | Increase spacing between Y values |

---

## Summary

The easiest workflow:
1. Use `inspect-pdf.js` to get page dimensions
2. Use `map-fields.js` to visualize positions
3. Use `test-fill.js` to test actual filling
4. Adjust coordinates and repeat
5. Use final coordinates in API upload

Remember: **Y coordinate in our API is from TOP** (more intuitive), but PDF internally uses bottom-left origin (we handle the conversion).


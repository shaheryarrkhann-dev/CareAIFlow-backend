# PDF Filling System - Quick Reference

## Quick Start

### 1. Upload PDF Template with Field Positions

```bash
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@employee_form.pdf" \
  -F 'fieldMapping=[
    {
      "fieldName": "employee_name",
      "page": 0,
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 20,
      "type": "text"
    },
    {
      "fieldName": "department",
      "page": 0,
      "x": 100,
      "y": 250,
      "width": 150,
      "height": 20,
      "type": "text"
    }
  ]' \
  -F "displayName=Employee Form"
```

### 2. View All Templates

```bash
curl -X GET http://localhost:4000/api/embeddings/templates \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Submit Form (Auto-fills ALL PDFs)

```bash
curl -X POST http://localhost:4000/api/forms/{formId}/submit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "Engineering"
  }'
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/embeddings/upload` | Upload PDF template with field mappings |
| GET | `/api/embeddings/templates` | Get all templates for tenant |
| GET | `/api/pdfs/templates/:id` | Get specific template details |
| POST | `/api/forms/:formId/submit` | Submit form (auto-fills ALL PDFs) |
| POST | `/api/pdfs/fill/:templateId` | Fill specific template |
| POST | `/api/pdfs/fill-all` | Fill all templates manually |

---

## Field Mapping Template

```json
[
  {
    "fieldName": "field_name_in_form_schema",
    "page": 0,
    "x": 100,
    "y": 200,
    "width": 200,
    "height": 20,
    "type": "text"
  }
]
```

**Field Types:** `text`, `number`, `date`, `checkbox`, `dropdown`, `textarea`

---

## S3 Directory Structure

```
tenant-id/
├── timestamp_template.pdf              # Original template
└── users/
    └── user-id/
        └── filled-pdfs/
            └── timestamp_filled_template.pdf   # Filled PDF
```

---

## Coordinate System

- **X**: Distance from left edge (in points)
- **Y**: Distance from top edge (in points)
- 1 point = 1/72 inch
- Standard letter page: 612 x 792 points

---

## Common Field Positions (Letter Size PDF)

| Location | X | Y | Width | Height |
|----------|---|---|-------|--------|
| Top-left | 50 | 50 | 200 | 20 |
| Top-center | 206 | 50 | 200 | 20 |
| Top-right | 362 | 50 | 200 | 20 |
| Middle-left | 50 | 386 | 200 | 20 |
| Bottom-left | 50 | 722 | 200 | 20 |

---

## Workflow Summary

### Admin Setup (One-time)
1. Upload all 40 PDF templates with field mappings
2. Verify templates are stored correctly

### User Form Submission (Recurring)
1. User fills out form
2. User submits form
3. **System automatically fills all 40 PDFs**
4. Filled PDFs saved in S3 under user's directory
5. User receives URLs to download filled PDFs

---

## Example: Complete Template Upload

**JavaScript/Node.js:**
```javascript
const FormData = require('form-data');
const fs = require('fs');

const form = new FormData();
form.append('file', fs.createReadStream('employee_form.pdf'));
form.append('fieldMapping', JSON.stringify([
  {
    fieldName: 'employee_name',
    page: 0,
    x: 100,
    y: 200,
    width: 200,
    height: 20,
    type: 'text'
  }
]));
form.append('displayName', 'Employee Form');

fetch('http://localhost:4000/api/embeddings/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    ...form.getHeaders()
  },
  body: form
});
```

**Python:**
```python
import requests

files = {
    'file': open('employee_form.pdf', 'rb')
}

data = {
    'fieldMapping': '[{"fieldName":"employee_name","page":0,"x":100,"y":200,"width":200,"height":20,"type":"text"}]',
    'displayName': 'Employee Form'
}

headers = {
    'Authorization': 'Bearer YOUR_TOKEN'
}

response = requests.post(
    'http://localhost:4000/api/embeddings/upload',
    files=files,
    data=data,
    headers=headers
)
```

---

## Troubleshooting Quick Tips

| Issue | Solution |
|-------|----------|
| Fields not appearing | Check coordinates are within page bounds |
| Text cut off | Increase width or reduce font size |
| Wrong page | Verify page index (0-based) |
| Field names don't match | Ensure fieldName matches form schema exactly |
| PDFs not generating | Check template has fieldMapping defined |

---

## Performance Notes

- **Time per PDF:** ~1-2 seconds
- **40 PDFs:** ~40-80 seconds total
- **Recommendation:** Use background jobs for production
- **Storage:** ~100KB - 5MB per filled PDF

---

## Key Features

✅ **Automatic PDF Generation** - Fills all PDFs on form submit  
✅ **User Isolation** - Each user has their own directory  
✅ **Tenant Isolation** - Complete data separation  
✅ **Multiple Templates** - Support for 40+ PDFs per tenant  
✅ **Flexible Field Types** - Text, numbers, dates, checkboxes  
✅ **S3 Storage** - Secure, scalable cloud storage  
✅ **Encrypted** - AES256 server-side encryption  

---

## Next Steps

1. Run `npx prisma generate` to regenerate Prisma client
2. Restart your development server
3. Upload PDF templates with field mappings
4. Test form submission
5. Verify filled PDFs in S3

---

## File Changes Summary

**New Files:**
- `src/services/pdf.service.js` - PDF filling logic
- `src/controllers/pdf.controller.js` - PDF API controllers
- `src/routes/pdf.routes.js` - PDF routes
- `prisma/migrations/20251015000000_add_pdf_templates/` - Database migration

**Modified Files:**
- `prisma/schema.prisma` - Added PdfTemplate model
- `src/utils/s3.util.js` - Added download and user-specific upload
- `src/services/embedding.service.js` - Store templates on upload
- `src/controllers/embedding.controller.js` - Accept field mappings
- `src/controllers/form.controller.js` - Auto-fill PDFs on submit
- `src/routes/embedding.routes.js` - Added templates endpoint
- `src/app.js` - Registered PDF routes
- `package.json` - Added pdf-lib dependency

---

## Support

For detailed documentation, see: `PDF_FILLING_GUIDE.md`


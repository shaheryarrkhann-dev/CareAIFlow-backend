# AI-Powered RAG Forms System - Complete Guide

## Overview
This system implements a tenant-aware RAG (Retrieval-Augmented Generation) solution where:
1. Tenants upload PDF documents containing form templates
2. AI analyzes the embedded text and generates dynamic form schemas
3. Staff fill out these forms, with data stored in dynamically created tenant-specific tables
4. Complete tenant isolation at every layer

---

## Architecture

### Data Flow
```
PDF Upload → Text Extraction → Embeddings (pgvector) 
    ↓
OpenAI Analysis → Dynamic Schema Generation → Store in tenant_form_schemas
    ↓
Staff Opens Form → Renders Dynamic Fields
    ↓
Form Submission → Create tenant_<tenantId>_form_<formId> table → Store data
```

### Database Tables

#### 1. `pdf_embeddings` (pgvector)
- Stores chunked PDF content with vector embeddings
- Isolated by `tenant_id`
- Used for RAG context retrieval

#### 2. `tenant_form_schemas`
- Stores AI-generated form schemas (JSON)
- Each tenant has their own schemas
- Schema format:
```json
{
  "form_name": "Employee Information",
  "description": "New hire data collection",
  "fields": [
    {
      "label": "Employee Name",
      "name": "employee_name",
      "type": "text",
      "required": true,
      "placeholder": "Enter full name"
    },
    {
      "label": "Department",
      "name": "department",
      "type": "dropdown",
      "required": true,
      "options": ["HR", "IT", "Finance", "Operations"]
    },
    {
      "label": "Joining Date",
      "name": "joining_date",
      "type": "date",
      "required": false
    }
  ]
}
```

#### 3. Dynamic Tables: `tenant_<tenantId>_form_<formId>`
- Created automatically on first form submission
- Columns based on schema fields
- Always includes: `id`, `tenant_id`, `user_id`, `form_id`, `created_at`, `updated_at`
- Example: `tenant_a1b2c3_form_d4e5f6`

---

## API Endpoints

### 1. Upload PDF (Existing)
```http
POST /api/embeddings/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <pdf_file>
tenantId: <uuid> (optional, SUPER_ADMIN only)
```

### 2. Generate Form Schema
```http
POST /api/forms/generate-schema
Authorization: Bearer <token>
Content-Type: application/json

{
  "formName": "Employee Onboarding Form",
  "description": "Collect new hire information",
  "tenantId": "<uuid>" // optional, SUPER_ADMIN only
}
```

**Response:**
```json
{
  "success": true,
  "message": "Form schema generated successfully",
  "formSchema": {
    "id": "schema-uuid",
    "schema": { /* AI-generated schema */ },
    "createdAt": "2025-10-12T..."
  }
}
```

### 3. Get All Form Schemas
```http
GET /api/forms/schemas?activeOnly=true&tenantId=<uuid>
Authorization: Bearer <token>
```

### 4. Get Single Schema
```http
GET /api/forms/schemas/:id?tenantId=<uuid>
Authorization: Bearer <token>
```

### 5. Submit Form Data
```http
POST /api/forms/:formId/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "employee_name": "John Doe",
  "department": "IT",
  "joining_date": "2025-01-15",
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "submissionId": "submission-uuid",
  "tableName": "tenant_a1b2c3_form_d4e5f6"
}
```

### 6. Get Form Responses
```http
GET /api/forms/:formId/responses?limit=100&offset=0&tenantId=<uuid>
Authorization: Bearer <token>
```

**Access Control:**
- `STAFF`/`GUARDIAN`: See only their own submissions
- `ADMIN`/`SUPER_ADMIN`: See all submissions for tenant

### 7. Get Table Schema (Admin Only)
```http
GET /api/forms/:formId/table-schema?tenantId=<uuid>
Authorization: Bearer <token>
```

---

## Environment Variables

Add these to your `.env`:

```env
# Existing vars...
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
JWT_ACCESS_SECRET="your-secret"
JWT_REFRESH_SECRET="your-secret"

# OpenAI for RAG
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"  # or gpt-4-turbo
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"  # 1536 dimensions

# AWS S3 for PDF Storage
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
S3_BUCKET_NAME=pdf-storage-project
```

---

## Usage Workflow

### Step 1: Upload PDFs
```bash
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@employee_form_template.pdf"
```

### Step 2: Generate Form Schema
```bash
curl -X POST http://localhost:4000/api/forms/generate-schema \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "formName": "Employee Onboarding",
    "description": "New hire information collection"
  }'
```

### Step 3: Get Schema ID
```bash
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"
```

### Step 4: Staff Submits Form
```bash
curl -X POST http://localhost:4000/api/forms/<schema-id>/submit \
  -H "Authorization: Bearer <staff-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "Jane Smith",
    "department": "HR",
    "joining_date": "2025-02-01"
  }'
```

### Step 5: Admin Views Responses
```bash
curl -X GET http://localhost:4000/api/forms/<schema-id>/responses \
  -H "Authorization: Bearer <admin-token>"
```

---

## Security & Isolation

### Tenant Isolation Layers

1. **Embeddings**: `tenantId` column in `pdf_embeddings`
2. **Schemas**: `tenantId` in `tenant_form_schemas`
3. **Form Data**: 
   - Separate table per tenant+form
   - `tenant_id` column enforced
   - Middleware validates access

### Access Control

| Role | Upload PDF | Generate Schema | View Schemas | Submit Form | View Own Responses | View All Responses |
|------|-----------|-----------------|--------------|-------------|-------------------|-------------------|
| STAFF | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ |
| GUARDIAN | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ |
| ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (own tenant) |
| SUPER_ADMIN | ✓ | ✓ | ✓ (all) | ✓ | ✓ | ✓ (all tenants) |

---

## Migration & Setup

### 1. Run Migrations
```bash
# Generate Prisma client
npm run prisma:generate

# Apply migrations (creates tenant_form_schemas table)
npm run prisma:migrate
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Server
```bash
npm run dev
```

---

## Field Types Supported

| Type | Database Type | HTML Input | Validation |
|------|--------------|------------|-----------|
| `text` | TEXT | `<input type="text">` | maxLength, pattern |
| `number` | NUMERIC | `<input type="number">` | min, max |
| `email` | TEXT | `<input type="email">` | email format |
| `date` | DATE | `<input type="date">` | date range |
| `dropdown` | TEXT | `<select>` | options list |
| `checkbox` | BOOLEAN | `<input type="checkbox">` | true/false |
| `textarea` | TEXT | `<textarea>` | maxLength |

---

## AI Prompt Engineering

The system uses a carefully crafted prompt to ensure consistent schema generation:

```javascript
// System prompt instructs AI to:
// 1. Analyze document content
// 2. Identify form fields
// 3. Determine field types
// 4. Set validation rules
// 5. Return valid JSON only
```

The AI considers:
- Field labels from PDF
- Data types (text, numbers, dates)
- Required vs optional fields
- Dropdown options
- Validation patterns

---

## Example Schema Generated by AI

Input: PDF containing employee onboarding form

Output:
```json
{
  "form_name": "Employee Onboarding Form",
  "description": "Comprehensive new hire data collection",
  "fields": [
    {
      "label": "Full Name",
      "name": "full_name",
      "type": "text",
      "required": true,
      "placeholder": "Enter employee's full legal name"
    },
    {
      "label": "Email Address",
      "name": "email_address",
      "type": "email",
      "required": true,
      "validation": {
        "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
      }
    },
    {
      "label": "Department",
      "name": "department",
      "type": "dropdown",
      "required": true,
      "options": ["Engineering", "Sales", "Marketing", "HR", "Finance"]
    },
    {
      "label": "Start Date",
      "name": "start_date",
      "type": "date",
      "required": true
    },
    {
      "label": "Salary",
      "name": "salary",
      "type": "number",
      "required": false,
      "validation": {
        "min": 0,
        "max": 1000000
      }
    },
    {
      "label": "Remote Worker",
      "name": "remote_worker",
      "type": "checkbox",
      "required": false
    }
  ]
}
```

---

## Dynamic Table Example

After first submission of the above schema, table created:

```sql
CREATE TABLE "tenant_a1b2c3d4_form_e5f6g7h8" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "form_id" TEXT NOT NULL,
  "full_name" TEXT,
  "email_address" TEXT,
  "department" TEXT,
  "start_date" DATE,
  "salary" NUMERIC,
  "remote_worker" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Troubleshooting

### No embeddings found error
**Problem:** AI can't generate schema
**Solution:** Upload PDFs first via `/api/embeddings/upload`

### Table already exists error
**Solution:** Table is created on first submission, this is expected

### Invalid schema structure
**Problem:** AI returned malformed JSON
**Solution:** 
- Check PDF content quality
- Retry with better form description
- Ensure OpenAI API key is valid

### Permission denied
**Problem:** User can't access endpoint
**Solution:** Check role-based access control table above

---

## Testing with Swagger

1. Start server: `npm run dev`
2. Open: http://localhost:4000/api-docs
3. Navigate to "AI-Powered Forms" section
4. Authorize with Bearer token
5. Test endpoints interactively

---

## Production Considerations

1. **Rate Limiting**: Add rate limits to AI generation endpoint
2. **Cost Control**: Monitor OpenAI API usage
3. **Table Limits**: PostgreSQL supports thousands of tables, but monitor
4. **Caching**: Cache schemas to reduce DB queries
5. **Validation**: Add stricter validation for form submissions
6. **Backups**: Ensure dynamic tables are included in backups
7. **Monitoring**: Log AI generation failures and retries

---

## Future Enhancements

- [ ] Export form responses to CSV/Excel
- [ ] Form versioning (schema updates)
- [ ] Conditional fields (show/hide based on other fields)
- [ ] File upload fields
- [ ] Multi-page forms
- [ ] Form analytics dashboard
- [ ] Custom validation rules per tenant
- [ ] Form templates library

---

## Support

For issues or questions:
1. Check Swagger docs: http://localhost:4000/api-docs
2. Review server logs
3. Verify tenant isolation in database
4. Test with Postman/curl examples above


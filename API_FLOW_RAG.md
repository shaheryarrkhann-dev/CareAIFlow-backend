# RAG Forms System - API Flow Examples

## Complete Workflow: From PDF to Form Submission

### Step 1: Login
```bash
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "alirazaarif@yopmail.com",
  "password": "Admin@12345"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "alirazaarif@yopmail.com",
    "role": "ADMIN",
    "tenantId": "tenant-uuid"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Step 2: Upload PDF
```bash
POST http://localhost:4000/api/embeddings/upload
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data

file: @employee_form_template.pdf
```

**Response:**
```json
{
  "success": true,
  "message": "Embeddings stored",
  "chunks": 42
}
```

---

### Step 3: Generate Form Schema (AI)
```bash
POST http://localhost:4000/api/forms/generate-schema
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "formName": "Employee Onboarding Form",
  "description": "Comprehensive new hire information collection form"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Form schema generated successfully",
  "formSchema": {
    "id": "form-schema-uuid",
    "schema": {
      "form_name": "Employee Onboarding Form",
      "description": "Comprehensive new hire information collection form",
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
    },
    "createdAt": "2025-10-12T15:30:00.000Z"
  }
}
```

---

### Step 4: View All Schemas
```bash
GET http://localhost:4000/api/forms/schemas?activeOnly=true
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "schemas": [
    {
      "id": "form-schema-uuid-1",
      "formName": "Employee Onboarding Form",
      "description": "Comprehensive new hire information collection form",
      "schemaJson": { /* full schema */ },
      "isActive": true,
      "createdAt": "2025-10-12T15:30:00.000Z",
      "updatedAt": "2025-10-12T15:30:00.000Z"
    },
    {
      "id": "form-schema-uuid-2",
      "formName": "Benefits Enrollment Form",
      "description": "Employee benefits selection",
      "schemaJson": { /* full schema */ },
      "isActive": true,
      "createdAt": "2025-10-11T10:15:00.000Z",
      "updatedAt": "2025-10-11T10:15:00.000Z"
    }
  ]
}
```

---

### Step 5: Get Single Schema (for rendering form)
```bash
GET http://localhost:4000/api/forms/schemas/form-schema-uuid
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "schema": {
    "id": "form-schema-uuid",
    "tenantId": "tenant-uuid",
    "formName": "Employee Onboarding Form",
    "description": "Comprehensive new hire information collection form",
    "schemaJson": {
      "form_name": "Employee Onboarding Form",
      "fields": [ /* field definitions */ ]
    },
    "isActive": true,
    "createdBy": "admin-user-uuid",
    "createdAt": "2025-10-12T15:30:00.000Z",
    "updatedAt": "2025-10-12T15:30:00.000Z"
  }
}
```

---

### Step 6: Submit Form (as Staff User)
```bash
POST http://localhost:4000/api/forms/form-schema-uuid/submit
Authorization: Bearer <STAFF_USER_TOKEN>
Content-Type: application/json

{
  "full_name": "John Doe",
  "email_address": "john.doe@company.com",
  "department": "Engineering",
  "start_date": "2025-01-15",
  "salary": 95000,
  "remote_worker": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "submissionId": "submission-uuid",
  "tableName": "tenant_a1b2c3d4_form_e5f6g7h8"
}
```

**Note:** On first submission, a dynamic table is created:
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
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);
```

---

### Step 7: View Form Responses (as Admin)
```bash
GET http://localhost:4000/api/forms/form-schema-uuid/responses?limit=50&offset=0
Authorization: Bearer <ADMIN_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "submission-uuid-1",
      "tenant_id": "tenant-uuid",
      "user_id": "staff-user-uuid-1",
      "form_id": "form-schema-uuid",
      "full_name": "John Doe",
      "email_address": "john.doe@company.com",
      "department": "Engineering",
      "start_date": "2025-01-15",
      "salary": 95000,
      "remote_worker": true,
      "created_at": "2025-10-12T16:45:00.000Z",
      "updated_at": "2025-10-12T16:45:00.000Z"
    },
    {
      "id": "submission-uuid-2",
      "tenant_id": "tenant-uuid",
      "user_id": "staff-user-uuid-2",
      "form_id": "form-schema-uuid",
      "full_name": "Jane Smith",
      "email_address": "jane.smith@company.com",
      "department": "HR",
      "start_date": "2025-02-01",
      "salary": 85000,
      "remote_worker": false,
      "created_at": "2025-10-12T17:00:00.000Z",
      "updated_at": "2025-10-12T17:00:00.000Z"
    }
  ],
  "tableName": "tenant_a1b2c3d4_form_e5f6g7h8",
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 15
  }
}
```

---

### Step 8: View Table Schema (Admin Only)
```bash
GET http://localhost:4000/api/forms/form-schema-uuid/table-schema
Authorization: Bearer <ADMIN_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "schema": {
    "tableName": "tenant_a1b2c3d4_form_e5f6g7h8",
    "columns": [
      { "column_name": "id", "data_type": "text", "is_nullable": "NO" },
      { "column_name": "tenant_id", "data_type": "text", "is_nullable": "NO" },
      { "column_name": "user_id", "data_type": "text", "is_nullable": "NO" },
      { "column_name": "form_id", "data_type": "text", "is_nullable": "NO" },
      { "column_name": "full_name", "data_type": "text", "is_nullable": "YES" },
      { "column_name": "email_address", "data_type": "text", "is_nullable": "YES" },
      { "column_name": "department", "data_type": "text", "is_nullable": "YES" },
      { "column_name": "start_date", "data_type": "date", "is_nullable": "YES" },
      { "column_name": "salary", "data_type": "numeric", "is_nullable": "YES" },
      { "column_name": "remote_worker", "data_type": "boolean", "is_nullable": "YES" },
      { "column_name": "created_at", "data_type": "timestamp without time zone", "is_nullable": "NO" },
      { "column_name": "updated_at", "data_type": "timestamp without time zone", "is_nullable": "NO" }
    ]
  }
}
```

---

## Error Responses

### 400 - Missing Required Fields
```json
{
  "success": false,
  "message": "Missing required fields",
  "missingFields": ["full_name", "department"]
}
```

### 401 - Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 - Forbidden (Insufficient Permissions)
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

### 404 - Not Found
```json
{
  "success": false,
  "message": "Form schema not found or access denied"
}
```

### 500 - AI Generation Error
```json
{
  "success": false,
  "message": "No embedded data found for this tenant. Please upload PDFs first."
}
```

---

## Role-Based Access Examples

### STAFF User Flow
1. ✅ Login
2. ✅ View available schemas
3. ✅ Submit form
4. ✅ View own submissions
5. ❌ Cannot generate schemas
6. ❌ Cannot view other users' submissions

### ADMIN User Flow
1. ✅ Login
2. ✅ Upload PDFs
3. ✅ Generate schemas
4. ✅ View all schemas
5. ✅ Submit forms
6. ✅ View ALL submissions for tenant
7. ✅ View table schemas

### SUPER_ADMIN User Flow
1. ✅ All ADMIN capabilities
2. ✅ Can specify `tenantId` in requests
3. ✅ Access any tenant's data
4. ✅ Generate schemas for any tenant

---

## Postman Collection

Import this collection to test all endpoints:

```json
{
  "info": {
    "name": "RAG Forms System",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Login",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\"email\":\"alirazaarif@yopmail.com\",\"password\":\"Admin@12345\"}"
        },
        "url": { "raw": "{{base_url}}/api/auth/login" }
      }
    },
    {
      "name": "2. Upload PDF",
      "request": {
        "method": "POST",
        "header": [{ "key": "Authorization", "value": "Bearer {{access_token}}" }],
        "body": {
          "mode": "formdata",
          "formdata": [{ "key": "file", "type": "file" }]
        },
        "url": { "raw": "{{base_url}}/api/embeddings/upload" }
      }
    },
    {
      "name": "3. Generate Schema",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Authorization", "value": "Bearer {{access_token}}" },
          { "key": "Content-Type", "value": "application/json" }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"formName\":\"Employee Form\",\"description\":\"Test form\"}"
        },
        "url": { "raw": "{{base_url}}/api/forms/generate-schema" }
      }
    },
    {
      "name": "4. Get Schemas",
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{access_token}}" }],
        "url": { "raw": "{{base_url}}/api/forms/schemas" }
      }
    },
    {
      "name": "5. Submit Form",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Authorization", "value": "Bearer {{access_token}}" },
          { "key": "Content-Type", "value": "application/json" }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"field_name\":\"value\"}"
        },
        "url": { "raw": "{{base_url}}/api/forms/{{form_id}}/submit" }
      }
    },
    {
      "name": "6. Get Responses",
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{access_token}}" }],
        "url": { "raw": "{{base_url}}/api/forms/{{form_id}}/responses" }
      }
    }
  ],
  "variable": [
    { "key": "base_url", "value": "http://localhost:4000" },
    { "key": "access_token", "value": "" },
    { "key": "form_id", "value": "" }
  ]
}
```

---

## cURL Examples

### Complete Flow
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alirazaarif@yopmail.com","password":"Admin@12345"}' \
  | jq -r '.accessToken')

# 2. Upload PDF
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@form_template.pdf"

# 3. Generate Schema
FORM_ID=$(curl -s -X POST http://localhost:4000/api/forms/generate-schema \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"formName":"Employee Form","description":"Test"}' \
  | jq -r '.formSchema.id')

# 4. Submit Form
curl -X POST http://localhost:4000/api/forms/$FORM_ID/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field_name":"value","another_field":"value2"}'

# 5. View Responses
curl -X GET "http://localhost:4000/api/forms/$FORM_ID/responses?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

**Happy Testing! 🚀**


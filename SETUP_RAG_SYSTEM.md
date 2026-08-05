# RAG Forms System - Quick Setup

## Prerequisites
- Node.js 16+ installed
- Docker Desktop installed and running
- OpenAI API key

---

## Step 1: Start pgvector Database

### Option A: Docker (Recommended)
```powershell
# Remove old container if exists
docker rm -f pgvector-db

# Start pgvector Postgres on port 5433
docker run --name pgvector-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=test_project \
  -p 5433:5432 \
  -d pgvector/pgvector:pg16

# Wait for container to be ready (10 seconds)
Start-Sleep -Seconds 10

# Create vector extension
docker exec -it pgvector-db psql -U postgres -d test_project -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Verify
docker ps
docker exec -it pgvector-db psql -U postgres -d test_project -c "\dx"
```

### Option B: Native PostgreSQL (if pgvector already installed)
```powershell
# Just ensure extension is enabled
psql "postgresql://postgres:your_password@localhost:5432/test_project" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## Step 2: Configure Environment

Create or update `.env` file:

```env
# Database (use Docker container on port 5433)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/test_project?schema=public"

# JWT Secrets
JWT_ACCESS_SECRET="your-super-secret-access-key-change-this"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this"

# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# OpenAI for RAG
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

# AWS S3 for PDF Storage
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
S3_BUCKET_NAME=pdf-storage-project

# Email (optional for password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourapp.com
```

---

## Step 3: Install Dependencies

```powershell
npm install
```

---

## Step 4: Run Migrations

```powershell
# Generate Prisma Client
npm run prisma:generate

# Apply all migrations (creates all tables including tenant_form_schemas)
npm run prisma:migrate

# Seed database with test data (optional)
npm run prisma:seed
```

---

## Step 5: Start Server

```powershell
npm run dev
```

Expected output:
```
✅ Database connected successfully

🚀 Server running on http://localhost:4000
📝 Environment: development

📚 API Endpoints:
   POST   /api/auth/login
   ...
   
🧠 Embeddings:
   POST   /api/embeddings/upload (Authenticated)
   
📋 AI-Powered Forms (RAG):
   POST   /api/forms/generate-schema (ADMIN/SUPER_ADMIN)
   GET    /api/forms/schemas (List form schemas)
   GET    /api/forms/schemas/:id (Get schema)
   POST   /api/forms/:formId/submit (Submit form)
   GET    /api/forms/:formId/responses (View responses)

📖 Swagger Documentation: http://localhost:4000/api-docs
```

---

## Step 6: Test the System

### 6.1 Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alirazaarif@yopmail.com",
    "password": "Admin@12345"
  }'
```

Save the `accessToken` from response.

### 6.2 Upload PDF
```bash
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@your_form_template.pdf"
```

### 6.3 Generate Form Schema
```bash
curl -X POST http://localhost:4000/api/forms/generate-schema \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "formName": "Employee Onboarding Form",
    "description": "New hire information collection"
  }'
```

Save the `formSchema.id` from response.

### 6.4 View Generated Schema
```bash
curl -X GET http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 6.5 Submit Form (as Staff)
```bash
curl -X POST http://localhost:4000/api/forms/SCHEMA_ID/submit \
  -H "Authorization: Bearer STAFF_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "IT",
    "joining_date": "2025-01-15"
  }'
```

### 6.6 View Responses (as Admin)
```bash
curl -X GET http://localhost:4000/api/forms/SCHEMA_ID/responses \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

---

## Step 7: Explore Swagger UI

Open browser: http://localhost:4000/api-docs

1. Click **Authorize** button
2. Enter: `Bearer YOUR_ACCESS_TOKEN`
3. Navigate to **AI-Powered Forms** section
4. Try endpoints interactively

---

## Verify Database Tables

```powershell
# Connect to database
docker exec -it pgvector-db psql -U postgres -d test_project

# List tables
\dt

# Should see:
# - tenants
# - users
# - pdf_embeddings
# - tenant_form_schemas
# - tenant_<id>_form_<id> (after first submission)

# View form schemas
SELECT id, "formName", "tenantId", "isActive", "createdAt" FROM tenant_form_schemas;

# View embeddings
SELECT id, "tenantId", "fileName", "createdAt" FROM pdf_embeddings;

# Exit
\q
```

---

## Troubleshooting

### Docker not starting
```powershell
# Check Docker status
docker version
docker info

# Restart Docker Desktop
net stop com.docker.service
net start com.docker.service
```

### Container errors
```powershell
# View logs
docker logs pgvector-db

# Restart container
docker restart pgvector-db
```

### Migration errors
```powershell
# Reset database (WARNING: deletes all data)
npm run prisma:migrate reset

# Or manually drop and recreate
docker exec -it pgvector-db psql -U postgres -c "DROP DATABASE test_project;"
docker exec -it pgvector-db psql -U postgres -c "CREATE DATABASE test_project;"
docker exec -it pgvector-db psql -U postgres -d test_project -c "CREATE EXTENSION vector;"
npm run prisma:migrate
```

### OpenAI errors
- Verify `OPENAI_API_KEY` in `.env`
- Check API key has credits: https://platform.openai.com/usage
- Try different model: `gpt-4-turbo` or `gpt-3.5-turbo`

### No embeddings found
- Upload PDFs first via `/api/embeddings/upload`
- Check embeddings exist:
  ```sql
  SELECT COUNT(*) FROM pdf_embeddings WHERE "tenantId" = 'YOUR_TENANT_ID';
  ```

---

## Production Deployment

### Environment Variables
```env
NODE_ENV=production
DATABASE_URL="postgresql://user:password@prod-host:5432/dbname"
OPENAI_API_KEY="sk-prod-..."
```

### Run Migrations
```bash
npx prisma migrate deploy
```

### Start Server
```bash
npm start
```

### Monitor
- Set up logging (Winston, Morgan)
- Monitor OpenAI API costs
- Track table creation (dynamic tables)
- Set up database backups

---

## Files Created

### New Services
- `src/services/ai.service.js` - OpenAI integration, schema generation
- `src/services/formData.service.js` - Dynamic table creation, data storage

### New Controllers
- `src/controllers/form.controller.js` - Form schema and submission handling

### New Routes
- `src/routes/form.routes.js` - Form API endpoints

### Documentation
- `src/docs/form.docs.js` - Swagger documentation
- `RAG_FORMS_GUIDE.md` - Complete usage guide
- `SETUP_RAG_SYSTEM.md` - This file

### Database
- `prisma/schema.prisma` - Added `FormSchema` model
- Migration: `tenant_form_schemas` table
- Dynamic tables: `tenant_*_form_*` (created on demand)

---

## Next Steps

1. ✅ Setup database with pgvector
2. ✅ Run migrations
3. ✅ Test PDF upload
4. ✅ Test schema generation
5. ✅ Test form submission
6. 📝 Build frontend UI to render dynamic forms
7. 📝 Add form validation on frontend
8. 📝 Create admin dashboard for viewing responses
9. 📝 Add export to CSV/Excel
10. 📝 Implement form versioning

---

## Support

Documentation:
- API Examples: See `API_EXAMPLES.md`
- RAG Guide: See `RAG_FORMS_GUIDE.md`
- Swagger: http://localhost:4000/api-docs

Issues:
- Check server logs for errors
- Verify database connection
- Test with Postman/curl
- Review Prisma Studio: `npm run prisma:studio`


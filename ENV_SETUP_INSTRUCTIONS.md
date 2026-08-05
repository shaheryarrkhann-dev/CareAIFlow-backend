# 🚀 Environment Setup Instructions for New Laptop

## Step 1: Create `.env` File

Create a file named `.env` in the root directory with the following content:

```env
# ========================================
# APP CONFIGURATION
# ========================================
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ========================================
# JWT SECRETS - CHANGE THESE!
# ========================================
JWT_ACCESS_SECRET=your_super_secret_access_key_at_least_32_characters_long_change_me
JWT_REFRESH_SECRET=your_super_secret_refresh_key_at_least_32_characters_long_change_me
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d
JWT_RESET_PASSWORD_EXPIRES=1h

# ========================================
# DATABASE (PostgreSQL with pgvector)
# ========================================
# Replace with your actual credentials:
# DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME"
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/ai_onboarding_platform"

# ========================================
# OPENAI (Required for AI/RAG features)
# ========================================
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# ========================================
# AWS S3 (Required for PDF Storage)
# ========================================
# Get credentials from AWS IAM Console
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key-here
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-s3-bucket-name-here

# ========================================
# EMAIL CONFIGURATION (Optional - Can skip for now)
# ========================================
# For Gmail: Generate App Password at https://myaccount.google.com/apppasswords
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=AI Onboarding Platform

# ========================================
# RATE LIMITING
# ========================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX_REQUESTS=5
```

## Step 2: Update Required Variables

### **MUST UPDATE:**

1. **DATABASE_URL**: Replace `YOUR_PASSWORD` with your PostgreSQL password
   ```
   DATABASE_URL="postgresql://postgres:MyPassword123@localhost:5432/ai_onboarding_platform"
   ```

2. **JWT_ACCESS_SECRET** & **JWT_REFRESH_SECRET**: Generate strong random strings (at least 32 characters)
   - You can use: https://generate-random.org/api-key-generator
   - Or run in PowerShell: `[System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((New-Guid).ToString() + (New-Guid).ToString()))`

3. **OPENAI_API_KEY**: Get from https://platform.openai.com/api-keys

4. **AWS S3 Credentials**: Get from AWS IAM Console
   - Or skip for now if you don't have AWS setup yet

### **OPTIONAL (Can skip initially):**
- Email configuration (app will use test email service)

---

## Step 3: Database Setup Options

### Option A: Using pgAdmin (Your Current Setup)

1. **Install PostgreSQL with pgAdmin:**
   - Download from: https://www.postgresql.org/download/windows/
   - During installation, set a password for `postgres` user

2. **Create Database:**
   - Open pgAdmin
   - Right-click "Databases" → "Create" → "Database"
   - Name: `ai_onboarding_platform`
   - Click "Save"

3. **Enable pgvector Extension:**
   - Right-click your database → "Query Tool"
   - Run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - **If this fails**, pgvector is not installed. Use **Option B** below instead.

4. **Update .env:**
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/ai_onboarding_platform"
   ```

### Option B: Using Docker (Recommended - Easier)

If pgvector extension is not available in your PostgreSQL installation:

```powershell
# Install Docker Desktop first: https://www.docker.com/products/docker-desktop

# Start pgvector container
docker run --name ai-onboarding-db `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=ai_onboarding_platform `
  -p 5432:5432 `
  -d pgvector/pgvector:pg16

# Wait 10 seconds for container to start
Start-Sleep -Seconds 10

# Create vector extension
docker exec -it ai-onboarding-db psql -U postgres -d ai_onboarding_platform -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Verify container is running
docker ps
```

**Update .env for Docker:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_onboarding_platform"
```

---

## Step 4: Install Dependencies & Setup Database

```powershell
# Install Node modules
npm install

# Generate Prisma Client
npm run prisma:generate

# Run database migrations (creates all tables)
npm run prisma:migrate

# Seed database with test data
npm run prisma:seed
```

---

## Step 5: Start the Application

```powershell
npm run dev
```

You should see:
```
✅ Database connected successfully
🚀 Server running on http://localhost:4000
📝 Environment: development
```

---

## Step 6: Test the Setup

### Test Health Check:
```powershell
curl http://localhost:4000/health
```

### Test Login with Default Admin:
```powershell
curl -X POST http://localhost:4000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{
    "email": "alirazaarif@yopmail.com",
    "password": "Admin@12345"
  }'
```

### Access Swagger UI:
Open browser: http://localhost:4000/api-docs

---

## Default Test Accounts (After Seeding)

- **Super Admin:**
  - Email: `alirazaarif@yopmail.com`
  - Password: `Admin@12345`

- **Staff User:**
  - Email: `staff@example.com`
  - Password: `Staff@12345`

- **Guardian User:**
  - Email: `guardian@example.com`
  - Password: `Guardian@12345`

---

## Troubleshooting

### Database Connection Failed
- Check PostgreSQL is running (or Docker container)
- Verify password in DATABASE_URL
- Try: `psql -U postgres -d ai_onboarding_platform` to test connection

### pgvector Extension Error
- Use Docker Option B instead
- Or install pgvector manually: https://github.com/pgvector/pgvector

### Prisma Errors
```powershell
# Reset and recreate database
npm run prisma:migrate reset
npm run prisma:migrate
npm run prisma:seed
```

### Port Already in Use
- Change PORT in .env to 4001 or another available port

---

## What This Platform Does

### Core Features:
1. **Multi-Tenant Authentication** - Organizations can manage users
2. **AI-Powered Forms (RAG)** - Upload PDFs, AI generates dynamic forms
3. **PDF Processing** - Fill PDFs with form data
4. **Role-Based Access** - SUPER_ADMIN, ADMIN, STAFF, GUARDIAN
5. **Draft System** - Save partial form submissions

### Tech Stack:
- Node.js + Express
- Prisma ORM + PostgreSQL + pgvector
- OpenAI API (GPT-4 + Embeddings)
- AWS S3 (PDF Storage)
- JWT Authentication

---

## Next Steps After Setup

1. Get OpenAI API key (if you want AI features)
2. Setup AWS S3 bucket (if you want PDF upload)
3. Explore Swagger API docs at http://localhost:4000/api-docs
4. Read `RAG_FORMS_GUIDE.md` for AI form generation
5. Read `PDF_FILLING_GUIDE.md` for PDF operations

---

## Quick Command Reference

```powershell
# Development
npm run dev                    # Start with auto-reload
npm start                      # Production mode

# Database
npm run prisma:generate        # Generate Prisma Client
npm run prisma:migrate         # Run migrations
npm run prisma:studio          # Open database GUI
npm run prisma:seed            # Seed test data

# Docker (if using)
docker ps                      # Check running containers
docker logs ai-onboarding-db   # View database logs
docker stop ai-onboarding-db   # Stop database
docker start ai-onboarding-db  # Start database
```

---

## Need Help?

- Check existing documentation in project root (*.md files)
- View API docs: http://localhost:4000/api-docs
- Check server logs for detailed error messages



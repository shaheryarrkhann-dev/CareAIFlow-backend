# Fix: Missing Database Tables

## Problem
When trying to delete an organization, you get this error:
```
The table `public.pdf_embeddings` does not exist in the current database.
```

## Solution Applied
✅ **Updated `deleteTenant` function** to gracefully handle missing tables

The function now:
- Uses try-catch for each table count
- Won't fail if tables don't exist
- Returns 0 for missing table counts

## Run Database Migrations (Recommended)

To create all the missing tables, run the migrations:

### Step 1: Navigate to Backend Directory
```bash
cd ai-onboarding-platform
```

### Step 2: Generate Prisma Client
```bash
npx prisma generate
```

### Step 3: Run Migrations
```bash
npx prisma migrate deploy
```

Or in development:
```bash
npx prisma migrate dev
```

### Step 4: Verify Tables
```bash
npx prisma studio
```

This will open Prisma Studio where you can see all your tables.

## What Tables Will Be Created

After running migrations, you'll have:
- ✅ `tenants` (organizations)
- ✅ `users`
- ✅ `refresh_tokens`
- ✅ `password_reset_tokens`
- ✅ `pdf_embeddings` (for AI/RAG features)
- ✅ `tenant_form_schemas` (for AI-generated forms)
- ✅ `form_drafts` (for saving partial forms)
- ✅ `pdf_templates` (for PDF filling)

## Testing Delete After Fix

### Option 1: Without Running Migrations
The delete function will now work, but return 0 for missing table counts:

```json
{
  "success": true,
  "message": "Organization deleted successfully",
  "deletedTenant": {
    "id": "...",
    "name": "Test Org",
    "slug": "test-org"
  },
  "deletedRelatedData": {
    "users": 2,
    "pdfEmbeddings": 0,     // 0 because table doesn't exist
    "formSchemas": 0,        // 0 because table doesn't exist
    "formDrafts": 0,         // 0 because table doesn't exist
    "pdfTemplates": 0        // 0 because table doesn't exist
  }
}
```

### Option 2: After Running Migrations
You'll get accurate counts for all tables:

```json
{
  "success": true,
  "message": "Organization deleted successfully",
  "deletedTenant": {
    "id": "...",
    "name": "Test Org",
    "slug": "test-org"
  },
  "deletedRelatedData": {
    "users": 2,
    "pdfEmbeddings": 5,
    "formSchemas": 3,
    "formDrafts": 7,
    "pdfTemplates": 2
  }
}
```

## Quick Test

1. **Restart your backend server** (to load the updated code)
```bash
# Stop the server (Ctrl+C)
# Then start it again
npm run dev
```

2. **Try deleting an organization again**
   - Should work now without errors!

## Database Connection String

Make sure your `.env` file has the correct database connection:

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/DATABASE_NAME
```

Example:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_onboarding
```

## Troubleshooting

### If migrations fail:
```bash
# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Then run migrations again
npx prisma migrate deploy
```

### If you get "connection refused":
1. Make sure PostgreSQL is running
2. Check your DATABASE_URL in `.env`
3. Verify database exists:
```bash
psql -U postgres
\l  # List databases
\q  # Quit
```

### Create database if it doesn't exist:
```bash
psql -U postgres
CREATE DATABASE ai_onboarding;
\q
```

## Summary

✅ **Immediate Fix Applied**: Delete function now works even with missing tables  
📝 **Recommended**: Run migrations to create all tables  
🚀 **Next Step**: Restart backend and test delete again

---

**Status**: Fixed and Ready to Use  
**Action Required**: Restart backend server





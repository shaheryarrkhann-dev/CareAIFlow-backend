# Fix Notes Table Error

## Problem
Error: `The table public.notes does not exist in the current database.`

The migrations exist but haven't been applied to your database.

## Solution

Run the migrations:

```bash
cd ai-onboarding-platform
npx prisma migrate deploy
```

**OR** if you're in development (applies migrations + generates Prisma client):

```bash
cd ai-onboarding-platform
npx prisma migrate dev
```

This will apply these migrations in order:
1. `20251101181407_add_progress_notes_module` - Creates notes table
2. `20251101193635_add_progress_notes_module` - Fixes foreign keys
3. `20251102000000_add_note_soft_delete` - Adds deletedAt column

## What Will Happen

The migrations will:
- Create `notes` table
- Create `note_versions` table  
- Add `NoteType` enum
- Add audit actions for notes
- Set up proper indexes

## After Running

The Progress Notes section will work once the `notes` table exists.

## Verify

Check if migration was applied:

```bash
npx prisma studio
```

You should see the `notes` table in the list.

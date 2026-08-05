# Safe Migration Guide - DON'T RESET!

## ⚠️ What "Reset" Would Delete

If you reset the database, you would lose **ALL data** in **ALL tables**:

- ✅ **All Users** - User accounts, passwords
- ✅ **All Tenants** - Organizations  
- ✅ **All Form Submissions** - All resident data
- ✅ **All PDFs** - PDF uploads, templates
- ✅ **All Form Schemas** - Generated forms
- ✅ **All Notes** - Progress notes
- ✅ **All Dynamic Tables** - Form submission tables (like `tenant_xxx_form_xxx`)
- ✅ **Everything else** - Complete database wipe

**This is destructive - don't do it if you have any data!**

---

## ✅ Safe Solution: Use `migrate deploy` Instead

The dynamic form tables (`tenant_xxx_form_xxx`) are created automatically and aren't tracked in migrations - this is **normal** and **expected**.

Prisma sees them as "drift" but they're supposed to exist.

### Safe Command (Does NOT delete data):

```bash
cd ai-onboarding-platform
npx prisma migrate deploy
```

This will:
- ✅ Apply missing migrations (like `notes` table)
- ✅ NOT delete any existing data
- ✅ NOT drop any tables
- ✅ Only add missing tables/columns

---

## Why Prisma Shows "Drift"

The dynamic tables (`tenant_xxx_form_xxx`) are created at runtime when forms are submitted. They're NOT in migrations because they're dynamic. This is correct behavior.

Prisma sees them as "drift" because they exist but aren't in migration files, but that's fine - they're supposed to be there!

---

## What To Do

1. **Cancel the reset** - Press `N` (No)

2. **Run safe migration:**
   ```bash
   cd ai-onboarding-platform
   npx prisma migrate deploy
   ```

3. **This will only create the missing `notes` table** - Your data stays safe!

---

## Summary

- ❌ **Reset** = Deletes ALL data (Don't do it!)
- ✅ **Deploy** = Only adds missing tables (Safe!)

Use `prisma migrate deploy` - it's safe and won't touch your existing data.
















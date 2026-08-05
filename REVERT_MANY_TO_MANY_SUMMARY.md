# Revert Many-to-Many Multi-Tenant System

## 📋 Overview

The many-to-many relationship between Users and Tenants has been **reverted back to a simple one-to-many relationship**. The system now works as follows:

- ✅ **Each user belongs to ONE organization (tenant)**
- ✅ **SUPER_ADMIN users can still access all tenants** (their tenantId is NULL)
- ✅ **Each user has ONE role** (not per-tenant)
- ✅ **Simpler, more straightforward architecture**

---

## 🔄 What Changed

### Database Schema

**Before (Many-to-Many):**
```prisma
model User {
  id          String       @id
  userTenants UserTenant[] // User could belong to MANY tenants
  // ...
}

model UserTenant {
  id       String  @id
  userId   String
  tenantId String
  role     Role    // Role per tenant
  // ...
}
```

**After (One-to-Many - Reverted):**
```prisma
model User {
  id       String  @id
  tenantId String? // User belongs to ONE tenant (NULL for SUPER_ADMIN)
  role     Role    // User has ONE role globally
  tenant   Tenant? @relation(...)
  // ...
}

// UserTenant model removed
```

### Key Changes

1. **Removed UserTenant Junction Table** - No more many-to-many complexity
2. **Single Role Per User** - Users have one role, not per-tenant
3. **Single Tenant Per User** - Users belong to one organization (except SUPER_ADMIN)
4. **SUPER_ADMIN Preserved** - SUPER_ADMIN users still have tenantId = NULL and can access all tenants

---

## 🗑️ Removed Features

### Removed API Endpoints

The following endpoints have been **removed**:

1. ❌ `POST /api/tenants/:tenantId/users/:userId` - Add user to tenant
2. ❌ `DELETE /api/tenants/:tenantId/users/:userId` - Remove user from tenant
3. ❌ `PATCH /api/tenants/:tenantId/users/:userId/role` - Update user role in tenant
4. ❌ `POST /api/tenants/:tenantId/switch` - Switch active tenant

### What You Can Still Do

✅ **Invite new users** - Using `POST /api/auth/invite-user`  
✅ **View tenant users** - Using `GET /api/tenants/:id/users`  
✅ **Manage tenants** - All tenant CRUD operations still work  
✅ **SUPER_ADMIN access** - SUPER_ADMIN can still manage all tenants

---

## 📡 Current API Usage

### Login (Simplified)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "tenantId": "tenant-uuid",
    "role": "ADMIN",
    "tenant": {
      "id": "tenant-uuid",
      "name": "Organization Name",
      "slug": "org-slug"
    }
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Invite User (Simplified)

```http
POST /api/auth/invite-user
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "STAFF",
  "tenantId": "tenant-uuid"
}
```

**Behavior:**
- Creates a new user assigned to the specified tenant
- If user already exists, returns an error (no longer adds to multiple tenants)

---

## 🔐 Permission Model (Unchanged)

### Role Hierarchy

| Role | Permissions |
|------|-------------|
| **SUPER_ADMIN** | Access ALL tenants, manage system (tenantId = NULL) |
| **ADMIN** | Manage their tenant, invite users to their tenant |
| **STAFF** | Regular access to their tenant |
| **GUARDIAN** | Limited access to their tenant |

### Permission Rules

1. **SUPER_ADMIN**:
   - Has `tenantId = NULL`
   - Can access any tenant
   - Can manage all tenants and users
   - Has global permissions

2. **ADMIN**:
   - Belongs to ONE tenant
   - Can invite users to their tenant
   - Can manage users in their tenant
   - Cannot access other tenants

3. **STAFF/GUARDIAN**:
   - Belongs to ONE tenant
   - Can access data in their tenant
   - Cannot manage users or change roles

---

## 🗄️ Database Migration

### What the Migration Did

1. ✅ **Added back `tenantId` and `role` columns to `users` table**
2. ✅ **Migrated data from `user_tenants` back to `users`**
   - Took the first/earliest active membership for each user
   - Preserved their role from that membership
3. ✅ **Dropped the `user_tenants` junction table**
4. ✅ **Added foreign key constraint from `users.tenantId` to `tenants.id`**

### Migration File

Location: `prisma/migrations/20251010000000_revert_many_to_many/migration.sql`

**The migration has already been applied** - Your database is now in sync!

---

## 🎯 Updated Use Cases

### Use Case 1: Employee in One Organization

**Scenario:** John works for Company A.

**Setup:**
1. John is created with `tenantId = "company-a-id"` and `role = "STAFF"`
2. John can only access Company A's data
3. If John moves to Company B, an admin must update his `tenantId`

---

### Use Case 2: System Administrator

**Scenario:** Sarah is a system administrator.

**Setup:**
1. Sarah is created with `role = "SUPER_ADMIN"` and `tenantId = NULL`
2. Sarah can access all tenants
3. Sarah can manage all organizations and users

---

## 🧪 Testing the System

### Step 1: Verify Migration

The migration has already been applied. To verify:

```bash
npx prisma studio
```

Check that:
- `users` table has `tenantId` and `role` columns
- `user_tenants` table no longer exists

### Step 2: Test Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

You should see the user with their single tenant and role!

### Step 3: Test as SUPER_ADMIN

Login as a SUPER_ADMIN user and verify you can access all tenants:

```bash
curl -X GET http://localhost:4000/api/tenants \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>"
```

---

## 📝 Code Changes Summary

### Files Modified

1. **prisma/schema.prisma** - Reverted to one-to-many relationship
2. **prisma/migrations/20251010000000_revert_many_to_many/migration.sql** - Migration to revert DB
3. **src/services/auth.service.js** - Simplified login and invite logic
4. **src/services/tenant.service.js** - Removed many-to-many functions
5. **src/middlewares/auth.middleware.js** - Simplified user loading
6. **src/middlewares/tenant.middleware.js** - Simplified tenant filtering
7. **src/controllers/tenant.controller.js** - Removed many-to-many endpoints
8. **src/routes/tenant.routes.js** - Removed many-to-many routes

### Functions Removed

- `addUserToTenant()`
- `removeUserFromTenant()`
- `updateUserRoleInTenant()`
- `switchTenant()`

---

## 🚀 Benefits of Reverting

1. **Simpler Architecture** - Easier to understand and maintain
2. **Less Complex Queries** - No more junction table joins
3. **Clearer Permissions** - One role per user, one tenant per user
4. **Better Performance** - Fewer database queries
5. **SUPER_ADMIN Still Works** - System admins can still access everything

---

## 📞 Next Steps

1. ✅ **Migration applied** - Database is ready
2. ✅ **Code updated** - All files updated and tested
3. ✅ **Prisma client regenerated** - Client is in sync with schema
4. 🔄 **Restart your server** - If running, restart to load changes

```bash
npm run dev
```

5. 🧪 **Test your endpoints** - Verify login and user management work

---

## 📚 Additional Notes

### SUPER_ADMIN Logic Preserved

The SUPER_ADMIN role still works exactly as before:
- SUPER_ADMIN users have `tenantId = NULL`
- They can access all tenants without restriction
- All tenant management endpoints still check for SUPER_ADMIN

### User Migration

If users had multiple tenant memberships:
- The migration took their **earliest/first** active membership
- Their role from that membership was preserved
- Other memberships were discarded

---

**Version:** 1.0.0  
**Date:** October 10, 2025  
**Migration:** `20251010000000_revert_many_to_many`


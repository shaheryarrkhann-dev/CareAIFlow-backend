# 👑 Super Admin Guide - Cross-Tenant Access

## 🎯 Overview

**SUPER_ADMIN** is a special role with **no tenant assignment** (tenantId = `null`). This allows them to:
- ✅ Access **ALL tenants/organizations**
- ✅ Manage users across different facilities
- ✅ Create and manage tenants
- ✅ View all system data

---

## 🔍 Key Differences from Other Roles

### SUPER_ADMIN (Cross-Tenant)
```json
{
  "id": "uuid",
  "email": "alirazaarif@yopmail.com",
  "role": "SUPER_ADMIN",
  "tenantId": null,  // ⭐ No tenant - can access all
  "name": "Super Admin"
}
```

### ADMIN (Single Tenant)
```json
{
  "id": "uuid",
  "email": "admin@facility1.com",
  "role": "ADMIN",
  "tenantId": "tenant-uuid-123",  // ⚠️ Locked to one tenant
  "name": "Facility Admin"
}
```

---

## 🔒 Database Schema Changes

### Before (WRONG ❌)
```prisma
model User {
  tenantId String  // Required - ALL users had a tenant
  tenant   Tenant  @relation(...)
}
```

### After (CORRECT ✅)
```prisma
model User {
  tenantId String?  // Optional - SUPER_ADMIN has null
  tenant   Tenant?  @relation(...)
}
```

---

## 🎯 How Tenant Isolation Works

### 1. **getTenantFilter() Function**

```javascript
function getTenantFilter(user) {
  // SUPER_ADMIN: no filter, sees everything
  if (user.role === 'SUPER_ADMIN' || !user.tenantId) {
    return {};  // No WHERE clause
  }

  // Others: filtered by their tenant
  return { tenantId: user.tenantId };  // WHERE tenantId = 'xxx'
}
```

### 2. **Database Queries**

#### SUPER_ADMIN Query:
```javascript
// No filter - sees all tenants
const users = await prisma.user.findMany({
  where: {}  // Gets ALL users from ALL tenants
});
```

#### ADMIN Query:
```javascript
// Filtered by tenant
const users = await prisma.user.findMany({
  where: { tenantId: 'tenant-123' }  // Only their tenant
});
```

---

## 📝 What Changed

### 1. **Schema Updated** (`prisma/schema.prisma`)
```diff
model User {
-  tenantId String
+  tenantId String?  // Now optional
-  tenant   Tenant @relation(...)
+  tenant   Tenant? @relation(...)  // Relation also optional
}

model RefreshToken {
-  tenantId String
+  tenantId String?  // Optional for SUPER_ADMIN tokens
}
```

### 2. **Seed Updated** (`prisma/seed.js`)
```diff
const adminUser = await prisma.user.create({
  email: 'alirazaarif@yopmail.com',
  role: 'SUPER_ADMIN',
-  tenantId: defaultTenant.id  // ❌ Was assigned to tenant
+  tenantId: null  // ✅ No tenant - cross-tenant access
});
```

### 3. **Auth Service Updated** (`src/services/auth.service.js`)
```diff
async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true }
  });

-  if (!user.tenant.isActive) {
+  if (user.tenant && !user.tenant.isActive) {  // ✅ Check if tenant exists first
    throw new Error('Organization inactive');
  }
}
```

### 4. **Tenant Middleware Updated** (`src/middlewares/tenant.middleware.js`)
```diff
const getTenantFilter = (user) => {
-  if (user.role === 'SUPER_ADMIN') {
+  if (user.role === 'SUPER_ADMIN' || !user.tenantId) {  // ✅ Also check null tenantId
    return {};
  }
  return { tenantId: user.tenantId };
};
```

---

## 🧪 Testing Super Admin Access

### 1. **Login as Super Admin**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alirazaarif@yopmail.com",
    "password": "Admin@12345"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "alirazaarif@yopmail.com",
      "role": "SUPER_ADMIN",
      "tenantId": null,  // ⭐ No tenant!
      "tenant": null
    },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### 2. **Create Multiple Tenants** (Super Admin Only)
```bash
# Create Tenant 1
POST /api/tenants
{
  "name": "Facility A",
  "slug": "facility-a"
}

# Create Tenant 2
POST /api/tenants
{
  "name": "Facility B",
  "slug": "facility-b"
}
```

### 3. **View Users Across All Tenants**
```bash
GET /api/users
# Super Admin sees users from ALL tenants
```

**Response:**
```json
{
  "users": [
    {
      "id": "1",
      "email": "admin@facility-a.com",
      "tenantId": "facility-a-uuid",
      "tenant": { "name": "Facility A" }
    },
    {
      "id": "2",
      "email": "staff@facility-b.com",
      "tenantId": "facility-b-uuid",
      "tenant": { "name": "Facility B" }
    }
  ]
}
```

---

## 🔐 Security Implications

### ✅ Advantages:
1. **Central Management** - One account to manage all facilities
2. **Audit & Oversight** - Can monitor all organizations
3. **Emergency Access** - Can fix issues across tenants
4. **Simplified Setup** - No need to create admin in each tenant

### ⚠️ Risks & Mitigation:
1. **Too Much Power**
   - ✅ Mitigate: Use strong password, 2FA (future)
   - ✅ Mitigate: Log all SUPER_ADMIN actions (future)

2. **Accidental Data Access**
   - ✅ Mitigate: UI shows which tenant is being accessed
   - ✅ Mitigate: Confirmation dialogs for cross-tenant actions

3. **Security Breach Impact**
   - ✅ Mitigate: Rotate credentials regularly
   - ✅ Mitigate: Monitor unusual activity

---

## 📊 Role Comparison Table

| Feature | SUPER_ADMIN | ADMIN | STAFF | GUARDIAN |
|---------|-------------|-------|-------|----------|
| **Tenant Assignment** | None (null) | Required | Required | Required |
| **Can Create Tenants** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Access All Tenants** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Manage Own Tenant Users** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Invite Users** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **View Other Tenants** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Typical Count** | 1-2 | 1 per tenant | Many | Many |

---

## 🎯 Typical Use Cases

### Scenario 1: New Facility Onboarding
```
1. SUPER_ADMIN logs in
2. Creates new Tenant: "Golden Years AFH"
3. Invites ADMIN: admin@goldenyears.com (with tenantId)
4. ADMIN logs in to their facility
5. ADMIN invites STAFF and GUARDIANs
```

### Scenario 2: Cross-Facility Report
```
1. SUPER_ADMIN logs in
2. Accesses /api/tenants (sees all facilities)
3. Gets users from each tenant
4. Generates company-wide report
```

### Scenario 3: User Management Issue
```
1. Facility Admin locked out
2. SUPER_ADMIN logs in
3. Accesses that facility's users
4. Resets admin password
5. Notifies admin via email
```

---

## 🚀 Next Steps

### For Development:
1. ✅ Test login as SUPER_ADMIN
2. ✅ Verify `tenantId` is `null`
3. ✅ Create multiple tenants
4. ✅ Verify cross-tenant user access
5. ✅ Test tenant isolation for regular users

### For Production:
1. ⚠️ Change SUPER_ADMIN password immediately
2. ⚠️ Use strong, unique password
3. ⚠️ Limit SUPER_ADMIN accounts (1-2 max)
4. ⚠️ Monitor SUPER_ADMIN activity
5. ⚠️ Implement 2FA (future enhancement)

---

## 📚 Related Documentation

- `MULTI_TENANCY_GUIDE.md` - Complete multi-tenancy overview
- `ROLES_GUIDE.md` - All role descriptions
- `API_EXAMPLES.md` - API usage examples
- `SETUP_GUIDE.md` - Initial setup

---

## 🆘 Troubleshooting

### Issue: "Organization not found" error

**Cause:** Tenant middleware expects all users to have a tenant  
**Solution:** Already fixed - middleware now checks if tenant exists

### Issue: SUPER_ADMIN can't see other tenants

**Check:**
1. Is `tenantId` null in database?
   ```sql
   SELECT id, email, role, tenantId FROM users WHERE role = 'SUPER_ADMIN';
   -- Should show: tenantId = NULL
   ```

2. Is `getTenantFilter()` returning empty object?
   ```javascript
   console.log(getTenantFilter(user));
   // Should return: {}
   ```

### Issue: Regular ADMIN seeing all tenants

**Cause:** Tenant middleware not properly filtering  
**Solution:** Check `getTenantFilter()` returns `{ tenantId: user.tenantId }`

---

**Last Updated:** October 9, 2024  
**Version:** 1.0.3  
**Migration:** `20251009170034_make_tenantid_optional_for_superadmin`

✅ **SUPER_ADMIN now has true cross-tenant access!**


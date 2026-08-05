

# 🏢 Multi-Tenancy Guide

Complete guide to understanding and implementing multi-tenancy in the AI Onboarding system.

## 📋 Overview

The system implements **multi-tenancy** to provide complete data isolation between different organizations (tenants). Each organization's data is completely separate and secure.

### What is Multi-Tenancy?

Multi-tenancy is an architecture where a single application instance serves multiple organizations (tenants), with each tenant's data completely isolated from others.

**Benefits:**
- ✅ Data isolation and security
- ✅ Resource efficiency
- ✅ Centralized management
- ✅ Scalable architecture
- ✅ Cost-effective hosting

---

## 🎯 Tenant Architecture

### Data Model

```
Tenant (Organization)
  ├── Users (Staff, Guardians, Admins)
  ├── Refresh Tokens
  └── [Future: Resources, Content, etc.]
```

### Key Concepts

1. **Tenant** = Organization/Facility
   - Each organization is a separate tenant
   - Has unique ID and slug
   - Can be activated/deactivated

2. **Tenant Isolation**
   - Users belong to one tenant
   - Users can only access their tenant's data
   - SUPER_ADMIN can access all tenants

3. **Tenant Context**
   - Every request carries tenant information
   - Middleware enforces tenant boundaries
   - Automatic filtering of queries

---

## 🔐 Access Control Matrix

| Action | SUPER_ADMIN | ADMIN | STAFF | GUARDIAN |
|--------|-------------|-------|-------|----------|
| **View all tenants** | ✅ | ❌ | ❌ | ❌ |
| **View own tenant** | ✅ | ✅ | ✅ | ✅ |
| **Create tenant** | ✅ | ❌ | ❌ | ❌ |
| **Update any tenant** | ✅ | ❌ | ❌ | ❌ |
| **Update own tenant** | ✅ | ✅ | ❌ | ❌ |
| **Deactivate tenant** | ✅ | ❌ | ❌ | ❌ |
| **View own tenant users** | ✅ | ✅ | ❌ | ❌ |
| **View any tenant users** | ✅ | ❌ | ❌ | ❌ |
| **Invite users (own tenant)** | ✅ | ✅ | ❌ | ❌ |
| **Invite users (any tenant)** | ✅ | ❌ | ❌ | ❌ |

---

## 🛠️ API Endpoints

### Tenant Management

#### 1. Create Organization (SUPER_ADMIN only)
```bash
POST /api/tenants
Authorization: Bearer SUPER_ADMIN_TOKEN

{
  "name": "Acme School",
  "slug": "acme-school"
}
```

#### 2. List Organizations
```bash
GET /api/tenants?page=1&limit=10&search=acme
Authorization: Bearer YOUR_TOKEN

# SUPER_ADMIN sees: All tenants
# Others see: Only their tenant
```

#### 3. Get Organization Details
```bash
GET /api/tenants/{tenantId}
Authorization: Bearer YOUR_TOKEN
```

#### 4. Update Organization
```bash
PATCH /api/tenants/{tenantId}
Authorization: Bearer ADMIN_TOKEN

{
  "name": "Acme School Updated"
}
```

#### 5. Deactivate Organization (SUPER_ADMIN only)
```bash
POST /api/tenants/{tenantId}/deactivate
Authorization: Bearer SUPER_ADMIN_TOKEN
```

#### 6. Activate Organization (SUPER_ADMIN only)
```bash
POST /api/tenants/{tenantId}/activate
Authorization: Bearer SUPER_ADMIN_TOKEN
```

#### 7. Get Organization Users
```bash
GET /api/tenants/{tenantId}/users?page=1&limit=10
Authorization: Bearer ADMIN_TOKEN
```

#### 8. Get Organization Statistics
```bash
GET /api/tenants/{tenantId}/stats
Authorization: Bearer ADMIN_TOKEN
```

---

## 🔧 Middleware Components

### 1. attachTenantContext

Automatically attaches tenant information to every request.

```javascript
// Usage in routes
router.use(authenticate());
router.use(attachTenantContext);

// Now req.tenant is available
```

**What it does:**
- Fetches tenant from database
- Validates tenant is active
- Attaches tenant to request object
- Returns 403 if tenant inactive

### 2. enforceTenantIsolation

Prevents users from accessing other tenants' data.

```javascript
// Usage
router.post('/resource',
  authenticate(),
  enforceTenantIsolation('tenantId'),
  controller.create
);
```

**What it does:**
- Checks tenantId in body/params/query
- Compares with user's tenantId
- Allows if match or SUPER_ADMIN
- Returns 403 if mismatch

### 3. ensureTenantScope

Automatically sets tenantId for create operations.

```javascript
// Usage
router.post('/resource',
  authenticate(),
  ensureTenantScope,
  controller.create
);
```

**What it does:**
- Adds user's tenantId to request body
- SUPER_ADMIN can override
- Ensures resources belong to correct tenant

### 4. validateTenantExists

Validates tenant ID before operations.

```javascript
// Usage
router.get('/tenants/:tenantId',
  validateTenantExists,
  controller.getTenant
);
```

**What it does:**
- Checks if tenant exists
- Validates tenant is active
- Attaches tenant to req.validatedTenant

### 5. tenantAdminOnly

Ensures only tenant admins access endpoint.

```javascript
// Usage
router.post('/tenant-settings',
  authenticate(),
  tenantAdminOnly,
  controller.updateSettings
);
```

**What it does:**
- Checks user is ADMIN or SUPER_ADMIN
- Validates admin manages own tenant
- Returns 403 if unauthorized

---

## 💻 Code Examples

### Creating Tenant-Scoped Resources

```javascript
// BAD: No tenant isolation ❌
async function createResource(data) {
  return await prisma.resource.create({
    data: data
  });
}

// GOOD: With tenant isolation ✅
async function createResource(data, user) {
  // Ensure tenant scope
  const tenantId = user.role === 'SUPER_ADMIN' 
    ? data.tenantId 
    : user.tenantId;

  return await prisma.resource.create({
    data: {
      ...data,
      tenantId
    }
  });
}
```

### Querying Tenant-Scoped Data

```javascript
// BAD: Returns all data ❌
async function getResources() {
  return await prisma.resource.findMany();
}

// GOOD: Filtered by tenant ✅
async function getResources(user) {
  const where = user.role === 'SUPER_ADMIN' 
    ? {} 
    : { tenantId: user.tenantId };

  return await prisma.resource.findMany({
    where
  });
}
```

### Using getTenantFilter Helper

```javascript
const { getTenantFilter } = require('../middlewares/tenant.middleware');

async function getResources(user) {
  return await prisma.resource.findMany({
    where: getTenantFilter(user)
  });
}
```

---

## 🧪 Testing Multi-Tenancy

### Setup Test Data

1. **Create Multiple Tenants (as SUPER_ADMIN):**
```bash
POST /api/tenants
{ "name": "Tenant A", "slug": "tenant-a" }

POST /api/tenants
{ "name": "Tenant B", "slug": "tenant-b" }
```

2. **Create Users in Each Tenant:**
```bash
# Invite admin to Tenant A
POST /api/auth/invite-user
{
  "email": "admin-a@example.com",
  "name": "Admin A",
  "role": "ADMIN",
  "tenantId": "tenant-a-uuid"
}

# Invite admin to Tenant B
POST /api/auth/invite-user
{
  "email": "admin-b@example.com",
  "name": "Admin B",
  "role": "ADMIN",
  "tenantId": "tenant-b-uuid"
}
```

### Test Isolation

1. **Login as Admin A:**
```bash
POST /api/auth/login
{
  "email": "admin-a@example.com",
  "password": "temp-password"
}
```

2. **Try to Access Tenant B Data:**
```bash
GET /api/tenants/{tenant-b-uuid}
# Should return: 403 Forbidden
```

3. **Try to Invite User to Tenant B:**
```bash
POST /api/auth/invite-user
{
  "email": "user@example.com",
  "tenantId": "tenant-b-uuid"
}
# Should return: 403 Forbidden
```

4. **Verify Can Access Own Tenant:**
```bash
GET /api/tenants/{tenant-a-uuid}
# Should return: 200 OK with tenant data
```

---

## 🔒 Security Best Practices

### 1. Always Validate Tenant Access

```javascript
// Before any operation
const tenant = await getTenantById(tenantId, req.user);
if (!tenant) {
  throw new Error('Access denied');
}
```

### 2. Use Middleware for Protection

```javascript
// Don't manually check in controllers
router.post('/resource',
  authenticate(),
  enforceTenantIsolation(),
  ensureTenantScope,
  controller.create
);
```

### 3. Filter All Queries

```javascript
// Always apply tenant filter
const where = {
  ...getTenantFilter(user),
  // ... other conditions
};
```

### 4. Audit Tenant Access

```javascript
// Log tenant access for security
console.log(`User ${user.id} accessed tenant ${tenantId}`);
```

### 5. Validate Tenant Status

```javascript
// Check tenant is active
if (!tenant.isActive) {
  throw new Error('Organization is inactive');
}
```

---

## 📊 Tenant Statistics

Each tenant has access to statistics:

```javascript
GET /api/tenants/{tenantId}/stats

Response:
{
  "users": {
    "total": 50,
    "active": 48,
    "inactive": 2,
    "byRole": {
      "admin": 2,
      "staff": 30,
      "guardian": 18
    }
  },
  "activity": {
    "loginsLast24Hours": 15
  }
}
```

---

## 🚀 Advanced Features

### Custom Tenant Settings (Future)

```javascript
// Extend tenant model with settings
model Tenant {
  // ... existing fields
  settings Json?
}

// Store tenant-specific configuration
{
  "theme": "blue",
  "features": ["attendance", "messaging"],
  "limits": {
    "maxUsers": 100,
    "storage": "10GB"
  }
}
```

### Tenant-Specific Resources (Future)

```javascript
// All future resources should include tenantId
model Resource {
  id        String
  tenantId  String
  // ... other fields
  
  tenant    Tenant @relation(fields: [tenantId], references: [id])
  
  @@index([tenantId])
}
```

---

## ❓ FAQ

### Q: Can a user belong to multiple tenants?
**A:** No, each user belongs to exactly one tenant. For multi-tenant users, create separate accounts per tenant.

### Q: Can SUPER_ADMIN see all data?
**A:** Yes, SUPER_ADMIN has system-wide access across all tenants.

### Q: What happens when tenant is deactivated?
**A:** Users cannot login, all API requests return 403, but data is preserved.

### Q: How do I migrate users between tenants?
**A:** Currently requires database update. Future feature will add user transfer API.

### Q: Can tenant slug be changed?
**A:** Yes, SUPER_ADMIN or tenant ADMIN can update slug (must remain unique).

### Q: How is tenant ID passed in requests?
**A:** Automatically from user's JWT token. No need to pass manually.

### Q: What if I forget to add tenant filter?
**A:** Risk of data leakage. Always use `getTenantFilter()` helper.

---

## 🎓 Best Practices Checklist

- [ ] All models have `tenantId` field (except system tables)
- [ ] All queries use `getTenantFilter(user)`
- [ ] Routes use `enforceTenantIsolation()` middleware
- [ ] Create operations use `ensureTenantScope` middleware
- [ ] API endpoints have tenant-aware documentation
- [ ] Test isolation with multiple test tenants
- [ ] Audit logs include tenant information
- [ ] Error messages don't leak tenant data
- [ ] Validate tenant exists before operations
- [ ] Check tenant.isActive before allowing access

---

## 📚 Related Documentation

- `ROLES_GUIDE.md` - Understanding user roles
- `API_EXAMPLES.md` - API usage examples
- `SWAGGER_GUIDE.md` - Interactive API testing

---

**Last Updated:** October 7, 2024  
**Version:** 1.0.2


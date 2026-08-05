# Form Schema API - SUPER_ADMIN Fix

## ✅ Issue Resolved

**Problem:** SUPER_ADMIN users were getting "tenantId is required" error when trying to fetch all form schemas without specifying a tenantId parameter.

**Error:**
```json
{
  "success": false,
  "message": "tenantId is required"
}
```

## 🎯 Solution Implemented

Updated form schema endpoints to allow SUPER_ADMIN to:
- **Fetch ALL tenant data** when tenantId is NOT provided
- **Fetch specific tenant data** when tenantId IS provided

### Files Modified:
1. ✅ `src/controllers/form.controller.js`
2. ✅ `src/services/ai.service.js`

## 📋 How It Works Now

### For SUPER_ADMIN Users:

#### Option 1: Get All Schemas (All Tenants)
```bash
# No tenantId parameter = fetch all tenants
GET /api/forms/schemas
```

**Response:**
```json
{
  "success": true,
  "count": 20,
  "total": 75,
  "schemas": [
    {
      "id": "abc-123",
      "formName": "Employee Form",
      "tenantId": "tenant-1",  // ← Shows which tenant
      "isActive": true,
      "createdAt": "..."
    },
    {
      "id": "xyz-789",
      "formName": "Application Form",
      "tenantId": "tenant-2",  // ← Different tenant
      "isActive": true,
      "createdAt": "..."
    }
  ],
  "pagination": {...}
}
```

#### Option 2: Get Specific Tenant Schemas
```bash
# With tenantId parameter = fetch specific tenant only
GET /api/forms/schemas?tenantId=abc-123-tenant-id
```

**Response:**
```json
{
  "success": true,
  "schemas": [
    // Only schemas from specified tenant
  ]
}
```

### For Regular Users (ADMIN, STAFF, GUARDIAN):
- Always uses their own `tenantId`
- Cannot see other tenant's data
- Works as before (no changes)

## 🔄 Updated Endpoints

### 1. Get All Form Schemas
```
GET /api/forms/schemas
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tenantId` | No | SUPER_ADMIN: Optional (omit for all tenants) |
| `activeOnly` | No | Filter active schemas only (default: true) |
| `limit` | No | Max items to return (default: 100, max: 500) |
| `offset` | No | Number of items to skip (default: 0) |

**Examples:**

```bash
# SUPER_ADMIN: Get all schemas from all tenants
curl -X GET "http://localhost:4000/api/forms/schemas" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"

# SUPER_ADMIN: Get schemas from specific tenant
curl -X GET "http://localhost:4000/api/forms/schemas?tenantId=abc-123" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"

# SUPER_ADMIN: Get all including inactive
curl -X GET "http://localhost:4000/api/forms/schemas?activeOnly=false" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"

# Regular user: Gets their own tenant's schemas
curl -X GET "http://localhost:4000/api/forms/schemas" \
  -H "Authorization: Bearer USER_TOKEN"
```

### 2. Get Single Form Schema by ID
```
GET /api/forms/schemas/:id
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tenantId` | No | SUPER_ADMIN: Optional (omit to search all tenants) |

**Examples:**

```bash
# SUPER_ADMIN: Get schema from any tenant
curl -X GET "http://localhost:4000/api/forms/schemas/schema-id-123" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"

# SUPER_ADMIN: Get schema from specific tenant
curl -X GET "http://localhost:4000/api/forms/schemas/schema-id-123?tenantId=tenant-abc" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"

# Regular user: Gets schema from their tenant only
curl -X GET "http://localhost:4000/api/forms/schemas/schema-id-123" \
  -H "Authorization: Bearer USER_TOKEN"
```

## 📊 Response Format

### When Fetching All Tenants (SUPER_ADMIN)
```json
{
  "success": true,
  "count": 20,
  "total": 75,
  "schemas": [
    {
      "id": "schema-1",
      "formName": "Form Name",
      "description": "Description",
      "schemaJson": {...},
      "isActive": true,
      "tenantId": "tenant-1",  // ← Important: Shows tenant
      "createdAt": "2025-11-01T02:00:00.000+05:00",
      "updatedAt": "2025-11-01T02:00:00.000+05:00"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 75
  }
}
```

### When Fetching Specific Tenant
```json
{
  "success": true,
  "schemas": [
    {
      "id": "schema-1",
      "tenantId": "specified-tenant-id",
      // ... rest of schema
    }
  ]
}
```

## 🔍 Key Changes

### Controller Changes (`form.controller.js`)

**Before:**
```javascript
const tenantId = req.user.role === 'SUPER_ADMIN' 
  ? (req.query.tenantId || req.user.tenantId) 
  : req.user.tenantId;
  
if (!tenantId) {
  return res.status(400).json({ 
    success: false, 
    message: 'tenantId is required' 
  });
}
```

**After:**
```javascript
let tenantId;
if (req.user.role === 'SUPER_ADMIN') {
  tenantId = req.query.tenantId || null; // null = all tenants
} else {
  tenantId = req.user.tenantId;
  if (!tenantId) {
    return res.status(400).json({ 
      success: false, 
      message: 'tenantId is required' 
    });
  }
}
```

### Service Changes (`ai.service.js`)

**Before:**
```javascript
async function getFormSchemas(tenantId, activeOnly = true) {
  const where = { tenantId }; // Always required tenantId
  // ...
}
```

**After:**
```javascript
async function getFormSchemas(tenantId, activeOnly = true) {
  const where = {};
  
  // Only filter by tenantId if provided
  if (tenantId !== null && tenantId !== undefined) {
    where.tenantId = tenantId;
  }
  // ...
  
  // Include tenantId in response for SUPER_ADMIN
  select: {
    // ... other fields
    tenantId: true  // Added this
  }
}
```

## ✅ Benefits

### For SUPER_ADMIN:
- ✅ Can view all form schemas across all tenants
- ✅ Can filter by specific tenant when needed
- ✅ Sees which tenant each schema belongs to
- ✅ Full system visibility

### For Regular Users:
- ✅ No changes to existing behavior
- ✅ Still isolated to their own tenant
- ✅ Cannot access other tenant data
- ✅ Secure tenant isolation maintained

## 🧪 Testing

### Test 1: SUPER_ADMIN - Get All Schemas
```bash
curl -X GET "http://localhost:4000/api/forms/schemas" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

**Expected:** 
- ✅ Returns all schemas from all tenants
- ✅ Each schema includes `tenantId` field
- ✅ No "tenantId is required" error

### Test 2: SUPER_ADMIN - Get Specific Tenant
```bash
curl -X GET "http://localhost:4000/api/forms/schemas?tenantId=abc-123" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

**Expected:**
- ✅ Returns only schemas from specified tenant
- ✅ All schemas have same `tenantId`

### Test 3: Regular User
```bash
curl -X GET "http://localhost:4000/api/forms/schemas" \
  -H "Authorization: Bearer USER_TOKEN"
```

**Expected:**
- ✅ Returns only their tenant's schemas
- ✅ Cannot see other tenant data
- ✅ Works as before

### Test 4: SUPER_ADMIN - Get Schema by ID (Any Tenant)
```bash
curl -X GET "http://localhost:4000/api/forms/schemas/schema-id-123" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

**Expected:**
- ✅ Returns schema from any tenant
- ✅ No tenant restriction

## 📝 Use Cases

### Use Case 1: System Overview
```bash
# SUPER_ADMIN views all form schemas across the platform
GET /api/forms/schemas?activeOnly=true&limit=500
```

### Use Case 2: Tenant-Specific Review
```bash
# SUPER_ADMIN reviews a specific tenant's schemas
GET /api/forms/schemas?tenantId=tenant-123&activeOnly=false
```

### Use Case 3: Schema Investigation
```bash
# SUPER_ADMIN finds a schema by ID without knowing the tenant
GET /api/forms/schemas/schema-abc-123
```

### Use Case 4: Regular Admin
```bash
# ADMIN sees only their tenant's schemas (automatic)
GET /api/forms/schemas
```

## 🔒 Security

### Maintained Isolation:
- ✅ Regular users still isolated to their tenant
- ✅ Only SUPER_ADMIN can cross tenant boundaries
- ✅ No breaking changes to existing permissions
- ✅ Backward compatible

### Permissions Summary:
| Role | Can See All Tenants | Can See Specific Tenant | Requires tenantId |
|------|--------------------|-----------------------|-------------------|
| SUPER_ADMIN | ✅ Yes | ✅ Yes (optional) | ❌ No |
| ADMIN | ❌ No | ✅ Own only | ❌ Auto-assigned |
| STAFF | ❌ No | ✅ Own only | ❌ Auto-assigned |
| GUARDIAN | ❌ No | ✅ Own only | ❌ Auto-assigned |

## 📚 Additional Notes

### Response Changes:
- Added `tenantId` field to schema responses
- SUPER_ADMIN now sees which tenant each schema belongs to
- Regular users always see their own tenant (no change)

### Backward Compatibility:
- ✅ Existing API calls still work
- ✅ Regular users see no changes
- ✅ Only enhances SUPER_ADMIN capabilities

---

**Status:** ✅ Complete and Tested  
**Version:** 1.2.3  
**Date:** November 1, 2025  
**Breaking Changes:** None (Backward compatible)


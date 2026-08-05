# Get All Responses API - Enhanced Feature

## Overview

The `/api/forms/responses` endpoint has been enhanced to support retrieving responses across **all forms** when `formId` is not specified. This is particularly useful for SUPER_ADMIN users who need to see all data across the system.

---

## Updated Endpoints

### 1. Get All Form Responses (NEW - Enhanced)

#### Endpoint Details

```
GET /api/forms/responses
```

#### Description

Retrieve form submissions across **all forms**. The behavior depends on the user's role:
- **SUPER_ADMIN** without `tenantId`: Gets ALL responses from ALL forms in ALL tenants
- **SUPER_ADMIN** with `tenantId`: Gets all responses from all forms in specified tenant
- **ADMIN**: Gets all responses from all forms in their tenant
- **STAFF/GUARDIAN**: Gets only their own responses from all forms

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `tenantId` | UUID | Query | ⚠️ Optional | For SUPER_ADMIN to filter by specific tenant. If omitted, gets all data. |
| `limit` | Integer | Query | ⚠️ Optional | Max records to return (default: 100, max: 500) |
| `offset` | Integer | Query | ⚠️ Optional | Number of records to skip (default: 0) |

#### Authentication

- **Required**: Bearer token (JWT)
- **Header**: `Authorization: Bearer <your-token>`

#### Authorization Rules

| Role | Permission | Tenant Filter |
|------|------------|---------------|
| **STAFF** | See only their own responses from all forms | Their tenant only |
| **GUARDIAN** | See only their own responses from all forms | Their tenant only |
| **ADMIN** | See all responses from all forms in tenant | Their tenant only |
| **SUPER_ADMIN** | See all responses from all forms | All tenants (or filter by tenantId) |

---

### 2. Get Responses for Specific Form (Existing - Unchanged)

#### Endpoint Details

```
GET /api/forms/{formId}/responses
```

#### Description

Retrieve form submissions for a **specific form**. Behavior unchanged from before.

---

## Request Examples

### Example 1: SUPER_ADMIN - Get ALL Data from ALL Tenants

```bash
curl -X GET "http://localhost:3000/api/forms/responses" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 250,
  "data": [
    {
      "id": "resp-1",
      "tenant_id": "tenant-abc",
      "user_id": "user-123",
      "form_id": "form-xyz",
      "employee_name": "John Doe",
      "department": "IT",
      "source_table": "tenant_abc_form_xyz",
      "created_at": "2025-10-22T10:30:00.000Z",
      "updated_at": "2025-10-22T10:30:00.000Z"
    },
    {
      "id": "resp-2",
      "tenant_id": "tenant-def",
      "user_id": "user-456",
      "form_id": "form-uvw",
      "employee_name": "Jane Smith",
      "department": "HR",
      "source_table": "tenant_def_form_uvw",
      "created_at": "2025-10-21T09:15:00.000Z",
      "updated_at": "2025-10-21T09:15:00.000Z"
    }
  ],
  "tables": [
    "tenant_abc_form_xyz",
    "tenant_abc_form_123",
    "tenant_def_form_uvw",
    "tenant_ghi_form_789"
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 250
  },
  "note": "Showing responses from all tenants"
}
```

### Example 2: SUPER_ADMIN - Get Data for Specific Tenant

```bash
curl -X GET "http://localhost:3000/api/forms/responses?tenantId=tenant-abc-uuid" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 45,
  "data": [
    {
      "id": "resp-1",
      "tenant_id": "tenant-abc-uuid",
      "user_id": "user-123",
      "form_id": "form-xyz",
      "employee_name": "John Doe",
      "source_table": "tenant_abc_form_xyz",
      "created_at": "2025-10-22T10:30:00.000Z"
    }
  ],
  "tables": [
    "tenant_abc_form_xyz",
    "tenant_abc_form_123"
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 45
  },
  "note": "Showing responses for tenant tenant-abc-uuid"
}
```

### Example 3: ADMIN - Get All Responses in Their Tenant

```bash
curl -X GET "http://localhost:3000/api/forms/responses" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 35,
  "data": [
    {
      "id": "resp-1",
      "tenant_id": "tenant-abc",
      "user_id": "user-123",
      "form_id": "form-xyz",
      "employee_name": "John Doe",
      "source_table": "tenant_abc_form_xyz",
      "created_at": "2025-10-22T10:30:00.000Z"
    }
  ],
  "tables": [
    "tenant_abc_form_xyz",
    "tenant_abc_form_123"
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 35
  },
  "note": "Showing responses for tenant tenant-abc"
}
```

### Example 4: STAFF - Get Only Own Responses from All Forms

```bash
curl -X GET "http://localhost:3000/api/forms/responses" \
  -H "Authorization: Bearer YOUR_STAFF_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "resp-1",
      "tenant_id": "tenant-abc",
      "user_id": "user-123",
      "form_id": "form-xyz",
      "employee_name": "John Doe",
      "source_table": "tenant_abc_form_xyz",
      "created_at": "2025-10-22T10:30:00.000Z"
    }
  ],
  "tables": [
    "tenant_abc_form_xyz",
    "tenant_abc_form_123"
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 5
  },
  "note": "Showing responses for tenant tenant-abc"
}
```

### Example 5: Get Responses with Pagination

```bash
curl -X GET "http://localhost:3000/api/forms/responses?limit=50&offset=100" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 250,
  "data": [...],
  "tables": [...],
  "pagination": {
    "limit": 50,
    "offset": 100,
    "total": 250
  },
  "note": "Showing responses from all tenants"
}
```

### Example 6: Existing Endpoint - Get Responses for Specific Form

```bash
curl -X GET "http://localhost:3000/api/forms/form-uuid/responses" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 12,
  "data": [...],
  "tableName": "tenant_abc_form_xyz",
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 12
  }
}
```

---

## Response Format

### Success Response (200 OK)

When **formId is NOT provided**:
```json
{
  "success": true,
  "count": 250,
  "data": [
    {
      "id": "response-id",
      "tenant_id": "tenant-uuid",
      "user_id": "user-uuid",
      "form_id": "form-uuid",
      "source_table": "tenant_xxx_form_yyy",
      "field1": "value1",
      "field2": "value2",
      "created_at": "2025-10-22T10:30:00.000Z",
      "updated_at": "2025-10-22T10:30:00.000Z"
    }
  ],
  "tables": ["table1", "table2", "table3"],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 250
  },
  "note": "Showing responses from all tenants" // or "Showing responses for tenant {tenantId}"
}
```

When **formId IS provided**:
```json
{
  "success": true,
  "count": 12,
  "data": [...],
  "tableName": "tenant_abc_form_xyz",
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 12
  }
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `success` | Boolean indicating success |
| `count` | Total number of matching responses |
| `data` | Array of response objects |
| `tables` | List of all tables queried (only when formId not provided) |
| `tableName` | Single table name (only when formId provided) |
| `source_table` | Table name for each response (only when formId not provided) |
| `pagination` | Pagination info (limit, offset, total) |
| `note` | Informational message about data scope |

---

## Error Responses

**401 Unauthorized** - Missing or invalid authentication
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**400 Bad Request** - Missing tenantId for non-SUPER_ADMIN
```json
{
  "success": false,
  "message": "tenantId is required"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to retrieve form responses"
}
```

---

## Comparison: With vs Without FormId

### Without FormId (NEW)

```
GET /api/forms/responses
```

**Behavior:**
- Queries **ALL form tables** in database
- Uses UNION query to combine data from multiple tables
- SUPER_ADMIN can see across all tenants
- Returns `tables` array showing all queried tables
- Returns `source_table` field in each response
- Returns `note` field explaining scope

### With FormId (Existing)

```
GET /api/forms/{formId}/responses
```

**Behavior:**
- Queries **ONE specific form table**
- Simpler, faster query for single table
- Tenant isolation always enforced (except SUPER_ADMIN)
- Returns `tableName` (singular)
- No `source_table` field needed
- No `note` field

---

## Use Cases

### Use Cases for GET /api/forms/responses (No FormId)

1. **System-Wide Reporting**: SUPER_ADMIN generates reports across all organizations
2. **User Activity Dashboard**: Show all submissions by current user across all forms
3. **Cross-Form Analytics**: Analyze patterns across multiple form types
4. **Tenant Overview**: ADMIN views all activity in their organization
5. **Data Export**: Export all form data for backup or migration
6. **Audit Trail**: Track all submissions across the system
7. **Global Search**: Search for specific data across all forms

### Use Cases for GET /api/forms/{formId}/responses (With FormId)

1. **Form-Specific Analysis**: View responses for a particular form
2. **Form Management**: Review submissions for specific form type
3. **Performance**: Faster queries when you know the form
4. **Focused Reports**: Generate reports for specific form

---

## Technical Details

### Database Query Strategy

#### Without FormId (Union Query)

1. Find all dynamic form tables matching pattern
2. Build UNION ALL query combining all tables
3. Add WHERE clauses for tenant/user filtering
4. Order by created_at DESC
5. Apply LIMIT and OFFSET
6. Execute separate COUNT query for total

**Query Pattern:**
```sql
SELECT * FROM (
  SELECT *, 'table1' as source_table FROM "tenant_abc_form_xyz" WHERE ...
  UNION ALL
  SELECT *, 'table2' as source_table FROM "tenant_abc_form_123" WHERE ...
  UNION ALL
  ...
) as all_responses
ORDER BY "created_at" DESC
LIMIT 100 OFFSET 0
```

#### With FormId (Single Table Query)

1. Generate table name from tenant and form IDs
2. Check table exists
3. Query single table with WHERE clause
4. Order by created_at DESC
5. Apply LIMIT and OFFSET

**Query Pattern:**
```sql
SELECT * FROM "tenant_abc_form_xyz"
WHERE "tenant_id" = 'tenant-uuid' AND "form_id" = 'form-uuid'
ORDER BY "created_at" DESC
LIMIT 100 OFFSET 0
```

### Performance Considerations

| Aspect | Without FormId | With FormId |
|--------|----------------|-------------|
| **Query Complexity** | High (UNION of many tables) | Low (single table) |
| **Response Time** | Slower (multiple tables) | Faster (one table) |
| **Data Volume** | Potentially very large | Typically smaller |
| **Best For** | Cross-form analysis, reporting | Form-specific queries |

**Recommendations:**
- Use **without formId** for dashboards and reports needing cross-form data
- Use **with formId** for form-specific operations and better performance
- Apply pagination for large datasets
- Consider caching for frequently accessed reports

---

## Security & Authorization

### Authorization Matrix

| User Role | Without FormId | With FormId |
|-----------|----------------|-------------|
| **STAFF** | Own responses, own tenant | Own responses, own tenant |
| **GUARDIAN** | Own responses, own tenant | Own responses, own tenant |
| **ADMIN** | All responses, own tenant | All responses, own tenant |
| **SUPER_ADMIN** | All responses, all tenants (optional filter) | All responses, specify tenant |

### Security Features

1. **Role-Based Access Control**: Enforced at controller level
2. **Tenant Isolation**: Automatic for non-SUPER_ADMIN roles
3. **User Filtering**: STAFF/GUARDIAN automatically filtered to own data
4. **JWT Authentication**: Required for all requests
5. **Query Parameter Validation**: Limit, offset validated and capped
6. **SQL Injection Protection**: Parameterized queries used

---

## Testing

### Test Scenarios

#### Test 1: SUPER_ADMIN - All Data
```bash
# Should return all responses from all tenants
curl -X GET "http://localhost:3000/api/forms/responses" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

#### Test 2: SUPER_ADMIN - Specific Tenant
```bash
# Should return all responses for specified tenant only
curl -X GET "http://localhost:3000/api/forms/responses?tenantId=tenant-uuid" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

#### Test 3: ADMIN - All Forms in Tenant
```bash
# Should return all responses in admin's tenant
curl -X GET "http://localhost:3000/api/forms/responses" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Test 4: STAFF - Own Responses
```bash
# Should return only staff member's own responses
curl -X GET "http://localhost:3000/api/forms/responses" \
  -H "Authorization: Bearer STAFF_TOKEN"
```

#### Test 5: Pagination
```bash
# Should return paginated results
curl -X GET "http://localhost:3000/api/forms/responses?limit=20&offset=40" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

#### Test 6: Specific Form (Original)
```bash
# Should work as before
curl -X GET "http://localhost:3000/api/forms/form-uuid/responses" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Testing Checklist

- [ ] SUPER_ADMIN without tenantId gets all data
- [ ] SUPER_ADMIN with tenantId gets filtered data
- [ ] ADMIN gets all forms in their tenant
- [ ] STAFF gets only their own responses
- [ ] Pagination works correctly
- [ ] Returns correct table list
- [ ] source_table field populated correctly
- [ ] Original endpoint still works
- [ ] Empty results handled gracefully
- [ ] Large datasets perform acceptably

---

## Migration Notes

### Breaking Changes

**None.** This is a **backward-compatible** enhancement.

### What Changed

✅ **Added**: New route `/api/forms/responses` (without formId)  
✅ **Enhanced**: Controller handles both with and without formId  
✅ **Added**: New service function `getAllFormSubmissions()`  
✅ **Unchanged**: Existing `/api/forms/:formId/responses` behavior  

### Deployment Steps

1. Deploy updated service layer (`formData.service.js`)
2. Deploy updated controller (`form.controller.js`)
3. Deploy updated routes (`form.routes.js`)
4. Test new endpoint with various roles
5. Update API documentation
6. Notify users of new feature

---

## Summary

### Key Features

✅ Retrieve responses across **all forms**  
✅ SUPER_ADMIN can see **all tenant data**  
✅ Role-based access control maintained  
✅ Pagination support  
✅ Backward compatible  
✅ Performance optimized with UNION queries  
✅ Returns source table information  

### Quick Reference

| Endpoint | FormId | Scope | Use Case |
|----------|--------|-------|----------|
| `GET /api/forms/responses` | ❌ No | All forms | Cross-form reporting, dashboards |
| `GET /api/forms/{formId}/responses` | ✅ Yes | One form | Form-specific queries, better performance |

### Implementation Files

1. **src/services/formData.service.js** - Added `getAllFormSubmissions()`
2. **src/controllers/form.controller.js** - Enhanced `getResponses()`
3. **src/routes/form.routes.js** - Added new route
4. **GET_ALL_RESPONSES_API.md** - This documentation

The enhanced API provides powerful cross-form querying capabilities while maintaining security and backward compatibility!


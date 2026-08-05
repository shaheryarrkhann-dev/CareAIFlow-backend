# User Response API - Quick Reference

## New Endpoint: Get Specific User's Form Response

This API endpoint allows you to retrieve a specific user's response(s) for a particular form.

### Endpoint Details

```
GET /api/forms/{formId}/user/{userId}/response
```

### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `formId` | UUID | Path | ✅ Yes | The form schema ID |
| `userId` | UUID | Path | ✅ Yes | The user ID whose response to retrieve |
| `tenantId` | UUID | Query | ⚠️ Optional | For SUPER_ADMIN to query specific tenant |

### Authentication

- **Required**: Bearer token (JWT)
- **Header**: `Authorization: Bearer <your-token>`

### Authorization Rules

| Role | Permission |
|------|------------|
| **STAFF** | Can only view their own responses |
| **GUARDIAN** | Can only view their own responses |
| **ADMIN** | Can view any user's response in their tenant |
| **SUPER_ADMIN** | Can view any user's response in any tenant |

### Request Examples

#### Example 1: Get Your Own Response (STAFF/GUARDIAN)

```bash
curl -X GET "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Example 2: Get Another User's Response (ADMIN)

```bash
curl -X GET "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

#### Example 3: Get User Response for Specific Tenant (SUPER_ADMIN)

```bash
curl -X GET "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response?tenantId=tenant-uuid" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN"
```

### Response Format

#### Success Response (200 OK)

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "submission-id-1",
      "tenant_id": "tenant-uuid",
      "user_id": "user-uuid",
      "form_id": "form-uuid",
      "employee_name": "John Doe",
      "department": "IT",
      "joining_date": "2025-01-15",
      "created_at": "2025-10-18T10:30:00.000Z",
      "updated_at": "2025-10-18T10:30:00.000Z"
    },
    {
      "id": "submission-id-2",
      "tenant_id": "tenant-uuid",
      "user_id": "user-uuid",
      "form_id": "form-uuid",
      "employee_name": "John Doe Updated",
      "department": "Engineering",
      "joining_date": "2025-02-01",
      "created_at": "2025-10-17T09:20:00.000Z",
      "updated_at": "2025-10-17T09:20:00.000Z"
    }
  ],
  "tableName": "tenant_abc123_form_def456",
  "userId": "user-uuid"
}
```

#### No Responses Found (200 OK)

```json
{
  "success": true,
  "count": 0,
  "data": [],
  "tableName": "tenant_abc123_form_def456",
  "userId": "user-uuid"
}
```

#### Error Responses

**401 Unauthorized** - Missing or invalid authentication
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**403 Forbidden** - Trying to view another user's response without permission
```json
{
  "success": false,
  "message": "You do not have permission to view other users' responses"
}
```

**400 Bad Request** - Missing required parameters
```json
{
  "success": false,
  "message": "userId is required"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to retrieve user response"
}
```

## Comparison with Existing API

### Existing API: `/api/forms/{formId}/responses`

- Returns **all responses** for a form
- STAFF/GUARDIAN: automatically filtered to their own responses
- ADMIN/SUPER_ADMIN: see all responses for the tenant
- Supports pagination (limit, offset)

### New API: `/api/forms/{formId}/user/{userId}/response`

- Returns responses for a **specific user**
- Explicit userId in the path
- STAFF/GUARDIAN: can only request their own userId
- ADMIN/SUPER_ADMIN: can request any userId in their tenant
- No pagination (returns all responses for that user)

## Use Cases

1. **Admin Dashboard**: View a specific user's submission history
2. **User Profile**: Show a user's form responses
3. **Audit Trail**: Track specific user's form submissions
4. **Support**: Help desk retrieving user's submitted data
5. **Reporting**: Generate user-specific reports

## Integration with Swagger

The new endpoint is fully documented in Swagger UI. Visit:

```
http://localhost:3000/api-docs
```

Look for the **AI-Powered Forms** section, and you'll find:
- `GET /api/forms/{formId}/user/{userId}/response` - Get specific user's form response

## Notes

- The API returns data from dynamically created tables (one per tenant-form combination)
- Results are ordered by `created_at` DESC (newest first)
- All user responses for the form are returned (no pagination on this endpoint)
- The table structure matches the form schema fields
- Empty array is returned if no submissions found (not an error)

## Testing

You can test this endpoint using:
1. **Swagger UI** at `/api-docs`
2. **Postman** or any API client
3. **curl** as shown in examples above

Remember to:
- Have valid JWT token
- Ensure the form has been submitted at least once
- Use correct UUIDs for formId and userId
- Respect role-based access controls


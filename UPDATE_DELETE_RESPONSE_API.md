# Update and Delete Response APIs - Quick Reference

## Overview

These APIs allow users to update and delete their form responses. This document covers two new endpoints for managing user responses in the AI-powered forms system.

---

## 1. Update User Response

### Endpoint Details

```
PUT /api/forms/{formId}/user/{userId}/response/{responseId}
```

### Description

Update a specific user's form response. Users can modify their previously submitted form data.

### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `formId` | UUID | Path | ✅ Yes | The form schema ID |
| `userId` | UUID | Path | ✅ Yes | The user ID whose response to update |
| `responseId` | UUID | Path | ✅ Yes | The specific response/submission ID to update |
| `tenantId` | UUID | Query | ⚠️ Optional | For SUPER_ADMIN to query specific tenant |

### Request Body

The request body should contain the form fields you want to update. You don't need to include all fields - only the ones you want to change.

```json
{
  "employee_name": "John Doe Updated",
  "department": "Engineering",
  "salary": 75000
}
```

### Authentication

- **Required**: Bearer token (JWT)
- **Header**: `Authorization: Bearer <your-token>`

### Authorization Rules

| Role | Permission |
|------|------------|
| **STAFF** | Can only update their own responses |
| **GUARDIAN** | Can only update their own responses |
| **ADMIN** | Can update any user's response in their tenant |
| **SUPER_ADMIN** | Can update any user's response in any tenant |

### Request Examples

#### Example 1: Update Your Own Response (STAFF/GUARDIAN)

```bash
curl -X PUT "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "Jane Smith",
    "department": "Marketing"
  }'
```

#### Example 2: Update Another User's Response (ADMIN)

```bash
curl -X PUT "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "Engineering",
    "salary": 80000
  }'
```

#### Example 3: Update Response for Specific Tenant (SUPER_ADMIN)

```bash
curl -X PUT "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123?tenantId=tenant-uuid" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "Updated Name",
    "status": "Active"
  }'
```

### Response Format

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Response updated successfully",
  "data": {
    "id": "response-123",
    "tenant_id": "tenant-uuid",
    "user_id": "user-uuid",
    "form_id": "form-uuid",
    "employee_name": "Jane Smith",
    "department": "Marketing",
    "salary": 75000,
    "created_at": "2025-10-18T10:30:00.000Z",
    "updated_at": "2025-10-22T14:25:00.000Z"
  },
  "tableName": "tenant_abc123_form_def456"
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

**403 Forbidden** - Trying to update another user's response without permission
```json
{
  "success": false,
  "message": "You do not have permission to update other users' responses"
}
```

**404 Not Found** - Response doesn't exist or access denied
```json
{
  "success": false,
  "message": "Response not found or access denied"
}
```

**400 Bad Request** - No fields to update
```json
{
  "success": false,
  "message": "No valid fields to update"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to update user response"
}
```

---

## 2. Delete User Response

### Endpoint Details

```
DELETE /api/forms/{formId}/user/{userId}/response/{responseId}
```

### Description

Delete a specific user's form response. This permanently removes the submission from the database.

### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `formId` | UUID | Path | ✅ Yes | The form schema ID |
| `userId` | UUID | Path | ✅ Yes | The user ID whose response to delete |
| `responseId` | UUID | Path | ✅ Yes | The specific response/submission ID to delete |
| `tenantId` | UUID | Query | ⚠️ Optional | For SUPER_ADMIN to query specific tenant |

### Authentication

- **Required**: Bearer token (JWT)
- **Header**: `Authorization: Bearer <your-token>`

### Authorization Rules

| Role | Permission |
|------|------------|
| **STAFF** | Can only delete their own responses |
| **GUARDIAN** | Can only delete their own responses |
| **ADMIN** | Can delete any user's response in their tenant |
| **SUPER_ADMIN** | Can delete any user's response in any tenant |

### Request Examples

#### Example 1: Delete Your Own Response (STAFF/GUARDIAN)

```bash
curl -X DELETE "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Example 2: Delete Another User's Response (ADMIN)

```bash
curl -X DELETE "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

#### Example 3: Delete Response for Specific Tenant (SUPER_ADMIN)

```bash
curl -X DELETE "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123?tenantId=tenant-uuid" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN"
```

### Response Format

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Response deleted successfully",
  "deleted": true,
  "deletedData": {
    "id": "response-123",
    "tenant_id": "tenant-uuid",
    "user_id": "user-uuid",
    "form_id": "form-uuid",
    "employee_name": "John Doe",
    "department": "IT",
    "created_at": "2025-10-18T10:30:00.000Z",
    "updated_at": "2025-10-18T10:30:00.000Z"
  },
  "tableName": "tenant_abc123_form_def456"
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

**403 Forbidden** - Trying to delete another user's response without permission
```json
{
  "success": false,
  "message": "You do not have permission to delete other users' responses"
}
```

**404 Not Found** - Response doesn't exist or access denied
```json
{
  "success": false,
  "message": "Response not found or access denied"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to delete user response"
}
```

---

## Complete API Workflow Example

Here's a complete workflow showing how to create, read, update, and delete responses:

### Step 1: Submit a Form (Create)

```bash
curl -X POST "http://localhost:3000/api/forms/abc-123-form-id/submit" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "IT",
    "salary": 65000
  }'
```

Response:
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "submissionId": "response-123"
}
```

### Step 2: Get User's Responses (Read)

```bash
curl -X GET "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "success": true,
  "count": 1,
  "data": [{
    "id": "response-123",
    "employee_name": "John Doe",
    "department": "IT",
    "salary": 65000
  }]
}
```

### Step 3: Update the Response (Update)

```bash
curl -X PUT "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "department": "Engineering",
    "salary": 75000
  }'
```

Response:
```json
{
  "success": true,
  "message": "Response updated successfully",
  "data": {
    "id": "response-123",
    "employee_name": "John Doe",
    "department": "Engineering",
    "salary": 75000,
    "updated_at": "2025-10-22T14:25:00.000Z"
  }
}
```

### Step 4: Delete the Response (Delete)

```bash
curl -X DELETE "http://localhost:3000/api/forms/abc-123-form-id/user/xyz-789-user-id/response/response-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "success": true,
  "message": "Response deleted successfully",
  "deleted": true
}
```

---

## Use Cases

### Update Response Use Cases

1. **Error Correction**: User notices a typo or mistake in their submission
2. **Status Changes**: Update status fields as work progresses
3. **Data Updates**: Keep information current (e.g., salary changes, department transfers)
4. **Admin Corrections**: Admins can fix data entry errors for their team
5. **Partial Updates**: Update only specific fields without resending all data

### Delete Response Use Cases

1. **Duplicate Removal**: Delete duplicate submissions
2. **Test Data Cleanup**: Remove test submissions
3. **Data Privacy**: Allow users to remove their data
4. **Admin Moderation**: Admins can remove inappropriate or invalid submissions
5. **Compliance**: Support "right to be forgotten" requirements

---

## Security & Validation

### Security Features

1. **Authentication Required**: All endpoints require valid JWT token
2. **Authorization Checks**: Role-based access control enforced
3. **Tenant Isolation**: Users can only access data in their tenant
4. **User Verification**: Users can only modify their own data (unless ADMIN/SUPER_ADMIN)
5. **Response Ownership**: Validates response belongs to the specified user

### Data Validation

1. **Schema Validation**: Updates validated against form schema
2. **Field Type Checking**: Data types enforced (date, number, text, etc.)
3. **Field Normalization**: Flexible field name matching
4. **Existence Checks**: Verifies form and response exist before operations
5. **Partial Updates**: Only provided fields are updated

### Best Practices

1. **Use Response IDs**: Always use the specific response ID from GET requests
2. **Partial Updates**: Only send fields that need to change
3. **Check Permissions**: Ensure user has appropriate role before attempting operations
4. **Handle Errors**: Implement proper error handling for 403, 404 responses
5. **Audit Trail**: Track who makes changes (logged via JWT user info)

---

## Integration with Existing APIs

### Related Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/forms/:formId/submit` | POST | Create new response |
| `/api/forms/:formId/responses` | GET | Get all responses for a form |
| `/api/forms/:formId/user/:userId/response` | GET | Get specific user's responses |
| `/api/forms/:formId/user/:userId/response/:responseId` | PUT | **Update specific response** |
| `/api/forms/:formId/user/:userId/response/:responseId` | DELETE | **Delete specific response** |

---

## Testing

### Using Swagger UI

Visit `http://localhost:3000/api-docs` and look for the **AI-Powered Forms** section:

- `PUT /api/forms/{formId}/user/{userId}/response/{responseId}` - Update response
- `DELETE /api/forms/{formId}/user/{userId}/response/{responseId}` - Delete response

### Using Postman

1. Set up authentication with Bearer token
2. Use the endpoint URLs as shown in examples
3. For UPDATE: Set Content-Type to `application/json` and provide request body
4. For DELETE: No request body needed

### Testing Checklist

- [ ] Test as STAFF user updating own response
- [ ] Test as STAFF user trying to update another's response (should fail)
- [ ] Test as ADMIN updating any user's response in tenant
- [ ] Test as SUPER_ADMIN with tenantId parameter
- [ ] Test updating non-existent response (should return 404)
- [ ] Test deleting own response
- [ ] Test deleting with invalid response ID
- [ ] Test partial updates (only some fields)
- [ ] Verify updated_at timestamp changes on update
- [ ] Verify deleted data is actually removed from database

---

## Notes

- **Permanent Deletion**: DELETE operation is permanent and cannot be undone
- **Partial Updates**: UPDATE only modifies fields included in request body
- **Timestamp Tracking**: `updated_at` field is automatically updated on changes
- **Dynamic Tables**: Operations work on dynamically created tenant-specific tables
- **Data Integrity**: Updates maintain data type integrity based on form schema
- **Audit Trail**: All operations are logged with user information from JWT

---

## Error Handling

### Common Error Scenarios

1. **Invalid Response ID**: Returns 404 with "Response not found"
2. **Wrong User**: Returns 403 with "You do not have permission"
3. **No Auth Token**: Returns 401 with "Authentication required"
4. **Empty Update**: Returns 400 with "No valid fields to update"
5. **Invalid Tenant**: Returns 400 with "tenantId is required"

### Troubleshooting Tips

| Issue | Solution |
|-------|----------|
| 404 Response not found | Verify responseId exists using GET endpoint first |
| 403 Permission denied | Check user role and ensure userId matches authenticated user |
| 400 No fields to update | Ensure request body contains valid form fields |
| 401 Authentication error | Verify JWT token is valid and not expired |
| 500 Server error | Check server logs for detailed error information |

---

## Summary

These new APIs complete the CRUD operations for form responses:

✅ **Create** - `POST /api/forms/:formId/submit`  
✅ **Read** - `GET /api/forms/:formId/user/:userId/response`  
✅ **Update** - `PUT /api/forms/:formId/user/:userId/response/:responseId` (NEW)  
✅ **Delete** - `DELETE /api/forms/:formId/user/:userId/response/:responseId` (NEW)

The system now supports complete lifecycle management of form submissions with proper authentication, authorization, and data validation.


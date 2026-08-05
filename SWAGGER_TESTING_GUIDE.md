# Swagger Documentation Testing Guide

## Quick Start

### Access Swagger UI

```
http://localhost:3000/api-docs
```

---

## Authentication Setup

Before testing any endpoints:

1. **Login to get token**
   - Go to **Authentication** section
   - Find `POST /api/auth/login`
   - Click "Try it out"
   - Enter credentials:
     ```json
     {
       "email": "your-email@example.com",
       "password": "your-password"
     }
     ```
   - Click "Execute"
   - Copy the `accessToken` from response

2. **Set Bearer Token**
   - Click the **"Authorize"** button at the top
   - Enter: `Bearer YOUR_ACCESS_TOKEN`
   - Click "Authorize"
   - Click "Close"

Now you can test protected endpoints! 🎉

---

## Testing New Endpoints

### 1. Get All Responses (Cross-Form)

**Endpoint:** `GET /api/forms/responses`

**Steps:**
1. Navigate to **AI-Powered Forms** section
2. Find `GET /api/forms/responses`
3. Click "Try it out"
4. **Optional parameters:**
   - `tenantId`: Leave empty (SUPER_ADMIN) or omit
   - `limit`: 20
   - `offset`: 0
5. Click "Execute"

**Expected Response:**
```json
{
  "success": true,
  "count": 20,
  "data": [...],
  "tables": ["tenant_abc_form_xyz", ...],
  "pagination": {...},
  "note": "Showing responses from all tenants"
}
```

---

### 2. Update User Response

**Endpoint:** `PUT /api/forms/{formId}/user/{userId}/response/{responseId}`

**Steps:**
1. Navigate to **AI-Powered Forms** section
2. Find `PUT /api/forms/{formId}/user/{userId}/response/{responseId}`
3. Click "Try it out"
4. **Fill parameters:**
   - `formId`: Your form UUID
   - `userId`: Your user UUID
   - `responseId`: Response UUID to update
   - `tenantId`: (optional)
5. **Request body:**
   ```json
   {
     "employee_name": "Updated Name",
     "department": "Engineering"
   }
   ```
6. Click "Execute"

**Expected Response:**
```json
{
  "success": true,
  "message": "Response updated successfully",
  "data": {...},
  "tableName": "tenant_abc_form_xyz"
}
```

---

### 3. Delete User Response

**Endpoint:** `DELETE /api/forms/{formId}/user/{userId}/response/{responseId}`

**Steps:**
1. Navigate to **AI-Powered Forms** section
2. Find `DELETE /api/forms/{formId}/user/{userId}/response/{responseId}`
3. Click "Try it out"
4. **Fill parameters:**
   - `formId`: Your form UUID
   - `userId`: Your user UUID
   - `responseId`: Response UUID to delete
   - `tenantId`: (optional)
5. Click "Execute"

**Expected Response:**
```json
{
  "success": true,
  "message": "Response deleted successfully",
  "deleted": true,
  "deletedData": {...},
  "tableName": "tenant_abc_form_xyz"
}
```

---

## Testing Pagination

### Test Schemas Pagination

**Endpoint:** `GET /api/forms/schemas`

**Test Cases:**

#### Test 1: Default (First 100)
```
Parameters: (leave empty)
Expected: First 100 schemas
```

#### Test 2: Custom Page Size
```
Parameters:
  limit: 20
  offset: 0
Expected: First 20 schemas
```

#### Test 3: Second Page
```
Parameters:
  limit: 20
  offset: 20
Expected: Items 21-40
```

#### Test 4: Large Limit (Capped)
```
Parameters:
  limit: 1000
Expected: Max 500 schemas (capped)
```

---

### Test Drafts Pagination

**Endpoint:** `GET /api/forms/drafts`

**Test Cases:**

#### Test 1: All Drafts (First Page)
```
Parameters:
  limit: 10
  offset: 0
Expected: First 10 drafts
```

#### Test 2: Specific Form Drafts
```
Endpoint: GET /api/forms/{formId}/drafts
Parameters:
  formId: your-form-uuid
  limit: 5
  offset: 0
Expected: First 5 drafts for that form
```

---

### Test Templates Pagination

**Endpoint:** `GET /api/embeddings/templates`

**Test Cases:**

#### Test 1: First Page
```
Parameters:
  limit: 20
  offset: 0
Expected: First 20 templates
```

#### Test 2: Pagination Navigation
```
Page 1: offset=0, limit=20
Page 2: offset=20, limit=20
Page 3: offset=40, limit=20
```

---

## Testing Role-Based Access

### As STAFF User

1. **Login as STAFF**
2. **Test Own Response Access:**
   - ✅ Can GET own responses
   - ✅ Can UPDATE own responses
   - ✅ Can DELETE own responses
3. **Test Other User Access:**
   - ❌ Should fail with 403 for other users

### As ADMIN User

1. **Login as ADMIN**
2. **Test Tenant-Wide Access:**
   - ✅ Can GET any user's responses in tenant
   - ✅ Can UPDATE any user's responses in tenant
   - ✅ Can DELETE any user's responses in tenant
3. **Test Cross-Tenant Access:**
   - ❌ Should fail with 403 for other tenants

### As SUPER_ADMIN User

1. **Login as SUPER_ADMIN**
2. **Test All-Access:**
   - ✅ Can GET responses from all tenants
   - ✅ Can UPDATE any response
   - ✅ Can DELETE any response
3. **Test Tenant Filtering:**
   - ✅ Can filter by tenantId parameter

---

## Complete CRUD Workflow Test

### Scenario: Employee Form Management

#### Step 1: Create Form Schema
```
POST /api/forms/generate-schema
Body: {
  "formName": "Employee Onboarding",
  "description": "New employee information"
}
```

#### Step 2: Submit Form
```
POST /api/forms/{formId}/submit
Body: {
  "employee_name": "John Doe",
  "department": "IT",
  "salary": 65000
}
Note: Save the submissionId
```

#### Step 3: Get Responses
```
GET /api/forms/{formId}/responses
```

#### Step 4: Get User's Response
```
GET /api/forms/{formId}/user/{userId}/response
```

#### Step 5: Update Response
```
PUT /api/forms/{formId}/user/{userId}/response/{responseId}
Body: {
  "department": "Engineering",
  "salary": 75000
}
```

#### Step 6: Get Updated Response
```
GET /api/forms/{formId}/user/{userId}/response
Verify: Check updated fields
```

#### Step 7: Delete Response
```
DELETE /api/forms/{formId}/user/{userId}/response/{responseId}
```

#### Step 8: Verify Deletion
```
GET /api/forms/{formId}/user/{userId}/response
Verify: Empty data array
```

---

## Testing Error Scenarios

### Test 1: Unauthorized Access
```
1. Don't set Bearer token
2. Try any protected endpoint
Expected: 401 Unauthorized
```

### Test 2: Forbidden Access
```
1. Login as STAFF
2. Try to access another user's response
Expected: 403 Forbidden
```

### Test 3: Not Found
```
1. Use non-existent UUID
Expected: 404 Not Found
```

### Test 4: Validation Error
```
1. Submit incomplete data
Expected: 400 Bad Request
```

### Test 5: Invalid Parameters
```
1. Use negative pagination values
Expected: Uses defaults (0, 100)
```

---

## Swagger UI Tips

### Keyboard Shortcuts
- **Tab**: Move between fields
- **Enter**: Execute request
- **Esc**: Close modals

### Copying Responses
1. Click response body
2. Click "Copy" button
3. Paste into your code

### Downloading Spec
1. Click `/api-docs/swagger.json`
2. Save the JSON file
3. Use for code generation tools

### Schemas Section
- Explore all data models
- See field types and requirements
- Use for TypeScript interfaces

---

## Common Issues & Solutions

### Issue 1: 401 Unauthorized

**Solution:**
- Check Bearer token is set
- Token might be expired - login again
- Ensure "Bearer " prefix in token

### Issue 2: 403 Forbidden

**Solution:**
- Check user role permissions
- Verify accessing own data (for STAFF)
- Confirm tenantId if SUPER_ADMIN

### Issue 3: 404 Not Found

**Solution:**
- Verify UUID is correct
- Check resource exists
- Ensure proper tenant context

### Issue 4: No Responses

**Solution:**
- Submit form first
- Check correct formId
- Verify user has permissions

### Issue 5: CORS Error

**Solution:**
- Access from same origin
- Check CORS settings
- Use Swagger UI directly

---

## Advanced Testing

### Testing with cURL

Export request as cURL from Swagger UI:
1. Execute request in Swagger
2. Look for "curl" in response
3. Copy command
4. Run in terminal

Example:
```bash
curl -X PUT "http://localhost:3000/api/forms/abc/user/xyz/response/123" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_name":"Updated"}'
```

### Testing with Postman

1. Export OpenAPI spec from Swagger
2. Import into Postman
3. Create environment variables
4. Test with collections

### Automated Testing

Use the OpenAPI spec for:
- **Code generation**: TypeScript, Python clients
- **Mock servers**: Prism, MockServer
- **Contract testing**: Dredd, Pact
- **Load testing**: K6, Artillery

---

## Verification Checklist

### New Endpoints
- [ ] GET /api/forms/responses works
- [ ] PUT update response works
- [ ] DELETE response works
- [ ] GET templates with pagination works

### Pagination
- [ ] Schemas pagination works
- [ ] Drafts pagination works  
- [ ] Templates pagination works
- [ ] Limit parameter enforced (max 500)
- [ ] Offset parameter works
- [ ] Pagination object in responses

### Authorization
- [ ] STAFF can only access own data
- [ ] ADMIN can access tenant data
- [ ] SUPER_ADMIN can access all data
- [ ] Proper 403 errors for unauthorized access

### Response Format
- [ ] All responses have `success` field
- [ ] Paginated responses have `pagination` object
- [ ] Paginated responses have `total` field
- [ ] Error responses follow standard format

---

## Performance Testing

### Test Large Datasets

```
1. Create 500+ schemas
2. Test pagination performance
3. Verify response times < 2s
4. Check offset performance
```

### Test Concurrent Requests

```
1. Open multiple Swagger tabs
2. Execute same endpoint simultaneously
3. Verify no conflicts
4. Check response consistency
```

---

## Documentation Review

### For Each Endpoint Check:
- [ ] Summary is clear
- [ ] Description is detailed
- [ ] Parameters documented
- [ ] Request body examples provided
- [ ] Response examples provided
- [ ] Error responses documented
- [ ] Authorization rules clear

---

## Quick Reference

| Endpoint | Method | Test With |
|----------|--------|-----------|
| Get all responses | GET | No body needed |
| Get schemas | GET | Add limit/offset |
| Get drafts | GET | Add limit/offset |
| Get templates | GET | Add limit/offset |
| Update response | PUT | Form data in body |
| Delete response | DELETE | No body needed |

---

## Support

### If Tests Fail:
1. Check authentication token
2. Verify user role/permissions
3. Confirm resource exists
4. Check server logs
5. Review endpoint documentation

### For Help:
- Review API documentation
- Check error messages
- Test with simpler requests
- Verify data in database

---

## Summary

✅ **Access**: http://localhost:3000/api-docs  
✅ **Authenticate**: Use Bearer token  
✅ **Test**: Try all new endpoints  
✅ **Verify**: Check responses match docs  
✅ **Explore**: Use Swagger UI features  

Happy testing! 🚀


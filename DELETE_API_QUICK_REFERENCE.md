# Delete Organization API - Quick Reference

## ✅ What Was Implemented

### Backend
- ✅ DELETE endpoint: `/api/tenants/:id`
- ✅ SUPER_ADMIN only authorization
- ✅ Cascade delete all related data
- ✅ Returns count of deleted records
- ✅ Full Swagger documentation

### Frontend
- ✅ `deleteOrganization()` API function
- ✅ Delete confirmation modal
- ✅ Success/error toast notifications
- ✅ Auto-refresh after deletion

## 🚀 Quick Test

### Using Frontend
1. Login as SUPER_ADMIN:
   - Email: `alirazaarif@yopmail.com`
   - Password: `Admin@12345`
2. Go to Organizations page
3. Click delete icon (trash can)
4. Confirm deletion
5. See success toast!

### Using API (curl)
```bash
# 1. Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alirazaarif@yopmail.com",
    "password": "Admin@12345"
  }'

# Copy the accessToken from response

# 2. Delete Organization
curl -X DELETE http://localhost:4000/api/tenants/{ORGANIZATION_ID} \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### Using Swagger UI
1. Go to: `http://localhost:4000/api-docs`
2. Login to get token
3. Click "Authorize" button
4. Enter: `Bearer {your_token}`
5. Find `DELETE /api/tenants/{id}`
6. Click "Try it out"
7. Enter organization ID
8. Click "Execute"

## 📋 Endpoint Details

**Endpoint**: `DELETE /api/tenants/:id`  
**Authorization**: SUPER_ADMIN only  
**Rate Limited**: Yes

### Request
```
DELETE /api/tenants/550e8400-e29b-41d4-a716-446655440000
Headers:
  Authorization: Bearer {token}
```

### Response
```json
{
  "success": true,
  "message": "Organization deleted successfully",
  "deletedTenant": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Test Organization",
    "slug": "test-org"
  },
  "deletedRelatedData": {
    "users": 5,
    "pdfEmbeddings": 10,
    "formSchemas": 2,
    "formDrafts": 3,
    "pdfTemplates": 1
  }
}
```

## 🔒 What Gets Deleted (CASCADE)

When you delete an organization, it automatically deletes:
- ✅ All users in the organization
- ✅ All user refresh tokens
- ✅ All password reset tokens
- ✅ All PDF embeddings
- ✅ All form schemas
- ✅ All form drafts
- ✅ All PDF templates
- ✅ The organization itself

**⚠️ WARNING: This action cannot be undone!**

## 🛡️ Security

- ✅ **SUPER_ADMIN only** - Regular users cannot delete
- ✅ **JWT required** - Must be authenticated
- ✅ **Rate limited** - Prevents abuse
- ✅ **UUID validation** - Validates organization ID

## 📁 Files Changed

### Backend
- `src/services/tenant.service.js`
- `src/controllers/tenant.controller.js`
- `src/routes/tenant.routes.js`
- `src/docs/tenant.docs.js`

### Frontend
- `src/api/organization.ts`
- `src/api/config.ts`
- `src/pages/OrganizationPage.tsx`

## ⚠️ Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Only system administrators can delete organizations"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Organization not found"
}
```

## 🎯 Complete Organization API

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/api/tenants` | Create | SUPER_ADMIN |
| GET | `/api/tenants` | List all | Any |
| GET | `/api/tenants/:id` | Get one | Any |
| PATCH | `/api/tenants/:id` | Update | SUPER_ADMIN/ADMIN |
| **DELETE** | **`/api/tenants/:id`** | **Delete** | **SUPER_ADMIN** |
| POST | `/api/tenants/:id/activate` | Activate | SUPER_ADMIN |
| POST | `/api/tenants/:id/deactivate` | Deactivate | SUPER_ADMIN |

## 💡 Tips

1. **Always confirm** before deleting in production
2. **Test first** with a test organization
3. **Backup data** before deleting important orgs
4. **Check counts** in the response to verify deletion
5. **Use soft delete** in production (recommended)

---

Need more details? Check `DELETE_ORGANIZATION_API.md`





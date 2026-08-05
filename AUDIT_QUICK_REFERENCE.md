# Audit Trail System - Quick Reference

## 🚀 Quick Start

### View Recent Audit Logs
```bash
GET /api/audit/logs
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### View Failed Logins
```bash
GET /api/audit/logs?action=LOGIN_FAILED
```

### View Security Events
```bash
GET /api/audit/security-events
```

### View User Activity
```bash
GET /api/audit/user/:userId
```

### Get Statistics
```bash
GET /api/audit/stats
```

## 📊 Common Queries

### Last 24 Hours of Activity
```bash
GET /api/audit/logs?startDate=2025-10-27T12:00:00Z
```

### Filter by Action Type
```bash
GET /api/audit/logs?action=USER_CREATED
```

### Filter by Resource
```bash
GET /api/audit/logs?resource=form
```

### Paginate Results
```bash
GET /api/audit/logs?page=2&limit=50
```

## 🔐 Action Types

### Authentication
- `LOGIN_SUCCESS` - User logged in
- `LOGIN_FAILED` - Failed login attempt
- `LOGOUT` - User logged out
- `TOKEN_REFRESH` - Token refreshed
- `PASSWORD_RESET_REQUEST` - Password reset requested
- `PASSWORD_RESET_SUCCESS` - Password reset completed
- `EMAIL_VERIFICATION` - Email verified

### User Management
- `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`
- `USER_INVITED`, `USER_ACTIVATED`, `USER_DEACTIVATED`

### Tenant Management
- `TENANT_CREATED`, `TENANT_UPDATED`, `TENANT_DELETED`
- `TENANT_ACTIVATED`, `TENANT_DEACTIVATED`

### Form Management
- `FORM_CREATED`, `FORM_UPDATED`, `FORM_DELETED`
- `FORM_SUBMITTED`, `FORM_DRAFT_SAVED`, `FORM_DRAFT_DELETED`

### PDF Management
- `PDF_UPLOADED`, `PDF_GENERATED`, `PDF_DOWNLOADED`, `PDF_DELETED`
- `PDF_TEMPLATE_CREATED`, `PDF_TEMPLATE_UPDATED`, `PDF_TEMPLATE_DELETED`

### Embeddings
- `EMBEDDING_CREATED`, `EMBEDDING_DELETED`, `EMBEDDING_QUERIED`

### Security
- `SYSTEM_ERROR`, `ACCESS_DENIED`, `UNAUTHORIZED_ACCESS`

## 💻 Manual Logging

### Log Authentication Event
```javascript
const auditService = require('../services/audit.service');

await auditService.logAuthEvent({
  action: 'LOGIN_SUCCESS',
  userId: user.id,
  tenantId: user.tenantId,
  email: user.email,
  req,
  success: true
});
```

### Log User Action
```javascript
await auditService.logUserAction({
  action: 'USER_CREATED',
  userId: currentUser.id,
  tenantId: currentUser.tenantId,
  resourceId: newUser.id,
  req,
  metadata: { role: newUser.role }
});
```

### Log Custom Event
```javascript
await auditService.createAuditLog({
  userId: req.user?.id,
  tenantId: req.user?.tenantId,
  action: 'CUSTOM_ACTION',
  resource: 'custom_resource',
  req,
  metadata: { custom: 'data' }
});
```

## ⚙️ Configuration

### Audit Middleware Options
```javascript
// In src/app.js
app.use('/api/', auditMiddleware({
  logGET: false,              // Skip GET requests
  logOptions: false,          // Skip OPTIONS requests
  excludeEndpoints: [         // Skip these paths
    '/health',
    '/api-docs'
  ],
  onlyLogErrors: false        // Log all requests
}));
```

## 🔍 Filtering Options

### Query Parameters
- `userId` - Filter by user ID
- `tenantId` - Filter by tenant ID (SUPER_ADMIN only)
- `action` - Filter by action type
- `resource` - Filter by resource type (user, tenant, form, pdf, etc.)
- `startDate` - Filter from date (ISO 8601 format)
- `endDate` - Filter to date (ISO 8601 format)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)

## 🛡️ Security Features

✅ **Automatic Data Sanitization**
- Passwords: `[REDACTED]`
- Tokens: `[REDACTED]`
- Secrets: `[REDACTED]`

✅ **Tenant Isolation**
- ADMIN: See only their tenant's logs
- SUPER_ADMIN: See all logs

✅ **Immutable Logs**
- No update or delete operations
- Insert-only for compliance

✅ **IP Tracking**
- Captures real IP through proxies
- Logs user agent

## 📋 Response Format

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user-id",
      "tenantId": "tenant-id",
      "action": "LOGIN_SUCCESS",
      "resource": "auth",
      "method": "POST",
      "endpoint": "/api/auth/login",
      "statusCode": 200,
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "requestData": { "email": "user@example.com" },
      "duration": 234,
      "createdAt": "2025-10-28T12:34:56.789Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

## 🎯 Access Control

### Required Roles
- **View Logs**: ADMIN or SUPER_ADMIN
- **View All Tenants**: SUPER_ADMIN only
- **Manual Logging**: Any authenticated user

### Authentication
```bash
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## 📚 Documentation

- **Complete Guide**: `AUDIT_TRAIL_GUIDE.md`
- **Implementation Summary**: `AUDIT_TRAIL_IMPLEMENTATION_SUMMARY.md`
- **IP Address Guide**: `AUDIT_IP_ADDRESS_GUIDE.md`
- **Swagger Docs**: `http://localhost:4000/api-docs`

## 🧪 Testing

### 1. Test Failed Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'
```

### 2. View the Log
```bash
curl -X GET "http://localhost:4000/api/audit/logs?action=LOGIN_FAILED" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 🔧 Troubleshooting

### Logs not appearing?
1. Check database connection: `npx prisma studio`
2. Verify middleware loaded in `src/app.js`
3. Check console for "Audit logging failed" messages

### Permission denied?
1. Ensure user has ADMIN or SUPER_ADMIN role
2. Check JWT token is valid
3. Verify authentication middleware is working

### Performance issues?
1. Enable `onlyLogErrors: true` in middleware config
2. Disable GET logging: `logGET: false`
3. Implement log archiving for old data

## 📞 Support

- Review `AUDIT_TRAIL_GUIDE.md` for detailed documentation
- Check Swagger docs for API details
- Verify database with `npx prisma studio`

---

**System Status**: ✅ Production Ready
**Total Action Types**: 38+
**API Endpoints**: 5
**Documentation**: Complete


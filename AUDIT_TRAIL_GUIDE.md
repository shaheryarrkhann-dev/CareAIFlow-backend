# Audit Trail System - Complete Guide

## Overview

The audit trail system provides comprehensive logging of all user activities and system events in the application. It's designed with security, performance, and compliance in mind.

## Features

- ✅ **Automatic Request Logging** - Middleware-based logging of all API requests
- ✅ **Authentication Event Tracking** - Logs login, logout, and failed authentication attempts
- ✅ **User Activity Tracking** - Tracks create, update, delete operations across all resources
- ✅ **Security Event Monitoring** - Logs unauthorized access, access denied, and system errors
- ✅ **Data Sanitization** - Automatically removes sensitive data (passwords, tokens, etc.)
- ✅ **Immutable Logs** - Audit logs are insert-only (no updates or deletions)
- ✅ **Tenant Isolation** - Logs are associated with tenants for multi-tenancy support
- ✅ **Performance Optimized** - Async logging that doesn't block request processing
- ✅ **Comprehensive Metadata** - Captures IP address, user agent, request/response data, duration
- ✅ **Query & Analytics** - RESTful API for viewing and analyzing audit logs
- ✅ **UTC+05:00 Timezone** - All timestamps displayed in UTC+05:00 (Pakistan Standard Time)

## 🕐 Timezone Configuration

**All audit trail logs display timestamps in UTC+05:00 timezone.**

- Database stores in UTC (best practice)
- API converts to UTC+05:00 for display
- Format: `2025-10-31T15:30:45.123+05:00`

For detailed timezone documentation, see:
- `AUDIT_TIMEZONE_IMPLEMENTATION.md` - Full implementation details
- `AUDIT_TIMEZONE_QUICK_REFERENCE.md` - Quick reference guide

## Architecture

### Components

1. **Database Schema** (`prisma/schema.prisma`)
   - `AuditLog` model with comprehensive fields
   - `AuditAction` enum with 38+ action types
   - Optimized indexes for fast queries

2. **Audit Service** (`src/services/audit.service.js`)
   - Core logging functionality
   - Data sanitization
   - Query and statistics functions

3. **Audit Middleware** (`src/middlewares/audit.middleware.js`)
   - Automatic request interception
   - Response capture
   - Error logging

4. **Audit Controller** (`src/controllers/audit.controller.js`)
   - RESTful API endpoints for log viewing
   - Filtering and pagination
   - Statistics and analytics

5. **Audit Routes** (`src/routes/audit.routes.js`)
   - Protected routes (ADMIN/SUPER_ADMIN only)
   - Multiple query endpoints

## Database Schema

```prisma
model AuditLog {
  id            String       @id @default(uuid())
  userId        String?      // Null for unauthenticated actions
  tenantId      String?      // Null for system-wide actions
  action        AuditAction  // Type of action performed
  resource      String       // Resource affected (e.g., "user", "tenant", "form")
  resourceId    String?      // ID of the affected resource
  method        String?      // HTTP method (GET, POST, PUT, DELETE)
  endpoint      String?      // API endpoint called
  statusCode    Int?         // HTTP status code
  ipAddress     String?      // IP address of the requester
  userAgent     String?      // User agent string
  requestData   Json?        // Sanitized request payload
  responseData  Json?        // Sanitized response data
  errorMessage  String?      // Error message if action failed
  duration      Int?         // Request duration in milliseconds
  metadata      Json?        // Additional metadata
  createdAt     DateTime     @default(now())
}
```

## Action Types

### Authentication Actions
- `LOGIN_SUCCESS` - Successful user login
- `LOGIN_FAILED` - Failed login attempt
- `LOGOUT` - User logout
- `TOKEN_REFRESH` - JWT token refresh
- `PASSWORD_RESET_REQUEST` - Password reset requested
- `PASSWORD_RESET_SUCCESS` - Password reset completed
- `EMAIL_VERIFICATION` - Email verified

### User Actions
- `USER_CREATED` - New user created
- `USER_UPDATED` - User information updated
- `USER_DELETED` - User deleted
- `USER_INVITED` - User invited to organization
- `USER_ACTIVATED` - User account activated
- `USER_DEACTIVATED` - User account deactivated

### Tenant Actions
- `TENANT_CREATED` - New tenant/organization created
- `TENANT_UPDATED` - Tenant information updated
- `TENANT_DELETED` - Tenant deleted
- `TENANT_ACTIVATED` - Tenant activated
- `TENANT_DEACTIVATED` - Tenant deactivated

### Form Actions
- `FORM_CREATED` - Form created
- `FORM_UPDATED` - Form updated
- `FORM_DELETED` - Form deleted
- `FORM_SUBMITTED` - Form submitted
- `FORM_DRAFT_SAVED` - Form draft saved
- `FORM_DRAFT_DELETED` - Form draft deleted

### PDF Actions
- `PDF_UPLOADED` - PDF uploaded
- `PDF_GENERATED` - PDF generated
- `PDF_DOWNLOADED` - PDF downloaded
- `PDF_DELETED` - PDF deleted
- `PDF_TEMPLATE_CREATED` - PDF template created
- `PDF_TEMPLATE_UPDATED` - PDF template updated
- `PDF_TEMPLATE_DELETED` - PDF template deleted

### Embedding Actions
- `EMBEDDING_CREATED` - Vector embedding created
- `EMBEDDING_DELETED` - Vector embedding deleted
- `EMBEDDING_QUERIED` - Vector search performed

### System Actions
- `SYSTEM_ERROR` - System error occurred
- `ACCESS_DENIED` - Access denied (403)
- `UNAUTHORIZED_ACCESS` - Unauthorized access (401)

## Security Features

### Data Sanitization

The audit service automatically removes sensitive information from logs:

```javascript
// Sensitive fields that are automatically redacted
const SENSITIVE_FIELDS = [
  'password', 'passwordHash', 'newPassword', 'oldPassword',
  'token', 'refreshToken', 'accessToken', 'resetToken',
  'secret', 'apiKey', 'privateKey', 'authorization',
  'cookie', 'session'
];
```

Example:
```json
{
  "email": "user@example.com",
  "password": "[REDACTED]"
}
```

### IP Address Extraction

The system intelligently extracts the client's IP address, considering proxies and load balancers:

```javascript
const ip = req.ip ||
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.headers['x-real-ip'] ||
  req.connection?.remoteAddress;
```

### Immutability

Audit logs are immutable - once created, they cannot be updated or deleted through the API. This ensures data integrity for compliance and forensic purposes.

## API Endpoints

All audit endpoints require authentication and ADMIN or SUPER_ADMIN role.

### 1. Get Audit Logs

```http
GET /api/audit/logs
```

**Query Parameters:**
- `userId` - Filter by user ID
- `tenantId` - Filter by tenant ID (SUPER_ADMIN only)
- `action` - Filter by action type
- `resource` - Filter by resource type
- `startDate` - Filter from date (ISO 8601)
- `endDate` - Filter to date (ISO 8601)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)

**Example:**
```bash
curl -X GET "http://localhost:4000/api/audit/logs?action=LOGIN_FAILED&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userId": "user-123-456",
      "tenantId": "tenant-789-012",
      "action": "LOGIN_SUCCESS",
      "resource": "auth",
      "method": "POST",
      "endpoint": "/api/auth/login",
      "statusCode": 200,
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "duration": 234,
      "createdAt": "2025-10-31T15:30:45.123+05:00"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

> **Note:** All timestamps are in UTC+05:00 timezone (Pakistan Standard Time)

### 2. Get Audit Log by ID

```http
GET /api/audit/logs/:id
```

**Example:**
```bash
curl -X GET "http://localhost:4000/api/audit/logs/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Get Audit Statistics

```http
GET /api/audit/stats
```

**Query Parameters:**
- `userId` - Filter by user ID
- `tenantId` - Filter by tenant ID (SUPER_ADMIN only)
- `startDate` - Filter from date
- `endDate` - Filter to date

**Example:**
```bash
curl -X GET "http://localhost:4000/api/audit/stats?startDate=2025-10-01&endDate=2025-10-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalLogs": 1523,
    "byAction": [
      { "action": "LOGIN_SUCCESS", "count": 342 },
      { "action": "LOGIN_FAILED", "count": 28 },
      { "action": "USER_CREATED", "count": 15 }
    ],
    "byResource": [
      { "resource": "auth", "count": 400 },
      { "resource": "user", "count": 250 },
      { "resource": "form", "count": 500 }
    ]
  }
}
```

### 4. Get User Audit Logs

```http
GET /api/audit/user/:userId
```

**Query Parameters:**
- `startDate` - Filter from date
- `endDate` - Filter to date
- `page` - Page number
- `limit` - Results per page

**Example:**
```bash
curl -X GET "http://localhost:4000/api/audit/user/user-123-456?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Get Security Events

```http
GET /api/audit/security-events
```

Returns logs for security-related events: `LOGIN_FAILED`, `UNAUTHORIZED_ACCESS`, `ACCESS_DENIED`, `SYSTEM_ERROR`

**Query Parameters:**
- `tenantId` - Filter by tenant ID (SUPER_ADMIN only)
- `startDate` - Filter from date
- `endDate` - Filter to date
- `page` - Page number
- `limit` - Results per page

**Example:**
```bash
curl -X GET "http://localhost:4000/api/audit/security-events?startDate=2025-10-28" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Manual Logging

You can manually log events from anywhere in your code:

### Authentication Events

```javascript
const auditService = require('../services/audit.service');

// Log successful login
await auditService.logAuthEvent({
  action: 'LOGIN_SUCCESS',
  userId: user.id,
  tenantId: user.tenantId,
  email: user.email,
  req,
  success: true
});

// Log failed login
await auditService.logAuthEvent({
  action: 'LOGIN_FAILED',
  email: 'attacker@example.com',
  req,
  success: false,
  errorMessage: 'Invalid credentials'
});
```

### User Actions

```javascript
await auditService.logUserAction({
  action: 'USER_CREATED',
  userId: currentUser.id,
  tenantId: currentUser.tenantId,
  resourceId: newUser.id,
  req,
  metadata: { invitedBy: currentUser.email }
});
```

### Custom Events

```javascript
await auditService.createAuditLog({
  userId: req.user?.id,
  tenantId: req.user?.tenantId,
  action: 'CUSTOM_ACTION',
  resource: 'custom_resource',
  resourceId: 'resource-id',
  req,
  metadata: { custom: 'data' }
});
```

## Configuration

### Middleware Options

You can configure the audit middleware in `src/app.js`:

```javascript
app.use('/api/', auditMiddleware({
  logGET: false,              // Don't log read operations
  logOptions: false,          // Don't log OPTIONS requests
  excludeEndpoints: [         // Skip these endpoints
    '/health', 
    '/api-docs', 
    '/api-docs.json'
  ],
  onlyLogErrors: false        // Log all requests (not just errors)
}));
```

### Custom Configuration Examples

**Log everything including GET requests:**
```javascript
app.use('/api/', auditMiddleware({
  logGET: true,
  onlyLogErrors: false
}));
```

**Only log errors and security events:**
```javascript
app.use('/api/', auditMiddleware({
  logGET: false,
  onlyLogErrors: true
}));
```

## Tenant Isolation

The audit system respects multi-tenancy:

- **SUPER_ADMIN**: Can view logs across all tenants
- **ADMIN**: Can only view logs from their own tenant
- **STAFF/GUARDIAN**: Cannot access audit logs

This is enforced at the controller level:

```javascript
// For non-SUPER_ADMIN users, filter by their tenant
const tenantId = req.user.role === 'SUPER_ADMIN' 
  ? req.query.tenantId 
  : req.user.tenantId;
```

## Performance Considerations

### Async Logging

All audit logging is asynchronous and non-blocking:

```javascript
setImmediate(() => {
  auditService.createAuditLog(data).catch(err => {
    console.error('Audit logging failed:', err.message);
  });
});
```

This ensures that audit logging failures don't impact the user experience.

### Database Indexes

The schema includes optimized indexes for common queries:

```prisma
@@index([userId])
@@index([tenantId])
@@index([action])
@@index([resource])
@@index([createdAt])
@@index([userId, createdAt])
@@index([tenantId, createdAt])
```

### Pagination

All query endpoints support pagination to prevent overwhelming large datasets:

- Default limit: 50 records
- Maximum limit: 100 records per page

## Compliance and Best Practices

### GDPR Compliance

- User consent should be obtained for logging
- Implement data retention policies
- Provide ability to export user's audit logs
- Consider pseudonymization for long-term storage

### Data Retention

Implement a scheduled job to archive or delete old logs:

```javascript
// Example: Delete logs older than 1 year
async function cleanupOldLogs() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: oneYearAgo
      }
    }
  });
}
```

### Monitoring

Set up alerts for security events:

```javascript
// Example: Alert on multiple failed login attempts
const failedLogins = await prisma.auditLog.count({
  where: {
    action: 'LOGIN_FAILED',
    ipAddress: suspiciousIp,
    createdAt: {
      gte: new Date(Date.now() - 3600000) // Last hour
    }
  }
});

if (failedLogins > 5) {
  // Send alert
}
```

## Testing

### Test the Audit System

1. **Start the server:**
```bash
npm run dev
```

2. **Make a login attempt:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}'
```

3. **Check audit logs:**
```bash
curl -X GET "http://localhost:4000/api/audit/logs?action=LOGIN_FAILED" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

4. **View security events:**
```bash
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Swagger Documentation

The audit endpoints are fully documented in Swagger. Access at:

```
http://localhost:4000/api-docs
```

Look for the "Audit" section in the API documentation.

## Troubleshooting

### Logs not appearing

1. **Check database connection:**
```bash
npx prisma studio
```

2. **Verify middleware is loaded:**
Check `src/app.js` for audit middleware

3. **Check console for errors:**
Look for "Audit logging failed" messages

### Permission denied

Ensure your user has ADMIN or SUPER_ADMIN role:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your@email.com';
```

### Performance issues

1. **Reduce logging scope:**
```javascript
auditMiddleware({ logGET: false, onlyLogErrors: true })
```

2. **Add database indexes:**
Already included in schema

3. **Implement log archiving:**
Move old logs to cold storage

## Future Enhancements

- [ ] Export logs to CSV/JSON
- [ ] Real-time log streaming via WebSocket
- [ ] Advanced analytics dashboard
- [ ] Automatic threat detection
- [ ] Integration with SIEM systems
- [ ] Log encryption at rest
- [ ] Blockchain-based log verification

## Summary

The audit trail system is now fully integrated into your application, providing:

✅ Comprehensive logging of all user activities
✅ Automatic security event detection
✅ Data sanitization and privacy protection
✅ Multi-tenant support with proper isolation
✅ Performance-optimized async logging
✅ RESTful API for querying and analytics
✅ Full Swagger documentation
✅ ADMIN/SUPER_ADMIN role-based access

The system is production-ready and follows industry best practices for security and compliance.


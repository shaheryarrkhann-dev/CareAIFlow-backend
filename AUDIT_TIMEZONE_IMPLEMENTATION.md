# Audit Trail Timezone Configuration - UTC+05:00

## Overview

All audit trail logs are now configured to display timestamps in **UTC+05:00** timezone (Pakistan Standard Time / PKT). This ensures consistency across all audit log entries and makes it easier to track system activities in your local timezone.

## Implementation Details

### Architecture

The system follows best practices for timezone handling:

1. **Storage**: All timestamps are stored in UTC in the database (standard practice)
2. **Conversion**: Timestamps are converted to UTC+05:00 when returning data through the API
3. **Consistency**: All audit log endpoints return timestamps in UTC+05:00 format

### Modified Files

#### 1. `src/services/audit.service.js`
Added timezone conversion utilities:

```javascript
// Timezone configuration - UTC+05:00
const AUDIT_TIMEZONE_OFFSET = 5 * 60; // 5 hours in minutes

/**
 * Convert UTC timestamp to UTC+05:00 timezone
 */
function convertToAuditTimezone(date) {
  if (!date) return null;
  
  const utcDate = new Date(date);
  const localDate = new Date(utcDate.getTime() + (AUDIT_TIMEZONE_OFFSET * 60 * 1000));
  
  const isoString = localDate.toISOString();
  return isoString.replace('Z', '+05:00');
}

/**
 * Format audit log timestamps to UTC+05:00
 */
function formatAuditLogTimezone(log) {
  if (!log) return null;
  
  return {
    ...log,
    createdAt: convertToAuditTimezone(log.createdAt)
  };
}
```

**Updated Functions:**
- `getAuditLogs()` - Now formats all returned logs to UTC+05:00

#### 2. `src/controllers/audit.controller.js`
Added the same timezone conversion utilities to format logs in all controller endpoints:

**Updated Endpoints:**
- `GET /api/audit/logs` - Returns all logs with UTC+05:00 timestamps
- `GET /api/audit/logs/:id` - Returns single log with UTC+05:00 timestamp
- `GET /api/audit/security-events` - Returns security events with UTC+05:00 timestamps

## Timestamp Format

### Before (UTC)
```json
{
  "id": "abc-123",
  "action": "LOGIN_SUCCESS",
  "createdAt": "2025-10-31T10:30:45.123Z"
}
```

### After (UTC+05:00)
```json
{
  "id": "abc-123",
  "action": "LOGIN_SUCCESS",
  "createdAt": "2025-10-31T15:30:45.123+05:00"
}
```

## API Examples

### Get Audit Logs
```bash
curl -X GET "http://localhost:4000/api/audit/logs" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userId": "user-123",
      "action": "LOGIN_SUCCESS",
      "resource": "auth",
      "createdAt": "2025-10-31T15:30:45.123+05:00",
      "ipAddress": "192.168.1.100"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  }
}
```

### Get Specific Audit Log
```bash
curl -X GET "http://localhost:4000/api/audit/logs/abc-123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc-123",
    "userId": "user-456",
    "action": "FORM_SUBMITTED",
    "resource": "form",
    "createdAt": "2025-10-31T14:15:30.456+05:00",
    "description": "John Doe (STAFF) submitted a form"
  }
}
```

### Get Security Events
```bash
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "security-789",
      "action": "LOGIN_FAILED",
      "createdAt": "2025-10-31T13:45:20.789+05:00",
      "ipAddress": "203.0.113.42",
      "description": "Failed login attempt for user@example.com"
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

## Benefits

### 1. **Local Time Reference**
- All timestamps are in your local timezone (UTC+05:00)
- No need for manual timezone conversion
- Easier to correlate with local events

### 2. **Consistency**
- All audit logs use the same timezone
- Uniform format across all endpoints
- Predictable timestamp format

### 3. **Database Efficiency**
- Database continues to store in UTC (best practice)
- No database schema changes required
- Maintains compatibility with Prisma ORM

### 4. **Future Flexibility**
- Easy to change timezone if needed (update `AUDIT_TIMEZONE_OFFSET` constant)
- Can add per-user timezone preferences in the future
- Can support multiple timezones if required

## Changing the Timezone

If you need to change the timezone offset in the future:

### 1. Update `src/services/audit.service.js`
```javascript
// Change the offset value:
// For UTC+08:00 (e.g., Singapore): const AUDIT_TIMEZONE_OFFSET = 8 * 60;
// For UTC-05:00 (e.g., EST): const AUDIT_TIMEZONE_OFFSET = -5 * 60;
// For UTC+00:00 (UTC): const AUDIT_TIMEZONE_OFFSET = 0;

const AUDIT_TIMEZONE_OFFSET = 5 * 60; // Current: UTC+05:00
```

### 2. Update `src/controllers/audit.controller.js`
```javascript
// Update the same constant:
const AUDIT_TIMEZONE_OFFSET = 5 * 60; // Current: UTC+05:00
```

### 3. Update the timezone suffix in both files
```javascript
// Change '+05:00' to your desired timezone:
return isoString.replace('Z', '+05:00'); // <-- Update this
```

## Testing

### 1. Test Audit Log Retrieval
```bash
# Start the server
npm run dev

# Login to generate an audit log
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}'

# Get audit logs (with admin token)
curl -X GET "http://localhost:4000/api/audit/logs?limit=5" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Verify timestamps show +05:00 suffix
```

### 2. Test Different Endpoints
```bash
# Test single log retrieval
curl -X GET "http://localhost:4000/api/audit/logs/{LOG_ID}" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Test security events
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Test user-specific logs
curl -X GET "http://localhost:4000/api/audit/user/{USER_ID}" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 3. Verify Time Difference
If current UTC time is: `2025-10-31T10:30:00Z`
Then audit log should show: `2025-10-31T15:30:00+05:00`

The difference should be exactly 5 hours ahead.

## Important Notes

### ✅ What's Changed
- All API responses now return timestamps in UTC+05:00
- Timestamp format includes `+05:00` suffix
- All audit endpoints are affected

### ⚠️ What Hasn't Changed
- Database storage (still in UTC)
- Database schema
- Prisma models
- Migration files
- Audit log creation (still stores in UTC)

### 🔒 Data Integrity
- Original UTC timestamps preserved in database
- Conversion happens only at API response level
- No data loss or corruption
- Historical logs automatically formatted correctly

## Frontend Integration

When consuming these timestamps in your frontend:

### JavaScript/React Example
```javascript
// The timestamp is already in UTC+05:00
const auditLog = {
  createdAt: "2025-10-31T15:30:45.123+05:00"
};

// Create a Date object
const date = new Date(auditLog.createdAt);

// Display in various formats
console.log(date.toLocaleString()); // Uses browser's locale
console.log(date.toISOString()); // Converts back to UTC

// Or use a library like date-fns or moment.js
import { format } from 'date-fns';
console.log(format(date, 'PPpp')); // Oct 31, 2025, 3:30:45 PM
```

### Display Examples
```javascript
// Simple display
const formatAuditTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// Result: "Oct 31, 2025, 15:30:45"
```

## Troubleshooting

### Issue: Timestamps still showing in UTC
**Solution:** Clear your server cache and restart:
```bash
npm run dev
```

### Issue: Timestamps showing wrong time
**Solution:** Verify the offset calculation:
- UTC+05:00 means 5 hours **ahead** of UTC
- If you see timestamps in the past, check the offset sign

### Issue: Different endpoints showing different timezones
**Solution:** Ensure both files are updated:
- `src/services/audit.service.js`
- `src/controllers/audit.controller.js`

## Summary

✅ **Implemented**: UTC+05:00 timezone for all audit trail logs
✅ **Tested**: All audit endpoints return formatted timestamps
✅ **Compatible**: No breaking changes to existing functionality
✅ **Maintainable**: Easy to modify timezone offset if needed
✅ **Best Practice**: Database stores UTC, API converts for display

All audit trail logs now consistently display timestamps in UTC+05:00 timezone, making it easier to track system activities in your local time.

---

**Implementation Date**: October 31, 2025  
**Timezone**: UTC+05:00 (Pakistan Standard Time)  
**Status**: ✅ Complete and Tested


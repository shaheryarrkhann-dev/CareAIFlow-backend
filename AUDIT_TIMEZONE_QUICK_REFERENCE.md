# Audit Trail Timezone - Quick Reference

## 🕐 Timezone Configuration

**All audit logs display in UTC+05:00 (Pakistan Standard Time)**

## Format

### Timestamp Format
```
YYYY-MM-DDTHH:mm:ss.sss+05:00
```

### Example
```
2025-10-31T15:30:45.123+05:00
```

## Quick Examples

### 1. Get All Audit Logs
```bash
curl -X GET "http://localhost:4000/api/audit/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc-123",
      "action": "LOGIN_SUCCESS",
      "createdAt": "2025-10-31T15:30:45.123+05:00"
    }
  ]
}
```

### 2. Get Specific Log
```bash
curl -X GET "http://localhost:4000/api/audit/logs/abc-123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc-123",
    "createdAt": "2025-10-31T15:30:45.123+05:00"
  }
}
```

### 3. Get Security Events
```bash
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "action": "LOGIN_FAILED",
      "createdAt": "2025-10-31T14:20:15.789+05:00"
    }
  ]
}
```

## Time Conversion

| UTC Time | UTC+05:00 Time |
|----------|----------------|
| 00:00:00 | 05:00:00 |
| 06:00:00 | 11:00:00 |
| 12:00:00 | 17:00:00 |
| 18:00:00 | 23:00:00 |
| 23:59:59 | 04:59:59 (next day) |

## Frontend Display

### JavaScript
```javascript
const timestamp = "2025-10-31T15:30:45.123+05:00";
const date = new Date(timestamp);

// Display options
console.log(date.toLocaleString());
// Output: "10/31/2025, 3:30:45 PM"

console.log(date.toISOString());
// Output: "2025-10-31T10:30:45.123Z" (converts to UTC)
```

### React Example
```jsx
const AuditLogRow = ({ log }) => {
  const date = new Date(log.createdAt);
  
  return (
    <tr>
      <td>{log.action}</td>
      <td>{date.toLocaleString()}</td>
    </tr>
  );
};
```

## Changing Timezone

To change to a different timezone:

### 1. Edit `src/services/audit.service.js`
```javascript
// Change offset (in minutes):
const AUDIT_TIMEZONE_OFFSET = 5 * 60;  // UTC+05:00

// Change suffix:
return isoString.replace('Z', '+05:00');
```

### 2. Edit `src/controllers/audit.controller.js`
```javascript
// Make the same changes as above
const AUDIT_TIMEZONE_OFFSET = 5 * 60;
return isoString.replace('Z', '+05:00');
```

## Common Timezones

| Timezone | Offset (minutes) | Suffix |
|----------|-----------------|--------|
| UTC+00:00 (UTC) | 0 | +00:00 |
| UTC+05:00 (PKT) | 300 | +05:00 |
| UTC+05:30 (IST) | 330 | +05:30 |
| UTC+08:00 (SGT) | 480 | +08:00 |
| UTC-05:00 (EST) | -300 | -05:00 |

## Verification

### Test the Implementation
```bash
# 1. Generate a log
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Check the timestamp
curl -X GET "http://localhost:4000/api/audit/logs?limit=1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Verify format ends with +05:00
```

## Key Points

✅ All timestamps in UTC+05:00  
✅ Database stores in UTC (unchanged)  
✅ Conversion at API response level  
✅ No data loss or corruption  
✅ All endpoints affected  
✅ Historical logs included  

## Support

For detailed information, see: `AUDIT_TIMEZONE_IMPLEMENTATION.md`

---

**Timezone**: UTC+05:00 (Pakistan Standard Time)  
**Status**: ✅ Active


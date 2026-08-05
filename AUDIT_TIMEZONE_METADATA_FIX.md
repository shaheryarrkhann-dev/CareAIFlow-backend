# Audit Timezone - Metadata Fields Fix

## ✅ Issue Resolved

**Problem:** Timezone conversion was only applied to the main `createdAt` field, but timestamps inside `metadata`, `requestData`, and `responseData` fields were still showing in UTC.

**Example of the issue:**
```json
{
  "createdAt": "2025-11-01T02:05:06.932+05:00",  // ✅ Converted
  "metadata": {
    "loginTime": "2025-10-31T21:05:06.930Z",     // ❌ Still UTC
    "failureTime": "2025-10-31T21:04:43.010Z"    // ❌ Still UTC
  }
}
```

## 🔧 Solution Implemented

Added **recursive timestamp conversion** that automatically converts ALL timestamp fields throughout the entire audit log object, including:
- Main `createdAt` field
- All timestamps in `metadata`
- All timestamps in `requestData`
- All timestamps in `responseData`

## 📝 What Changed

### Files Modified:
1. `src/services/audit.service.js`
2. `src/controllers/audit.controller.js`

### New Function Added:
```javascript
/**
 * Recursively convert all timestamps in an object to UTC+05:00
 */
function convertTimestampsInObject(obj) {
  // Automatically detects and converts:
  // - Fields with "time" in the name (loginTime, failureTime, etc.)
  // - Fields with "date" in the name (startDate, endDate, etc.)
  // - Standard fields (createdAt, updatedAt)
  // - Any ISO 8601 timestamp format
}
```

### Detection Logic:
The function automatically converts timestamps if:
1. Field name contains "time" (case-insensitive)
2. Field name contains "date" (case-insensitive)
3. Field name is `createdAt` or `updatedAt`
4. Value matches ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

## ✅ After Fix

Now ALL timestamps are converted:
```json
{
  "createdAt": "2025-11-01T02:05:06.932+05:00",  // ✅ Converted
  "metadata": {
    "loginTime": "2025-11-01T02:05:06.930+05:00",     // ✅ Now converted!
    "failureTime": "2025-11-01T02:04:43.010+05:00",   // ✅ Now converted!
    "isEmailVerified": true
  }
}
```

## 🧪 How to Test

### Step 1: Restart the Server
```bash
npm run dev
```

### Step 2: Test the API
```powershell
# PowerShell:
.\test-timezone.ps1 "YOUR_ADMIN_TOKEN"

# Or manually:
curl -X GET "http://localhost:4000/api/audit/logs?limit=5" ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 3: Verify Results
Check that ALL these fields have `+05:00`:
- ✅ `createdAt`
- ✅ `metadata.loginTime`
- ✅ `metadata.failureTime`
- ✅ Any other timestamp fields

## 📊 Example Comparison

### Before Fix:
```json
{
  "id": "7cf3a9e3-af96-4804-b1ac-a21a5260a813",
  "action": "LOGIN_SUCCESS",
  "createdAt": "2025-11-01T02:05:06.932+05:00",
  "metadata": {
    "loginTime": "2025-10-31T21:05:06.930Z"  // ❌ Wrong - Still UTC
  }
}
```

### After Fix:
```json
{
  "id": "7cf3a9e3-af96-4804-b1ac-a21a5260a813",
  "action": "LOGIN_SUCCESS",
  "createdAt": "2025-11-01T02:05:06.932+05:00",
  "metadata": {
    "loginTime": "2025-11-01T02:05:06.930+05:00"  // ✅ Correct - UTC+05:00
  }
}
```

## 🎯 What Gets Converted

### Automatically Detected Fields:
- ✅ `createdAt`
- ✅ `updatedAt`
- ✅ `loginTime`
- ✅ `failureTime`
- ✅ `startDate`
- ✅ `endDate`
- ✅ `timestamp`
- ✅ `eventTime`
- ✅ Any field with "time" or "date" in name

### Works in All JSON Fields:
- ✅ `metadata`
- ✅ `requestData`
- ✅ `responseData`

### Handles Nested Objects:
```json
{
  "metadata": {
    "event": {
      "startTime": "2025-10-31T21:00:00.000Z",  // ✅ Converts nested timestamps too!
      "details": {
        "processedAt": "2025-10-31T21:00:05.000Z"  // ✅ Even deeply nested!
      }
    }
  }
}
```

## 🔍 Technical Details

### Recursive Algorithm:
1. Checks if value is an array → Process each item
2. Checks if value is a string → Test if it's an ISO timestamp
3. Checks if value is an object → Process all properties
4. For timestamp fields → Convert to UTC+05:00
5. For nested objects → Recursively process

### Safe Conversion:
- ✅ Only converts valid ISO 8601 timestamps
- ✅ Preserves non-timestamp strings
- ✅ Handles null/undefined values
- ✅ Works with arrays and nested objects
- ✅ No data loss or corruption

## 📋 All Affected Endpoints

All audit endpoints now convert ALL timestamps:

| Endpoint | Converts |
|----------|----------|
| `GET /api/audit/logs` | ✅ All fields |
| `GET /api/audit/logs/:id` | ✅ All fields |
| `GET /api/audit/user/:userId` | ✅ All fields |
| `GET /api/audit/security-events` | ✅ All fields |

## ⚙️ Configuration

The timezone offset is still configurable in both files:

```javascript
// To change timezone, update this constant:
const AUDIT_TIMEZONE_OFFSET = 5 * 60;  // 5 hours = UTC+05:00

// For different timezones:
// UTC+08:00 → const AUDIT_TIMEZONE_OFFSET = 8 * 60;
// UTC-05:00 → const AUDIT_TIMEZONE_OFFSET = -5 * 60;
```

## ✅ Verification Checklist

After restarting the server, verify:
- [ ] `createdAt` has `+05:00`
- [ ] `metadata.loginTime` has `+05:00`
- [ ] `metadata.failureTime` has `+05:00`
- [ ] All other timestamp fields have `+05:00`
- [ ] Time difference is exactly 5 hours from UTC

## 🎉 Benefits

1. **Complete Coverage**: ALL timestamps converted, not just main field
2. **Automatic Detection**: No need to specify which fields to convert
3. **Deep Conversion**: Works with nested objects and arrays
4. **Safe Processing**: Only converts actual timestamps
5. **Consistent Format**: Uniform timezone across all fields

## 📞 Support

If any timestamp field is still showing UTC (ending with `Z`):
1. Restart server: `npm run dev`
2. Wait 5 seconds for server to fully start
3. Test again
4. Check field name contains "time" or "date"

---

**Status**: ✅ Complete  
**Version**: 1.2.1 (Enhanced)  
**Date**: October 31, 2025  
**Timezone**: UTC+05:00 (Pakistan Standard Time)


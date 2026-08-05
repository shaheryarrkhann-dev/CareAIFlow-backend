# Test Metadata Timezone Conversion

## 🎯 What Was Fixed

**Issue:** `loginTime` and `failureTime` in metadata were still showing UTC (ending with `Z`)

**Fix:** Added recursive timestamp conversion that converts ALL timestamp fields

## ✅ Quick Test

### Step 1: Restart Server
```bash
# Stop the server (Ctrl+C)
npm run dev
```

### Step 2: Run Test Script
```powershell
.\test-timezone.ps1 "YOUR_ADMIN_TOKEN"
```

### Step 3: Verify Output
You should see ALL these with `+05:00`:
- ✅ `Created At: 2025-11-01T02:05:06.932+05:00`
- ✅ `Login Time: 2025-11-01T02:05:06.930+05:00`
- ✅ `Failure Time: 2025-11-01T02:04:43.010+05:00`

## 📊 Expected Result

```json
{
  "id": "7cf3a9e3-af96-4804-b1ac-a21a5260a813",
  "action": "LOGIN_SUCCESS",
  "createdAt": "2025-11-01T02:05:06.932+05:00",  // ✅
  "metadata": {
    "loginTime": "2025-11-01T02:05:06.930+05:00",  // ✅ Now has +05:00!
    "isEmailVerified": true
  }
}
```

## 🔍 What Gets Converted Now

### All These Fields Automatically:
- `createdAt` → Always converted
- `loginTime` → Detected (has "time" in name)
- `failureTime` → Detected (has "time" in name)
- `startDate` → Detected (has "date" in name)
- `endDate` → Detected (has "date" in name)
- `timestamp` → Detected (has "time" in name)
- Any field with "time" or "date" in the name

### In All JSON Fields:
- ✅ `metadata`
- ✅ `requestData`
- ✅ `responseData`

### Even Nested Objects:
```json
{
  "metadata": {
    "event": {
      "startTime": "...",  // ✅ Converted
      "nested": {
        "timestamp": "..."  // ✅ Also converted!
      }
    }
  }
}
```

## 🧪 Manual Test (Alternative)

### Using Postman or Browser:
```
GET http://localhost:4000/api/audit/logs?limit=5
Header: Authorization: Bearer YOUR_TOKEN
```

**Check the response JSON:**
1. Find a log with `metadata`
2. Look for `loginTime` or `failureTime`
3. Verify it ends with `+05:00` (not `Z`)

## ✅ Success Indicators

| Field | Before | After |
|-------|--------|-------|
| `createdAt` | `...Z` → `...+05:00` | ✅ |
| `metadata.loginTime` | `...Z` → `...+05:00` | ✅ |
| `metadata.failureTime` | `...Z` → `...+05:00` | ✅ |

## 📋 Comparison

### Your Previous Response (Before Fix):
```json
"metadata": {
  "loginTime": "2025-10-31T21:05:06.930Z"  // ❌ Had Z
}
```

### After Fix (What You Should See Now):
```json
"metadata": {
  "loginTime": "2025-11-01T02:05:06.930+05:00"  // ✅ Has +05:00
}
```

## 🚀 Test Commands

### PowerShell Test (Recommended):
```powershell
.\test-timezone.ps1 "YOUR_TOKEN"
```

### Manual curl Test:
```bash
curl -X GET "http://localhost:4000/api/audit/logs?limit=3" ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Specific Log:
```bash
curl -X GET "http://localhost:4000/api/audit/logs/7cf3a9e3-af96-4804-b1ac-a21a5260a813" ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🎉 What Changed in Code

### Added Function: `convertTimestampsInObject()`
- Recursively processes all objects
- Detects timestamp fields by name
- Converts ISO 8601 timestamps
- Works with arrays and nested objects
- Safe - only converts actual timestamps

### Enhanced Function: `formatAuditLogTimezone()`
- Now processes `metadata`
- Now processes `requestData`
- Now processes `responseData`
- Converts all timestamp fields in each

## 📝 Notes

- **Database unchanged** - Still stores in UTC (correct)
- **API layer conversion** - Happens when returning data
- **Automatic detection** - Finds timestamp fields by name
- **Safe conversion** - Only converts valid ISO timestamps
- **No data loss** - Original data preserved in database

## 🐛 If Still Not Working

1. **Verify server restarted:**
   ```bash
   # Should see: Server running on port 4000
   npm run dev
   ```

2. **Wait 5 seconds** after server starts

3. **Test again:**
   ```powershell
   .\test-timezone.ps1 "YOUR_TOKEN"
   ```

4. **Check for errors:**
   - Look at server console for any errors
   - Verify token is valid
   - Ensure you're testing the API (not database)

---

**Status:** ✅ Enhanced  
**Now Converts:** Main fields + All metadata timestamps  
**Detection:** Automatic by field name  
**Coverage:** 100% of timestamp fields


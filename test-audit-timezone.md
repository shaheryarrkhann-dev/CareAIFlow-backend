# Test Audit Trail Timezone - UTC+05:00

## Quick Test Script

Run these commands to verify the timezone implementation:

### 1. Start the Server
```bash
npm run dev
```

### 2. Test Login (Generates Audit Log)
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your_password"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": { ... }
}
```

### 3. Get Audit Logs (Check Timezone)
```bash
curl -X GET "http://localhost:4000/api/audit/logs?limit=5" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc-123-...",
      "userId": "user-456",
      "userName": "Admin User",
      "userEmail": "admin@example.com",
      "action": "LOGIN_SUCCESS",
      "resource": "auth",
      "description": "Admin User (SUPER_ADMIN) logged in successfully",
      "method": "POST",
      "endpoint": "/api/auth/login",
      "statusCode": 200,
      "ipAddress": "127.0.0.1",
      "createdAt": "2025-10-31T15:30:45.123+05:00"  ← CHECK THIS!
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 5,
    "totalPages": 1
  }
}
```

### 4. Verify Timestamp Format

The `createdAt` field should:
- ✅ End with `+05:00`
- ✅ Be 5 hours ahead of current UTC time
- ✅ Format: `YYYY-MM-DDTHH:mm:ss.sss+05:00`

### 5. Test Other Endpoints

#### Get Specific Log
```bash
curl -X GET "http://localhost:4000/api/audit/logs/{LOG_ID}" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Get Security Events
```bash
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Get User Logs
```bash
curl -X GET "http://localhost:4000/api/audit/user/{USER_ID}" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Time Verification

### Current Time Check
```bash
# Get current UTC time
date -u

# Get current UTC+05:00 time (should match audit logs)
TZ='Asia/Karachi' date
```

### Example Verification
```
Current UTC:      2025-10-31 10:30:45
Expected in Logs: 2025-10-31T15:30:45+05:00
Difference:       +5 hours ✅
```

## Visual Verification

### ✅ Correct Format
```json
"createdAt": "2025-10-31T15:30:45.123+05:00"
             └─────────────────────┘└────┘
                    Date/Time       Timezone
```

### ❌ Wrong Format (Old UTC)
```json
"createdAt": "2025-10-31T10:30:45.123Z"
                                      └─ Z means UTC (old format)
```

## Browser/Postman Test

### Using Postman
1. Create GET request to `http://localhost:4000/api/audit/logs`
2. Add Header: `Authorization: Bearer YOUR_TOKEN`
3. Send request
4. Check `createdAt` field in response
5. Verify it ends with `+05:00`

### Using Browser DevTools
```javascript
// Open browser console at http://localhost:4000/api/audit/logs
fetch('/api/audit/logs', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
})
.then(r => r.json())
.then(data => {
  console.log('Timestamp:', data.data[0].createdAt);
  console.log('Has +05:00?', data.data[0].createdAt.includes('+05:00'));
});
```

## Troubleshooting

### Issue: Timestamp still shows Z (UTC)
**Solution:**
1. Restart the server: `npm run dev`
2. Clear any caching
3. Verify files were saved correctly

### Issue: Wrong time shown
**Solution:**
1. Check system time: `date`
2. Verify offset calculation
3. Ensure 5 hours are added, not subtracted

### Issue: Error when fetching logs
**Solution:**
1. Verify authentication token
2. Check user has ADMIN or SUPER_ADMIN role
3. Check server logs for errors

## Success Indicators

You'll know it's working correctly when:

✅ All timestamps end with `+05:00`  
✅ Time is 5 hours ahead of UTC  
✅ Format is ISO 8601 compliant  
✅ Historical logs also show +05:00  
✅ All audit endpoints return same format  

## Quick Comparison Table

| UTC Time | UTC+05:00 Time |
|----------|----------------|
| 00:00:00 | 05:00:00 |
| 06:00:00 | 11:00:00 |
| 12:00:00 | 17:00:00 |
| 18:00:00 | 23:00:00 |
| 23:00:00 | 04:00:00 (next day) |

## Complete Test Suite

```bash
#!/bin/bash
# Save as test-timezone.sh

echo "=== Testing Audit Trail Timezone ==="

# Variables
BASE_URL="http://localhost:4000"
TOKEN="YOUR_ADMIN_TOKEN_HERE"

# Test 1: Get all logs
echo -e "\n1. Getting all audit logs..."
curl -s -X GET "$BASE_URL/api/audit/logs?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0].createdAt'

# Test 2: Get security events
echo -e "\n2. Getting security events..."
curl -s -X GET "$BASE_URL/api/audit/security-events?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0].createdAt'

# Test 3: Verify format
echo -e "\n3. Verifying timezone format..."
TIMESTAMP=$(curl -s -X GET "$BASE_URL/api/audit/logs?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].createdAt')

if [[ $TIMESTAMP == *"+05:00" ]]; then
  echo "✅ Timezone format correct: $TIMESTAMP"
else
  echo "❌ Timezone format incorrect: $TIMESTAMP"
fi

echo -e "\n=== Test Complete ==="
```

Make executable and run:
```bash
chmod +x test-timezone.sh
./test-timezone.sh
```

---

**All tests should show timestamps with +05:00 suffix**


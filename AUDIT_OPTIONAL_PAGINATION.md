# Audit Trail - Optional Pagination

## ✅ What Changed

Pagination is now **optional** for all audit log endpoints. Users can:
- Fetch **all records** at once (no pagination)
- Or use pagination to fetch specific pages

## 🎯 Key Changes

### Before (Mandatory Pagination)
- Default `page = 1`
- Default `limit = 50`
- Max limit: 100 records per page
- Always returned pagination info

### After (Optional Pagination)
- **No defaults** - fetch all if not specified
- **No max limit** - can fetch 1000+ records
- Pagination info only when using pagination

## 📋 API Usage

### Option 1: Fetch ALL Records (No Pagination)
```bash
# Get all audit logs
curl -X GET "http://localhost:4000/api/audit/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [...],  // All records
  "total": 1523   // Total count
}
```

### Option 2: Use Pagination
```bash
# Get page 1 with 50 records
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [...],  // 50 records
  "pagination": {
    "total": 1523,
    "page": 1,
    "limit": 50,
    "totalPages": 31
  }
}
```

### Option 3: Large Batch Fetch
```bash
# Get 1000 records at once
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=1000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔄 All Affected Endpoints

### 1. Get All Audit Logs
```
GET /api/audit/logs
```

**Without Pagination:**
```bash
GET /api/audit/logs?action=LOGIN_SUCCESS
```

**With Pagination:**
```bash
GET /api/audit/logs?action=LOGIN_SUCCESS&page=1&limit=50
```

### 2. Get User Audit Logs
```
GET /api/audit/user/:userId
```

**Without Pagination:**
```bash
GET /api/audit/user/abc-123
```

**With Pagination:**
```bash
GET /api/audit/user/abc-123?page=1&limit=100
```

### 3. Get Security Events
```
GET /api/audit/security-events
```

**Without Pagination:**
```bash
GET /api/audit/security-events
```

**With Pagination:**
```bash
GET /api/audit/security-events?page=1&limit=20
```

## 📊 Response Format

### Without Pagination Parameters
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "action": "LOGIN_SUCCESS",
      "createdAt": "2025-11-01T02:05:06.932+05:00",
      // ... all fields with UTC+05:00 timestamps
    }
    // ... all matching records
  ],
  "total": 1523  // Total count of records
}
```

### With Pagination Parameters
```json
{
  "success": true,
  "data": [
    // ... limited records
  ],
  "pagination": {
    "total": 1523,
    "page": 1,
    "limit": 50,
    "totalPages": 31
  }
}
```

## 🎯 Use Cases

### Use Case 1: Export All Logs
```bash
# Get all logs for export
curl -X GET "http://localhost:4000/api/audit/logs?startDate=2025-10-01&endDate=2025-10-31" \
  -H "Authorization: Bearer YOUR_TOKEN" > audit_logs.json
```

### Use Case 2: Dashboard Display
```bash
# Get recent 100 logs for dashboard
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=100" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Use Case 3: User Activity Report
```bash
# Get all actions by a specific user
curl -X GET "http://localhost:4000/api/audit/user/abc-123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Use Case 4: Security Analysis
```bash
# Get all failed login attempts
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## ⚡ Performance Considerations

### Small Datasets (< 1000 records)
```bash
# Fetch all at once - fast and simple
GET /api/audit/logs
```

### Large Datasets (> 1000 records)
```bash
# Use pagination for better performance
GET /api/audit/logs?page=1&limit=100
```

### Very Large Datasets (> 10000 records)
```bash
# Filter by date and use pagination
GET /api/audit/logs?startDate=2025-10-01&endDate=2025-10-31&page=1&limit=500
```

## 🔍 Filtering Examples

### Without Pagination (All Results)
```bash
# All login successes
GET /api/audit/logs?action=LOGIN_SUCCESS

# All auth-related logs
GET /api/audit/logs?resource=auth

# All logs from specific user
GET /api/audit/logs?userId=abc-123

# All logs in date range
GET /api/audit/logs?startDate=2025-10-01&endDate=2025-10-31
```

### With Pagination (Limited Results)
```bash
# First 50 login successes
GET /api/audit/logs?action=LOGIN_SUCCESS&page=1&limit=50

# Next 50 login successes
GET /api/audit/logs?action=LOGIN_SUCCESS&page=2&limit=50
```

## 📝 Query Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `page` | No | Page number (starts at 1) | `page=1` |
| `limit` | No | Records per page | `limit=100` |
| `userId` | No | Filter by user ID | `userId=abc-123` |
| `action` | No | Filter by action type | `action=LOGIN_SUCCESS` |
| `resource` | No | Filter by resource | `resource=auth` |
| `startDate` | No | Filter from date | `startDate=2025-10-01` |
| `endDate` | No | Filter to date | `endDate=2025-10-31` |
| `tenantId` | No | Filter by tenant (SUPER_ADMIN only) | `tenantId=xyz-789` |

**Note:** 
- Both `page` and `limit` must be provided together for pagination
- If neither is provided, all matching records are returned
- If only one is provided, it's ignored (no pagination)

## ✅ Benefits

1. **Flexibility**
   - Fetch all records when needed
   - Use pagination for large datasets
   - No arbitrary limits

2. **Performance**
   - Fetch only what you need
   - No wasted API calls for small datasets
   - Efficient for large exports

3. **Simplicity**
   - No pagination logic needed for small queries
   - Cleaner API responses
   - Easier integration

4. **Backward Compatibility**
   - Existing pagination still works
   - No breaking changes
   - API consumers can choose their approach

## 🧪 Testing

### Test 1: Fetch All Records
```bash
curl -X GET "http://localhost:4000/api/audit/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** All records, `total` field present, no `pagination` field

### Test 2: Fetch With Pagination
```bash
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** 10 records max, `pagination` field present, no `total` field

### Test 3: Large Batch
```bash
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=1000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Up to 1000 records, `pagination` field with correct counts

## 📚 Implementation Details

### Modified Files
1. `src/controllers/audit.controller.js`
   - Removed default values for `page` and `limit`
   - Removed max limit restriction
   - Made pagination response conditional

2. `src/services/audit.service.js`
   - Removed default values
   - Made query pagination conditional
   - Returns `total` when no pagination
   - Returns `pagination` object when paginated

### Logic Flow
```
User Request
    ↓
Check if page & limit provided?
    ↓
YES → Apply pagination
│     - Calculate skip
│     - Apply take limit
│     - Return with pagination object
│
NO  → Fetch all records
      - No skip/take
      - Return with total count
```

## 🎉 Summary

| Feature | Before | After |
|---------|--------|-------|
| Default pagination | ✅ Yes (page=1, limit=50) | ❌ No defaults |
| Max records per request | ❌ Limited to 100 | ✅ Unlimited |
| Fetch all at once | ❌ Not possible | ✅ Possible |
| Pagination optional | ❌ No | ✅ Yes |
| Response format | Same always | Dynamic based on params |

---

**Status:** ✅ Complete  
**Version:** 1.2.2  
**Date:** October 31, 2025  
**Backward Compatible:** Yes


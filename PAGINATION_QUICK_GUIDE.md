# Audit Pagination - Quick Guide

## 🎯 Two Ways to Use the API

### Option 1: Get ALL Records (No Pagination)
```bash
GET /api/audit/logs
```

**Response:**
```json
{
  "success": true,
  "data": [...],  // All records
  "total": 1523
}
```

### Option 2: Get Paginated Records
```bash
GET /api/audit/logs?page=1&limit=50
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

---

## 📋 Quick Examples

### Fetch All Logs
```bash
curl -X GET "http://localhost:4000/api/audit/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Fetch 100 Logs (Paginated)
```bash
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=100" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Fetch 1000 Logs at Once
```bash
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=1000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get All Security Events
```bash
curl -X GET "http://localhost:4000/api/audit/security-events" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get All User Logs
```bash
curl -X GET "http://localhost:4000/api/audit/user/abc-123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚡ What Changed

| Aspect | Before | After |
|--------|--------|-------|
| Default page | 1 | None (optional) |
| Default limit | 50 | None (optional) |
| Max limit | 100 | Unlimited |
| Fetch all | ❌ Not possible | ✅ Possible |

---

## ✅ Key Points

- **No pagination params** = Fetch ALL records
- **Both page & limit** = Fetch paginated records
- **No limits** = Can fetch 1000+ records
- **Backward compatible** = Old pagination still works

---

**Quick Test:**
```bash
# Restart server
npm run dev

# Test without pagination (all records)
curl -X GET "http://localhost:4000/api/audit/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test with pagination (limited)
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```


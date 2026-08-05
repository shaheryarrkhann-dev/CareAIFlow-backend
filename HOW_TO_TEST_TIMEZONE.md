# How to Test Timezone Implementation - Quick Guide

## 🚨 IMPORTANT: You're Looking at the Wrong Thing!

### ❌ What You Checked (Raw Database)
```
createdAt: 2025-10-31 21:05:06.932  ← No +05:00 (This is CORRECT for database!)
```

### ✅ What You SHOULD Check (API Response)
```json
"createdAt": "2025-11-01T02:05:06.932+05:00"  ← Has +05:00 (This shows conversion!)
```

---

## 📋 3-Step Test Process

### Step 1: Restart Your Server
```bash
# Stop server (Ctrl+C in the terminal)
# Then restart:
npm run dev
```

**Wait for:** `Server running on port 4000`

### Step 2: Get Your Admin Token
You already have a token from your login. If you need a fresh one:

```bash
# Login via API
curl -X POST http://localhost:4000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"muhammadasharusman@gmail.com\",\"password\":\"your_password\"}"
```

Copy the `token` from the response.

### Step 3: Test the API (Choose One Method)

#### Method A: PowerShell Script (Recommended for Windows)
```powershell
# In PowerShell:
.\test-timezone.ps1 "YOUR_ADMIN_TOKEN_HERE"
```

#### Method B: Using Postman
1. Open Postman
2. Create GET request: `http://localhost:4000/api/audit/logs?limit=5`
3. Add Header: `Authorization: Bearer YOUR_TOKEN`
4. Send
5. Check `createdAt` field - **must have `+05:00` at the end**

#### Method C: Command Line (Windows)
```powershell
# Replace YOUR_TOKEN with your actual token
curl -X GET "http://localhost:4000/api/audit/logs?limit=5" -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ✅ What Success Looks Like

### API Response Should Show:
```json
{
  "success": true,
  "data": [
    {
      "id": "7cf3a9e3-af96-4804-b1ac-a21a5260a813",
      "userId": "64cbb65e-7c02-4343-96b7-7e9f44a12a59",
      "action": "LOGIN_SUCCESS",
      "createdAt": "2025-11-01T02:05:06.932+05:00",  ← ✅ Has +05:00
      "description": "Super Admin (SUPER_ADMIN) logged in successfully"
    }
  ]
}
```

### Your Last Login (Database: 21:05:06 UTC)
**Should appear in API as:** `02:05:06+05:00` (5 hours later, next day)

```
Database:  Oct 31, 21:05:06 (UTC)
API:       Nov 1,  02:05:06 (UTC+05:00)  ← +5 hours
```

---

## 🔍 Visual Verification

```
Your Database Shows:
┌──────────────────────┐
│ 2025-10-31 21:05:06  │  ← UTC time (stored)
└──────────────────────┘

API Should Show:
┌────────────────────────────────┐
│ 2025-11-01T02:05:06.932+05:00 │  ← UTC+05:00 (converted)
└────────────────────────────────┘
        ↑           ↑         ↑
     Next day    +5 hours  Timezone suffix
```

---

## 🐛 If It's Still Not Working

### 1. Verify Files Were Updated
```powershell
# Check the service file
Select-String -Path "src/services/audit.service.js" -Pattern "AUDIT_TIMEZONE_OFFSET"

# Should show: const AUDIT_TIMEZONE_OFFSET = 5 * 60;
```

### 2. Check Server is Running
```powershell
# You should see:
# Server running on port 4000
```

### 3. Test with Fresh Session
```powershell
# Kill all node processes
taskkill /F /IM node.exe

# Start server fresh
npm run dev

# Wait 5 seconds, then test again
.\test-timezone.ps1 "YOUR_TOKEN"
```

---

## 📊 Quick Reference

| Check | Expected Result |
|-------|----------------|
| Database query | `2025-10-31 21:05:06` (no timezone) |
| API response | `2025-11-01T02:05:06.932+05:00` (has +05:00) |
| Time difference | +5 hours from UTC |
| Format suffix | Must end with `+05:00` |

---

## 💡 Key Understanding

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  DATABASE   │  →   │     API     │  →   │   CLIENT    │
│             │      │             │      │             │
│ Stores UTC  │      │ Converts to │      │  Receives   │
│ (standard)  │      │ UTC+05:00   │      │  +05:00     │
└─────────────┘      └─────────────┘      └─────────────┘
```

**You were checking the DATABASE directly, which will always show UTC!**
**You need to check the API response to see the timezone conversion!**

---

## 🎯 Action Items

1. [ ] Restart server: `npm run dev`
2. [ ] Get admin token (or use existing one)
3. [ ] Run: `.\test-timezone.ps1 "YOUR_TOKEN"`
4. [ ] Verify response has `+05:00` suffix
5. [ ] If successful, ✅ implementation is working!

---

## 📞 Next Steps

After testing via API:
- If you see `+05:00` → ✅ **Working correctly!**
- If you still see `Z` → Share the **API response** (not database output)

---

**Remember: Database stores UTC, API returns UTC+05:00. Always test via API!**


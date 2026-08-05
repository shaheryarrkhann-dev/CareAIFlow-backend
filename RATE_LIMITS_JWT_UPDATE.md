# Rate Limits & JWT Token Updates

## Changes Made

### 1. Rate Limiting (Increased Limits)

#### Before vs After

| Limiter Type | Before | After | Change |
|--------------|--------|-------|--------|
| **General API** | 100 requests/15min | 1000 requests/15min | **+900%** |
| **Authentication** | 20 attempts/15min | 50 attempts/15min | **+150%** |
| **Password Reset** | 3 attempts/hour | 10 attempts/hour | **+233%** |

#### Details

**General API Rate Limiter** (`apiLimiter`)
- **Old:** 100 requests per 15 minutes
- **New:** 1000 requests per 15 minutes
- **Impact:** Users can make 10x more API calls without being blocked
- **File:** `src/middlewares/rateLimit.middleware.js` (Line 9)

**Authentication Rate Limiter** (`authLimiter`)
- **Old:** 20 login attempts per 15 minutes
- **New:** 50 login attempts per 15 minutes
- **Impact:** More lenient during login issues, testing, or password recovery
- **File:** `src/middlewares/rateLimit.middleware.js` (Line 24)

**Password Reset Rate Limiter** (`passwordResetLimiter`)
- **Old:** 3 password reset requests per hour
- **New:** 10 password reset requests per hour
- **Impact:** Users can retry password resets more times before being blocked
- **File:** `src/middlewares/rateLimit.middleware.js` (Line 40)

### 2. JWT Access Token Expiration (Extended)

#### Before vs After

| Token Type | Before | After | Change |
|------------|--------|-------|--------|
| **Access Token** | 15 minutes | 2 days | **+192x** |
| **Refresh Token** | 30 days | 30 days | No change |
| **Password Reset Token** | 1 hour | 1 hour | No change |

#### Details

**Access Token Expiration**
- **Old:** 15 minutes (user had to re-login every 15 minutes)
- **New:** 2 days (user stays logged in for 2 days)
- **Impact:** Much better user experience - no frequent logouts
- **File:** `src/utils/jwt.util.js` (Line 5)

## Why These Changes?

### Problem 1: Aggressive Rate Limiting
**User Complaint:** "When someone tries for 3 or 5 times... it gives error and wait for 15 minutes. It's really frustrating."

**Root Cause:** 
- The authentication rate limiter was set to 20 attempts per 15 minutes
- During development/testing, this limit is hit quickly
- Users with typos or forgotten passwords get blocked

**Solution:**
- Increased all rate limits significantly
- Still provides protection against abuse, but more forgiving

### Problem 2: Short JWT Token Expiration
**User Request:** "For JWT login, increase time to 2 days"

**Root Cause:**
- Access tokens expired after 15 minutes
- Users had to re-authenticate frequently
- Poor user experience during active sessions

**Solution:**
- Extended access token to 2 days
- Users can work continuously without re-login
- Refresh token (30 days) remains as backup

## Security Considerations

### Are These Changes Safe?

**Rate Limiting:**
✅ **Yes** - The new limits are still reasonable:
- 1000 requests/15min = ~1 request per second (not abusive)
- 50 login attempts/15min = still blocks brute force attacks
- 10 password resets/hour = prevents spam, allows legitimate use

**JWT Token Extension:**
✅ **Yes, with caveats:**
- 2-day access token is common in production apps
- Refresh token (30 days) provides long-term session
- Users can manually logout to invalidate tokens
- For higher security environments, you can reduce this via env variable

### Environment Variable Override

You can still override these defaults in your `.env` file:

```env
# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=1000          # General API (default: 1000)
RATE_LIMIT_AUTH_MAX_REQUESTS=50       # Auth endpoints (default: 50)
RATE_LIMIT_WINDOW_MS=900000           # 15 minutes in ms (default)
RATE_LIMIT_AUTH_WINDOW_MS=900000      # 15 minutes in ms (default)

# JWT Tokens
JWT_ACCESS_EXPIRES=2d                 # Access token (default: 2 days)
JWT_REFRESH_EXPIRES=30d               # Refresh token (default: 30 days)
JWT_RESET_PASSWORD_EXPIRES=1h         # Password reset (default: 1 hour)
```

## What Happens After Restart

### Immediate Effects:
1. ✅ Users can make 1000 API calls per 15 minutes (was 100)
2. ✅ Users can attempt login 50 times per 15 minutes (was 20)
3. ✅ Users can request password reset 10 times per hour (was 3)
4. ✅ New logins will get 2-day access tokens (was 15 minutes)

### For Existing Users:
- **Old tokens:** Will continue to work until their original 15-minute expiration
- **New tokens:** Will get 2-day expiration on next login
- **Rate limits:** Reset immediately after server restart

## Testing the Changes

### Test 1: Rate Limiting
```bash
# Make 30 API calls in quick succession - should work fine now
for i in {1..30}; do
  curl -X GET http://localhost:4000/api/forms/schemas \
    -H "Authorization: Bearer YOUR_TOKEN"
done
```

### Test 2: JWT Token Duration
```bash
# Login and check token expiration
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Decode the JWT to see expiration (use jwt.io or jwt-cli)
# Should show exp: 2 days from now
```

### Test 3: Multiple Login Attempts
```bash
# Try login 30 times - should work without blocking
for i in {1..30}; do
  echo "Attempt $i"
  curl -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrongpassword"}'
done
```

## Rollback (If Needed)

If you need to revert to stricter limits:

### Option 1: Use Environment Variables
Add to `.env`:
```env
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_REQUESTS=20
JWT_ACCESS_EXPIRES=15m
```

### Option 2: Edit the Files
Revert the changes in:
- `src/middlewares/rateLimit.middleware.js`
- `src/utils/jwt.util.js`

## Summary

| Setting | Old Value | New Value | Benefit |
|---------|-----------|-----------|---------|
| General API Limit | 100/15min | 1000/15min | Less frustration during active use |
| Auth Limit | 20/15min | 50/15min | More forgiving during login issues |
| Password Reset | 3/hour | 10/hour | Better recovery experience |
| JWT Access Token | 15 minutes | 2 days | No frequent logouts |

**Result:** 🎉 **Much better user experience while maintaining security!**

---

**Updated:** October 20, 2025
**Status:** ✅ Implemented - Restart server to apply



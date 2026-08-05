# 📡 API Examples

Complete examples for all authentication endpoints.

## 🔐 Authentication Endpoints

### 1. Login

**Endpoint:** `POST /api/auth/login`

**Rate Limit:** 5 requests per 15 minutes

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@12345"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Super Admin",
    "role": "SUPER_ADMIN",
    "isEmailVerified": true,
    "isActive": true,
    "tenantId": "uuid",
    "tenant": {
      "id": "uuid",
      "name": "Default Organization",
      "slug": "default",
      "isActive": true
    }
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 2. Refresh Token

**Endpoint:** `POST /api/auth/refresh-token`

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3. Logout

**Endpoint:** `POST /api/auth/logout`

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 4. Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

**Rate Limit:** 3 requests per hour

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent"
}
```

**Note:** In development mode, the reset token will be logged to the console. In production, it should be sent via email.

---

### 5. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Rate Limit:** 5 requests per 15 minutes

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RESET_TOKEN_FROM_EMAIL",
    "newPassword": "NewSecure@123"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

---

### 6. Invite User (Admin Only)

**Endpoint:** `POST /api/auth/invite-user`

**Rate Limit:** 5 requests per 15 minutes

**Authentication:** Required (Admin or Super Admin)

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/invite-user \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "New User",
    "role": "USER",
    "tenantId": "YOUR_TENANT_ID"
  }'
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "User invited successfully",
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "USER",
    "isEmailVerified": false,
    "isActive": true,
    "tenantId": "uuid"
  }
}
```

**Notes:**
- Admins can only invite users to their own tenant
- Super Admins can invite users to any tenant
- A temporary password is generated and sent via email (logged to console in dev mode)
- Valid roles: `STAFF`, `GUARDIAN`, `ADMIN`
  - **STAFF**: Staff member with standard access
  - **GUARDIAN**: Guardian/Parent user role
  - **ADMIN**: Organization administrator

---

### 7. Get Current User

**Endpoint:** `GET /api/auth/me`

**Authentication:** Required

**Request:**
```bash
curl -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Super Admin",
    "role": "SUPER_ADMIN",
    "isEmailVerified": true,
    "isActive": true,
    "tenantId": "uuid",
    "tenant": {
      "id": "uuid",
      "name": "Default Organization",
      "slug": "default",
      "isActive": true
    }
  }
}
```

---

## 🔑 Using Access Tokens

All protected endpoints require an access token in the Authorization header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Token Lifecycle

1. **Login** → Receive `accessToken` (15 min expiry) and `refreshToken` (30 days expiry)
2. **Use accessToken** → For authenticated requests
3. **Token expires** → Use `refreshToken` to get new tokens
4. **Logout** → Revoke the `refreshToken`

---

## 🚦 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/api/auth/login` | 5 per 15 minutes |
| `/api/auth/forgot-password` | 3 per hour |
| `/api/auth/reset-password` | 5 per 15 minutes |
| `/api/auth/invite-user` | 5 per 15 minutes |
| All other `/api/*` | 100 per 15 minutes |

**Rate Limit Headers:**
```
RateLimit-Limit: 5
RateLimit-Remaining: 4
RateLimit-Reset: 1699999999
```

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error (field_name)"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Route not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "message": "Too many authentication attempts, please try again after 15 minutes"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 🧪 Testing with Postman

Import this collection structure:

1. **Create Environment Variables:**
   - `baseUrl`: `http://localhost:4000`
   - `accessToken`: (set automatically after login)
   - `refreshToken`: (set automatically after login)

2. **Login Request** - Save tokens to environment:
   ```javascript
   // Test script
   const response = pm.response.json();
   pm.environment.set("accessToken", response.accessToken);
   pm.environment.set("refreshToken", response.refreshToken);
   ```

3. **Protected Routes** - Use `{{accessToken}}` in Authorization header

---

## 📱 Integration Examples

### JavaScript/Fetch
```javascript
// Login
const response = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'Admin@12345'
  })
});

const { accessToken, refreshToken, user } = await response.json();

// Use access token
const userResponse = await fetch('http://localhost:4000/api/auth/me', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
```

### Axios
```javascript
import axios from 'axios';

// Configure base URL
const api = axios.create({
  baseURL: 'http://localhost:4000/api'
});

// Login
const { data } = await api.post('/auth/login', {
  email: 'admin@example.com',
  password: 'Admin@12345'
});

// Set token for future requests
api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;

// Get current user
const user = await api.get('/auth/me');
```

---

Happy coding! 🚀


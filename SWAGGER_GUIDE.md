# 📖 Swagger API Documentation Guide

This guide will help you use the Swagger UI to test and explore the API endpoints.

## 🌐 Accessing Swagger UI

Once your server is running, access Swagger at:

```
http://localhost:4000/api-docs
```

## 🎯 Features

### What You Can Do:

✅ **View all endpoints** - See complete API documentation  
✅ **Try endpoints live** - Execute API calls directly from the browser  
✅ **See request/response schemas** - Understand data structures  
✅ **Test authentication** - Use Bearer tokens for protected routes  
✅ **View rate limits** - See which endpoints are rate-limited  
✅ **Download OpenAPI spec** - Get the JSON specification  

## 🔐 Testing Protected Endpoints

### Step-by-Step Guide:

#### 1. Login to Get Token

1. Find the **POST /api/auth/login** endpoint
2. Click **"Try it out"**
3. Enter credentials:
   ```json
   {
     "email": "alirazaarif@yopmail.com",
     "password": "Admin@12345"
   }
   ```
4. Click **"Execute"**
5. Copy the `accessToken` from the response

#### 2. Authorize Swagger

1. Click the **"Authorize" 🔒** button at the top right
2. In the dialog, enter:
   ```
   Bearer YOUR_ACCESS_TOKEN
   ```
   (Replace YOUR_ACCESS_TOKEN with the token from step 1)
3. Click **"Authorize"**
4. Click **"Close"**

#### 3. Test Protected Endpoints

Now you can test any endpoint that requires authentication, such as:
- **GET /api/auth/me** - Get your user profile
- **POST /api/auth/invite-user** - Invite new users (Admin only)

## 📚 Endpoint Categories

### 🔑 Authentication
Endpoints for user login, logout, and token management:
- Login
- Refresh Token
- Logout
- Forgot Password
- Reset Password

### 👥 User Management (Admin Only)
Endpoints requiring ADMIN or SUPER_ADMIN role:
- Invite User

### 🏥 System
Health check and status endpoints

## 🎨 Understanding the UI

### Color Coding:
- 🟢 **GET** - Retrieve data
- 🟡 **POST** - Create or submit data
- 🔵 **PUT** - Update data
- 🔴 **DELETE** - Remove data

### Status Codes:
- **200** - Success
- **201** - Created
- **400** - Bad Request (validation error)
- **401** - Unauthorized (missing/invalid token)
- **403** - Forbidden (insufficient permissions)
- **429** - Too Many Requests (rate limited)
- **500** - Server Error

## 💡 Pro Tips

### 1. Save Your Token
After logging in, keep your access token handy. It expires in 15 minutes, so you'll need to refresh it.

### 2. Use Refresh Token
When your access token expires:
1. Use **POST /api/auth/refresh-token**
2. Provide your `refreshToken`
3. Get a new `accessToken`

### 3. Test Rate Limits
Try making multiple login attempts to see rate limiting in action:
- Login: 5 attempts per 15 minutes
- Forgot Password: 3 attempts per hour

### 4. Explore Schemas
Click on any endpoint to see:
- Request body schema
- Response schema
- Example values

### 5. Download Specification
Get the OpenAPI JSON spec at:
```
http://localhost:4000/api-docs.json
```

## 🧪 Common Test Scenarios

### Scenario 1: Complete Login Flow
```
1. POST /api/auth/login
   → Get accessToken and refreshToken

2. GET /api/auth/me
   → View your profile (use accessToken)

3. POST /api/auth/logout
   → Revoke refreshToken
```

### Scenario 2: Password Reset Flow
```
1. POST /api/auth/forgot-password
   → Request reset (check console for token)

2. POST /api/auth/reset-password
   → Use token to reset password

3. POST /api/auth/login
   → Login with new password
```

### Scenario 3: Admin Operations
```
1. Login as admin (alirazaarif@yopmail.com)

2. POST /api/auth/invite-user
   → Invite new user to organization
   → Choose role: STAFF, GUARDIAN, or ADMIN

3. Check console for temporary password
```

### Scenario 4: Testing Different Roles
```
1. Login as Staff:
   → staff@example.com / Staff@12345

2. Login as Guardian:
   → guardian@example.com / Guardian@12345

3. Test role-specific permissions
```

## 🔍 Troubleshooting

### "Unauthorized" Error
- Make sure you clicked "Authorize" button
- Check if your token is in format: `Bearer TOKEN`
- Token might be expired (expires in 15 minutes)

### "Forbidden" Error
- You don't have the required role
- Admins can only access their own tenant
- Super Admins have access to all tenants

### Rate Limit Error
- Wait for the cooldown period
- Check rate limit headers in response

### Validation Error
- Check the request schema
- Ensure all required fields are provided
- Verify data formats (email, password strength, etc.)

## 📱 Alternative Tools

If you prefer other API testing tools:

### Postman
1. Import OpenAPI spec from: `http://localhost:4000/api-docs.json`
2. Set up environment variables for tokens
3. Use collection runner for automated tests

### Insomnia
1. Import OpenAPI spec
2. Use workspace for organizing requests

### cURL
See `API_EXAMPLES.md` for cURL examples

## 🎓 Learning Resources

### Understanding Swagger/OpenAPI
- [Swagger Official Docs](https://swagger.io/docs/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)

### JWT Authentication
- [JWT.io](https://jwt.io/) - Decode and verify JWT tokens
- Paste your access token to see the payload

### Rate Limiting
- Check response headers for limit information:
  - `RateLimit-Limit`: Maximum requests allowed
  - `RateLimit-Remaining`: Requests remaining
  - `RateLimit-Reset`: When limit resets (Unix timestamp)

## 🚀 Best Practices

1. **Always logout** - Revoke tokens when done testing
2. **Use demo user** - Test with demo@example.com for non-admin features
3. **Check schemas** - Review request/response structures before testing
4. **Monitor rate limits** - Don't exceed rate limits during testing
5. **Read descriptions** - Each endpoint has helpful description text

## 📞 Need Help?

If you encounter issues:
1. Check server console for error logs
2. Verify database connection
3. Ensure all environment variables are set
4. Check if Prisma Client is generated
5. Review API_EXAMPLES.md for code samples

---

Happy Testing! 🎉


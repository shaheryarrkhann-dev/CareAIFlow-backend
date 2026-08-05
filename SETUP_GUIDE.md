# 🚀 Quick Setup Guide

Follow these steps to get your authentication API up and running.

## ✅ Prerequisites

- [x] Node.js v16+ installed
- [x] PostgreSQL database installed and running
- [x] npm or yarn installed

## 📋 Step-by-Step Setup

### 1️⃣ Create Environment File

Copy the example and update with your values:

```bash
# Create .env file with your configuration
```

**Required environment variables:**

```env
# App Configuration
PORT=4000
NODE_ENV=development

# JWT Secrets - MUST CHANGE THESE!
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d
JWT_RESET_PASSWORD_EXPIRES=1h

# PostgreSQL Database URL
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/DATABASE_NAME

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX_REQUESTS=5

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Email Configuration (Optional - Development mode uses test emails)
# For Gmail, use App Password: https://myaccount.google.com/apppasswords
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=AI Onboarding
```

> 💡 **Email Setup:** Without SMTP configuration, emails are sent to Ethereal (test service) with preview links. See `EMAIL_SETUP.md` for production setup.

### 2️⃣ Create PostgreSQL Database

Option A - Using psql:
```bash
psql -U postgres
CREATE DATABASE auth_demo;
\q
```

Option B - Using PgAdmin or any PostgreSQL GUI client

### 3️⃣ Generate Prisma Client

```bash
npm run prisma:generate
```

This generates the Prisma Client based on your schema.

### 4️⃣ Run Database Migrations

```bash
npm run prisma:migrate
```

This creates all database tables (users, tenants, refresh_tokens, password_reset_tokens).

### 5️⃣ Seed Database (Optional)

```bash
npm run prisma:seed
```

This creates:
- Default tenant organization
- Super admin user: `alirazaarif@yopmail.com` / `Admin@12345`
- Staff user: `staff@example.com` / `Staff@12345`
- Guardian user: `guardian@example.com` / `Guardian@12345`

### 6️⃣ Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### 7️⃣ Test the API

Health check:
```bash
curl http://localhost:4000/health
```

Login:
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@12345"
  }'
```

## 🔍 Verify Setup

If everything is working correctly, you should see:

```
✅ Database connected successfully
🚀 Server running on http://localhost:4000
📝 Environment: development
```

## 🛠️ Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm start` | Start production server |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run migrations |
| `npm run prisma:studio` | Open database GUI |
| `npm run prisma:seed` | Seed database |

## 🐛 Troubleshooting

### Database Connection Error

If you see `Database connection failed`, check:
1. PostgreSQL is running
2. Database exists
3. Credentials in `DATABASE_URL` are correct
4. Host and port are correct

### Prisma Client Not Found

Run:
```bash
npm run prisma:generate
```

### Migration Errors

If migrations fail:
```bash
# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Then run migrations again
npm run prisma:migrate
```

## 📚 Next Steps

1. **Test all endpoints** using Postman or curl
2. **Integrate with frontend** using the access tokens
3. **Configure email service** for password reset (currently simulated)
4. **Customize user roles** and permissions as needed
5. **Add more features** like email verification, 2FA, etc.

## 🔒 Security Checklist

Before deploying to production:

- [ ] Change all JWT secrets to strong random strings
- [ ] Update `DATABASE_URL` with production credentials
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS
- [ ] Configure real email service
- [ ] Review and adjust rate limits
- [ ] Set up proper logging and monitoring
- [ ] Configure CORS for your frontend domain

## 🎉 You're All Set!

Your authentication API is now ready to use. Check the main README.md for full API documentation.

---

Need help? Check the README.md or open an issue on GitHub.


## 🧠 AI-Powered RAG Forms System

This project includes a complete **Retrieval-Augmented Generation (RAG)** system for dynamic form generation:

### Features
- 📄 **PDF Upload & Embedding** - Tenant-isolated vector storage with pgvector
- 🤖 **AI Schema Generation** - OpenAI analyzes PDFs and creates form schemas
- 📊 **Dynamic Tables** - Automatic per-tenant, per-form database tables
- 📝 **Form Submission** - Staff fill AI-generated forms
- 🔒 **Complete Tenant Isolation** - Multi-tenancy at every layer

### Quick Start
1. **Setup Database**: See `SETUP_RAG_SYSTEM.md`
2. **Usage Guide**: See `RAG_FORMS_GUIDE.md`
3. **Implementation Details**: See `RAG_SYSTEM_SUMMARY.md`
4. **API Docs**: http://localhost:4000/api-docs

### Environment Variables
```env
# OpenAI (Required for RAG)
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

# AWS S3 (Required for PDF Storage)
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
S3_BUCKET_NAME=pdf-storage-project

# Database (with pgvector)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/test_project"
```

### Key Endpoints
- `POST /api/embeddings/upload` - Upload PDF
- `POST /api/forms/generate-schema` - AI generates form
- `GET /api/forms/schemas` - List schemas
- `POST /api/forms/:id/submit` - Submit form
- `GET /api/forms/:id/responses` - View responses

### Database Prerequisites
- PostgreSQL with **pgvector** extension enabled
- **For local setup, see:** `LOCAL_SETUP_DOCKER.md` (complete step-by-step guide)
- Quick Docker command: `docker run --name postgres-pgvector -e POSTGRES_PASSWORD=123 -e POSTGRES_DB=ai_onboarding_local -p 5433:5432 -d pgvector/pgvector:pg16`

# AI Powered On Boarding

Multi-tenant authentication service with JWT access/refresh tokens, role-based access control, and rate limiting.

## 🚀 Stack
- **Node.js** & **Express.js**
- **Prisma ORM** + PostgreSQL
- **JWT** (access + refresh tokens)
- **bcrypt** for password hashing
- **express-validator** for request validation
- **express-rate-limit** for rate limiting
- **Helmet** for security headers
- **Multi-tenancy** support

## 📋 Features

- ✅ JWT authentication (access + refresh tokens)
- ✅ Multi-tenant architecture
- ✅ Role-based access control (RBAC)
- ✅ Password reset functionality
- ✅ User invitation system
- ✅ Rate limiting on sensitive endpoints
- ✅ Secure password hashing
- ✅ Token rotation on refresh
- ✅ Graceful shutdown handling
- ✅ Email notifications (Nodemailer)

## 🔐 User Roles

- **SUPER_ADMIN** - Full system access, can manage all tenants
- **ADMIN** - Can manage users within their organization
- **STAFF** - Staff member with standard access
- **GUARDIAN** - Guardian/Parent user role

## 📡 API Endpoints

### 📖 Interactive API Documentation

Access the **Swagger UI** documentation at:
```
http://localhost:4000/api-docs
```

You can also get the OpenAPI JSON specification at:
```
http://localhost:4000/api-docs.json
```

### Authentication
| Method | Endpoint | Description | Auth Required | Rate Limited |
|--------|----------|-------------|---------------|--------------|
| POST | `/api/auth/login` | Login user | No | Yes (5/15min) |
| POST | `/api/auth/refresh-token` | Refresh access token | No | No |
| POST | `/api/auth/logout` | Logout user | No | No |
| POST | `/api/auth/forgot-password` | Request password reset | No | Yes (3/hour) |
| POST | `/api/auth/reset-password` | Reset password | No | Yes (5/15min) |
| POST | `/api/auth/invite-user` | Invite user (Admin) | Yes | Yes (5/15min) |
| GET | `/api/auth/me` | Get current user | Yes | No |

### Tenant Management
| Method | Endpoint | Description | Auth Required | Rate Limited |
|--------|----------|-------------|---------------|--------------|
| GET | `/api/tenants` | List organizations | Yes | No |
| POST | `/api/tenants` | Create organization | Yes (SUPER_ADMIN) | Yes |
| GET | `/api/tenants/:id` | Get organization | Yes | No |
| PATCH | `/api/tenants/:id` | Update organization | Yes (ADMIN+) | Yes |
| GET | `/api/tenants/:id/users` | Get org users | Yes (ADMIN+) | No |
| GET | `/api/tenants/:id/stats` | Get org statistics | Yes (ADMIN+) | No |

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory (copy from `.env.example`):

```env
# App Configuration
PORT=4000
NODE_ENV=development

# JWT Secrets (CHANGE THESE IN PRODUCTION!)
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d
JWT_RESET_PASSWORD_EXPIRES=1h

# PostgreSQL Database URL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth_demo

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX_REQUESTS=5

# Frontend URL (for password reset links)
FRONTEND_URL=http://localhost:3000

# Email Configuration (Optional - uses test mode if not configured)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=AI Onboarding
```

**Note:** Email configuration is optional. Without SMTP credentials, the app uses Ethereal (test email service) that provides preview links in console. See `EMAIL_SETUP.md` for detailed configuration.

### 3. Initialize Database

Generate Prisma Client:
```bash
npm run prisma:generate
```

Run migrations:
```bash
npm run prisma:migrate
```

Seed database (creates default tenant and admin user):
```bash
npm run prisma:seed
```

### 4. Run the Application

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### 5. Access Prisma Studio (Optional)

To view and manage your database visually:
```bash
npm run prisma:studio
```

## 🔑 Default Credentials

After seeding, you can login with:

**Super Admin:**
- Email: `alirazaarif@yopmail.com`
- Password: `Admin@12345`

**Staff User:**
- Email: `staff@example.com`
- Password: `Staff@12345`

**Guardian User:**
- Email: `guardian@example.com`
- Password: `Guardian@12345`

> 💡 **Tip:** Use the Swagger UI at `http://localhost:4000/api-docs` to test all endpoints interactively!

## 📝 API Usage Examples

### Quick Test with Swagger UI

1. Open http://localhost:4000/api-docs
2. Click on `/api/auth/login` endpoint
3. Click "Try it out"
4. Enter credentials and execute
5. Copy the `accessToken` from response
6. Click "Authorize" button at top
7. Enter `Bearer YOUR_ACCESS_TOKEN`
8. Now you can test protected endpoints!

### Using cURL

#### Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alirazaarif@yopmail.com",
    "password": "Admin@12345"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Forgot Password
```bash
curl -X POST http://localhost:4000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com"
  }'
```

### Invite User (Admin Only)
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

## 🏗️ Project Structure

```
src/
├── app.js                    # Express app configuration
├── server.js                 # Server entry point
├── lib/
│   └── prisma.js             # Prisma client singleton
├── routes/
│   └── auth.routes.js        # Authentication routes
├── controllers/
│   └── auth.controller.js    # Request handlers
├── services/
│   └── auth.service.js       # Business logic
├── middlewares/
│   ├── auth.middleware.js    # JWT authentication
│   ├── rbac.middleware.js    # Role-based access control
│   ├── rateLimit.middleware.js # Rate limiting
│   └── validate.middleware.js  # Request validation
├── validators/
│   └── auth.validators.js    # Input validation rules
└── utils/
    ├── jwt.util.js           # JWT utilities
    └── email.util.js         # Email utilities

prisma/
├── schema.prisma             # Database schema
└── seed.js                   # Database seeder
```

## 🔒 Security Features

- **Helmet.js** - Sets secure HTTP headers
- **CORS** - Configured for frontend integration
- **Rate Limiting** - Protects against brute force attacks
- **JWT Tokens** - Secure stateless authentication
- **Password Hashing** - bcrypt with salt rounds of 12
- **Token Rotation** - Refresh tokens are rotated on use
- **Role-Based Access** - Granular permission control
- **Multi-Tenancy** - Data isolation between organizations

## 📦 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with nodemon |
| `npm start` | Start production server |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:studio` | Open Prisma Studio (database GUI) |
| `npm run prisma:seed` | Seed database with initial data |

## 🔄 Database Schema

### Models

**Tenant** - Organizations/companies
- id, name, slug, isActive, timestamps

**User** - Application users
- id, email, passwordHash, name, role, isEmailVerified, isActive, tenantId, timestamps

**RefreshToken** - JWT refresh tokens
- id, token, userId, tenantId, revoked, expiresAt, timestamps

**PasswordResetToken** - Password reset tokens
- id, token, userId, used, expiresAt, createdAt

## 🚧 Production Considerations

1. **Environment Variables**: Update all secrets before deployment
2. **Email Service**: Integrate real email provider (SendGrid, AWS SES, etc.)
3. **Database**: Use managed PostgreSQL (AWS RDS, Railway, etc.)
4. **HTTPS**: Always use HTTPS in production
5. **Logging**: Implement proper logging (Winston, Pino)
6. **Monitoring**: Add monitoring (Sentry, DataDog, etc.)
7. **Rate Limits**: Adjust rate limits based on your needs

## 📄 License

MIT

## 🤝 Contributing

Feel free to open issues and pull requests!

---

**Built with ❤️ using Node.js, Express, and Prisma**


docker run --name postgres-pgvector -e POSTGRES_PASSWORD=123 -e POSTGRES_DB=ai_onboarding_local -p 5433:5432 -d pgvector/pgvector:pg16

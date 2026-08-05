# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4] - 2025-11-01

### Added - Swagger Documentation for DELETE APIs 📝

#### What Was Added
- Added missing Swagger documentation for DELETE endpoints
- Documented PDF deletion endpoint with field cleanup details
- Documented form schema deletion endpoint
- Added preview-delete endpoint documentation

#### Modified Files
- `src/docs/embedding.docs.js`
  - Added `DELETE /api/embeddings/{id}` documentation
  - Added `GET /api/embeddings/{id}/preview-delete` documentation
  - Includes field cleanup response details
  - Shows master form deletion scenarios

- `src/docs/form.docs.js`
  - Added `DELETE /api/forms/schemas/{id}` documentation
  - Includes dynamic table drop details
  - Shows all deletion warnings

#### New Swagger Endpoints Documented

**DELETE /api/embeddings/{id}:**
- Delete PDF template and all embeddings
- Automatic field cleanup from master form
- Shows cleanup results in response
- Only ADMIN/SUPER_ADMIN

**GET /api/embeddings/{id}/preview-delete:**
- Preview which fields will be removed
- Shows fields still in use
- No actual deletion

**DELETE /api/forms/schemas/{id}:**
- Delete form schema
- Drops dynamic database table
- Deletes all form responses
- Only ADMIN/SUPER_ADMIN

#### Response Details Documented
- PDF deletion shows chunks deleted
- Field cleanup results (removed vs kept)
- Master form deletion status
- Dynamic table drop confirmation
- Clear warnings about data loss

#### Benefits
- ✅ Complete API documentation in Swagger UI
- ✅ All DELETE endpoints now discoverable
- ✅ Clear warnings about permanent deletions
- ✅ Field cleanup process documented
- ✅ Preview functionality exposed

#### Documentation
- `SWAGGER_DELETE_APIS_ADDED.md` - Complete guide

## [1.2.3] - 2025-11-01

### Fixed - Form Schema API for SUPER_ADMIN 🔧

#### Issue Resolved
- Fixed "tenantId is required" error when SUPER_ADMIN tried to fetch all form schemas without specifying tenantId
- SUPER_ADMIN can now view all tenant data without providing tenantId parameter

#### Changes Made

**Modified Files:**
- `src/controllers/form.controller.js`
  - Updated `getSchemas()` - Made tenantId optional for SUPER_ADMIN
  - Updated `getSchemaById()` - Made tenantId optional for SUPER_ADMIN
  - SUPER_ADMIN: tenantId=null fetches all tenants
  - SUPER_ADMIN: tenantId=specific fetches that tenant
  - Regular users: Always use their own tenantId (unchanged)

- `src/services/ai.service.js`
  - Updated `getFormSchemas()` - Conditionally filters by tenantId
  - Updated `getFormSchemaById()` - Conditionally filters by tenantId
  - Added `tenantId` to response so SUPER_ADMIN can see tenant ownership

#### API Behavior

**SUPER_ADMIN without tenantId (NEW):**
```bash
GET /api/forms/schemas
# Returns all schemas from all tenants
```

**SUPER_ADMIN with tenantId:**
```bash
GET /api/forms/schemas?tenantId=abc-123
# Returns schemas from specific tenant
```

**Regular users (unchanged):**
```bash
GET /api/forms/schemas
# Returns their own tenant's schemas
```

#### Response Changes
- Schema responses now include `tenantId` field
- SUPER_ADMIN can see which tenant each schema belongs to
- Regular users still isolated to their tenant

#### Benefits
- ✅ SUPER_ADMIN can view all tenant data
- ✅ SUPER_ADMIN can filter by specific tenant
- ✅ No breaking changes for regular users
- ✅ Maintains tenant isolation for non-SUPER_ADMIN

#### Documentation
- `FORM_SCHEMA_SUPER_ADMIN_FIX.md` - Complete guide

## [1.2.2] - 2025-10-31

### Changed - Optional Pagination for Audit Logs 🔓

#### Feature Overview
- 🔓 **Optional Pagination**: Pagination is now optional for all audit log endpoints
- 📊 **Fetch All Records**: Can fetch all records at once without pagination
- ⚡ **No Limits**: Removed default values and max limit restrictions
- 🎯 **Flexible Queries**: Choose between paginated or full result sets

#### Implementation Details

**Modified Files:**
- `src/controllers/audit.controller.js` - Made pagination optional
  - Removed default `page = 1` and `limit = 50`
  - Removed max limit restriction (was 100)
  - Made pagination response conditional
  - Updated: `getAuditLogs()`, `getUserAuditLogs()`, `getSecurityEvents()`

- `src/services/audit.service.js` - Made pagination conditional
  - Removed default pagination values
  - Only applies skip/take when page & limit provided
  - Returns `total` for non-paginated queries
  - Returns `pagination` object for paginated queries

**API Behavior Changes:**

**Without Pagination (Fetch All):**
```bash
GET /api/audit/logs
# Returns all records with "total" count
```

**With Pagination:**
```bash
GET /api/audit/logs?page=1&limit=50
# Returns limited records with "pagination" object
```

**All Affected Endpoints:**
- `GET /api/audit/logs` - Can fetch all or paginated
- `GET /api/audit/user/:userId` - Can fetch all or paginated
- `GET /api/audit/security-events` - Can fetch all or paginated

#### Response Format Changes

**Without Pagination Parameters:**
```json
{
  "success": true,
  "data": [...],  // All records
  "total": 1523   // Total count
}
```

**With Pagination Parameters:**
```json
{
  "success": true,
  "data": [...],  // Limited records
  "pagination": {
    "total": 1523,
    "page": 1,
    "limit": 50,
    "totalPages": 31
  }
}
```

#### Documentation
- `AUDIT_OPTIONAL_PAGINATION.md` - Complete guide for optional pagination

#### Benefits
- ✅ Fetch all records when needed (no limit)
- ✅ No mandatory pagination for small datasets
- ✅ Can fetch 1000+ records at once
- ✅ More flexible API usage
- ✅ Backward compatible (pagination still works)
- ✅ Better for exports and reports

## [1.2.1] - 2025-10-31

### Added - Audit Trail UTC+05:00 Timezone Support 🕐

#### Feature Overview
- 🕐 **UTC+05:00 Timezone**: All audit trail logs now display timestamps in UTC+05:00 (Pakistan Standard Time)
- 🎯 **Consistent Format**: Uniform timestamp format across all audit endpoints
- 💾 **Database Efficiency**: Database continues to store in UTC (best practice)
- 🔄 **Automatic Conversion**: Timestamps converted at API response level
- 🔍 **Deep Conversion**: Recursively converts ALL timestamps including nested metadata fields

#### Implementation Details

**Modified Files:**
- `src/services/audit.service.js` - Added timezone conversion utilities
  - `convertToAuditTimezone()` - Converts UTC to UTC+05:00
  - `convertTimestampsInObject()` - Recursively converts all timestamps in nested objects
  - `formatAuditLogTimezone()` - Formats audit log timestamps (enhanced to handle metadata)
  - Updated `getAuditLogs()` to format all returned logs

- `src/controllers/audit.controller.js` - Added timezone conversion to all endpoints
  - `convertTimestampsInObject()` - Recursive timestamp conversion
  - `getAuditLogs()` - Returns logs with UTC+05:00 timestamps
  - `getAuditLogById()` - Returns single log with UTC+05:00 timestamp
  - `getSecurityEvents()` - Returns security events with UTC+05:00 timestamps

**Timestamp Format:**
```
Before: 2025-10-31T10:30:45.123Z (UTC)
After:  2025-10-31T15:30:45.123+05:00 (UTC+05:00)
```

**Enhanced Conversion Coverage:**
- ✅ Main `createdAt` field
- ✅ `metadata.loginTime` field
- ✅ `metadata.failureTime` field
- ✅ All fields containing "time" or "date" in name
- ✅ Works with nested objects and arrays
- ✅ Automatically detects ISO 8601 timestamps

**All Affected Endpoints:**
- `GET /api/audit/logs` - All audit logs (all timestamp fields)
- `GET /api/audit/logs/:id` - Specific audit log (all timestamp fields)
- `GET /api/audit/user/:userId` - User audit logs (all timestamp fields)
- `GET /api/audit/security-events` - Security events (all timestamp fields)
- `GET /api/audit/stats` - Audit statistics

#### Documentation
- `AUDIT_TIMEZONE_IMPLEMENTATION.md` - Complete implementation guide
- `AUDIT_TIMEZONE_QUICK_REFERENCE.md` - Quick reference guide
- `AUDIT_TIMEZONE_METADATA_FIX.md` - Enhanced metadata conversion details
- Updated `AUDIT_TRAIL_GUIDE.md` - Added timezone configuration section
- Updated `test-timezone.ps1` - Now checks metadata fields too

#### Benefits
- ✅ All timestamps in local timezone (UTC+05:00)
- ✅ Includes timestamps in metadata, requestData, and responseData
- ✅ Automatic detection of timestamp fields
- ✅ No manual timezone conversion needed
- ✅ Easier to correlate with local events
- ✅ Database continues to store in UTC
- ✅ No breaking changes to existing functionality
- ✅ Historical logs automatically formatted
- ✅ Deep nested object support

## [1.2.0] - 2025-10-30

### Added - Master Form Field Cleanup System 🧹

#### Feature Overview
- 🧹 **Automatic Field Cleanup**: When a PDF/form is deleted, unused fields are automatically removed from the master form
- 🛡️ **Safe Field Preservation**: Common fields used by other PDFs are preserved
- 🔍 **Preview Before Delete**: Check which fields will be removed before deleting
- 🎯 **Smart Detection**: Case-insensitive field matching and duplicate detection
- 📊 **Detailed Results**: See exactly what was cleaned up after deletion

#### How It Works
When you delete a PDF template:
1. System identifies fields from the deleted PDF
2. Checks if those fields are used by other active PDFs
3. Removes only fields that are NOT used elsewhere
4. Updates master form with cleaned field list
5. **⚠️ Special Case:** If this is the last PDF, deletes entire master form
6. Returns detailed cleanup results

#### New API Endpoints
- `GET /api/embeddings/:id/preview-delete` - Preview which fields will be removed
- Enhanced `DELETE /api/embeddings/:id` - Now includes automatic field cleanup
- `DELETE /api/forms/schemas/:id` - Delete form schema directly

#### New Services
- `src/services/formFieldCleanup.service.js` - Core field cleanup logic
  - `cleanupMasterFormFields()` - Removes unused fields from master form
  - `previewFieldCleanup()` - Preview cleanup without deleting

#### Enhanced Services
- `src/services/embedding.service.js` - Integrated field cleanup into PDF deletion
- `src/controllers/embedding.controller.js` - Added preview endpoint
- `src/controllers/form.controller.js` - Added form schema deletion
- `src/routes/embedding.routes.js` - Added preview route
- `src/routes/form.routes.js` - Added form deletion route

#### API Response Examples

**Preview Cleanup:**
```json
{
  "success": true,
  "preview": {
    "willRemoveFields": ["unique_field_1", "unique_field_2"],
    "fieldsStillInUse": ["employee_name", "employee_email"],
    "totalFieldsInPdf": 4,
    "message": "2 field(s) will be removed from the master form"
  }
}
```

**Delete PDF with Cleanup:**
```json
{
  "success": true,
  "message": "PDF deleted successfully and 2 unused field(s) removed from master form",
  "deletedPdf": {
    "id": "abc123",
    "fileName": "form1.pdf",
    "displayName": "Employee Form",
    "chunksDeleted": 15
  },
  "fieldCleanup": {
    "fieldsRemoved": 2,
    "fieldsStillInUse": 2,
    "removedFieldNames": ["unique_field_1", "unique_field_2"],
    "message": "Removed 2 field(s) from master form",
    "masterFormId": "form-schema-uuid"
  }
}
```

#### Key Features
- ✅ **Automatic**: Cleanup happens automatically on PDF deletion
- ✅ **Safe**: Never removes fields still in use by other PDFs
- ✅ **Complete Deletion**: Deletes entire master form when last PDF is removed
- ✅ **Transparent**: Detailed logging and response data
- ✅ **Preview Available**: Check impact before deleting (warns if master form will be deleted)
- ✅ **Tenant Isolated**: Cleanup only affects specific tenant
- ✅ **Error Resilient**: Cleanup failure doesn't break PDF deletion

#### Use Cases
1. **Testing & Development**: Clean up test PDFs without polluting master form
2. **Form Version Management**: Replace old forms and remove outdated fields
3. **Multi-Tenant SaaS**: Each tenant manages fields independently
4. **Regulatory Compliance**: Remove fields from deprecated forms

#### Documentation
- 📖 `MASTER_FORM_FIELD_CLEANUP.md` - Complete implementation guide
- 📋 `FIELD_CLEANUP_QUICK_REFERENCE.md` - Quick reference and examples

#### Technical Details
- Field comparison using Sets for O(1) lookup
- Case-insensitive field name matching
- Atomic database operations
- Graceful error handling
- Comprehensive logging for debugging
- No schema changes required

#### Security
- ✅ ADMIN and SUPER_ADMIN authorization required
- ✅ Tenant isolation enforced
- ✅ Audit trail maintained
- ✅ No cross-tenant field access

#### Performance
- Fast field comparison (Set-based)
- Minimal database queries
- No impact on PDF upload/form submission
- Efficient cleanup operations

---

## [1.1.0] - 2025-10-15

### Added - PDF Template Filling System with AI Detection 🤖
- 📄 **PDF Template Management**: Upload PDF templates with field position mappings
- 🤖 **AI-Powered Field Detection**: Automatic field position detection using OpenAI GPT-4o (NEW!)
- 🔄 **Automatic PDF Filling**: Auto-fills all PDF templates when forms are submitted
- 📁 **S3 Organization**: User-specific directories for filled PDFs (`tenant-id/users/user-id/filled-pdfs/`)
- 🎯 **Multi-Template Support**: Handle 40+ PDF templates per tenant
- 📝 **Field Type Support**: Text, number, date, checkbox, dropdown fields
- 🔐 **Data Isolation**: Complete tenant and user isolation for filled PDFs
- ⚡ **Zero Configuration**: Just upload PDFs - AI detects fields automatically
- 📋 **Schema Integration**: AI uses existing form schema for accurate field mapping

### New API Endpoints
- `POST /api/embeddings/upload` - Enhanced to accept field mappings (existing endpoint upgraded)
- `GET /api/embeddings/templates` - Get all PDF templates for tenant
- `GET /api/pdfs/templates/:id` - Get template details with field mappings
- `POST /api/pdfs/fill/:templateId` - Fill specific PDF template
- `POST /api/pdfs/fill-all` - Fill all PDF templates for tenant
- `POST /api/forms/:formId/submit` - Enhanced to auto-fill all PDFs (existing endpoint upgraded)

### New Database Models
- `PdfTemplate` model for storing template metadata and field positions
- Migration: `20251015000000_add_pdf_templates`

### New Services & Utilities
- `src/services/pdf.service.js` - PDF filling and template management
- `src/controllers/pdf.controller.js` - PDF API controllers
- `src/routes/pdf.routes.js` - PDF route definitions
- Enhanced `src/utils/s3.util.js` with download and user-specific upload functions

### Documentation
- 📖 `PDF_FILLING_GUIDE.md` - Complete user guide with examples
- 🤖 `AI_FIELD_DETECTION_GUIDE.md` - AI-powered automatic field detection guide (NEW!)
- 📋 `PDF_QUICK_REFERENCE.md` - Quick reference for common operations
- 🛠️ `FIELD_POSITION_HELPER.md` - Tools and methods for manual field positioning
- 📊 `IMPLEMENTATION_SUMMARY.md` - Technical implementation overview

### Dependencies
- ➕ `pdf-lib` - PDF manipulation library for filling forms
- ➕ `canvas` - PDF to image conversion for AI analysis
- ➕ `pdfjs-dist` - PDF rendering utilities
- ➕ `sharp` - Image processing for AI field detection

### Technical Details
- S3 structure: Templates at `{tenantId}/{timestamp}_{filename}.pdf`
- Filled PDFs at: `{tenantId}/users/{userId}/filled-pdfs/{timestamp}_filled_{filename}.pdf`
- AES256 server-side encryption for all S3 objects
- Coordinate system: Top-left origin (converted internally to PDF's bottom-left)
- Sequential processing: ~1-2 seconds per PDF
- AI Detection: OpenAI GPT-4o analyzes PDF content and estimates field positions
- AI Processing time: ~5-10 seconds per PDF
- AI Accuracy: 85-95% field detection rate

### Security
- ✅ Tenant-specific template storage and access
- ✅ User-specific filled PDF directories
- ✅ Role-based access control (RBAC) for all endpoints
- ✅ Encrypted S3 storage with AES256

### Bug Fixes
- 🐛 Fixed checkbox encoding error (`WinAnsi cannot encode "☑"`)
  - Changed from Unicode checkbox characters to drawn rectangles
  - Checkboxes now render as boxes with "X" marks (ASCII-safe)
  - Resolves PDF generation failures for forms with checkbox fields

## [1.0.2] - 2024-10-07

### Added
- 📧 Nodemailer integration for real email sending
- ✨ Beautiful HTML email templates
- 🧪 Ethereal test email support (development mode)
- 📖 Comprehensive email setup guide (`EMAIL_SETUP.md`)
- 🎨 Responsive email designs for all notifications

### Features
- User invitation emails with credentials
- Password reset emails with secure links
- Password change confirmation emails
- Automatic fallback to test mode without SMTP config
- Support for Gmail, Outlook, SendGrid, AWS SES, and custom SMTP

## [1.0.1] - 2024-10-07

### Changed
- 🔄 Updated user roles from 3 to 4 roles
- ✅ New role system: SUPER_ADMIN, ADMIN, STAFF, GUARDIAN
- 📝 Updated all documentation to reflect new roles
- 🔧 Updated validators to accept new roles
- 📖 Updated Swagger documentation

### Migration
- Old roles (USER) replaced with STAFF and GUARDIAN
- Admins can now invite users with STAFF, GUARDIAN, or ADMIN roles
- Super Admins retain full system access

## [1.0.0] - 2024-10-07

### Added
- 🚀 Initial release of AI Onboarding Authentication API
- ✅ JWT authentication with access and refresh tokens
- ✅ Multi-tenant architecture with organization support
- ✅ Role-based access control (SUPER_ADMIN, ADMIN, STAFF, GUARDIAN)
- ✅ Password reset functionality
- ✅ User invitation system
- ✅ Rate limiting on sensitive endpoints
- ✅ Prisma ORM integration with PostgreSQL
- ✅ Comprehensive Swagger/OpenAPI documentation
- ✅ Security headers with Helmet.js
- ✅ CORS configuration
- ✅ Request validation with express-validator
- ✅ Graceful shutdown handling

### API Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/invite-user` - Invite new user (Admin only)
- `GET /api/auth/me` - Get current user profile
- `GET /health` - Health check endpoint
- `GET /api-docs` - Swagger UI documentation
- `GET /api-docs.json` - OpenAPI specification

### Security
- bcrypt password hashing (12 rounds)
- JWT token expiration (15min access, 30 days refresh)
- Token rotation on refresh
- Rate limiting (5 login attempts per 15 minutes)
- Password reset rate limiting (3 per hour)
- Strong password requirements
- Tenant isolation

### Documentation
- README.md - Complete project documentation
- SETUP_GUIDE.md - Step-by-step setup instructions
- API_EXAMPLES.md - API usage examples
- SWAGGER_GUIDE.md - Interactive API documentation guide
- CHANGELOG.md - Version history

### Database Schema
- Users table with multi-tenancy
- Tenants/Organizations table
- Refresh tokens table
- Password reset tokens table

### Development
- Prisma seed script with default admin user
- Environment variable configuration
- Development and production modes
- Nodemon for auto-reload
- Prisma Studio for database management

---

## Future Enhancements (Planned)

### Version 1.1.0
- [ ] Email verification flow
- [ ] Two-factor authentication (2FA)
- [ ] Account lockout after failed attempts
- [ ] Audit logging
- [ ] User profile management endpoints
- [ ] Change password endpoint
- [ ] Delete account endpoint

### Version 1.2.0
- [ ] OAuth integration (Google, GitHub)
- [ ] API key authentication
- [ ] Webhook support
- [ ] Real email service integration
- [ ] SMS notifications
- [ ] File upload for profile pictures

### Version 2.0.0
- [ ] GraphQL API
- [ ] WebSocket support
- [ ] Real-time notifications
- [ ] Advanced analytics
- [ ] Multi-language support
- [ ] Advanced RBAC with custom permissions

---

## Migration Guide

### From Sequelize to Prisma

This project was migrated from Sequelize to Prisma ORM. Key changes:

1. **ORM Change**: Sequelize → Prisma
2. **Schema Definition**: `schema.prisma` instead of model files
3. **Migrations**: Prisma migrations instead of Sequelize migrations
4. **Query API**: Prisma Client instead of Sequelize methods
5. **Type Safety**: Better TypeScript support with Prisma

### Breaking Changes
- None (initial release)

---

## Contributors

- Muhammad Ashar Usman (alirazaarif@yopmail.com)

---

**Note:** This project follows [Semantic Versioning](https://semver.org/).


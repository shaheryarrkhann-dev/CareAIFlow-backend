# Form Drafts - Quick Reference

## 🚀 Quick Start

### Save Draft
```bash
POST /api/forms/:formId/draft
Authorization: Bearer <token>
Body: { "field1": "value", "field2": "value" }
```

### Get User's Drafts
```bash
# For specific form
GET /api/forms/:formId/drafts

# For all forms
GET /api/forms/drafts
```

### Update Draft
```bash
PUT /api/forms/:formId/draft/:draftId
Body: { "updated": "data" }
```

### Delete Draft
```bash
DELETE /api/forms/:formId/draft/:draftId
```

---

## 📋 Files Created/Modified

### New Files
- ✅ `src/services/draft.service.js` - Draft business logic
- ✅ `src/controllers/draft.controller.js` - Draft endpoints
- ✅ `prisma/migrations/20251013200000_add_form_drafts/migration.sql`
- ✅ `FORM_DRAFTS_GUIDE.md` - Full documentation

### Modified Files
- ✅ `prisma/schema.prisma` - Added FormDraft model
- ✅ `src/routes/form.routes.js` - Added draft routes
- ✅ `src/docs/form.docs.js` - Added Swagger docs

---

## 🗄️ Database

**Table:** `form_drafts`

**Columns:**
- `id` - UUID primary key
- `tenantId` - References tenants
- `userId` - References users
- `formId` - References form schemas
- `draftData` - JSONB (partial form data)
- `createdAt`, `updatedAt` - Timestamps

**Indexes:**
- `userId`
- `formId`
- `tenantId + userId`
- `formId + userId`

---

## 🔑 Key Features

1. **Auto-Update**: Saving draft for same form updates existing draft
2. **User Isolation**: Users only see/edit their own drafts
3. **No Validation**: Drafts accept partial/incomplete data
4. **Tenant Aware**: Full multi-tenancy support
5. **One Draft Per User Per Form**: System prevents duplicates

---

## 💡 Usage Example

```javascript
// Frontend: Save draft
const saveDraft = async (formId, data) => {
  const response = await fetch(`/api/forms/${formId}/draft`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
};

// Frontend: Load drafts
const loadDrafts = async (formId) => {
  const response = await fetch(`/api/forms/${formId}/drafts`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { drafts } = await response.json();
  return drafts;
};
```

---

## ⚠️ Important Notes

1. **Restart Server**: After migration, restart your dev server:
   ```bash
   npm run dev
   ```

2. **Prisma Client**: If you get Prisma errors, regenerate client:
   ```bash
   npx prisma generate
   ```

3. **Testing**: Use Swagger UI for interactive testing:
   ```
   http://localhost:4000/api-docs
   ```
   Look for "Form Drafts" tag

---

## 🧪 Quick Test

```bash
# 1. Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@example.com","password":"Staff@12345"}'

# Save token from response

# 2. Get form schemas
curl http://localhost:4000/api/forms/schemas \
  -H "Authorization: Bearer <token>"

# Copy a formId

# 3. Save draft
curl -X POST http://localhost:4000/api/forms/<formId>/draft \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"test_field":"draft value"}'

# 4. Get drafts
curl http://localhost:4000/api/forms/<formId>/drafts \
  -H "Authorization: Bearer <token>"
```

---

## 📚 Full Documentation

See `FORM_DRAFTS_GUIDE.md` for:
- Complete API reference
- Security details
- Frontend integration examples
- Testing strategies
- Best practices

---

**Status:** ✅ Ready to Use  
**Migration:** Applied  
**Endpoints:** 5 draft endpoints available  
**Documentation:** Complete


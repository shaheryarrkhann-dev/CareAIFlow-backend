# Draft User Isolation - Example

## 🎯 Scenario: 3 Users, Same Form

### Setup
- **Tenant:** Acme Corp (ID: `tenant-123`)
- **Form:** Master Form (ID: `form-abc`)
- **Users:** Alice, Bob, Carol (all STAFF role)

---

## 📊 What Happens

### Step 1: Alice Saves Draft
```bash
# Alice logs in
POST /api/auth/login
{ "email": "alice@acme.com", "password": "Alice@123" }
# Token: token-alice

# Alice starts filling form, saves draft
POST /api/forms/form-abc/draft
Authorization: Bearer token-alice
Body: {
  "employee_name": "Alice Anderson",
  "department": "Engineering"
}

# Database Record Created:
{
  id: "draft-001",
  tenantId: "tenant-123",
  userId: "user-alice",
  formId: "form-abc",
  draftData: {
    employee_name: "Alice Anderson",
    department: "Engineering"
  }
}
```

### Step 2: Bob Saves Draft (Same Form!)
```bash
# Bob logs in
POST /api/auth/login
{ "email": "bob@acme.com", "password": "Bob@123" }
# Token: token-bob

# Bob also starts filling the SAME form, saves draft
POST /api/forms/form-abc/draft
Authorization: Bearer token-bob
Body: {
  "employee_name": "Bob Brown",
  "department": "Marketing"
}

# NEW Database Record Created (NOT updating Alice's):
{
  id: "draft-002",
  tenantId: "tenant-123",
  userId: "user-bob",
  formId: "form-abc",
  draftData: {
    employee_name: "Bob Brown",
    department: "Marketing"
  }
}
```

### Step 3: Carol Saves Draft (Same Form!)
```bash
# Carol logs in
POST /api/auth/login
{ "email": "carol@acme.com", "password": "Carol@123" }
# Token: token-carol

# Carol also starts filling the SAME form
POST /api/forms/form-abc/draft
Authorization: Bearer token-carol
Body: {
  "employee_name": "Carol Chen",
  "department": "Sales"
}

# ANOTHER NEW Database Record:
{
  id: "draft-003",
  tenantId: "tenant-123",
  userId: "user-carol",
  formId: "form-abc",
  draftData: {
    employee_name: "Carol Chen",
    department: "Sales"
  }
}
```

---

## 🔍 Database State

**Table: form_drafts**
```
┌──────────┬─────────────┬────────────┬──────────┬─────────────────────────────────────┐
│ id       │ tenantId    │ userId     │ formId   │ draftData                           │
├──────────┼─────────────┼────────────┼──────────┼─────────────────────────────────────┤
│ draft-001│ tenant-123  │ user-alice │ form-abc │ {employee_name: "Alice Anderson"... }│
│ draft-002│ tenant-123  │ user-bob   │ form-abc │ {employee_name: "Bob Brown"...}     │
│ draft-003│ tenant-123  │ user-carol │ form-abc │ {employee_name: "Carol Chen"...}    │
└──────────┴─────────────┴────────────┴──────────┴─────────────────────────────────────┘
```

**Notice:** 
- ✅ All for SAME tenant (`tenant-123`)
- ✅ All for SAME form (`form-abc`)
- ✅ But DIFFERENT `userId` → Separate drafts!

---

## 🔒 User Isolation in Action

### Alice Gets Her Drafts
```bash
GET /api/forms/form-abc/drafts
Authorization: Bearer token-alice

Response:
{
  "success": true,
  "count": 1,
  "drafts": [
    {
      "id": "draft-001",
      "draftData": {
        "employee_name": "Alice Anderson",
        "department": "Engineering"
      }
    }
  ]
}
```
**✅ Only sees her own draft, not Bob's or Carol's**

### Bob Gets His Drafts
```bash
GET /api/forms/form-abc/drafts
Authorization: Bearer token-bob

Response:
{
  "success": true,
  "count": 1,
  "drafts": [
    {
      "id": "draft-002",
      "draftData": {
        "employee_name": "Bob Brown",
        "department": "Marketing"
      }
    }
  ]
}
```
**✅ Only sees his own draft**

### Carol Gets Her Drafts
```bash
GET /api/forms/form-abc/drafts
Authorization: Bearer token-carol

Response:
{
  "success": true,
  "count": 1,
  "drafts": [
    {
      "id": "draft-003",
      "draftData": {
        "employee_name": "Carol Chen",
        "department": "Sales"
      }
    }
  ]
}
```
**✅ Only sees her own draft**

---

## 🚫 Security Check: Bob Tries to Access Alice's Draft

```bash
# Bob knows Alice's draft ID somehow
GET /api/forms/form-abc/draft/draft-001
Authorization: Bearer token-bob

Response:
{
  "success": false,
  "message": "Draft not found or access denied"
}
```

**❌ Access Denied!** The service filters by both `userId` AND `draftId`:
```javascript
const draft = await prisma.formDraft.findFirst({
  where: {
    id: draftId,
    tenantId,
    userId  // Bob's userId, not Alice's
  }
});
// Returns null → Access denied
```

---

## 🔄 Update Scenario: Alice Updates Her Draft

```bash
# Alice updates her draft with more data
POST /api/forms/form-abc/draft
Authorization: Bearer token-alice
Body: {
  "employee_name": "Alice Anderson",
  "department": "Engineering",
  "joining_date": "2025-01-15",
  "email": "alice@acme.com"
}

Response:
{
  "success": true,
  "message": "Draft saved successfully",
  "draft": {
    "id": "draft-001",  // SAME ID - updated, not created new
    "draftData": {
      "employee_name": "Alice Anderson",
      "department": "Engineering",
      "joining_date": "2025-01-15",
      "email": "alice@acme.com"
    }
  }
}
```

**Updated Database:**
```
┌──────────┬─────────────┬────────────┬──────────┬─────────────────────────────────────┐
│ id       │ tenantId    │ userId     │ formId   │ draftData                           │
├──────────┼─────────────┼────────────┼──────────┼─────────────────────────────────────┤
│ draft-001│ tenant-123  │ user-alice │ form-abc │ {...4 fields now...}                │ ← UPDATED
│ draft-002│ tenant-123  │ user-bob   │ form-abc │ {employee_name: "Bob Brown"...}     │ ← UNCHANGED
│ draft-003│ tenant-123  │ user-carol │ form-abc │ {employee_name: "Carol Chen"...}    │ ← UNCHANGED
└──────────┴─────────────┴────────────┴──────────┴─────────────────────────────────────┘
```

**✅ Bob's and Carol's drafts remain untouched!**

---

## 📝 Key Takeaways

### ✅ Per-User Drafts
- Each user has **their own separate draft** for each form
- Saving a draft only affects the current user's draft
- One user's draft **never interferes** with another user's draft

### ✅ Automatic Behavior
```javascript
// System automatically uses userId from JWT token
const draft = await saveDraft({
  tenantId: req.user.tenantId,    // From JWT
  userId: req.user.id,             // From JWT (UNIQUE per user)
  formId: req.params.formId,
  draftData: req.body
});
```

### ✅ Database Constraint
The combination of `tenantId + userId + formId` ensures:
- Each user can have **ONE draft per form**
- Users in same tenant can have **separate drafts** for same form
- Complete isolation between users

---

## 🎯 Real-World Use Case

**Scenario:** Employee Self-Service Portal

100 employees all need to fill out the same "Employee Information Update" form.

**Result:**
- All 100 employees see the same form schema (Master Form)
- Each employee can save their own draft
- Total: **100 separate drafts** in database (one per employee)
- Each employee only sees/edits their own draft
- No conflicts, no overwrites

**Database:**
```
100 rows in form_drafts table:
- Same tenantId
- Same formId  
- 100 different userIds ✅
```

---

## 🔧 Technical Implementation

### Service Layer (draft.service.js)
```javascript
// Line 10-16: Check for user's existing draft
const existingDraft = await prisma.formDraft.findFirst({
  where: {
    tenantId,
    userId,    // ← USER SPECIFIC
    formId
  }
});
```

### Controller Layer (draft.controller.js)
```javascript
// Line 23: userId extracted from JWT token
const draft = await saveDraft({
  tenantId,
  userId: req.user.id,  // ← From authenticated user
  formId,
  draftData
});
```

### Database Indexes (for fast queries)
```sql
-- Find user's draft for a form (fast)
CREATE INDEX ON form_drafts(userId, formId);

-- Find all user's drafts (fast)
CREATE INDEX ON form_drafts(userId);

-- Tenant isolation (fast)
CREATE INDEX ON form_drafts(tenantId, userId);
```

---

## ✅ Summary

**Question:** Are drafts saved per user?  
**Answer:** **YES!** ✅

**How:** The `userId` field in the database ensures each user has their own separate draft for each form.

**Benefits:**
- ✅ Complete user isolation
- ✅ No draft conflicts
- ✅ Multiple users can work on same form simultaneously
- ✅ Secure (users can't access others' drafts)
- ✅ Scalable (supports unlimited users per form)

---

**Status:** ✅ Already Implemented Correctly  
**No Changes Needed:** The current implementation is perfect!


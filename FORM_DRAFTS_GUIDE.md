# Form Drafts Feature - Complete Guide

## 🎯 Overview

The Form Drafts feature allows users to save partial/incomplete form submissions and return to complete them later. This is essential for long forms where users might not have all information immediately available.

---

## ✨ Key Features

- ✅ **Save Partial Data** - No validation required for drafts
- ✅ **Auto-Update** - Saving a draft for same form updates existing draft
- ✅ **User Isolation** - Users can only see/edit their own drafts
- ✅ **Multi-Form Support** - One draft per user per form
- ✅ **Full CRUD** - Create, Read, Update, Delete operations
- ✅ **Auto-Cleanup** - Drafts deleted after successful form submission (optional)

---

## 📊 Database Schema

### Table: `form_drafts`

```sql
CREATE TABLE "form_drafts" (
    "id" TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "draftData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    FOREIGN KEY ("formId") REFERENCES "tenant_form_schemas"("id") ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX "form_drafts_userId_idx" ON "form_drafts"("userId");
CREATE INDEX "form_drafts_formId_idx" ON "form_drafts"("formId");
CREATE INDEX "form_drafts_tenantId_userId_idx" ON "form_drafts"("tenantId", "userId");
CREATE INDEX "form_drafts_formId_userId_idx" ON "form_drafts"("formId", "userId");
```

---

## 🚀 API Endpoints

### 1. Save Draft

**Endpoint:** `POST /api/forms/:formId/draft`

**Description:** Save partial form data as draft. If draft already exists for this user+form, it updates existing draft.

**Authorization:** Bearer token (all authenticated users)

**Request:**
```bash
curl -X POST http://localhost:4000/api/forms/{formId}/draft \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe",
    "department": "IT"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Draft saved successfully",
  "draft": {
    "id": "draft-uuid",
    "formId": "form-uuid",
    "draftData": {
      "employee_name": "John Doe",
      "department": "IT"
    },
    "createdAt": "2025-10-13T...",
    "updatedAt": "2025-10-13T..."
  }
}
```

**Features:**
- ✅ No field validation (partial data allowed)
- ✅ Auto-updates if draft exists
- ✅ Creates new if no draft exists

---

### 2. Get User's Drafts for Specific Form

**Endpoint:** `GET /api/forms/:formId/drafts`

**Description:** Retrieve all drafts for current user for a specific form

**Authorization:** Bearer token

**Request:**
```bash
curl -X GET http://localhost:4000/api/forms/{formId}/drafts \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "drafts": [
    {
      "id": "draft-uuid",
      "formId": "form-uuid",
      "formName": "Master Form",
      "formDescription": "Consolidated form...",
      "draftData": {
        "employee_name": "John Doe",
        "department": "IT"
      },
      "createdAt": "2025-10-13T...",
      "updatedAt": "2025-10-13T..."
    }
  ]
}
```

---

### 3. Get All User's Drafts (All Forms)

**Endpoint:** `GET /api/forms/drafts`

**Description:** Retrieve all drafts for current user across all forms

**Authorization:** Bearer token

**Request:**
```bash
curl -X GET http://localhost:4000/api/forms/drafts \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "drafts": [
    {
      "id": "draft-1",
      "formId": "form-1",
      "formName": "Master Form",
      "draftData": {...},
      "updatedAt": "2025-10-13T..."
    },
    {
      "id": "draft-2",
      "formId": "form-2",
      "formName": "Employee Review",
      "draftData": {...},
      "updatedAt": "2025-10-12T..."
    }
  ]
}
```

---

### 4. Get Specific Draft

**Endpoint:** `GET /api/forms/:formId/draft/:draftId`

**Description:** Retrieve a specific draft with full form schema

**Authorization:** Bearer token

**Request:**
```bash
curl -X GET http://localhost:4000/api/forms/{formId}/draft/{draftId} \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "draft": {
    "id": "draft-uuid",
    "formId": "form-uuid",
    "formName": "Master Form",
    "formSchema": {
      "form_name": "Master Form",
      "fields": [...]
    },
    "draftData": {
      "employee_name": "John Doe",
      "department": "IT"
    },
    "createdAt": "2025-10-13T...",
    "updatedAt": "2025-10-13T..."
  }
}
```

**Use Case:** Frontend can use this to pre-populate form fields with draft data

---

### 5. Update Draft

**Endpoint:** `PUT /api/forms/:formId/draft/:draftId`

**Description:** Update existing draft with new data

**Authorization:** Bearer token

**Request:**
```bash
curl -X PUT http://localhost:4000/api/forms/{formId}/draft/{draftId} \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_name": "John Doe Updated",
    "department": "Engineering",
    "joining_date": "2025-02-01"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Draft updated successfully",
  "draft": {
    "id": "draft-uuid",
    "formId": "form-uuid",
    "draftData": {
      "employee_name": "John Doe Updated",
      "department": "Engineering",
      "joining_date": "2025-02-01"
    },
    "updatedAt": "2025-10-13T..."
  }
}
```

---

### 6. Delete Draft

**Endpoint:** `DELETE /api/forms/:formId/draft/:draftId`

**Description:** Delete a saved draft

**Authorization:** Bearer token

**Request:**
```bash
curl -X DELETE http://localhost:4000/api/forms/{formId}/draft/{draftId} \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "message": "Draft deleted successfully"
}
```

---

## 🔄 Typical Workflow

### Scenario: User Fills Form Over Multiple Sessions

#### Session 1: Start Form
```bash
# User opens form, fills some fields, clicks "Save Draft"
POST /api/forms/abc-123/draft
{
  "employee_name": "Jane Smith",
  "department": "HR"
}

# Response
{
  "success": true,
  "draft": { "id": "draft-xyz", ... }
}
```

#### Session 2: Continue Later
```bash
# User returns, system loads drafts
GET /api/forms/abc-123/drafts

# Response shows saved draft
{
  "drafts": [
    {
      "id": "draft-xyz",
      "draftData": {
        "employee_name": "Jane Smith",
        "department": "HR"
      }
    }
  ]
}

# User adds more fields, saves again
POST /api/forms/abc-123/draft
{
  "employee_name": "Jane Smith",
  "department": "HR",
  "joining_date": "2025-02-01"
}

# Updates existing draft (same draft ID)
```

#### Session 3: Complete Form
```bash
# User completes all required fields, clicks "Submit"
POST /api/forms/abc-123/submit
{
  "employee_name": "Jane Smith",
  "department": "HR",
  "joining_date": "2025-02-01",
  "email": "jane@company.com"
}

# After successful submission, draft can be auto-deleted
```

---

## 🔒 Security & Access Control

### User Isolation
- ✅ Users can **ONLY** access their own drafts
- ✅ `userId` is automatically set from JWT token
- ✅ All queries filter by `tenantId` + `userId`

### Tenant Isolation
- ✅ All drafts include `tenantId` for multi-tenancy
- ✅ Cascading deletes when tenant/user removed
- ✅ No cross-tenant access possible

### Permission Matrix

| Role | Save Draft | View Own Drafts | View Others' Drafts | Update Own | Delete Own |
|------|-----------|----------------|---------------------|------------|------------|
| STAFF | ✅ | ✅ | ❌ | ✅ | ✅ |
| GUARDIAN | ✅ | ✅ | ❌ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ❌ | ✅ | ✅ |
| SUPER_ADMIN | ✅ | ✅ | ❌ | ✅ | ✅ |

**Note:** All roles have same draft permissions - users can only manage their own drafts.

---

## 💻 Frontend Integration Example

### React Component Example

```javascript
import { useState, useEffect } from 'react';
import axios from 'axios';

function FormWithDraft({ formId, token }) {
  const [formData, setFormData] = useState({});
  const [draftId, setDraftId] = useState(null);

  // Load existing draft on mount
  useEffect(() => {
    loadDraft();
  }, [formId]);

  const loadDraft = async () => {
    try {
      const res = await axios.get(
        `http://localhost:4000/api/forms/${formId}/drafts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.data.drafts.length > 0) {
        const draft = res.data.drafts[0];
        setFormData(draft.draftData);
        setDraftId(draft.id);
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  };

  const saveDraft = async () => {
    try {
      const res = await axios.post(
        `http://localhost:4000/api/forms/${formId}/draft`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setDraftId(res.data.draft.id);
      alert('Draft saved!');
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  const submitForm = async () => {
    try {
      await axios.post(
        `http://localhost:4000/api/forms/${formId}/submit`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert('Form submitted successfully!');
      // Optionally delete draft after submission
      if (draftId) {
        await axios.delete(
          `http://localhost:4000/api/forms/${formId}/draft/${draftId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
    } catch (error) {
      console.error('Failed to submit form:', error);
    }
  };

  return (
    <div>
      <input
        value={formData.employee_name || ''}
        onChange={(e) => setFormData({...formData, employee_name: e.target.value})}
        placeholder="Employee Name"
      />
      <input
        value={formData.department || ''}
        onChange={(e) => setFormData({...formData, department: e.target.value})}
        placeholder="Department"
      />
      
      <button onClick={saveDraft}>Save Draft</button>
      <button onClick={submitForm}>Submit Form</button>
    </div>
  );
}
```

---

## 🧪 Testing Guide

### Test Case 1: Save First Draft
```bash
# Login
POST /api/auth/login
{ "email": "staff@example.com", "password": "Staff@12345" }
# Get token

# Get form ID
GET /api/forms/schemas
# Copy formId

# Save draft
POST /api/forms/{formId}/draft
{ "field1": "value1" }

# Verify
✅ Response has draft.id
✅ createdAt and updatedAt are set
```

### Test Case 2: Update Existing Draft
```bash
# Save again with more data
POST /api/forms/{formId}/draft
{ "field1": "value1", "field2": "value2" }

# Verify
✅ Same draft ID returned
✅ updatedAt timestamp changed
✅ draftData contains both fields
```

### Test Case 3: List User Drafts
```bash
GET /api/forms/{formId}/drafts

# Verify
✅ Returns only current user's drafts
✅ Includes form name and description
✅ Sorted by updatedAt desc
```

### Test Case 4: Delete Draft
```bash
DELETE /api/forms/{formId}/draft/{draftId}

# Verify
✅ Returns success message
✅ Draft no longer in list
✅ Cannot retrieve deleted draft
```

### Test Case 5: User Isolation
```bash
# User A saves draft
POST /api/forms/{formId}/draft (as User A)

# User B tries to access User A's draft
GET /api/forms/{formId}/draft/{userA_draftId} (as User B)

# Verify
✅ Returns 404 or access denied
✅ User B cannot see User A's drafts
```

---

## 📝 Best Practices

### 1. Auto-Save Drafts
```javascript
// Debounced auto-save every 30 seconds
useEffect(() => {
  const timer = setTimeout(() => {
    saveDraft();
  }, 30000);
  
  return () => clearTimeout(timer);
}, [formData]);
```

### 2. Show Draft Indicator
```javascript
{draftId && (
  <div className="draft-indicator">
    Draft saved at {new Date(updatedAt).toLocaleTimeString()}
  </div>
)}
```

### 3. Confirm Before Leaving
```javascript
useEffect(() => {
  const handleBeforeUnload = (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = 'You have unsaved draft. Save before leaving?';
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnsavedChanges]);
```

### 4. Draft List Page
```javascript
// Show all user's drafts across forms
function DraftList() {
  const [drafts, setDrafts] = useState([]);
  
  useEffect(() => {
    axios.get('http://localhost:4000/api/forms/drafts', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setDrafts(res.data.drafts));
  }, []);
  
  return (
    <div>
      <h2>Your Saved Drafts</h2>
      {drafts.map(draft => (
        <div key={draft.id}>
          <h3>{draft.formName}</h3>
          <p>Last updated: {new Date(draft.updatedAt).toLocaleString()}</p>
          <button onClick={() => resumeDraft(draft.formId, draft.id)}>
            Continue
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔧 Configuration

### Optional: Auto-Delete Draft After Submission

In `form.controller.js`, modify `submitForm`:

```javascript
const { deleteDraftAfterSubmission } = require('../services/draft.service');

// After successful form submission
const result = await saveFormSubmission({ ... });

// Auto-cleanup draft
await deleteDraftAfterSubmission({
  tenantId,
  userId: req.user.id,
  formId
});

return res.status(201).json({ ... });
```

---

## 🎯 Use Cases

### 1. Long Forms
- Employee onboarding (20+ fields)
- Medical history forms
- Detailed applications

### 2. Multi-Step Processes
- Step 1: Personal info → Save draft
- Step 2: Employment details → Update draft
- Step 3: Review & submit → Delete draft

### 3. Information Gathering
- User doesn't have all info now
- Can save and return when documents available
- Prevents data loss

### 4. Mobile Users
- Limited time on mobile
- Save progress quickly
- Complete on desktop later

---

## 📊 Database Considerations

### Performance
- ✅ Indexed on `userId` for fast retrieval
- ✅ Indexed on `formId` for form-specific queries
- ✅ Composite index on `formId + userId` for draft lookups

### Storage
- Each draft stores full JSON data
- Estimate: ~1-5KB per draft average
- 10,000 drafts ≈ 10-50MB storage

### Cleanup Strategy
```sql
-- Delete drafts older than 90 days (optional cron job)
DELETE FROM form_drafts 
WHERE "updatedAt" < NOW() - INTERVAL '90 days';
```

---

## 🚀 Migration Applied

The migration `20251013200000_add_form_drafts` has been applied to your database.

To verify:
```bash
npx prisma studio
# Check "form_drafts" table exists
```

---

## 📖 Swagger Documentation

Access interactive API docs at:
```
http://localhost:4000/api-docs
```

Look for the **"Form Drafts"** tag in the Swagger UI for:
- Live API testing
- Request/response examples
- Schema definitions

---

## 🎉 Summary

✅ **Database:** `form_drafts` table created with indexes  
✅ **Service:** Full CRUD operations in `draft.service.js`  
✅ **Controller:** 5 endpoints in `draft.controller.js`  
✅ **Routes:** Integrated into `/api/forms/*` routes  
✅ **Docs:** Complete Swagger documentation  
✅ **Security:** User isolation and tenant isolation enforced  

**Ready to use!** Users can now save drafts and return to complete forms later. 🚀

---

**Last Updated:** October 13, 2025  
**Status:** ✅ Fully Implemented


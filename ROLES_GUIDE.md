# 🎭 User Roles Guide

Complete guide to understanding and managing user roles in the AI Onboarding system.

## 📋 Role Overview

The system supports 4 distinct user roles, each with specific permissions and access levels:

| Role | Level | Description | Use Case |
|------|-------|-------------|----------|
| **SUPER_ADMIN** | System | Full system access | Platform administrators |
| **ADMIN** | Organization | Manage organization | Organization managers |
| **STAFF** | Standard | Staff member access | Employees, team members |
| **GUARDIAN** | Standard | Guardian/Parent access | Parents, guardians |

---

## 🔐 Role Details

### 1. SUPER_ADMIN

**Access Level:** System-wide

**Capabilities:**
- ✅ Access all tenants/organizations
- ✅ Invite users to any organization
- ✅ Manage all users across the system
- ✅ Full CRUD operations on all resources
- ✅ System configuration access

**Limitations:**
- ⚠️ Cannot be created via invitation
- ⚠️ Must be created directly in database or via seed

**Example Use Cases:**
- Platform administrators
- System support staff
- DevOps personnel

**Default Credentials:**
```
Email: alirazaarif@yopmail.com
Password: Admin@12345
```

---

### 2. ADMIN

**Access Level:** Organization-specific

**Capabilities:**
- ✅ Manage users within own organization
- ✅ Invite users with roles: STAFF, GUARDIAN, ADMIN
- ✅ View all users in organization
- ✅ Update organization settings
- ✅ Access organization-wide reports

**Limitations:**
- ❌ Cannot access other organizations
- ❌ Cannot modify super admin users
- ❌ Can only invite to own organization

**Example Use Cases:**
- School administrators
- Organization managers
- Department heads

**How to Create:**
1. Super Admin invites user with ADMIN role
2. Or existing Admin invites new Admin (to same org)

---

### 3. STAFF

**Access Level:** Organization-specific

**Capabilities:**
- ✅ Access own organization resources
- ✅ View permitted data within organization
- ✅ Update own profile
- ✅ Perform staff-specific tasks
- ✅ Standard user operations

**Limitations:**
- ❌ Cannot invite other users
- ❌ Cannot access other organizations
- ❌ Limited administrative functions

**Example Use Cases:**
- Teachers
- Support staff
- Team members
- Employees

**Default Test Credentials:**
```
Email: staff@example.com
Password: Staff@12345
```

---

### 4. GUARDIAN

**Access Level:** Organization-specific

**Capabilities:**
- ✅ Access own organization resources
- ✅ View guardian-specific information
- ✅ Update own profile
- ✅ Access guardian dashboards
- ✅ Communicate with organization

**Limitations:**
- ❌ Cannot invite other users
- ❌ Cannot access other organizations
- ❌ Limited to guardian-specific features

**Example Use Cases:**
- Parents
- Legal guardians
- Caretakers
- Family members

**Default Test Credentials:**
```
Email: guardian@example.com
Password: Guardian@12345
```

---

## 🔄 Role Hierarchy

```
SUPER_ADMIN
    ├─ Can manage: ALL
    └─ Access: System-wide
        ↓
    ADMIN
        ├─ Can manage: STAFF, GUARDIAN, ADMIN (same org)
        └─ Access: Organization-wide
            ↓
        STAFF / GUARDIAN
            ├─ Can manage: Self
            └─ Access: Organization-specific
```

---

## 🎯 Role Permissions Matrix

| Action | SUPER_ADMIN | ADMIN | STAFF | GUARDIAN |
|--------|-------------|-------|-------|----------|
| **Login** | ✅ | ✅ | ✅ | ✅ |
| **View own profile** | ✅ | ✅ | ✅ | ✅ |
| **Update own profile** | ✅ | ✅ | ✅ | ✅ |
| **Reset own password** | ✅ | ✅ | ✅ | ✅ |
| **Invite users (own org)** | ✅ | ✅ | ❌ | ❌ |
| **Invite users (any org)** | ✅ | ❌ | ❌ | ❌ |
| **View org users** | ✅ | ✅ | ❌ | ❌ |
| **Manage org users** | ✅ | ✅ | ❌ | ❌ |
| **Access all orgs** | ✅ | ❌ | ❌ | ❌ |
| **System configuration** | ✅ | ❌ | ❌ | ❌ |

---

## 🔧 Managing Roles

### Inviting Users with Specific Roles

#### As SUPER_ADMIN:
```bash
POST /api/auth/invite-user
Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN

{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "STAFF",  // or "GUARDIAN", "ADMIN"
  "tenantId": "any-organization-uuid"
}
```

#### As ADMIN:
```bash
POST /api/auth/invite-user
Authorization: Bearer YOUR_ADMIN_TOKEN

{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "STAFF",  // or "GUARDIAN", "ADMIN"
  "tenantId": "your-organization-uuid"
}
```

**Valid roles for invitation:**
- ✅ `STAFF` - Default for most users
- ✅ `GUARDIAN` - For parent/guardian users
- ✅ `ADMIN` - For organization administrators

**Invalid roles:**
- ❌ `SUPER_ADMIN` - Cannot be created via API

---

## 🧪 Testing Different Roles

### Using Swagger UI:

1. **Login as Super Admin:**
   ```
   Email: alirazaarif@yopmail.com
   Password: Admin@12345
   ```
   - Test system-wide access
   - Try inviting users to any organization

2. **Login as Staff:**
   ```
   Email: staff@example.com
   Password: Staff@12345
   ```
   - Test standard user access
   - Verify limited permissions

3. **Login as Guardian:**
   ```
   Email: guardian@example.com
   Password: Guardian@12345
   ```
   - Test guardian-specific access
   - Verify guardian permissions

---

## 🚨 Security Considerations

### Role Assignment Best Practices:

1. **Principle of Least Privilege**
   - Assign the minimum role required
   - Regular review of role assignments
   - Audit role changes

2. **SUPER_ADMIN Protection**
   - Limit number of super admins
   - Use strong authentication
   - Enable 2FA (when implemented)
   - Monitor super admin activities

3. **ADMIN Responsibilities**
   - Regular security training
   - Careful user invitation
   - Monitor organization activity
   - Report suspicious behavior

4. **STAFF & GUARDIAN**
   - Standard security practices
   - Regular password updates
   - Secure credential storage

---

## 📊 Role-Based Data Access

### SUPER_ADMIN:
```javascript
// Can query across all tenants
const allUsers = await prisma.user.findMany();
const allOrganizations = await prisma.tenant.findMany();
```

### ADMIN:
```javascript
// Limited to own organization
const orgUsers = await prisma.user.findMany({
  where: { tenantId: currentUser.tenantId }
});
```

### STAFF & GUARDIAN:
```javascript
// Limited to own data
const myProfile = await prisma.user.findUnique({
  where: { id: currentUser.id }
});
```

---

## 🔄 Role Migration

If you need to change a user's role:

### Via Database:
```sql
-- Change user role
UPDATE "users" 
SET role = 'ADMIN' 
WHERE email = 'user@example.com';
```

### Via Prisma:
```javascript
await prisma.user.update({
  where: { email: 'user@example.com' },
  data: { role: 'ADMIN' }
});
```

---

## ❓ FAQ

### Q: Can STAFF users be promoted to ADMIN?
**A:** Yes, but requires database update or future role management endpoint.

### Q: Can users have multiple roles?
**A:** No, each user has exactly one role.

### Q: Can ADMIN demote another ADMIN?
**A:** Not currently implemented. Only SUPER_ADMIN should modify ADMIN roles.

### Q: What's the difference between STAFF and GUARDIAN?
**A:** Both have similar access levels but are intended for different user types:
- **STAFF**: Employees, team members
- **GUARDIAN**: Parents, legal guardians

The distinction allows for role-specific features in the future.

### Q: How do I create a SUPER_ADMIN?
**A:** SUPER_ADMIN users should only be created via:
1. Database seed script
2. Direct database insertion
3. Secure admin console (not via API)

---

## 🚀 Future Enhancements

Planned role-related features:

- [ ] Custom permissions per role
- [ ] Role templates
- [ ] Permission inheritance
- [ ] Role-based UI customization
- [ ] Audit logs for role changes
- [ ] Time-limited role assignments
- [ ] Role approval workflows

---

## 📞 Need Help?

If you have questions about roles or permissions:
- Check the API documentation at `/api-docs`
- Review the main README.md
- Contact: alirazaarif@yopmail.com

---

**Last Updated:** October 7, 2024  
**Version:** 1.0.1


# Implementation Plan: One Facility = One Independent Account (George's Request)

## Goal

When a user **creates a new facility**, they get a **completely independent account** (separate residents, data, billing). The **only shared element is login** — the same user can switch between facilities (accounts) with one email/password.

---

## Current State (Brief)

- **User** has a single `tenantId` (one organization). There was a many-to-many `UserTenant` in the past; it was **reverted** (see `REVERT_MANY_TO_MANY_SUMMARY.md`).
- **Create facility** = `POST /api/facility/facilities` → creates a new **Facility** under the **same tenant**. All facilities share the same residents and tenant data.
- **Auth**: JWT carries `tenantId`; `req.user.tenantId` is used everywhere. Login accepts optional `tenantId` only for SUPER_ADMIN.

---

## Target Model

- **One facility = one tenant.** Each “account” is a tenant with exactly one facility (for the new flow).
- **One user can belong to multiple tenants** (re-introduce a form of User–Tenant many-to-many).
- **“Create new facility”** = create a **new Tenant** + **one Facility** under it, and **link the current user** to that tenant so they can switch to it.
- **Switching facility** = switching **tenant context** (new tokens with selected `tenantId`); all existing APIs keep using `req.user.tenantId`.

---

## Implementation Steps

### Phase 1: Data model and migration

1. **Re-introduce User–Tenant association (many-to-many)**

   - Add a join table, e.g. **`UserTenant`**:
     - `id`, `userId`, `tenantId`, `role` (optional, per-tenant role), `isPrimary` (optional), timestamps.
     - Unique on `(userId, tenantId)`.
   - **Keep `User.tenantId`** for backward compatibility: treat it as “default tenant” (e.g. first or primary). Auth can still use it when token has no tenant or for migration.

2. **Migration**

   - For every **User** that has `tenantId` set, insert a row into **UserTenant** (`userId`, `tenantId`, `role` = user’s current role, `isPrimary` = true if you want).
   - Do **not** remove `User.tenantId` yet; keep it so existing tokens and logic still work.

3. **Tenant + Facility creation**

   - When creating an “independent” facility (see Phase 2), you will:
     - Create **Tenant** (e.g. name = facility name or “Facility: {name}”).
     - Create **Facility** with `tenantId` = new tenant.
     - Create **UserTenant** for the current user and new tenant (e.g. role = ADMIN).

---

### Phase 2: Backend – “Create new facility” = new tenant + facility

1. **New endpoint (recommended)**  
   - e.g. **`POST /api/facility/facilities/independent`**  
   - Body: same as current create facility (name, licenseNumber, address, capacity, licenseExpirationDate).

2. **Handler logic**

   - Resolve `userId` and (optional) current `tenantId` from `req.user`.
   - Create **Tenant**: e.g. `name = body.name`, `slug` = unique slug (e.g. from name + short id).
   - Create **Facility** with `tenantId` = new tenant id, same body fields.
   - Create **UserTenant** for `req.user.id` and new `tenantId` (e.g. role = ADMIN or same as user’s current role).
   - Optionally: create a **RefreshToken** (or leave for next login) with `tenantId` = new tenant if you want “switch” to work without calling switch endpoint.
   - Return: `{ success, tenant, facility, message }` and optionally a new **accessToken** (and refreshToken) scoped to the new tenant so the user is “in” the new account immediately.

3. **Existing `POST /api/facility/facilities`**

   - Keep as-is for backward compatibility (create facility under **current** tenant), or deprecate later. Frontend can use the new endpoint for “Create new independent facility” and old one only when you want to add a facility under the same tenant (if you still support that).

---

### Phase 3: Backend – Switch tenant (so “switch facility” works)

1. **New endpoint**  
   - **`POST /api/auth/switch-tenant`**  
   - Body: `{ tenantId: string }`.

2. **Handler logic**

   - Ensure user is authenticated.
   - Check that the user has access to `tenantId` (e.g. exists in **UserTenant** for this user, or is SUPER_ADMIN).
   - Optionally verify tenant is active.
   - Issue new **accessToken** (and optionally **refreshToken**) with `tenantId` in payload (same as current login).
   - Return: `{ success, accessToken, refreshToken?, user?, message }` so frontend can store tokens and use new `tenantId` for all subsequent API calls.

3. **Auth middleware**

   - No change: already uses `payload.tenantId ?? user.tenantId`. After switch, new token will have `tenantId` set, so `req.user.tenantId` will be the selected tenant.

---

### Phase 4: Backend – Login and “my tenants”

1. **Login response (extend)**

   - When user has at least one **UserTenant** (or has `tenantId`), include in response:
     - **`tenants`**: array of `{ tenantId, tenantName, facilityId?, facilityName? }` (or minimal list of tenants the user can access).
   - If user has **multiple** tenants, frontend can show a tenant/facility picker after login and then call **switch-tenant** with chosen `tenantId` (or you can accept optional `tenantId` in login body and issue token for that tenant if the user has access).

2. **Optional: “My tenants” endpoint**  
   - **`GET /api/auth/me/tenants`** (or under `/api/tenants` with filter “mine”): returns list of tenants (and their single facility) the current user can access. Used by the facility/tenant switcher in the UI.

---

### Phase 5: Frontend – Create new facility flow

1. **Facilities page**

   - Change “Create facility” to use the **new** endpoint (e.g. `POST /api/facility/facilities/independent`).
   - On success:
     - If backend returns new tokens, store them (e.g. update auth context) and **switch context** to the new tenant/facility (refresh facilities list; selected facility = new one).
     - If backend does not return tokens, call **`POST /api/auth/switch-tenant`** with the new `tenantId`, then store tokens and refresh (e.g. refresh facilities list and set selected facility to the new one).
   - Show success message: e.g. “New facility (independent account) created. You are now in that facility.”

2. **Facility list / FacilityContext**

   - **List facilities**: backend should return **all facilities** the user can access (all tenants they belong to, each with one facility in the new model). So either:
     - **Option A**: Keep `GET /api/facility/facilities` and have it return facilities for **all** of the user’s tenants (backend resolves user’s tenants from UserTenant and returns union of facilities), or  
     - **Option B**: New endpoint `GET /api/facility/facilities/all-mine` that does the same.
   - When user **selects a facility** from the dropdown/context:
     - Call **`POST /api/auth/switch-tenant`** with that facility’s `tenantId`.
     - Store new tokens and refresh app state (so all data is for the selected tenant). FacilityContext can keep `selectedFacilityId`; switching facility = switch tenant + set selected facility to that one.

---

### Phase 6: Frontend – Tenant/facility switcher

1. **Where to show**

   - Header or sidebar: “Current facility: {name}” with a dropdown listing all facilities (from `/auth/me/tenants` or from facility list). On select → call switch-tenant, update tokens, refresh (or redirect to home/dashboard).

2. **After login (if multiple tenants)**

   - If login response includes `tenants` and length > 1, show a **tenant/facility picker** (or use default and show switcher in header). If length === 1, auto-select that tenant (current behavior).

---

## Summary of New/Changed Pieces

| Layer        | Item |
|-------------|------|
| **Schema**  | Add `UserTenant` (userId, tenantId, role?, isPrimary?, etc.); migration from `User.tenantId` to populate UserTenant. |
| **Backend** | `POST /api/facility/facilities/independent` → create Tenant + Facility + UserTenant; return tenant + facility (and optionally new tokens). |
| **Backend** | `POST /api/auth/switch-tenant` → validate user has access to tenantId, issue new JWT with that tenantId. |
| **Backend** | Login (and optionally `GET /api/auth/me/tenants`) returns list of tenants/facilities the user can access. |
| **Backend** | Facility list: return facilities for **all** user’s tenants (or keep current behavior and add a separate “all my facilities” endpoint). |
| **Frontend** | Create facility uses new endpoint; on success, switch tenant (and optionally refresh tokens) and refresh facility list. |
| **Frontend** | Facility/tenant switcher in header/sidebar: on select facility → switch-tenant, store tokens, refresh. |
| **Frontend** | Optional: after login, if multiple tenants, show picker or default to first and show switcher. |

---

## Running the migration

If `prisma migrate dev` fails (e.g. shadow database issue), apply the migration manually:

```bash
cd ai-onboarding-platform
npx prisma migrate deploy
# or apply the SQL in prisma/migrations/20260315000000_add_user_tenants_for_independent_facility/migration.sql
```

Then run `npx prisma generate` so the client includes `UserTenant`.

## Order of Work

1. **Phase 1** – Schema + migration (UserTenant, migrate existing User.tenantId).
2. **Phase 2** – Backend: create-independent-facility endpoint.
3. **Phase 3** – Backend: switch-tenant endpoint.
4. **Phase 4** – Backend: login/me tenants and facility list for all user’s tenants.
5. **Phase 5** – Frontend: create facility flow + use new endpoint and switch-tenant.
6. **Phase 6** – Frontend: tenant/facility switcher UI.

---

## Notes

- **SUPER_ADMIN**: Can keep current behavior (no tenantId or access to all tenants). Switch-tenant for them can set any tenantId they want.
- **Existing users**: After migration, each has one row in UserTenant; behavior stays “one tenant” until they create a new facility (which adds a second tenant and UserTenant).
- **Backward compatibility**: Keeping `User.tenantId` and using it when token has no tenant (or as “default”) avoids breaking existing sessions during rollout.

This is how to implement George’s request: one facility = one independent account, with only login shared and the ability to switch between facilities (tenants) via the same login.

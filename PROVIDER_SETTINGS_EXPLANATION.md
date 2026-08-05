# Provider Settings - Explanation

## What Are Provider Settings?

**Provider Settings** are **NOT related to staff**. They are related to the **ORGANIZATION/TENANT** itself - the healthcare provider organization that is billing for services.

---

## Who/What It Represents

### Provider = The Healthcare Organization

The "Provider" in Provider Settings refers to the **healthcare organization/company** that is:

- Providing care services to residents
- Submitting billing claims to MCO (Managed Care Organizations)
- Registered with the Health Care Authority

**Examples:**

- "ABC Care Home" (Adult Family Home)
- "XYZ Assisted Living Facility"
- "Sunset Elder Care Services"

---

## What Information Is Stored?

Provider Settings contain the **organization's business/legal information** that must appear on every billing claim:

1. **Provider Name** - Legal business name (as on W-9)
2. **Provider ID** - ProviderOne ID (optional, for FFS submissions)
3. **TIN/SSN/EIN** - Tax Identification Number (as on W-9)
4. **Billing Provider NPI/API** - National Provider Identifier (assigned by Health Care Authority)
5. **Billing Provider Taxonomy** - Provider type code:
   - AFH (Adult Family Home): `311ZA0620X`
   - ALF/ARC/EARC: `310400000X`
   - ESF: `3104A0625X`
6. **Billing Provider Address** - Street, City, State, Zip (as on W-9)

---

## Why Is This Needed?

### Legal/Regulatory Requirement

According to the billing data dictionary:

- Provider information **must match** what was listed on the W-9 form
- Provider information **must match** what was sent to each MCO
- This information is **required on every billing claim**

### Efficiency

Instead of entering the same provider information on every billing record (hundreds of times), you:

1. **Enter it once** in Provider Settings
2. **It auto-fills** in all billing records automatically
3. **Update it once** if provider info changes (address, NPI, etc.)

---

## Relationship to Tenant/Organization

### One Provider Settings Per Tenant

- Each **tenant** (organization) has **one** Provider Settings record
- The tenant = the healthcare provider organization
- Example:
  - **Tenant A** = "ABC Care Home" → Has Provider Settings for "ABC Care Home"
  - **Tenant B** = "XYZ Assisted Living" → Has Provider Settings for "XYZ Assisted Living"

### Database Structure

```prisma
model ClaimsProviderSettings {
  tenantId  String @unique  // One per tenant
  providerName  String      // Organization name
  billingProviderNpi  String // Organization's NPI
  // ... other organization fields
}
```

---

## Who Can Manage Provider Settings?

### Access Control

- **ADMIN role**: Can view and update provider settings
- **STAFF role**: Can view provider settings (read-only, typically)
- **SUPER_ADMIN**: Can view/update for any tenant

### Typical Workflow

1. **Initial Setup** (One-time):

   - Admin logs in
   - Navigates to "Provider Settings" page
   - Enters organization's W-9 information
   - Saves settings

2. **Ongoing Use**:
   - Provider fields auto-fill in all billing records
   - Admin can update if organization info changes (e.g., address change, NPI update)

---

## How It Works in Billing Records

### Auto-Population Flow

When creating a billing record:

1. **System checks Provider Settings** for the tenant
2. **Auto-fills provider fields** in the billing form:

   - Provider Name → from Provider Settings
   - Provider ID → from Provider Settings
   - TIN/SSN/EIN → from Provider Settings
   - Billing Provider NPI → from Provider Settings
   - Billing Provider Taxonomy → from Provider Settings
   - Billing Provider Address → from Provider Settings

3. **User can override** if needed (but usually doesn't need to)

### Priority Order

When merging data for billing records:

1. **User Input** (if user manually enters something)
2. **Provider Settings** (organization's default info)
3. **Previous Billing Record** (if exists)

---

## Example Scenario

### Tenant: "ABC Care Home"

**Provider Settings:**

```
Provider Name: "ABC Care Home"
TIN/SSN/EIN: "12-3456789"
Billing Provider NPI: "1234567890"
Billing Provider Taxonomy: "311ZA0620X" (AFH)
Billing Provider Address: "123 Main St, Seattle, WA 98101"
```

**When creating billing records:**

- Every billing record for "ABC Care Home" tenants automatically gets:
  - Provider Name = "ABC Care Home"
  - TIN/SSN/EIN = "12-3456789"
  - NPI = "1234567890"
  - Taxonomy = "311ZA0620X"
  - Address = "123 Main St, Seattle, WA 98101"

**Result**: Staff don't need to type this information 100+ times per month!

---

## Comparison with Other Entities

| Entity                | What It Represents                           | Relationship      |
| --------------------- | -------------------------------------------- | ----------------- |
| **Provider Settings** | The **organization/company** (ABC Care Home) | One per tenant    |
| **Staff/Users**       | Individual **employees** (John, Jane)        | Many per tenant   |
| **Residents**         | **Clients** receiving care (Mary, Bob)       | Many per tenant   |
| **Billing Records**   | Monthly **billing entries** for residents    | Many per resident |

---

## Key Points

1. ✅ **Provider Settings = Organization Information**

   - Not related to individual staff members
   - Represents the healthcare provider organization/company

2. ✅ **One Per Tenant**

   - Each tenant (organization) has one Provider Settings record
   - Stored at tenant/organization level

3. ✅ **One-Time Setup**

   - Admin enters once during initial setup
   - Auto-fills in all billing records
   - Can be updated if organization info changes

4. ✅ **Required for Billing**

   - Must match W-9 information
   - Must match MCO registration
   - Required on every billing claim

5. ✅ **Efficiency Benefit**
   - Enter once, use everywhere
   - Reduces data entry errors
   - Ensures consistency across all billing records

---

## API Endpoints

### Get Provider Settings

```
GET /api/claims-billing/provider
```

Returns the organization's provider information for the current tenant.

### Update Provider Settings

```
PUT /api/claims-billing/provider
```

Creates or updates the organization's provider information.

**Access**: Admin role required

---

## Summary

**Provider Settings** = The **healthcare organization's business information** (name, NPI, address, etc.) that needs to appear on every billing claim. It's **NOT about staff** - it's about the **company/organization** that provides healthcare services.

**Think of it as**: The organization's "business card" information that gets stamped on every billing record automatically.

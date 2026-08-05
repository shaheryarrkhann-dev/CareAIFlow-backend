# EMAR Seed Script Guide

## Quick Start

To seed EMAR data for your tenant, you need:

1. **tenantId** (required) - Your tenant/organization ID
2. **Optional**: Specific resident IDs (if you want to seed for specific residents only)
3. **Optional**: Specific user IDs for caregivers (if you want to use specific staff users)

## Usage

### Basic Usage (Auto-detect residents and staff)

```bash
node scripts/seed-emar.js <tenantId>
```

This will:
- Automatically find all residents (form submissions) for the tenant
- Automatically find all staff users (STAFF/ADMIN role) for the tenant
- Create medications, schedules, MAR records, PRN records, and vitals

### With Specific Residents

```bash
node scripts/seed-emar.js <tenantId> residentId1 residentId2 residentId3
```

### With Specific Caregivers

```bash
node scripts/seed-emar.js <tenantId> --userIds userId1 userId2
```

### Combined

```bash
node scripts/seed-emar.js <tenantId> residentId1 residentId2 --userIds userId1 userId2
```

## What Gets Created

For each resident, the script creates:

1. **4-6 Medications** (randomly selected from sample list):
   - Mix of scheduled medications (Metformin, Lisinopril, Aspirin, etc.)
   - Some PRN medications (Tylenol, Ibuprofen)
   - Some with vitals requirements (Blood pressure, temperature, etc.)

2. **Schedules** (auto-generated):
   - Schedules for next 60 days
   - Based on medication frequency

3. **MAR Records** (past 7 days):
   - Mix of statuses: Given (70%), Late (some), Missed (20%), Skipped (10%)
   - Some with vitals linked
   - Digital signatures
   - Notes and resident responses

4. **PRN Records** (2-5 per PRN medication):
   - Some with follow-up responses (40%)
   - Some pending follow-up (60%)
   - Various symptoms

5. **Vitals Records** (2-3 per resident):
   - Standalone vitals records
   - Blood pressure, pulse, temperature, O2 saturation, weight

## Example

```bash
# Seed for tenant with ID "abc123-def456-ghi789"
node scripts/seed-emar.js abc123-def456-ghi789
```

## Finding Your tenantId

You can find your tenantId by:
1. Checking your database: `SELECT id, name FROM tenants;`
2. Or from your user account (if you're logged in as admin)
3. Or from the default seed: The default tenant created by `npm run prisma:seed`

## Finding Resident IDs

Resident IDs are form submission IDs. You can:
1. Check your form submissions in the database
2. Or use the API: `GET /api/residents` (returns all residents with IDs)
3. Or check the frontend - resident IDs are shown in the residents list

## Finding User IDs

User IDs are staff/admin user IDs. You can:
1. Check your database: `SELECT id, name, email, role FROM users WHERE tenant_id = '<tenantId>' AND role IN ('STAFF', 'ADMIN');`
2. Or use the API: `GET /api/users` (if available)

## Sample Data Created

- **Medications**: 4-6 per resident
- **Schedules**: ~60 days worth per medication
- **MAR Records**: ~50 records (mix of Given, Late, Missed, Skipped)
- **PRN Records**: 2-5 per PRN medication
- **Vitals**: 2-3 standalone records per resident

## Notes

- The script uses realistic sample data
- Dates are randomized within the last 7-30 days
- Statuses are randomized to show variety
- All data is tenant-isolated (only for your tenant)
- Existing data is not deleted (new records are added)

## Troubleshooting

**Error: "No residents found"**
- Make sure you have form submissions (residents) created first
- Or provide specific resident IDs as arguments

**Error: "No staff users found"**
- Make sure you have STAFF or ADMIN users in your tenant
- Or provide specific user IDs with `--userIds`

**Error: "Tenant not found"**
- Verify your tenantId is correct
- Check: `SELECT id, name FROM tenants WHERE id = '<tenantId>';`

## After Seeding

Once seeded, you can:
1. View the EMAR dashboard - should show all the sample data
2. See medications in the medications list
3. View MAR grid with scheduled doses
4. See recent MAR records
5. View PRN records and pending follow-ups
6. See vitals records

Enjoy your demo! 🎉


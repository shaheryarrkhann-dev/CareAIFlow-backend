# 🌱 Behavioral Tracking Seed Script Guide

This guide explains how to use the behavioral tracking seed script to populate your database with realistic demo data for the behavioral tracking module.

## 📋 Overview

The seed script creates:
- **Behavioral Logs**: Realistic behavioral incident entries with various behavior types, severities, triggers, and interventions
- **Behavioral Notes**: AI-generated narrative summaries grouped by month
- **PRN Record Links**: Some behavioral logs are linked to PRN medication records when applicable

## 🚀 Quick Start

### Basic Usage

```bash
# Seed all residents for a tenant (last 30 days)
node scripts/seed-behavioral.js <tenantId>
```

### Examples

```bash
# Seed specific residents
node scripts/seed-behavioral.js <tenantId> residentId1 residentId2

# Use specific staff users
node scripts/seed-behavioral.js <tenantId> --userIds userId1 userId2

# Generate logs for last 60 days
node scripts/seed-behavioral.js <tenantId> --days 60

# Combine options
node scripts/seed-behavioral.js <tenantId> residentId1 --userIds userId1 --days 45
```

## 📝 What Gets Created

### Behavioral Logs

For each resident, the script creates **3-8 behavioral logs** with:

- **Behavior Types**: Randomly selected from all available types:
  - Aggression, SelfHarm, Withdrawal, NonCompliance
  - MoodChanges, Anxiety, Agitation
  - VerbalAbuse, PhysicalAbuse, PropertyDamage
  - Wandering, InappropriateBehavior, Other

- **Severity Levels**: Weighted based on behavior type:
  - **Low**: Minor incidents (e.g., Withdrawal, Wandering)
  - **Moderate**: Standard incidents (e.g., Anxiety, Agitation)
  - **High**: Serious incidents (e.g., SelfHarm, PhysicalAbuse)

- **Triggers**: Realistic context/triggers (e.g., "Resident became upset when asked to take medication")

- **Staff Notes**: Professional observations and outcomes

- **Interventions**: Appropriate interventions based on behavior type:
  - Redirect, Counseling, PrnMedication, TimeOut
  - DeEscalation, EnvironmentalModification, StaffSupport
  - FamilyNotification, PhysicianNotification, EmergencyResponse

- **PRN Record Links**: 30% chance to link to PRN medication records when intervention includes "PrnMedication"

- **Date/Time**: Randomly distributed across the specified date range

### Behavioral Notes

The script automatically creates **monthly behavioral notes** for residents with 2+ logs:

- **Date Range**: Full month coverage (start to end of month)
- **Narrative**: AI-generated summary including:
  - Total incident count
  - Most common behavior type
  - Severity distribution
  - Common interventions used
  - Professional assessment language
- **Version History**: Initial version (v0) is automatically created

## 🎯 Behavior Type Characteristics

The script uses realistic probability distributions:

| Behavior Type | Low | Moderate | High | Common Interventions |
|--------------|-----|----------|------|---------------------|
| **Aggression** | 20% | 40% | 40% | Redirect, DeEscalation, TimeOut, StaffSupport |
| **SelfHarm** | 10% | 20% | 70% | EmergencyResponse, PhysicianNotification, Counseling |
| **PhysicalAbuse** | 10% | 30% | 60% | EmergencyResponse, TimeOut, StaffSupport |
| **Anxiety** | 40% | 50% | 10% | Redirect, Counseling, EnvironmentalModification |
| **Agitation** | 30% | 50% | 20% | Redirect, DeEscalation, PrnMedication |
| **Withdrawal** | 50% | 40% | 10% | Counseling, StaffSupport, FamilyNotification |

## 📊 Sample Data Structure

### Behavioral Log Example

```json
{
  "residentId": "abc-123",
  "residentName": "John Doe",
  "behaviorType": "Anxiety",
  "severity": "Moderate",
  "trigger": "Resident became anxious during meal time",
  "staffNotes": "Staff provided reassurance and redirection. Resident responded positively.",
  "interventions": ["Redirect", "Counseling", "EnvironmentalModification"],
  "interventionDetails": "Environmental modifications made: reduced noise, dimmed lights, provided comfort items.",
  "staffName": "Jane Smith",
  "dateTime": "2025-01-15T14:30:00Z"
}
```

### Behavioral Note Example

```
Behavioral Summary for John Doe

During this reporting period, 5 behavioral incident(s) were documented.

The most frequently observed behavior was Anxiety (3 occurrence(s)). 
Severity distribution: 2 Low, 2 Moderate, and 1 High severity incidents.

Common interventions utilized included: Redirect, Counseling, EnvironmentalModification.

Staff consistently monitored and documented all incidents, implementing appropriate 
interventions as needed. Ongoing assessment and care plan adjustments continue to be 
made based on observed patterns and resident response to interventions.
```

## ⚙️ Configuration Options

### Command Line Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<tenantId>` | **Required** - Tenant ID to seed | - |
| `[residentIds...]` | Optional - Specific resident IDs | All residents |
| `--userIds <ids...>` | Optional - Specific staff user IDs | All staff users |
| `--days <number>` | Optional - Days back to generate logs | 30 |

### Script Constants (Editable)

You can modify these in `scripts/seed-behavioral.js`:

- `SAMPLE_TRIGGERS`: Add more trigger scenarios
- `SAMPLE_STAFF_NOTES`: Add more staff note templates
- `SAMPLE_INTERVENTION_DETAILS`: Add more intervention detail templates
- `BEHAVIOR_INTERVENTION_MAP`: Customize intervention combinations
- `BEHAVIOR_SEVERITY_MAP`: Adjust severity probability distributions

## 🔍 Verification

After running the seed script, verify the data:

### Check Behavioral Logs

```sql
SELECT 
  COUNT(*) as total_logs,
  "behaviorType",
  "severity",
  COUNT(*) as count
FROM behavioral_logs
WHERE "tenantId" = '<tenantId>'
GROUP BY "behaviorType", "severity"
ORDER BY count DESC;
```

### Check Behavioral Notes

```sql
SELECT 
  "residentName",
  "startDate",
  "endDate",
  LENGTH("narrative") as narrative_length
FROM behavioral_notes
WHERE "tenantId" = '<tenantId>'
ORDER BY "startDate" DESC;
```

### Check PRN Record Links

```sql
SELECT 
  COUNT(*) as logs_with_prn,
  COUNT(DISTINCT "prnRecordId") as unique_prn_records
FROM behavioral_logs
WHERE "tenantId" = '<tenantId>' 
  AND "prnRecordId" IS NOT NULL;
```

## 🎨 Frontend Display

After seeding, you can view the data in:

1. **Behavioral Dashboard** (`/behavioral/dashboard`)
   - Summary statistics
   - Recent behavioral logs
   - Alerts and trends

2. **Behavioral Logs Page** (`/behavioral/logs`)
   - Filterable table of all logs
   - Create, view, edit, delete logs
   - Export reports

3. **Behavioral Notes Page** (`/behavioral/notes`)
   - Monthly narrative summaries
   - Generate new notes
   - Edit and version history

4. **Behavior Trends Page** (`/behavioral/trends`)
   - Frequency charts
   - Pattern analysis
   - Trend visualizations

## ⚠️ Important Notes

1. **Staff Users Required**: The script requires at least one active STAFF or ADMIN user in the tenant. Create staff users first if needed.

2. **Residents Required**: The script requires at least one resident (form submission) in the tenant. Run the form submission seed first if needed.

3. **PRN Records Optional**: PRN record linking is optional. The script works without PRN records, but linking adds realism.

4. **Date Range**: Logs are randomly distributed across the specified date range. Use `--days` to control the time period.

5. **Edit Restrictions**: Logs follow the 24-hour edit rule (similar to MAR records). Logs older than 24 hours are automatically locked.

6. **Soft Deletes**: The script respects soft deletes. Deleted residents or staff won't be used.

## 🐛 Troubleshooting

### Error: "No residents found"
- Ensure form submissions exist for the tenant
- Check that resident IDs are correct if using specific IDs

### Error: "No staff users found"
- Create at least one STAFF or ADMIN user for the tenant
- Ensure users are active (`isActive: true`)

### Error: "Tenant not found"
- Verify the tenant ID is correct
- Check that the tenant exists in the database

### No behavioral notes created
- Notes are only created for months with 2+ logs
- Increase `logsPerResident` or `daysBack` to generate more logs

## 📚 Related Documentation

- [EMAR Seed Guide](./EMAR_SEED_GUIDE.md) - Similar seed script for EMAR module
- [Behavioral Tracking API](./docs/behavioral-api.md) - API documentation
- [Database Schema](./prisma/schema.prisma) - Full schema reference

## ✅ Success Criteria

After running the seed script, you should see:

- ✅ Multiple behavioral logs per resident (3-8 logs)
- ✅ Variety of behavior types and severities
- ✅ Realistic triggers and staff notes
- ✅ Appropriate interventions for each behavior type
- ✅ Some logs linked to PRN records (if available)
- ✅ Monthly behavioral notes for residents with sufficient logs
- ✅ All data visible in the frontend behavioral tracking pages

---

**Happy Seeding! 🌱**










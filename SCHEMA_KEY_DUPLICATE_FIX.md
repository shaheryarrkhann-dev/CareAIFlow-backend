# Schema Key Duplicate Fix

## Problem Identified

**Multiple fields were mapping to the SAME `schemaKey`**, causing wrong data in fields:

```
resident_nickname → schemaKey="name" → Gets "Muhammad Ashar Usman" ❌
primary_insurance_name → schemaKey="name" → Gets "Muhammad Ashar Usman" ❌  
signed_name → schemaKey="name" → Gets "Muhammad Ashar Usman" ❌
```

**Result**: Nickname shows full name, Insurance shows name, etc.

## Root Cause

The `refineFieldsWithSchema` function was matching partial strings:
- "resident_**name**" contains "name" → matched to "name"
- "primary_insurance_**name**" contains "name" → matched to "name"
- "signed_**name**" contains "name" → matched to "name"

**No duplicate prevention** - multiple fields could claim the same schemaKey!

## Solution Implemented

### 1. Added Duplicate Prevention (`aiFieldDetectionCoordinate.service.js`)

```javascript
// Track used schemaKeys
const usedSchemaKeys = new Set();

for (const schemaField of schemaFields) {
  // Skip if already used
  if (usedSchemaKeys.has(schemaField.key)) {
    continue;
  }
  
  // ... matching logic ...
  
  if (schemaKey) {
    usedSchemaKeys.add(schemaKey); // Mark as used
  }
}
```

### 2. Added BlockList for Known Issues

```javascript
const blockList = {
  'nickname': ['name', 'resident_name'],
  'resident_nickname': ['name', 'resident_name'],
  'primary_insurance_name': ['name', 'resident_name'],
  'signed_name': ['name', 'resident_name'],
  'signed_date': ['name', 'resident_name'],
};
```

**Prevents**: "nickname" from EVER matching to "name"

### 3. Added Compound Field Matching

```javascript
// Check for compound field matches
if (detectedNorm.includes(schemaField.key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
  score = 90; // High score for "primary_insurance" matching "primary_insurance_name"
}
```

### 4. Added Field Mappings (`pdf.service.js`)

```javascript
'residentnickname': ['nickname'],
'signedname': ['authorization_signature', 'signature', 'signed_by'],
'signeddate': ['authorization_date', 'signature_date', 'signed_date'],
'primaryinsurancename': ['primary_insurance'],
```

## Expected Results

### Before Fix

| Field | schemaKey | Value | Correct? |
|-------|-----------|-------|----------|
| resident_nickname | name | "Muhammad Ashar Usman" | ❌ |
| primary_insurance_name | name | "Muhammad Ashar Usman" | ❌ |
| signed_name | name | "Muhammad Ashar Usman" | ❌ |
| signed_date | none | NULL | ❌ |

### After Fix

| Field | schemaKey | Value | Correct? |
|-------|-----------|-------|----------|
| resident_nickname | nickname | "ashar" | ✅ |
| primary_insurance_name | primary_insurance | "Insurance" | ✅ |
| signed_name | authorization_signature | "asharn sign" | ✅ |
| signed_date | authorization_date | "2025-11-15" | ✅ |

## Known Remaining Issue

**⚠️ Emergency Contact Phone Overlap**

Both "Phone # Day" and "Phone # Night" are being placed at the same coordinates:
- Both at (246.6, 337.7)
- They should be at different X positions

This is a **coordinate adjustment issue**, not a field matching issue. The AI detects them correctly (different coordinates), but the coordinate adjustment logic places them at the same position.

## Testing

1. **Restart server**
2. **Delete and re-upload PDF**
3. **Fill and submit form**

### Check Logs

Should see:
```
[MAPPING] Matched "resident_nickname" → "nickname" (score: 100) ✅
[MAPPING] Matched "primary_insurance_name" → "primary_insurance" (score: 90) ✅
[MAPPING] Matched "signed_name" → "authorization_signature" (score: 100) ✅
[MAPPING] Matched "signed_date" → "authorization_date" (score: 100) ✅
```

Should NOT see:
```
[MAPPING] Matched "resident_nickname" → "name" ❌
```

### Check Database

```sql
SELECT nickname, primary_insurance, authorization_signature, authorization_date
FROM tenant_..._form_...
```

Expected:
- `nickname`: "ashar" (not full name)
- `primary_insurance`: "Insurance" (not name)
- `authorization_signature`: "asharn sign"
- `authorization_date`: "2025-11-15"

## Files Modified

1. `AI_powered/src/services/aiFieldDetectionCoordinate.service.js`
   - Added `usedSchemaKeys` Set
   - Added `blockList` for known conflicts
   - Added compound field matching
   - Improved scoring logic

2. `AI_powered/src/services/pdf.service.js`
   - Added field mappings for nickname, signed, insurance

## Next Steps

1. **Test the fix** - Re-upload PDF and verify correct data
2. **Fix emergency phone overlap** - Coordinate adjustment issue (separate task)

## Success Criteria

✅ Nickname shows "ashar", not full name
✅ Primary Insurance shows insurance value, not name
✅ Signed name shows signature, not resident name
✅ Signed date shows authorization date, not NULL
✅ No duplicate schemaKey assignments in logs


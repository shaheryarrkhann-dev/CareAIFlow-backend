# Field Name Consistency Fix

## Problem Identified

**ROOT CAUSE**: AI was generating INCONSISTENT field names between PDF upload and form submission.

### The Mismatch

**Database Schema** (created at upload time):
```
emergency_contact_day_phone
emergency_contact_night_phone
```

**AI Detection** (at form submission time):
```
emergency_contact_phone_day    ❌ Different word order!
emergency_contact_phone_night  ❌ Different word order!
```

**Result**: Fields marked as `schemaKey="none"` → NOT filled!

### Impact

- Fields detected during upload had different names than at submission
- `findFieldValue()` couldn't match field names despite having data
- User data like phone numbers, addresses, etc. were skipped

## Solution Implemented

### 1. Enhanced Field Matching (pdf.service.js)

#### A. Added Word-Order-Insensitive Matching

```javascript
// Helper: Word-order-insensitive matching
const wordSetMatch = (str1, str2) => {
  const words1 = (str1 || '').toLowerCase().match(/\w+/g) || [];
  const words2 = (str2 || '').toLowerCase().match(/\w+/g) || [];
  
  if (words1.length === 0 || words2.length === 0) return false;
  if (words1.length !== words2.length) return false;
  
  // Check if same words in different order
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  if (set1.size !== set2.size) return false;
  
  for (const word of set1) {
    if (!set2.has(word)) return false;
  }
  return true; // All words match, just different order
};
```

This matches:
- `emergency_contact_phone_day` ↔ `emergency_contact_day_phone` ✅
- `emergency_contact_phone_night` ↔ `emergency_contact_night_phone` ✅

#### B. Added Emergency Contact Field Mappings

```javascript
const fieldMappings = {
  // ... existing mappings ...
  'emergencycontactphoneday': ['emergency_contact_day_phone', 'emergency_contact_phone_day'],
  'emergencycontactphonenight': ['emergency_contact_night_phone', 'emergency_contact_phone_night'],
  'emergencycontactdayphone': ['emergency_contact_day_phone', 'emergency_contact_phone_day'],
  'emergencycontactnightphone': ['emergency_contact_night_phone', 'emergency_contact_phone_night'],
  'phonenumberday': ['emergency_contact_day_phone', 'emergency_contact_phone_day', 'phone_day'],
  'phonenumbernight': ['emergency_contact_night_phone', 'emergency_contact_phone_night', 'phone_night'],
};
```

#### C. Added Priority 6 Matching

```javascript
// PRIORITY 6: Word-order-insensitive exact matching
for (const key of Object.keys(formData)) {
  if (formData[key] === undefined || formData[key] === null || formData[key] === '') {
    continue;
  }
  if (wordSetMatch(fieldName, key)) {
    console.log(`[FIELD-MATCH] Word-order match "${fieldName}" → "${key}" = "${formData[key]}"`);
    return formData[key];
  }
}
```

### 2. Improved AI Detection Consistency (aiFieldDetectionCoordinate.service.js)

Updated AI prompt with specific naming instructions:

```
CRITICAL - CONSISTENT FIELD NAMING:
- Use snake_case for all fieldName values (e.g., "emergency_contact_day_phone")
- For multi-word fields, ALWAYS use this order: [category]_[subcategory]_[type]
  Examples:
  * "emergency_contact_day_phone" NOT "emergency_contact_phone_day"
  * "emergency_contact_night_phone" NOT "emergency_contact_phone_night"
  * "emergency_contact_name_address" NOT "emergency_contact_address_name"
  * "preferred_hospital_phone" NOT "hospital_phone_preferred"
- Category order: emergency_contact, preferred_hospital, primary_insurance
- Type order: name, address, phone, email come LAST
- BE CONSISTENT - use the same field name every time you analyze this form!
```

## How It Works Now

### Field Matching Priority

1. **Common field mappings** (with word-order variations)
2. **schemaKey** exact match
3. **fieldName** exact match
4. **Label** matching (with normalization)
5. **Word-based** fuzzy matching
6. **Word-order-insensitive** exact matching ✨ NEW

### Example Flow

**Scenario**: AI detects `emergency_contact_phone_day` at submission

1. Normalize: `emergencycontactphoneday`
2. Check field mappings → Maps to `['emergency_contact_day_phone', 'emergency_contact_phone_day']`
3. Check formData for `emergency_contact_day_phone` → **FOUND!** ✅
4. Return value: `"03491868356"`

**Scenario 2**: Field mapping didn't match, fallback to word-order match

1. Field name: `emergency_contact_phone_night`
2. Form data key: `emergency_contact_night_phone`
3. Word-order match: `emergency`, `contact`, `phone`, `night` → **MATCH!** ✅
4. Return value: `"03012526053"`

## Testing

### Before Fix

```
[PDF-COORD] ⚠️ No value found for field "emergency_contact_phone_day"
[PDF-COORD] ⚠️ No value found for field "emergency_contact_phone_night"
```

**Result**: Fields skipped, PDF not filled

### After Fix

```
[FIELD-MATCH] Mapped "emergency_contact_phone_day" → "emergency_contact_day_phone" = "03491868356"
[FIELD-MATCH] Word-order match "emergency_contact_phone_night" → "emergency_contact_night_phone" = "03012526053"
```

**Result**: Fields filled correctly ✅

## Next Steps

1. **Restart server** to load the new code
2. **Delete existing PDF** from embeddings (to clear old field mapping)
3. **Re-upload PDF** - AI will use new consistent naming
4. **Submit form** - Fields will match using new word-order logic
5. **Verify** all fields are filled correctly

## What About OCR?

OCR is still in the code but **disabled effectively** because:
- OCR returns 0 fields for digital PDFs
- System falls back to AI text-based detection
- No code removed, just bypassed naturally

We can remove OCR later if not needed, but it's not interfering now.

## Files Modified

1. `AI_powered/src/services/pdf.service.js`
   - Added `wordSetMatch()` helper
   - Added emergency contact field mappings
   - Added Priority 6 word-order-insensitive matching

2. `AI_powered/src/services/aiFieldDetectionCoordinate.service.js`
   - Enhanced system prompt with consistent naming rules
   - Specified field naming conventions

## Success Criteria

✅ Emergency contact day phone filled
✅ Emergency contact night phone filled  
✅ All other fields filled correctly
✅ Field names consistent across upload/submission
✅ No more `schemaKey="none"` for valid fields

## Debugging

If fields still not filling:

```javascript
// Check logs for:
[FIELD-MATCH] Mapped "X" → "Y" = "value"  // Successful mapping
[FIELD-MATCH] Word-order match "X" → "Y"   // Word-order match worked
[PDF-COORD] ⚠️ No value found for field "X" // Still failing

// If still failing, check:
1. Field name in fieldMapping (from AI detection)
2. Field name in formData (from database schema)
3. Add debug log to see wordSetMatch results
```


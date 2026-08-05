# Azure Document Intelligence Null Coordinates Fix

## Problem

When submitting forms, the system crashed with:
```
TypeError: Cannot read properties of null (reading 'toFixed')
at fillPdfByCoordinates (pdf.service.js:599:65)
```

**Root Cause:**
- Azure Document Intelligence successfully detected some fields during PDF upload
- However, Azure returned `NaN` or `null` coordinates for these fields (line 216: `coords: (NaN, NaN)`)
- During PDF prefill, the code tried to use these null coordinates without validation
- Calling `.toFixed()` on null caused the crash

## Solution

Added null safety checks in `pdf.service.js` (line 486-489):

```javascript
// Skip fields with invalid coordinates (e.g., from Azure DI with missing coordinates)
if (x === null || x === undefined || y === null || y === undefined || isNaN(x) || isNaN(y)) {
  console.warn(`[PDF-COORD] ⚠️ Skipping field "${fieldName}" - invalid coordinates: (${x}, ${y})`);
  continue;
}
```

## What This Fixes

- ✅ Prevents crashes when Azure detects fields without valid coordinates
- ✅ System now gracefully skips fields with invalid coordinates
- ✅ Logs a warning so you can see which fields were skipped
- ✅ Other fields with valid coordinates will still be filled

## Expected Behavior

When you submit a form now:
1. Fields with valid coordinates will be filled normally
2. Fields with `null` or `NaN` coordinates will be skipped with a warning
3. The PDF will be generated successfully (even if some fields couldn't be filled)

## Why Azure Returns Null Coordinates

Azure Document Intelligence sometimes detects fields (especially checkboxes or text values) but doesn't always capture precise bounding box coordinates. This is expected behavior - Azure is better at **understanding content** than **precise positioning** for complex form layouts.

## Test It

1. **No restart needed** (unless you want to be safe)
2. Submit a form
3. Check logs - you should see warnings like:
   ```
   [PDF-COORD] ⚠️ Skipping field "male" - invalid coordinates: (null, null)
   ```
4. PDF should generate successfully with all other fields filled

---

**Status:** ✅ Fixed - System will no longer crash on null coordinates


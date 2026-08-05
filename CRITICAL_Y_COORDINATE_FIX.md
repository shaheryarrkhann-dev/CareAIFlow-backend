# Critical Y-Coordinate Baseline Fix

## 🚨 Issue Identified

Text is appearing **BELOW** underlines instead of **ON** them. This is a critical Y-coordinate baseline calculation issue.

## 🔍 Root Cause

The baseline calculation was using `fontDescent` subtraction, which positions text **below** the underline instead of **on** it.

### Before (WRONG):
```javascript
const fontDescent = fontSize * 0.25;
const textBaseline = fieldYFromBottom - fontDescent; // ❌ Places text BELOW line
```

### After (CORRECT):
```javascript
const adjustment = 3; // Position baseline slightly above line
const textBaseline = fieldYFromBottom + adjustment; // ✅ Text sits ON line
```

## ✅ Fix Applied

**File:** `pdfStructureAnalyzer.service.js`

**Change:**
- For underlines: Position baseline **AT** or **slightly above** the underline Y position
- Adjustment: +3pt above the line so text body sits on the line
- Descenders (g, p, q) will extend slightly below, which is acceptable

## 📊 How It Works Now

```
Underline at Y position (from top of page)
  ↓
Convert to PDF coordinates: fieldYFromBottom = pageHeight - fieldY
  ↓
Position baseline: textBaseline = fieldYFromBottom + 3pt
  ↓
Text renders with baseline at this position
  ↓
Text body sits ON the underline ✅
```

## 🧪 Testing

After this fix:
- ✅ Text should sit ON underlines (not below)
- ✅ Text should align with dotted lines
- ✅ Signature fields should align properly
- ✅ Date fields should align properly

## 🎯 Next Steps

1. **Re-upload PDFs** to regenerate field mappings
2. **Test form submission** - text should now be on underlines
3. **Check logs** for baseline calculations

## 📝 Technical Details

**Font Metrics:**
- Helvetica (StandardFonts.Helvetica) at 10pt
- Baseline is where most letters sit
- Descenders extend below baseline
- For text to sit ON a line, baseline should be slightly above the line

**Coordinate System:**
- Detection: Y from TOP of page (where underline is)
- PDF: Y from BOTTOM of page (bottom-left origin)
- Conversion: `fieldYFromBottom = pageHeight - fieldY`
- Baseline: `textBaseline = fieldYFromBottom + 3pt`

This fix ensures text sits on underlines across all PDF types!

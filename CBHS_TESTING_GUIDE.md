# CBHS Module - Testing Guide

This guide will help you test all the changes made to the CBHS (Community Behavioral Health Services) module.

## 📋 Summary of Changes

1. ✅ **Severity Field**: Visible in UI forms (for KPI tracking), but **NOT printed on PDF**
2. ✅ **Outcome Field**: Removed from UI forms and excluded from PDF
3. ✅ **Interventions**: Added edit/add/delete functionality
4. ✅ **Staff Field**: Enlarged to textarea (allows multiple staff names)
5. ✅ **Invoicing**: Restricted to single tier selection (already enforced)
6. ✅ **ClientID**: Made non-editable (disabled and readonly)

---

## 🧪 Testing Checklist

### Test 1: Severity Field - UI Visibility ✅

**Location**: Create Behavior Log Page

**Steps**:
1. Navigate to **Behavioral Tracking** → **Create Behavior Log**
2. Fill in the form with:
   - Select a Resident
   - Select number of services (e.g., 2)
   - Select a Date
3. Scroll to **Service 1** section
4. **Verify**: 
   - ✅ Severity dropdown is visible with options: Low, Moderate, High
   - ✅ Help text below says: "Used for KPI dashboard tracking. Not printed on final PDF."
   - ✅ Can select different severity levels

**Expected Result**: Severity field is visible and functional in the form.

---

### Test 2: Outcome Field - Removed from UI ❌

**Location**: Create Behavior Log Page

**Steps**:
1. Navigate to **Behavioral Tracking** → **Create Behavior Log**
2. Fill in the form (same as Test 1)
3. Scroll through all fields in Service 1 section
4. **Verify**:
   - ✅ **NO "Outcome" field** should be visible
   - ✅ Field order: Time, Observed Behaviors, Severity, Resident Explanation, Interventions, Staff Name, Signature, Summary

**Expected Result**: Outcome field is completely removed from the form.

---

### Test 3: Severity Field - NOT in PDF Print 📄

**Location**: PDF Export (after creating behavior log)

**Steps**:
1. Create a behavior log with severity = "High"
2. Submit the form
3. When PDF modal appears, click **"Download PDF"**
4. Open the downloaded PDF
5. **Verify**:
   - ✅ Look at the **table section** (if present in export reports)
   - ✅ **NO "Severity" column** should appear in the table
   - ✅ Table columns should be: Date, Time, Behavior Type, Trigger, Staff
   - ✅ Summary statistics section may show severity breakdown (this is OK - it's for KPI tracking)

**Expected Result**: Severity is NOT displayed in the PDF table, but may appear in summary statistics for KPI tracking.

---

### Test 4: Outcome Field - NOT in PDF Print 📄

**Location**: PDF Export

**Steps**:
1. Create a behavior log (even if outcome field doesn't exist in UI, check if old data has outcome)
2. Download the PDF
3. Open the PDF and check all service entries
4. **Verify**:
   - ✅ **NO "Outcome" field** should appear in any service entry
   - ✅ **NO "Outcome:" section** in the summary text
   - ✅ Service entries should show: Time, Observed Behavior, Resident Explanation, Interventions, Staff Name, Signature, Summary

**Expected Result**: Outcome is completely excluded from PDF.

---

### Test 5: Interventions - Edit/Add/Delete Functionality ✏️

**Location**: Create Behavior Log Page

**Steps**:
1. Navigate to **Create Behavior Log**
2. Select behaviors (this will auto-populate interventions)
3. Find the **Interventions** textarea field
4. **Test "Add Intervention" button**:
   - Click "Add Intervention" button
   - ✅ A bullet point "• " should be added to the textarea
   - ✅ You can type after the bullet point
5. **Test "Delete Last" button**:
   - Add multiple lines to interventions
   - Click "Delete Last" button
   - ✅ Last line should be removed
6. **Test "Clear All" button**:
   - Add some interventions text
   - Click "Clear All" button
   - ✅ Confirm dialog should appear
   - ✅ After confirming, all text should be cleared
7. **Manual editing**:
   - ✅ You should be able to type directly in the textarea
   - ✅ You can edit auto-populated interventions
   - ✅ You can add multiple interventions manually

**Expected Result**: All intervention edit/add/delete buttons work correctly.

---

### Test 6: Staff Field - Enlarged Textarea 👥

**Location**: Create Behavior Log Page

**Steps**:
1. Navigate to **Create Behavior Log**
2. Scroll to Service 1 section
3. Find the **"Name of Staff / Additional Staff"** field
4. **Verify**:
   - ✅ Field label shows: "Name of Staff / Additional Staff"
   - ✅ Field is a **textarea** (not a single-line input)
   - ✅ Textarea has multiple rows (should be 3 rows visible)
   - ✅ Can enter multiple lines of text
   - ✅ Can enter multiple staff names, one per line
   - ✅ Help text says: "You can enter multiple staff names. Signature will be auto-generated from your name."

**Expected Result**: Staff field is enlarged and allows multiple staff names.

---

### Test 7: Severity Field in Edit/View Modals 🔍

**Location**: Behavioral Logs List → View/Edit Log

**Steps**:
1. Navigate to **Behavioral Tracking** → **Behavioral Logs**
2. Find an existing log and click **View** or **Edit**
3. **In View Mode**:
   - ✅ Severity badge should be visible
   - ✅ Shows severity value (Low/Moderate/High) with color coding
   - ✅ Help text says: "Used for KPI dashboard tracking. Not printed on final PDF."
4. **In Edit Mode**:
   - ✅ Severity dropdown should be visible
   - ✅ Can change severity value
   - ✅ Help text visible below dropdown

**Expected Result**: Severity field is visible in both view and edit modes.

---

### Test 8: Outcome Field in Edit/View Modals ❌

**Location**: Behavioral Logs List → View/Edit Log

**Steps**:
1. Navigate to **Behavioral Logs** list
2. Open an existing log in **View** or **Edit** mode
3. Scroll through all fields
4. **Verify**:
   - ✅ **NO "Outcome" field** should be visible
   - ✅ Even if the log has outcome data in database, it shouldn't display in UI

**Expected Result**: Outcome field is completely removed from view/edit modals.

---

### Test 9: Invoicing - Single Tier Selection 💰

**Location**: Claims & Billing → Create Billing Record

**Steps**:
1. Navigate to **Claims & Billing** → **Create Billing Record**
2. Fill in Resident and other required fields
3. Find the **Tier** field
4. **Verify**:
   - ✅ Tier selector is a **dropdown** (single-select)
   - ✅ You can only select **ONE tier** at a time
   - ✅ Cannot select multiple tiers (no checkboxes)
   - ✅ When you select a tier, previous selection is replaced

**Expected Result**: Only one tier can be selected at a time.

---

### Test 10: ClientID - Non-Editable 🔒

**Location**: Claims & Billing → Create/Edit Billing Record

**Steps**:
1. Navigate to **Claims & Billing** → **Create Billing Record**
2. Select a Resident (this auto-fills ClientID)
3. Find the **Client ID** field
4. **Verify**:
   - ✅ Field is **disabled** (grayed out)
   - ✅ Field has **readonly** attribute
   - ✅ Cursor shows "not-allowed" when hovering
   - ✅ Background color is gray (`bg-gray-50`)
   - ✅ **Cannot type** or edit the value
   - ✅ Value is still visible (not hidden)

**In Edit Mode**:
5. Open an existing billing record in edit mode
6. **Verify**:
   - ✅ ClientID field is still disabled/non-editable
   - ✅ Value is displayed but cannot be changed

**Expected Result**: ClientID is always non-editable, even in edit mode.

---

### Test 11: PDF Generation - Complete Verification 📄

**Location**: After creating behavior logs

**Steps**:
1. Create a behavior log with:
   - Severity: High
   - Multiple interventions
   - Multiple staff names
   - NO outcome (field doesn't exist)
2. Submit and download PDF
3. **Verify PDF contains**:
   - ✅ Date, Time
   - ✅ Behavior Type
   - ✅ Trigger (if provided)
   - ✅ Staff Name(s)
   - ✅ Observed Behaviors
   - ✅ Resident Explanation
   - ✅ Interventions
   - ✅ Signature
   - ✅ Summary
4. **Verify PDF does NOT contain**:
   - ❌ Severity field/column
   - ❌ Outcome field/section
5. **Check Summary Statistics** (if present):
   - ✅ May show severity breakdown (this is OK for KPI)
   - ❌ Should NOT show outcome statistics

**Expected Result**: PDF contains all required fields except severity and outcome.

---

### Test 12: Interventions - In Edit/View Modals ✏️

**Location**: Behavioral Logs → Edit Log

**Steps**:
1. Navigate to **Behavioral Logs**
2. Click **Edit** on an existing log
3. Find the **Interventions** section
4. **Verify**:
   - ✅ Checkboxes for intervention types are visible
   - ✅ Can select/deselect interventions
   - ✅ "Intervention Details" textarea is visible
   - ✅ **Add Intervention** button is present
   - ✅ **Delete Last** button is present
   - ✅ **Clear All** button is present (if text exists)
   - ✅ Label says: "Intervention Details (Editable - Add/Edit/Delete interventions)"

**Expected Result**: Intervention edit/delete functionality works in edit mode.

---

## 🐛 Common Issues to Check

1. **Severity still in PDF**: If severity appears in PDF table, check backend export service
2. **Outcome still visible**: If outcome field appears, check frontend components
3. **ClientID editable**: If ClientID can be edited, check BillingRecordForm component
4. **Multiple tiers**: If multiple tiers can be selected, verify TierSelector component

## ✅ Final Verification Checklist

Before marking as complete, verify:

- [ ] Severity field visible in all CBHS forms
- [ ] Severity field NOT in PDF print (table section)
- [ ] Outcome field removed from all UI forms
- [ ] Outcome field NOT in PDF print
- [ ] Interventions can be added/edited/deleted
- [ ] Staff field is enlarged (textarea)
- [ ] Multiple staff names can be entered
- [ ] Invoicing allows only single tier
- [ ] ClientID is non-editable (disabled)
- [ ] All functionality works in both create and edit modes
- [ ] PDF generation works correctly after all changes

---

## 📝 Notes

- **Severity**: Still stored in database and used for KPI dashboard tracking
- **Outcome**: Removed from UI but may still exist in database (for backward compatibility)
- **PDF Export**: Both severity and outcome are excluded from final PDF print
- **Summary Statistics**: May include severity breakdown (this is intentional for KPI)

---

**Testing completed by**: _______________  
**Date**: _______________  
**Status**: ☐ Pass  ☐ Fail  ☐ Needs Review


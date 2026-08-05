# Nursing Care Plan (NCP) Module - Complete Guide

## Table of Contents
1. [What is NCP?](#what-is-ncp)
2. [Why Do We Need It?](#why-do-we-need-it)
3. [Module Overview](#module-overview)
4. [Core Concepts](#core-concepts)
5. [Complete User Flows](#complete-user-flows)
6. [Features Breakdown](#features-breakdown)
7. [How to Use Each Feature](#how-to-use-each-feature)
8. [Best Practices](#best-practices)
9. [Common Scenarios](#common-scenarios)

---

## What is NCP?

**Nursing Care Plan (NCP)** is a comprehensive digital system for creating, managing, and tracking individualized care plans for residents in healthcare facilities.

### In Simple Terms:
Think of it as a **digital notebook** where healthcare staff can:
- Document health problems for each resident
- Set goals to address those problems
- Plan specific interventions (actions) to achieve those goals
- Track progress over time
- Review and update plans regularly

---

## Why Do We Need It?

### 1. **Regulatory Compliance**
- Healthcare facilities are **legally required** to maintain care plans
- Must be reviewed and updated regularly (typically every 30-90 days)
- Must be accessible for audits and inspections

### 2. **Care Coordination**
- Ensures all staff know what care each resident needs
- Prevents missed treatments or interventions
- Standardizes care delivery across shifts

### 3. **Progress Tracking**
- Monitor if goals are being achieved
- Identify when care plans need adjustment
- Track resident health improvements

### 4. **Documentation & Accountability**
- Creates a permanent record of care provided
- Shows who created/updated care plans and when
- Maintains version history for legal protection

### 5. **Efficiency**
- Reusable templates (Care Library) save time
- AI assistance speeds up care plan creation
- Digital format is easier to update than paper

---

## Module Overview

### Main Sections:

1. **Dashboard** - Overview of all care plans, statistics, and alerts
2. **Care Plans** - List and manage all care plans
3. **Care Library** - Reusable templates for common care scenarios
4. **Statistics** - Analytics and reporting on care plan effectiveness

### Key Components:

```
Care Plan
  ├── Problems (Health Issues)
  │   ├── Goal 1
  │   │   ├── Intervention 1
  │   │   ├── Intervention 2
  │   │   └── Intervention 3
  │   └── Goal 2
  │       ├── Intervention 1
  │       └── Intervention 2
  └── Problems (Another Issue)
      └── Goal 1
          └── Intervention 1
```

---

## Core Concepts

### 1. **Care Plan**
**What it is:** The main document for a resident's care

**Contains:**
- Resident information
- Overall status (Draft, Active, Archived, Pending Review)
- Review schedule (when to review next)
- All problems, goals, and interventions

**Purpose:** Central document that guides all care for a resident

**Example:**
- Resident: John Doe
- Status: Active
- Title: "Post-Surgery Recovery Plan"
- Next Review: March 15, 2024

---

### 2. **Problem**
**What it is:** A health issue or concern for the resident

**Contains:**
- Title (e.g., "Diabetes Management")
- Category (Medical, Behavioral, Functional, Social)
- Priority (Low, Medium, High, Critical)
- Description
- Diagnosis code (optional)
- Onset date

**Purpose:** Identifies what needs to be addressed

**Example:**
- Title: "Wound Healing"
- Category: Medical
- Priority: High
- Description: "Monitor surgical incision site for infection"

---

### 3. **Goal**
**What it is:** A desired outcome for a problem

**Contains:**
- Description (what we want to achieve)
- Status (In Progress, Achieved, Not Met, On Hold)
- Target date
- Evaluation notes

**Purpose:** Defines what success looks like

**Example:**
- Description: "Complete wound healing within 2 weeks"
- Status: In Progress
- Target Date: February 28, 2024

---

### 4. **Intervention**
**What it is:** A specific action to achieve a goal

**Contains:**
- Description (what to do)
- Frequency (Daily, Twice Daily, Weekly, etc.)
- Responsible role (RN, LPN, CNA, etc.)
- Notes

**Purpose:** Defines the actual care actions

**Example:**
- Description: "Change dressing daily"
- Frequency: Daily
- Responsible Role: RN

---

### 5. **Version History**
**What it is:** A record of all changes made to a care plan

**Contains:**
- Version number
- What changed
- Who made the change
- When it was changed

**Purpose:** 
- Track changes over time
- Rollback if needed
- Legal documentation

---

### 6. **Care Library**
**What it is:** A collection of reusable care plan templates

**Contains:**
- Pre-built problems
- Associated goals
- Associated interventions

**Purpose:** 
- Save time creating care plans
- Standardize care for common conditions
- Ensure best practices

**Example Templates:**
- "Diabetes Care"
- "Fall Prevention"
- "Wound Care"
- "Pain Management"

---

## Complete User Flows

### Flow 1: Creating a New Care Plan (New Resident)

**Scenario:** A new resident arrives and needs a care plan

**Steps:**
1. **Navigate:** Care Plans → Create Care Plan
2. **Select Resident:** Choose the resident from dropdown
3. **Set Status:** Choose "Draft" (can activate later)
4. **Add Title:** "Initial Care Plan - [Resident Name]"
5. **Set Review Date:** Schedule first review (e.g., 30 days)
6. **Save:** Click "Create Care Plan"

**What Happens:**
- Care plan is created in "Draft" status
- You can now add problems, goals, and interventions
- Version 1 is automatically created

**Next Steps:**
- Add problems (health issues)
- Add goals for each problem
- Add interventions for each goal
- Change status to "Active" when ready

---

### Flow 2: Adding Problems, Goals, and Interventions

**Scenario:** Building out the care plan content

#### Step 1: Add a Problem
1. Open care plan detail page
2. Click "Add Problem"
3. Enter:
   - Title: "Diabetes Management"
   - Category: Medical
   - Priority: High
   - Description: "Patient has Type 2 Diabetes requiring ongoing monitoring"
4. Click "Add Problem"

**What Happens:**
- Problem is added to care plan
- Appears in problems list
- Can now add goals to this problem

#### Step 2: Add a Goal for the Problem
1. Find the problem you just added
2. Click "Add Goal" (or expand problem)
3. Enter:
   - Description: "Maintain blood glucose between 80-150 mg/dL"
   - Status: In Progress
   - Target Date: 3 months from now
4. Click "Add Goal"

**What Happens:**
- Goal is linked to the problem
- Goal appears under the problem
- Can now add interventions to this goal

#### Step 3: Add Interventions for the Goal
1. Find the goal you just added
2. Click "Add Intervention"
3. Enter:
   - Description: "Monitor blood glucose before meals"
   - Frequency: Twice Daily
   - Responsible Role: RN
4. Click "Add Intervention"

**What Happens:**
- Intervention is linked to the goal
- Staff now know what actions to take
- Intervention appears under the goal

**Complete Structure:**
```
Problem: Diabetes Management
  └── Goal: Maintain blood glucose 80-150 mg/dL
      ├── Intervention: Monitor blood glucose before meals (RN, Twice Daily)
      └── Intervention: Administer insulin as prescribed (RN, Daily)
```

---

### Flow 3: Using Care Library Templates

**Scenario:** Resident has a common condition (e.g., diabetes)

**Steps:**
1. **Option A - Apply Template When Creating:**
   - Create new care plan
   - Click "Apply Template" or "Use Library"
   - Select "Diabetes Care Template"
   - Template content is added automatically

2. **Option B - Apply Template to Existing Plan:**
   - Open care plan detail page
   - Click "Template Browser" or "Apply Template"
   - Select template
   - Customize as needed

**What Happens:**
- Pre-built problem, goals, and interventions are added
- You can customize them for the specific resident
- Saves significant time

**Example:**
- Template: "Diabetes Care"
- Adds: Problem (Diabetes), Goals (Blood sugar control), Interventions (Monitoring, Medication)

---

### Flow 4: Updating Goal Status (Tracking Progress)

**Scenario:** A goal has been achieved or needs status update

**Steps:**
1. Open care plan detail page
2. Find the goal
3. Click status update icon (checkmark)
4. Select new status:
   - **Achieved:** Goal was met
   - **Not Met:** Goal wasn't achieved
   - **On Hold:** Temporarily paused
5. Enter evaluation notes: "Patient has maintained target levels for 30 days"
6. Click "Update"

**What Happens:**
- Goal status changes
- Badge color updates (green for Achieved, red for Not Met)
- Achieved date is recorded (if achieved)
- Notes are saved for documentation

**Why This Matters:**
- Shows care plan effectiveness
- Identifies what's working
- Highlights areas needing adjustment

---

### Flow 5: Reviewing and Updating Care Plan

**Scenario:** Care plan is due for review (every 30-90 days)

**Steps:**
1. **Check Review Status:**
   - Dashboard shows "Due for Review" count
   - Or check care plan's "Next Review Date"

2. **Review Current Plan:**
   - Open care plan detail page
   - Review all problems, goals, interventions
   - Check goal statuses

3. **Make Updates:**
   - Update goal statuses
   - Add new problems if needed
   - Modify interventions
   - Update descriptions

4. **Set New Review Date:**
   - Update "Next Review Date"
   - Save changes

**What Happens:**
- New version is created automatically
- All changes are tracked in version history
- Review date is updated
- Alert is dismissed (if was showing)

**Why This Matters:**
- Required by regulations
- Ensures care plans stay current
- Documents ongoing care

---

### Flow 6: Using AI Features

**Scenario:** Creating care plan from assessment data or progress notes

#### AI Feature 1: Detect Problems from Assessment
1. Open care plan detail page
2. Click "Detect Problems" or "AI Suggestions"
3. Provide assessment data (or select from existing assessments)
4. Click "Detect"
5. Review AI-suggested problems
6. Select which to add
7. Click "Apply"

**What Happens:**
- AI analyzes assessment data
- Suggests relevant problems
- You review and approve
- Problems are added to care plan

#### AI Feature 2: Generate Draft Care Plan
1. On Care Plans page or when creating new plan
2. Click "Generate Draft" or "AI Generate"
3. Select resident
4. Provide assessment data
5. Click "Generate"
6. Review generated draft
7. Edit as needed
8. Save

**What Happens:**
- AI creates complete draft:
  - Problems identified
  - Goals suggested
  - Interventions recommended
- You customize and save

**Why This Matters:**
- Saves hours of manual work
- Ensures comprehensive care plans
- Uses best practices

---

### Flow 7: Version Management

**Scenario:** Need to see what changed or rollback to previous version

#### Viewing Version History
1. Open care plan detail page
2. Go to "Versions" tab
3. See list of all versions
4. Click "View" on any version
5. See what that version contained

**What Happens:**
- Shows all versions with dates
- Shows who made changes
- Shows change summaries

#### Comparing Versions
1. In Versions tab
2. Select 2 versions (checkboxes)
3. Click "Compare"
4. See side-by-side differences

**What Happens:**
- Highlights what changed
- Shows added/removed problems, goals, interventions
- Shows modified content

#### Rolling Back to Previous Version
1. In Versions tab
2. Find the version you want
3. Click "Rollback"
4. Confirm

**What Happens:**
- Care plan reverts to that version
- New version is created (showing the rollback)
- All current changes are lost (but previous versions remain)

**When to Use:**
- Made a mistake and want to undo
- Need to revert to approved version
- Want to see previous state

---

### Flow 8: Exporting Care Plans

**Scenario:** Need to print, email, or archive care plan

#### Export Care Plan PDF
1. Open care plan detail page
2. Click "Export" button
3. PDF downloads automatically

**What's Included:**
- Resident information
- All problems with details
- All goals with status
- All interventions
- Review dates
- Version information

**Use Cases:**
- Printing for physical files
- Emailing to family/physicians
- Archiving for records
- Sharing with external providers

#### Export Version History
1. Open care plan detail page
2. Go to Versions tab
3. Click "Export Version History"
4. PDF downloads

**What's Included:**
- All versions
- Change summaries
- Who made changes
- When changes were made

**Use Cases:**
- Audit documentation
- Legal records
- Compliance reporting

---

## Features Breakdown

### 1. Dashboard

**Purpose:** Quick overview of care plan status

**Shows:**
- Total care plans
- Active care plans
- Care plans due for review
- Recent care plans
- Upcoming reviews
- Goal progress charts
- Intervention compliance charts

**Who Uses It:**
- Administrators: See overall status
- Nurses: See what needs attention
- Managers: Monitor compliance

**When to Use:**
- Start of shift: See what needs review
- Daily check: Monitor alerts
- Weekly review: Check statistics

---

### 2. Care Plans List

**Purpose:** Browse and manage all care plans

**Features:**
- Search by resident name or title
- Filter by status (Active, Draft, etc.)
- Filter by resident
- Filter by date range
- Pagination for large lists

**Who Uses It:**
- All staff: Find specific care plans
- Administrators: Manage all plans

**When to Use:**
- Need to find a specific care plan
- Want to see all plans for a resident
- Need to filter by status

---

### 3. Care Plan Detail Page

**Purpose:** View and edit individual care plan

**Sections:**
- **Overview:** Basic information, status, review dates
- **Problems:** List of all problems with goals/interventions
- **Versions:** Version history and comparison

**Who Uses It:**
- All staff: View care plan details
- Nurses: Update goals and interventions
- Administrators: Review and approve

**When to Use:**
- Reviewing care plan
- Making updates
- Checking progress
- Adding new problems/goals/interventions

---

### 4. Care Library

**Purpose:** Store and reuse care plan templates

**Features:**
- Create templates
- Edit templates
- Duplicate templates
- Apply templates to care plans
- Search and filter templates

**Who Uses It:**
- Administrators: Create standard templates
- Nurses: Use templates to save time

**When to Use:**
- Creating care plan for common condition
- Standardizing care across residents
- Saving time on repetitive tasks

**Example Templates:**
- Diabetes Care
- Fall Prevention
- Wound Care
- Pain Management
- Behavioral Issues

---

### 5. Statistics Page

**Purpose:** Analytics and reporting

**Shows:**
- Total care plans created
- Most common problems
- Goal achievement rates
- Intervention compliance
- Trends over time

**Who Uses It:**
- Administrators: Monitor effectiveness
- Managers: Identify areas for improvement
- Quality assurance: Compliance reporting

**When to Use:**
- Monthly reports
- Quality reviews
- Identifying patterns
- Compliance audits

---

## How to Use Each Feature

### Creating a Care Plan

**When:** New resident arrives or needs new care plan

**Steps:**
1. Go to Care Plans → Create Care Plan
2. Select resident
3. Choose status (usually "Draft" initially)
4. Add title and description
5. Set review interval (30, 60, or 90 days)
6. Set next review date
7. Click "Create"

**Tips:**
- Start with "Draft" status
- Use descriptive titles
- Set realistic review dates

---

### Adding Problems

**When:** Identify a health issue that needs addressing

**Steps:**
1. Open care plan
2. Click "Add Problem"
3. Enter title (required)
4. Select category
5. Set priority
6. Add description
7. Add diagnosis code (if applicable)
8. Set onset date
9. Click "Add Problem"

**Tips:**
- Be specific with titles
- Use appropriate categories
- Set priority based on urgency
- Include diagnosis codes for medical problems

---

### Adding Goals

**When:** Define what you want to achieve for a problem

**Steps:**
1. Find the problem
2. Click "Add Goal"
3. Enter description (what you want to achieve)
4. Set status (usually "In Progress")
5. Set target date
6. Add evaluation notes (optional)
7. Click "Add Goal"

**Tips:**
- Make goals measurable
- Set realistic target dates
- Use clear descriptions
- One goal can have multiple interventions

---

### Adding Interventions

**When:** Define specific actions to achieve a goal

**Steps:**
1. Find the goal
2. Click "Add Intervention"
3. Enter description (what to do)
4. Select frequency
5. Set times per day (if applicable)
6. Select responsible role
7. Add notes (optional)
8. Click "Add Intervention"

**Tips:**
- Be specific about actions
- Choose appropriate frequency
- Assign to correct role
- Multiple interventions per goal are common

---

### Updating Goal Status

**When:** Goal progress changes or goal is achieved

**Steps:**
1. Find the goal
2. Click status update icon
3. Select new status:
   - **Achieved:** Goal met
   - **Not Met:** Goal not achieved
   - **On Hold:** Temporarily paused
   - **In Progress:** Still working on it
4. Enter evaluation notes
5. Click "Update"

**Tips:**
- Update status regularly
- Always add evaluation notes
- Be honest about progress
- Update when goal is clearly achieved or not met

---

### Using Templates

**When:** Creating care plan for common condition

**Steps:**
1. Create new care plan or open existing
2. Click "Apply Template" or "Template Browser"
3. Browse templates
4. Preview template (optional)
5. Select template
6. Review applied content
7. Customize for resident
8. Save

**Tips:**
- Always customize templates
- Remove irrelevant items
- Add resident-specific details
- Templates are starting points, not final plans

---

### Reviewing Care Plans

**When:** Review date arrives (every 30-90 days)

**Steps:**
1. Check dashboard for "Due for Review"
2. Open care plan
3. Review all sections:
   - Check goal statuses
   - Review interventions
   - Assess if problems are resolved
4. Make updates:
   - Update goal statuses
   - Add new problems if needed
   - Modify interventions
5. Set new review date
6. Save changes

**Tips:**
- Review thoroughly
- Update goal statuses
- Document changes
- Set realistic next review date

---

## Best Practices

### 1. **Start with Draft Status**
- Create care plan as "Draft"
- Add all problems, goals, interventions
- Review and edit
- Change to "Active" when complete

### 2. **Be Specific**
- Use clear, descriptive titles
- Avoid vague descriptions
- Include relevant details

### 3. **Set Realistic Goals**
- Goals should be achievable
- Set appropriate target dates
- Consider resident's condition

### 4. **Update Regularly**
- Update goal statuses weekly
- Review care plans on schedule
- Document changes

### 5. **Use Templates Wisely**
- Templates save time
- Always customize for resident
- Don't use templates blindly

### 6. **Document Everything**
- Add evaluation notes
- Explain status changes
- Document why interventions changed

### 7. **Review Before Activating**
- Complete all sections
- Verify information
- Check for errors
- Then activate

---

## Common Scenarios

### Scenario 1: New Resident Admission

**Situation:** New resident arrives, needs initial care plan

**Flow:**
1. Create care plan (Draft status)
2. Use AI to detect problems from assessment
3. Review and add problems manually
4. Add goals for each problem
5. Add interventions for each goal
6. Review complete plan
7. Change status to "Active"
8. Set review date (30 days)

**Time:** 30-60 minutes (with AI assistance)

---

### Scenario 2: Routine Care Plan Review

**Situation:** Care plan is due for review (30 days passed)

**Flow:**
1. Dashboard shows "Due for Review" alert
2. Open care plan
3. Review all problems, goals, interventions
4. Update goal statuses:
   - Mark achieved goals
   - Update in-progress goals
   - Note any not-met goals
5. Add evaluation notes
6. Update interventions if needed
7. Set new review date
8. Save (creates new version)

**Time:** 15-30 minutes

---

### Scenario 3: Resident Condition Changes

**Situation:** Resident develops new health issue

**Flow:**
1. Open active care plan
2. Add new problem
3. Add goals for new problem
4. Add interventions for goals
5. Update review date if needed
6. Save (creates new version)

**Time:** 10-20 minutes

---

### Scenario 4: Goal Achievement

**Situation:** A goal has been achieved

**Flow:**
1. Open care plan
2. Find the goal
3. Click status update
4. Select "Achieved"
5. Enter evaluation notes: "Goal met on [date], patient has maintained target for 30 days"
6. Update
7. Consider if new goal needed

**Time:** 2-5 minutes

---

### Scenario 5: Using Template for Common Condition

**Situation:** Resident has diabetes, use diabetes template

**Flow:**
1. Create new care plan
2. Click "Apply Template"
3. Select "Diabetes Care Template"
4. Review applied content:
   - Problem: Diabetes Management
   - Goals: Blood sugar control
   - Interventions: Monitoring, medication
5. Customize:
   - Adjust for resident's specific needs
   - Add resident-specific details
   - Remove irrelevant items
6. Add additional problems if needed
7. Save

**Time:** 15-20 minutes (vs 45+ minutes manually)

---

### Scenario 6: Exporting for Physician Review

**Situation:** Need to send care plan to physician

**Flow:**
1. Open care plan
2. Click "Export"
3. PDF downloads
4. Email PDF to physician
5. Physician reviews
6. Make updates based on feedback
7. Save

**Time:** 2 minutes

---

### Scenario 7: Audit/Compliance Review

**Situation:** Facility audit, need to show care plan history

**Flow:**
1. Open care plan
2. Go to Versions tab
3. Review version history
4. Export version history PDF
5. Provide to auditors

**Time:** 5 minutes

---

## Key Benefits Summary

### For Staff:
- ✅ Saves time with templates and AI
- ✅ Clear guidance on what care to provide
- ✅ Easy to update and track progress
- ✅ Digital format (no paper)

### For Facility:
- ✅ Regulatory compliance
- ✅ Standardized care
- ✅ Complete documentation
- ✅ Audit-ready records

### For Residents:
- ✅ Individualized care
- ✅ Consistent care delivery
- ✅ Better health outcomes
- ✅ Coordinated care

---

## Quick Reference

### Status Meanings:
- **Draft:** Being created, not active yet
- **Active:** Currently in use, guiding care
- **Pending Review:** Needs review
- **Archived:** No longer active

### Goal Status Meanings:
- **In Progress:** Working on it
- **Achieved:** Goal met successfully
- **Not Met:** Goal not achieved
- **On Hold:** Temporarily paused

### Priority Levels:
- **Critical:** Immediate attention needed
- **High:** Important, address soon
- **Medium:** Moderate importance
- **Low:** Can be addressed later

---

## Support & Help

### If You Need Help:
1. Check this guide
2. Review test cases document
3. Contact system administrator
4. Check error messages in browser console

### Common Issues:
- **Black screen:** Check browser console for errors
- **Can't save:** Check all required fields
- **Template not applying:** Verify template has content
- **Export not working:** Check browser download settings

---

## Conclusion

The NCP module is a comprehensive system for managing resident care plans. It helps ensure:
- ✅ Proper documentation
- ✅ Regulatory compliance
- ✅ Quality care delivery
- ✅ Progress tracking
- ✅ Time efficiency

Use this guide as a reference when working with care plans. The system is designed to be intuitive, but this guide will help you understand the "why" behind each feature.

**Remember:** Care plans are living documents. They should be reviewed regularly and updated as resident conditions change. The NCP module makes this process efficient and compliant.


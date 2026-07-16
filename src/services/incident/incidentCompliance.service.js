const HIGH_RISK_INCIDENT_TYPES = new Set(["MedicationError", "SuspectedAbuseOrNeglect"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNotified(value) {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    if (typeof value.notified === "boolean") return value.notified;
  }
  return false;
}

function normalizeNotifications(notifications) {
  return notifications && typeof notifications === "object" ? notifications : {};
}

function addIssue(target, issue) {
  target.push({
    code: issue.code,
    message: issue.message,
    path: issue.path || null,
    requiredBy: issue.requiredBy || "general",
    severity: issue.severity || "error",
  });
}

function shouldRequireCaseManager(incidentType, severity) {
  if (severity === "High") return true;
  return HIGH_RISK_INCIDENT_TYPES.has(incidentType);
}

function shouldRequireAuthorities(incidentType, severity) {
  return incidentType === "SuspectedAbuseOrNeglect" || severity === "High";
}

function evaluateIncidentCompliance(report, options = {}) {
  const mode = options.mode === "draft" ? "draft" : "preSubmit";
  const payload = report.payload && typeof report.payload === "object" ? report.payload : {};
  const notifications = normalizeNotifications(payload.notifications);
  const errors = [];
  const warnings = [];

  const pushError = (issue) => addIssue(errors, { ...issue, severity: "error" });
  const pushWarning = (issue) => addIssue(warnings, { ...issue, severity: "warning" });

  // Core required fields
  if (!report.residentId) {
    pushError({
      code: "RESIDENT_REQUIRED",
      message: "Resident is required.",
      path: "residentId",
      requiredBy: "general",
    });
  }
  if (!report.occurredAt) {
    pushError({
      code: "OCCURRED_AT_REQUIRED",
      message: "Incident date/time is required.",
      path: "occurredAt",
      requiredBy: "general",
    });
  }
  if (!isNonEmptyString(report.incidentType)) {
    pushError({
      code: "INCIDENT_TYPE_REQUIRED",
      message: "Incident type is required.",
      path: "incidentType",
      requiredBy: "general",
    });
  }
  if (!isNonEmptyString(payload.description)) {
    pushError({
      code: "DESCRIPTION_REQUIRED",
      message: "Incident description is required.",
      path: "payload.description",
      requiredBy: "general",
    });
  }

  if (report.incidentType === "Other" && !isNonEmptyString(report.incidentTypeOtherText)) {
    pushError({
      code: "INCIDENT_TYPE_OTHER_TEXT_REQUIRED",
      message: "Custom incident type description is required when type is Other.",
      path: "incidentTypeOtherText",
      requiredBy: "classification",
    });
  }

  // Type-specific fields
  if (report.incidentType === "Accident" && !isNonEmptyString(payload.injuriesDescription)) {
    pushWarning({
      code: "INJURIES_DESCRIPTION_RECOMMENDED",
      message: "Injuries description is recommended for accidents.",
      path: "payload.injuriesDescription",
      requiredBy: "accident",
    });
  }
  if (report.incidentType === "MedicationError" && !isNonEmptyString(payload.followUpPlan)) {
    pushError({
      code: "FOLLOW_UP_REQUIRED_MEDICATION_ERROR",
      message: "Follow-up plan is required for medication errors.",
      path: "payload.followUpPlan",
      requiredBy: "medicationError",
    });
  }
  if (
    report.incidentType === "SuspectedAbuseOrNeglect" &&
    !isNonEmptyString(payload.abuseReportedToLocalOfficeDate)
  ) {
    pushError({
      code: "ABUSE_LOCAL_OFFICE_DATE_REQUIRED",
      message: "Date reported to local office is required for suspected abuse or neglect.",
      path: "payload.abuseReportedToLocalOfficeDate",
      requiredBy: "suspectedAbuseOrNeglect",
    });
  }

  if (!isNonEmptyString(payload.staffActions)) {
    const issue = {
      code: "STAFF_ACTIONS_REQUIRED",
      message: "Staff actions taken are required.",
      path: "payload.staffActions",
      requiredBy: "general",
    };
    if (mode === "preSubmit") pushError(issue);
    else pushWarning(issue);
  }

  // Notification requirements
  if (!isNotified(notifications.provider)) {
    pushError({
      code: "NOTIFY_PROVIDER_REQUIRED",
      message: "Provider notification is required.",
      path: "payload.notifications.provider",
      requiredBy: "notification",
    });
  }
  if (!isNotified(notifications.family)) {
    pushError({
      code: "NOTIFY_FAMILY_REQUIRED",
      message: "Family notification is required.",
      path: "payload.notifications.family",
      requiredBy: "notification",
    });
  }
  if (shouldRequireCaseManager(report.incidentType, report.severity) && !isNotified(notifications.caseManager)) {
    pushError({
      code: "NOTIFY_CASE_MANAGER_REQUIRED",
      message: "Case manager notification is required for this incident.",
      path: "payload.notifications.caseManager",
      requiredBy: "notification",
    });
  }
  if (shouldRequireAuthorities(report.incidentType, report.severity) && !isNotified(notifications.authorities)) {
    pushError({
      code: "NOTIFY_AUTHORITIES_REQUIRED",
      message: "Authorities notification is required for this incident.",
      path: "payload.notifications.authorities",
      requiredBy: "notification",
    });
  }

  if (report.severity === "High" && !isNonEmptyString(payload.injuriesDescription)) {
    pushError({
      code: "HIGH_SEVERITY_INJURY_DETAIL_REQUIRED",
      message: "Injuries details are required for high severity incidents.",
      path: "payload.injuriesDescription",
      requiredBy: "highSeverity",
    });
  }

  if (report.status === "Closed" && !isNonEmptyString(payload.closureNotes)) {
    const issue = {
      code: "CLOSURE_NOTES_REQUIRED",
      message: "Closure notes are required before closing an incident.",
      path: "payload.closureNotes",
      requiredBy: "closure",
    };
    if (mode === "preSubmit") pushError(issue);
    else pushWarning(issue);
  }

  const status = errors.length > 0 ? "FAIL" : "PASS";
  const totalChecks = errors.length + warnings.length + 1;
  const passedChecks = totalChecks - errors.length;

  return {
    mode,
    status,
    score: {
      passedChecks,
      totalChecks,
      percent: Math.round((passedChecks / totalChecks) * 100),
    },
    errors,
    warnings,
    requiredNotifications: {
      provider: true,
      family: true,
      caseManager: shouldRequireCaseManager(report.incidentType, report.severity),
      authorities: shouldRequireAuthorities(report.incidentType, report.severity),
    },
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateIncidentCompliance,
};

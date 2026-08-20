const prisma = require("../../lib/prisma");
const letterheadPdf = require("../document/letterheadPdf.service");
const {
  lookupIpGeolocationSummary,
} = require("../../utils/ip-geolocation.util");

/**
 * Audit Service
 * Provides comprehensive audit logging functionality with security best practices
 * - Immutable logs (insert-only)
 * - Sanitized data (no sensitive information)
 * - Async/non-blocking operations
 */

// Timezone configuration - UTC+05:00
const AUDIT_TIMEZONE_OFFSET = 5 * 60; // 5 hours in minutes

/**
 * Convert UTC timestamp to UTC+05:00 timezone
 * @param {Date|string} date - UTC date to convert
 * @returns {string} Formatted date string in UTC+05:00
 */
function convertToAuditTimezone(date) {
  if (!date) return null;

  const utcDate = new Date(date);

  // Add 5 hours (300 minutes) to UTC time
  const localDate = new Date(
    utcDate.getTime() + AUDIT_TIMEZONE_OFFSET * 60 * 1000
  );

  // Format as ISO string but replace Z with +05:00
  const isoString = localDate.toISOString();
  return isoString.replace("Z", "+05:00");
}

/**
 * Recursively convert all timestamps in an object to UTC+05:00
 * @param {any} obj - Object, array, or value to process
 * @returns {any} Object with converted timestamps
 */
function convertTimestampsInObject(obj) {
  if (!obj) return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => convertTimestampsInObject(item));
  }

  // Handle dates and ISO strings
  if (typeof obj === "string") {
    // Check if it's an ISO 8601 timestamp
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(obj)) {
      return convertToAuditTimezone(obj);
    }
    return obj;
  }

  // Handle objects
  if (typeof obj === "object") {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key suggests it's a timestamp
      const isTimestampField =
        key.toLowerCase().includes("time") ||
        key.toLowerCase().includes("date") ||
        key === "createdAt" ||
        key === "updatedAt";

      if (
        isTimestampField &&
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)
      ) {
        converted[key] = convertToAuditTimezone(value);
      } else if (typeof value === "object") {
        converted[key] = convertTimestampsInObject(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }

  return obj;
}

/**
 * Format audit log timestamps to UTC+05:00
 * @param {Object} log - Audit log object
 * @returns {Object} Log with formatted timestamp
 */
function formatAuditLogTimezone(log) {
  if (!log) return null;

  // Convert the main createdAt field
  const formattedLog = {
    ...log,
    createdAt: convertToAuditTimezone(log.createdAt),
  };

  // Convert timestamps in metadata
  if (formattedLog.metadata) {
    formattedLog.metadata = convertTimestampsInObject(formattedLog.metadata);
  }

  // Convert timestamps in requestData
  if (formattedLog.requestData) {
    formattedLog.requestData = convertTimestampsInObject(
      formattedLog.requestData
    );
  }

  // Convert timestamps in responseData
  if (formattedLog.responseData) {
    formattedLog.responseData = convertTimestampsInObject(
      formattedLog.responseData
    );
  }

  return formattedLog;
}

// Sensitive field names to exclude from logs
const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "newPassword",
  "oldPassword",
  "confirmPassword",
  "token",
  "refreshToken",
  "accessToken",
  "resetToken",
  "verificationToken",
  "secret",
  "apiKey",
  "privateKey",
  "authorization",
  "cookie",
  "session",
];

/**
 * Recursively sanitize an object by removing sensitive fields
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeData(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeData(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if field is sensitive
    const isSensitive = SENSITIVE_FIELDS.some((field) =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extract IP address from request
 * Prioritizes proxy headers for real client IP (especially for Nginx/Docker)
 * @param {Object} req - Express request object
 * @returns {string|null} IP address
 */
function getIpAddress(req) {
  if (!req) return null;

  // Priority order for IP extraction (most reliable first)
  let ip = null;

  // 1. Check X-Forwarded-For (standard for proxies like Nginx)
  if (req.headers["x-forwarded-for"]) {
    const forwardedIps = req.headers["x-forwarded-for"].split(",");
    // Get the first (original) IP, not the proxy IP
    ip = forwardedIps[0]?.trim();
  }

  // 2. Check X-Real-IP (Nginx specific)
  if (!ip && req.headers["x-real-ip"]) {
    ip = req.headers["x-real-ip"];
  }

  // 3. Check Cloudflare
  if (!ip && req.headers["cf-connecting-ip"]) {
    ip = req.headers["cf-connecting-ip"];
  }

  // 4. Check other proxy headers
  if (!ip && req.headers["x-client-ip"]) {
    ip = req.headers["x-client-ip"];
  }

  if (!ip && req.headers["true-client-ip"]) {
    ip = req.headers["true-client-ip"];
  }

  if (!ip && req.headers["x-cluster-client-ip"]) {
    ip = req.headers["x-cluster-client-ip"];
  }

  // 5. Fall back to Express req.ip (uses trust proxy setting)
  if (!ip && req.ip) {
    ip = req.ip;
  }

  // 6. Last resort: direct connection (won't work behind proxy)
  if (!ip) {
    ip = req.connection?.remoteAddress || req.socket?.remoteAddress || null;
  }

  if (!ip) return null;

  // Clean up the IP address

  // Convert IPv6 loopback to IPv4 for consistency
  if (ip === "::1" || ip === "::ffff:127.0.0.1") {
    ip = "127.0.0.1";
  }

  // Remove IPv6 prefix if present
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  // Filter out private/internal IPs and return null if detected
  // This helps identify when proxy configuration is missing
  const privateRanges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^127\./, // 127.0.0.0/8
    /^::1$/, // IPv6 loopback
    /^fe80:/, // IPv6 link-local
    /^fc00:/, // IPv6 private
    /^fd00:/, // IPv6 private
  ];

  const isPrivateIp = privateRanges.some((range) => range.test(ip));

  // If it's a private IP and we have headers, log a warning
  if (
    isPrivateIp &&
    (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])
  ) {
    // Headers exist but still got private IP - might be misconfigured
    console.warn(
      `⚠️  Audit: Detected private IP ${ip} despite proxy headers. Check Nginx configuration.`
    );
  }

  return ip;
}

/**
 * Generate human-readable description for audit log
 * @param {Object} data - Log data
 * @returns {string} Description
 */
function generateDescription(data) {
  const { action, userName, userRole, userEmail, resourceId, errorMessage } =
    data;

  const name = userName || userEmail || "User";
  const role = userRole ? ` (${userRole})` : "";

  // Generate description based on action
  switch (action) {
    // Authentication
    case "LOGIN_SUCCESS":
      return `${name}${role} logged in successfully`;
    case "LOGIN_FAILED":
      return `Failed login attempt for ${userEmail || "unknown user"}`;
    case "LOGOUT":
      return `${name}${role} logged out`;
    case "TOKEN_REFRESH":
      return `${name}${role} refreshed authentication token`;
    case "PASSWORD_RESET_REQUEST":
      return `Password reset requested for ${userEmail}`;
    case "PASSWORD_RESET_SUCCESS":
      return `${name} reset their password successfully`;
    case "EMAIL_VERIFICATION":
      return `${name} verified their email address`;

    // User actions
    case "USER_CREATED":
      return `${name}${role} created a new user`;
    case "USER_UPDATED":
      return `${name}${role} updated user information`;
    case "USER_DELETED":
      return `${name}${role} deleted a user`;
    case "USER_INVITED":
      return `${name}${role} invited a new user`;
    case "USER_ACTIVATED":
      return `${name}${role} activated a user account`;
    case "USER_DEACTIVATED":
      return `${name}${role} deactivated a user account`;

    // Tenant actions
    case "TENANT_CREATED":
      return `${name}${role} created a new organization`;
    case "TENANT_UPDATED":
      return `${name}${role} updated organization information`;
    case "TENANT_DELETED":
      return `${name}${role} deleted an organization`;
    case "TENANT_ACTIVATED":
      return `${name}${role} activated an organization`;
    case "TENANT_DEACTIVATED":
      return `${name}${role} deactivated an organization`;

    // Form actions
    case "FORM_CREATED":
      return `${name}${role} created a new form`;
    case "FORM_UPDATED":
      return `${name}${role} updated a form`;
    case "FORM_DELETED":
      return `${name}${role} deleted a form`;
    case "FORM_SUBMITTED":
      return `${name}${role} submitted a form`;
    case "FORM_DRAFT_SAVED":
      return `${name}${role} saved a form draft`;
    case "FORM_DRAFT_DELETED":
      return `${name}${role} deleted a form draft`;

    // PDF actions
    case "PDF_UPLOADED":
      return `${name}${role} uploaded a PDF document`;
    case "PDF_GENERATED":
      return `${name}${role} generated a PDF document`;
    case "PDF_DOWNLOADED":
      return `${name}${role} downloaded a PDF document`;
    case "PDF_DELETED":
      return `${name}${role} deleted a PDF document`;
    case "PDF_TEMPLATE_CREATED":
      return `${name}${role} created a PDF template`;
    case "PDF_TEMPLATE_UPDATED":
      return `${name}${role} updated a PDF template`;
    case "PDF_TEMPLATE_DELETED":
      return `${name}${role} deleted a PDF template`;

    // Embedding actions
    case "EMBEDDING_CREATED":
      return `${name}${role} created vector embeddings`;
    case "EMBEDDING_DELETED":
      return `${name}${role} deleted vector embeddings`;
    case "EMBEDDING_QUERIED":
      return `${name}${role} performed a vector search query`;

    // Note actions
    case "NOTE_CREATED":
      return `${name}${role} created a progress note${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "NOTE_UPDATED":
      return `${name}${role} updated a progress note${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "NOTE_DELETED":
      return `${name}${role} deleted a progress note${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "NOTE_EXPORTED":
      return `${name}${role} exported progress notes`;

    // Billing actions
    case "BILLING_TIER_CREATED":
      return `${name}${role} created a billing tier${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "BILLING_TIER_UPDATED":
      return `${name}${role} updated a billing tier${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "BILLING_TIER_DELETED":
      return `${name}${role} deleted a billing tier${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "RESIDENT_TIER_ASSIGNED":
      return `${name}${role} assigned a billing tier to resident${
        resourceId ? ` (Resident ID: ${resourceId})` : ""
      }`;
    case "RESIDENT_TIER_UPDATED":
      return `${name}${role} updated billing tier assignment for resident${
        resourceId ? ` (Resident ID: ${resourceId})` : ""
      }`;
    case "INVOICE_GENERATED":
      return `${name}${role} generated an invoice${
        resourceId ? ` (Invoice ID: ${resourceId})` : ""
      }`;
    case "INVOICE_UPDATED":
      return `${name}${role} updated an invoice${
        resourceId ? ` (Invoice ID: ${resourceId})` : ""
      }`;
    case "INVOICE_STATUS_CHANGED":
      return `${name}${role} changed invoice status${
        resourceId ? ` (Invoice ID: ${resourceId})` : ""
      }`;
    case "INVOICE_EXPORTED":
      return `${name}${role} exported invoices`;

    // Facility actions
    case "FACILITY_PROFILE_CREATED":
      return `${name}${role} created facility profile`;
    case "FACILITY_PROFILE_UPDATED":
      return `${name}${role} updated facility profile`;
    case "FACILITY_FOLDER_CREATED":
      return `${name}${role} created folder${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "FACILITY_FOLDER_UPDATED":
      return `${name}${role} updated folder${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "FACILITY_FOLDER_DELETED":
      return `${name}${role} deleted folder${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "FACILITY_DOCUMENT_UPLOADED":
      return `${name}${role} uploaded document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "FACILITY_DOCUMENT_MODIFIED":
      return `${name}${role} modified document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "FACILITY_DOCUMENT_DELETED":
      return `${name}${role} deleted document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "FACILITY_DOCUMENT_VIEWED":
      return `${name}${role} viewed document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "EVACUATION_DRILL_CREATED":
      return `${name}${role} created evacuation drill${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "EVACUATION_DRILL_COMPLETED":
      return `${name}${role} completed evacuation drill${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "VISITOR_CHECK_IN":
      return `${name}${role} checked in visitor${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "VISITOR_CHECK_OUT":
      return `${name}${role} checked out visitor${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "VISITOR_QR_SIGN_IN":
      return `Visitor signed in via QR${resourceId ? ` (log ID: ${resourceId})` : ""}`;

    // Staff document actions
    case "STAFF_MEMBER_CREATED":
      return `${name}${role} added staff member for document management${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_MEMBER_DELETED":
      return `${name}${role} removed staff member from document management${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_FACILITY_ASSIGNED":
      return `${name}${role} assigned staff to facility${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_FACILITY_UNASSIGNED":
      return `${name}${role} unassigned staff from facility${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_FOLDER_CREATED":
      return `${name}${role} created staff folder${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_FOLDER_UPDATED":
      return `${name}${role} updated staff folder${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_FOLDER_DELETED":
      return `${name}${role} deleted staff folder${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_DOCUMENT_UPLOADED":
      return `${name}${role} uploaded staff document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_DOCUMENT_DELETED":
      return `${name}${role} deleted staff document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;
    case "STAFF_DOCUMENT_VIEWED":
      return `${name}${role} viewed staff document${
        resourceId ? ` (ID: ${resourceId})` : ""
      }`;

    // System actions
    case "SYSTEM_ERROR":
      return `System error occurred${errorMessage ? `: ${errorMessage}` : ""}`;
    case "ACCESS_DENIED":
      return `Access denied for ${name}${role}`;
    case "UNAUTHORIZED_ACCESS":
      return `Unauthorized access attempt${
        userEmail ? ` by ${userEmail}` : ""
      }`;

    // Subscription onboarding
    case "ONBOARDING_PLAN_CONFIRMED":
      return `${name}${role} confirmed their onboarding plan`;
    case "ONBOARDING_ORG_BOOTSTRAPPED":
      return `${name}${role} created organization and first facility during onboarding`;
    case "ONBOARDING_COMPLETED":
      return `${name}${role} completed onboarding`;
    case "ONBOARDING_INVITE_SKIPPED":
      return `${name}${role} skipped staff invites during onboarding`;
    case "ASSISTED_ACTIVATION_CREATED":
      return `${name}${role} provisioned an assisted activation`;

    default:
      return `${name}${role} performed ${action
        .toLowerCase()
        .replace(/_/g, " ")}`;
  }
}

/**
 * Create an audit log entry
 * @param {Object} data - Audit log data
 * @returns {Promise<Object>} Created audit log
 */
async function createAuditLog(data) {
  try {
    const {
      userId,
      userName,
      userEmail,
      userRole,
      tenantId,
      action,
      resource,
      resourceId,
      method,
      endpoint,
      statusCode,
      ipAddress,
      userAgent,
      requestData,
      responseData,
      errorMessage,
      duration,
      metadata,
      req,
    } = data;

    // Extract IP and user agent from request if provided
    const finalIpAddress = ipAddress || (req ? getIpAddress(req) : null);
    const finalUserAgent = userAgent || req?.headers["user-agent"] || null;

    // Extract user info from req.user if not provided
    const finalUserId = userId || req?.user?.id || null;
    const finalUserName = userName || req?.user?.name || null;
    const finalUserEmail = userEmail || req?.user?.email || null;
    const finalUserRole = userRole || req?.user?.role || null;
    const finalTenantId = tenantId || req?.user?.tenantId || null;

    // Generate human-readable description
    const description = generateDescription({
      action,
      userName: finalUserName,
      userRole: finalUserRole,
      userEmail: finalUserEmail,
      resourceId,
      errorMessage,
    });

    // Sanitize request and response data
    const sanitizedRequestData = requestData ? sanitizeData(requestData) : null;
    const sanitizedResponseData = responseData
      ? sanitizeData(responseData)
      : null;

    // Truncate user agent if too long
    const truncatedUserAgent = finalUserAgent
      ? finalUserAgent.substring(0, 500)
      : null;

    let ipGeoSummary = null;
    if (finalIpAddress) {
      try {
        ipGeoSummary = await lookupIpGeolocationSummary(finalIpAddress);
      } catch (_) {
        /* never block audit insert */
      }
    }

    // Create audit log entry
    const auditLog = await prisma.auditLog.create({
      data: {
        userId: finalUserId,
        userName: finalUserName,
        userEmail: finalUserEmail,
        userRole: finalUserRole,
        tenantId: finalTenantId,
        action,
        resource,
        resourceId: resourceId || null,
        description,
        method: method || null,
        endpoint: endpoint || null,
        statusCode: statusCode || null,
        ipAddress: finalIpAddress,
        ipGeoSummary,
        userAgent: truncatedUserAgent,
        requestData: sanitizedRequestData,
        responseData: sanitizedResponseData,
        errorMessage: errorMessage || null,
        duration: duration || null,
        metadata: metadata || null,
      },
    });

    return auditLog;
  } catch (error) {
    // Log to console but don't throw - audit logging should not break app flow
    console.error("Failed to create audit log:", {
      message: error.message,
      stack: error.stack,
      action: data?.action,
      resource: data?.resource,
      error: error,
    });
    return null;
  }
}

/**
 * Log authentication event
 * @param {Object} data - Authentication event data
 */
async function logAuthEvent(data) {
  const { action, userId, tenantId, email, req, success, errorMessage } = data;

  return createAuditLog({
    userId: userId || null,
    tenantId: tenantId || null,
    action,
    resource: "auth",
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    statusCode: success ? 200 : 401,
    req,
    errorMessage,
    metadata: email ? { email } : null,
  });
}

/**
 * Log user action
 * @param {Object} data - User action data
 */
async function logUserAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "user",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log tenant action
 * @param {Object} data - Tenant action data
 */
async function logTenantAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "tenant",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log form action
 * @param {Object} data - Form action data
 */
async function logFormAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "form",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log PDF action
 * @param {Object} data - PDF action data
 */
async function logPdfAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "pdf",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log embedding action
 * @param {Object} data - Embedding action data
 */
async function logEmbeddingAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "embedding",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log note action
 * @param {Object} data - Note action data
 */
async function logNoteAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "note",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log appointment action
 * @param {Object} data - Appointment action data
 */
async function logAppointmentAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  return createAuditLog({
    userId,
    tenantId,
    action,
    resource: "appointment",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });
}

/**
 * Log billing action
 * @param {Object} data - Billing action data
 */
async function logBillingAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "billing",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for billing action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log medication action
 * @param {Object} data - Medication action data
 */
async function logMedicationAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "medication",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for medication action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log MAR action
 * @param {Object} data - MAR action data
 */
async function logMarAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "mar",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for MAR action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log PRN action
 * @param {Object} data - PRN action data
 */
async function logPrnAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "prn",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for PRN action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log vitals action
 * @param {Object} data - Vitals action data
 */
async function logVitalsAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "vitals",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for vitals action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log behavioral tracking action
 * @param {Object} data - Behavioral action data
 */
async function logBehavioralAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "behavioral",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for behavioral action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log care plan action
 * @param {Object} data - Care plan action data
 */
async function logCarePlanAction(data) {
  const { action, userId, tenantId, resourceId, req, metadata } = data;

  const result = await createAuditLog({
    userId,
    tenantId,
    action,
    resource: "care_plan",
    resourceId,
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    req,
    metadata,
  });

  // Log warning if audit log creation failed
  if (!result) {
    console.warn("⚠️ Audit log creation returned null for care plan action:", {
      action,
      resourceId,
      userId,
      tenantId,
    });
  }

  return result;
}

/**
 * Log system error or security event
 * @param {Object} data - System event data
 */
async function logSystemEvent(data) {
  const { action, userId, tenantId, req, errorMessage, metadata } = data;

  return createAuditLog({
    userId: userId || null,
    tenantId: tenantId || null,
    action,
    resource: "system",
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    statusCode: 500,
    req,
    errorMessage,
    metadata,
  });
}

/**
 * Get audit logs with filtering and optional pagination
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Audit logs with optional pagination
 */
async function getAuditLogs(filters = {}) {
  const {
    userId,
    tenantId,
    action,
    resource,
    startDate,
    endDate,
    page,
    limit,
  } = filters;

  const where = {};

  if (userId) where.userId = userId;
  if (tenantId) where.tenantId = tenantId;
  if (action) where.action = action;
  if (resource) where.resource = resource;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  // Build query options
  const queryOptions = {
    where,
    orderBy: { createdAt: "desc" },
  };

  // Only add pagination if page and limit are provided
  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;
    queryOptions.skip = skip;
    queryOptions.take = limit;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany(queryOptions),
    prisma.auditLog.count({ where }),
  ]);

  // Format all logs to UTC+05:00 timezone
  const formattedLogs = logs.map((log) => formatAuditLogTimezone(log));

  const result = {
    logs: formattedLogs,
  };

  // Only include pagination if page and limit were provided
  if (page !== undefined && limit !== undefined) {
    result.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } else {
    result.total = total;
  }

  return result;
}

/**
 * Facility-related resources for audit filtering
 */
const FACILITY_RESOURCES = [
  "facility",
  "facility_folder",
  "facility_document",
  "evacuation_drill",
  "visitor_log",
];

/**
 * Staff-related resources for audit filtering
 */
const STAFF_RESOURCES = [
  "staff_member",
  "staff_folder",
  "staff_document",
  "staff_facility_assignment",
];

const RESIDENT_DOCUMENT_RESOURCES = [
  "resident_folder",
  "resident_document",
];

/**
 * Get resident document/folder audit logs for a specific resident
 * @param {string} tenantId - Tenant ID (required)
 * @param {string} residentId - Resident ID (required)
 * @param {Object} filters - action, resource, startDate, endDate, page, limit
 * @returns {Promise<Object>} Audit logs with pagination
 */
async function getResidentDocumentAuditLogs(tenantId, residentId, filters = {}) {
  const { action, resource, startDate, endDate, page, limit } = filters;

  const where = {
    tenantId,
    resource: { in: RESIDENT_DOCUMENT_RESOURCES },
    metadata: { path: ["residentId"], equals: residentId },
  };

  if (action) where.action = action;
  if (resource && RESIDENT_DOCUMENT_RESOURCES.includes(resource)) {
    where.resource = resource;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const queryOptions = {
    where,
    orderBy: { createdAt: "desc" },
  };

  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;
    queryOptions.skip = skip;
    queryOptions.take = limit;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany(queryOptions),
    prisma.auditLog.count({ where }),
  ]);

  const formattedLogs = logs.map((log) => formatAuditLogTimezone(log));

  const result = {
    logs: formattedLogs,
  };

  if (page !== undefined && limit !== undefined) {
    result.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } else {
    result.total = total;
  }

  return result;
}

/**
 * Get facility-specific audit logs
 * Filters by facility-related resources (facility, facility_folder, facility_document, etc.)
 * @param {string} tenantId - Tenant ID (required)
 * @param {Object} filters - Filter criteria (action, resource, startDate, endDate, page, limit)
 * @returns {Promise<Object>} Audit logs with pagination
 */
async function getFacilityAuditLogs(tenantId, filters = {}) {
  const { action, resource, startDate, endDate, page, limit, facilityId } =
    filters;

  const where = {
    tenantId,
    resource: { in: FACILITY_RESOURCES },
  };

  if (facilityId) {
    where.OR = [
      { resource: "facility", resourceId: facilityId },
      { metadata: { path: ["facilityId"], equals: facilityId } },
    ];
  }

  if (action) where.action = action;
  if (resource && FACILITY_RESOURCES.includes(resource)) {
    where.resource = resource;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const queryOptions = {
    where,
    orderBy: { createdAt: "desc" },
  };

  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;
    queryOptions.skip = skip;
    queryOptions.take = limit;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany(queryOptions),
    prisma.auditLog.count({ where }),
  ]);

  const formattedLogs = logs.map((log) => formatAuditLogTimezone(log));

  const result = {
    logs: formattedLogs,
  };

  if (page !== undefined && limit !== undefined) {
    result.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } else {
    result.total = total;
  }

  return result;
}

/**
 * Get staff-specific audit logs
 * Filters by staff-related resources (staff_member, staff_folder, staff_document, staff_facility_assignment)
 * @param {string} tenantId - Tenant ID (required)
 * @param {Object} filters - Filter criteria (action, resource, startDate, endDate, page, limit)
 * @returns {Promise<Object>} Audit logs with pagination
 */
async function getStaffAuditLogs(tenantId, filters = {}) {
  const { action, resource, startDate, endDate, page, limit } = filters;

  const where = {
    tenantId,
    resource: { in: STAFF_RESOURCES },
  };

  if (action) where.action = action;
  if (resource && STAFF_RESOURCES.includes(resource)) {
    where.resource = resource;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const queryOptions = {
    where,
    orderBy: { createdAt: "desc" },
  };

  if (page !== undefined && limit !== undefined) {
    const skip = (page - 1) * limit;
    queryOptions.skip = skip;
    queryOptions.take = limit;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany(queryOptions),
    prisma.auditLog.count({ where }),
  ]);

  const formattedLogs = logs.map((log) => formatAuditLogTimezone(log));

  const result = {
    logs: formattedLogs,
  };

  if (page !== undefined && limit !== undefined) {
    result.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } else {
    result.total = total;
  }

  return result;
}

/**
 * Get audit log statistics
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Audit statistics
 */
async function getAuditStats(filters = {}) {
  const { userId, tenantId, startDate, endDate } = filters;

  const where = {};
  if (userId) where.userId = userId;
  if (tenantId) where.tenantId = tenantId;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [totalLogs, actionCounts, resourceCounts] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where,
      _count: { action: true },
    }),
    prisma.auditLog.groupBy({
      by: ["resource"],
      where,
      _count: { resource: true },
    }),
  ]);

  return {
    totalLogs,
    byAction: actionCounts.map((item) => ({
      action: item.action,
      count: item._count.action,
    })),
    byResource: resourceCounts.map((item) => ({
      resource: item.resource,
      count: item._count.resource,
    })),
  };
}

/**
 * Export audit trail to PDF
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportAuditTrailToPdf(user, filters = {}) {
  const { PDFDocument, rgb } = require("pdf-lib");

  // Build tenant filter
  let tenantWhere = {};
  if (user.role === "SUPER_ADMIN") {
    if (filters.tenantId) {
      tenantWhere = { tenantId: filters.tenantId };
    }
  } else {
    tenantWhere = { tenantId: user.tenantId };
  }

  // Build date filter
  const dateFilter = {};
  if (filters.dateFrom) {
    dateFilter.gte = new Date(filters.dateFrom);
  }
  if (filters.dateTo) {
    dateFilter.lte = new Date(filters.dateTo);
  }

  // Build action filter (if provided)
  const where = {
    ...tenantWhere,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    ...(filters.action && { action: filters.action }),
    ...(filters.resource && { resource: filters.resource }),
    ...(filters.userId && { userId: filters.userId }),
  };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  if (logs.length === 0) {
    throw new Error("No audit trail records found to export");
  }

  const letterheadTenantId = filters.tenantId || user.tenantId;
  const pdfDoc = await PDFDocument.create();
  const letterheadAssets = await letterheadPdf.prepareLetterheadAssets(
    pdfDoc,
    letterheadTenantId,
    filters.facilityId
  );
  const font = letterheadAssets.fonts.font;
  const boldFont = letterheadAssets.fonts.boldFont;
  const semiBoldFont = letterheadAssets.fonts.semiBoldFont;
  const page = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  const bottomMin = letterheadPdf.contentBottomMin(letterheadAssets);
  let currentY = letterheadAssets.contentStartY;
  let currentPage = page;

  const checkNewPage = (requiredSpace) => {
    if (currentY - requiredSpace < bottomMin) {
      const newPage = letterheadPdf.addLetterheadPage(pdfDoc, letterheadAssets);
      currentY = letterheadAssets.contentStartY;
      currentPage = newPage;
      return newPage;
    }
    return currentPage;
  };

  // Sanitize text to remove Unicode characters that can't be encoded in WinAnsi
  function sanitizeText(text) {
    if (!text) return "";
    let sanitized = String(text);

    // Replace common Unicode characters with ASCII equivalents
    const replacements = {
      "\u2192": "->", // Right arrow
      "\u2190": "<-", // Left arrow
      "\u2191": "^", // Up arrow
      "\u2193": "v", // Down arrow
      "\u2013": "-", // En dash
      "\u2014": "--", // Em dash
      "\u2018": "'", // Left single quotation mark
      "\u2019": "'", // Right single quotation mark
      "\u201C": '"', // Left double quotation mark
      "\u201D": '"', // Right double quotation mark
      "\u2026": "...", // Horizontal ellipsis
      "\u00A0": " ", // Non-breaking space
    };

    // Apply replacements
    for (const [unicode, replacement] of Object.entries(replacements)) {
      sanitized = sanitized.replace(new RegExp(unicode, "g"), replacement);
    }

    // Remove any remaining non-ASCII characters (keep only printable ASCII 32-126)
    sanitized = sanitized.replace(/[^\x20-\x7E]/g, "");

    return sanitized;
  }

  // Wrap text helper - handles both word wrapping and long words without spaces
  function wrapText({ text, maxWidth, font, fontSize }) {
    if (!text) return [""];
    const sanitized = sanitizeText(text);
    const words = sanitized.split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = "";
    const widthOf = (line) => font.widthOfTextAtSize(line, fontSize);

    for (const word of words) {
      // Check if the word itself is longer than maxWidth
      const wordWidth = widthOf(word);

      if (wordWidth > maxWidth) {
        // Word is too long, need to break it character by character
        if (currentLine) {
          // Save current line before breaking the long word
          lines.push(currentLine);
          currentLine = "";
        }

        // Break long word into chunks that fit
        let wordChunk = "";
        for (let i = 0; i < word.length; i++) {
          const char = word[i];
          const candidate = wordChunk + char;
          if (widthOf(candidate) <= maxWidth) {
            wordChunk = candidate;
          } else {
            if (wordChunk) {
              lines.push(wordChunk);
            }
            wordChunk = char;
          }
        }
        if (wordChunk) {
          currentLine = wordChunk;
        }
      } else {
        // Word fits, try to add it to current line
        if (!currentLine) {
          currentLine = word;
        } else {
          const candidate = `${currentLine} ${word}`;
          if (widthOf(candidate) <= maxWidth) {
            currentLine = candidate;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [""];
  }

  // Calculate content width early (needed for header)
  const contentWidth = pageWidth - margin * 2;

  // Modern header without background
  currentPage.drawText(sanitizeText("Audit Trail"), {
    x: margin,
    y: currentY,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0), // Black text
  });
  currentY -= 30;

  // Get tenant name from first log or user
  let tenantName = "All Facilities";
  const tenantIdToFetch =
    logs.length > 0 && logs[0].tenantId ? logs[0].tenantId : user.tenantId;

  if (tenantIdToFetch) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantIdToFetch },
        select: { name: true },
      });
      if (tenant) {
        tenantName = tenant.name;
      }
    } catch (error) {
      console.warn("Could not fetch tenant name:", error.message);
    }
  }

  const dateRange =
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(
          filters.dateTo
        ).toLocaleDateString()}`
      : "All Dates";
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Info section with better styling
  currentPage.drawText(sanitizeText(`Facility: ${tenantName}`), {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(sanitizeText(`Date Range: ${dateRange}`), {
    x: margin,
    y: currentY,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 16;

  currentPage.drawText(sanitizeText(`Generated: ${generatedAt}`), {
    x: margin,
    y: currentY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  currentY -= 30;

  // Table headers with better column widths
  // Total page width: 612, margins: 50*2 = 100, so contentWidth = 512
  const colWidths = {
    date: 95,
    action: 125, // Increased by 10% (from 110)
    user: 90,
    resource: 60,
    details: 136, // Adjusted to fit within contentWidth
  };
  // Ensure total fits within contentWidth
  const totalFixedWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  if (totalFixedWidth > contentWidth) {
    // Adjust details column to fit
    const overflow = totalFixedWidth - contentWidth;
    colWidths.details = Math.max(100, colWidths.details - overflow);
  } else {
    // If there's extra space, give it to details column
    colWidths.details += contentWidth - totalFixedWidth;
  }

  const colX = {
    date: margin,
    action: margin + colWidths.date,
    user: margin + colWidths.date + colWidths.action,
    resource: margin + colWidths.date + colWidths.action + colWidths.user,
    details:
      margin +
      colWidths.date +
      colWidths.action +
      colWidths.user +
      colWidths.resource,
  };

  // Modern table header with professional styling
  const headerHeight = 24;
  currentPage.drawRectangle({
    x: margin,
    y: currentY - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.906, 0.971, 0.821), // #88DB1B33 - Light green tint (transparent green approximated)
  });

  const headers = ["Date/Time", "Action", "User", "Resource", "Details"];
  headers.forEach((header, idx) => {
    const x = Object.values(colX)[idx];
    const colWidth = Object.values(colWidths)[idx];
    // Account for padding: 6px left + 6px right = 12px total
    const maxWidth = colWidth - 12;
    const headerText = wrapText({
      text: header,
      maxWidth,
      font: semiBoldFont,
      fontSize: 10,
    });
    currentPage.drawText(sanitizeText(headerText[0] || header), {
      x: x + 6,
      y: currentY - 16,
      size: 10,
      font: semiBoldFont,
      color: rgb(0, 0, 0), // Black text
    });

    // Draw subtle column separator (except for last column)
    if (idx < headers.length - 1) {
      const separatorX = x + colWidth;
      currentPage.drawLine({
        start: { x: separatorX, y: currentY - headerHeight + 2 },
        end: { x: separatorX, y: currentY - 2 },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  });
  currentY -= headerHeight;

  // Subtle line under headers
  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  currentY -= 0; // No space between header and body

  // Records with proper row height calculation
  for (const log of logs) {
    const dateTime = sanitizeText(new Date(log.createdAt).toLocaleString());
    const action = sanitizeText(log.action);
    const userName = sanitizeText(log.userName || log.userEmail || "System");
    const resource = sanitizeText(log.resource || "N/A");
    const ipBits = [log.ipAddress, log.ipGeoSummary].filter(Boolean);
    const detailsRaw =
      ipBits.length > 0
        ? `${log.description || ""}${log.description ? " | " : ""}IP: ${ipBits.join(" — ")}`
        : log.description || "N/A";
    const details = sanitizeText(detailsRaw);

    // Calculate max lines needed for this row and store wrapped text for each cell
    const values = [dateTime, action, userName, resource, details];
    let maxLines = 1;
    const cellLines = [];
    values.forEach((value, idx) => {
      const colWidth = Object.values(colWidths)[idx];
      // Account for padding: 6px left + 6px right = 12px total
      // Use conservative maxWidth to ensure text never exceeds column boundary
      const maxWidth = colWidth - 14; // Extra 2px buffer for safety
      const lines = wrapText({
        text: String(value),
        maxWidth,
        font,
        fontSize: 9,
      });
      const limitedLines = lines.slice(0, 3); // Max 3 lines per cell
      cellLines.push(limitedLines);
      maxLines = Math.max(maxLines, limitedLines.length);
    });

    // Increased row height for better spacing (more padding)
    const lineHeight = 12;
    const verticalPadding = 10; // Top and bottom padding
    const rowHeight = maxLines * lineHeight + verticalPadding * 2;
    checkNewPage(rowHeight + 12);

    // Draw row background (alternating between light gray and sage green)
    const rowIndex = logs.indexOf(log);
    if (rowIndex % 2 === 0) {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(1, 1, 1), // White
      });
    } else {
      currentPage.drawRectangle({
        x: margin,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.97, 0.99, 0.92), // Sage green (same as table header)
      });
    }

    // Calculate row center for vertical centering
    const rowCenterY = currentY - rowHeight / 2;

    // Draw cell values with vertical centering
    values.forEach((value, idx) => {
      const x = Object.values(colX)[idx];
      const lines = cellLines[idx];
      const numLines = lines.length;

      // Calculate vertical position to center the text block
      // For single line: center at row center
      // For multiple lines: center the block around row center
      const textBlockHeight = (numLines - 1) * lineHeight;
      const firstLineY = rowCenterY + textBlockHeight / 2;

      const colWidth = Object.values(colWidths)[idx];
      const textMaxWidth = colWidth - 12; // Account for 6px padding on each side

      lines.forEach((line, lineIdx) => {
        currentPage.drawText(sanitizeText(line), {
          x: x + 6,
          y: firstLineY - lineIdx * lineHeight,
          size: 9,
          font: font,
          color: rgb(0.2, 0.2, 0.2), // Darker text for better readability
          maxWidth: textMaxWidth, // Ensure text never exceeds column width
        });
      });

      // Draw subtle column separator (except for last column)
      if (idx < values.length - 1) {
        const separatorX = x + Object.values(colWidths)[idx];
        currentPage.drawLine({
          start: { x: separatorX, y: currentY - rowHeight + 2 },
          end: { x: separatorX, y: currentY - 2 },
          thickness: 0.3,
          color: rgb(0.92, 0.92, 0.92),
        });
      }
    });

    // Draw subtle row separator
    currentPage.drawLine({
      start: { x: margin, y: currentY - rowHeight },
      end: { x: pageWidth - margin, y: currentY - rowHeight },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    currentY -= rowHeight;
  }

  letterheadPdf.stampPageNumbers(pdfDoc, font, margin);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  createAuditLog,
  logAuthEvent,
  logUserAction,
  logTenantAction,
  logFormAction,
  logPdfAction,
  logEmbeddingAction,
  logNoteAction,
  logAppointmentAction,
  logBillingAction,
  logMedicationAction,
  logMarAction,
  logPrnAction,
  logVitalsAction,
  logBehavioralAction,
  logCarePlanAction,
  logSystemEvent,
  getAuditLogs,
  getFacilityAuditLogs,
  getStaffAuditLogs,
  getResidentDocumentAuditLogs,
  getAuditStats,
  exportAuditTrailToPdf,
  sanitizeData,
  getIpAddress,
};

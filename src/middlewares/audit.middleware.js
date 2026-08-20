const auditService = require("../services/compliance/audit.service");

/**
 * Audit Middleware
 * Automatically logs HTTP requests and responses
 * - Captures request/response data
 * - Measures request duration
 * - Handles errors gracefully
 */

/**
 * Determine action based on method and endpoint
 * @param {string} method - HTTP method
 * @param {string} endpoint - Request endpoint
 * @param {Object} user - User object
 * @returns {string|null} Action type
 */
function inferAction(method, endpoint, user) {
  // Authentication endpoints
  if (endpoint.includes("/auth/login")) return "LOGIN_SUCCESS";
  if (endpoint.includes("/auth/logout")) return "LOGOUT";
  if (endpoint.includes("/auth/refresh-token")) return "TOKEN_REFRESH";
  if (endpoint.includes("/auth/forgot-password"))
    return "PASSWORD_RESET_REQUEST";
  if (endpoint.includes("/auth/reset-password"))
    return "PASSWORD_RESET_SUCCESS";
  if (endpoint.includes("/auth/verify-email")) return "EMAIL_VERIFICATION";
  if (endpoint.includes("/auth/invite-user")) return "USER_INVITED";

  // User endpoints
  if (endpoint.includes("/users")) {
    if (method === "POST") return "USER_CREATED";
    if (method === "PUT" || method === "PATCH") return "USER_UPDATED";
    if (method === "DELETE") return "USER_DELETED";
  }

  // Tenant endpoints
  if (endpoint.includes("/tenants")) {
    if (method === "POST") return "TENANT_CREATED";
    if (method === "PUT" || method === "PATCH") return "TENANT_UPDATED";
    if (method === "DELETE") return "TENANT_DELETED";
  }

  // Form endpoints
  if (endpoint.includes("/forms")) {
    if (method === "POST" && endpoint.includes("/draft"))
      return "FORM_DRAFT_SAVED";
    if (method === "DELETE" && endpoint.includes("/draft"))
      return "FORM_DRAFT_DELETED";
    if (method === "POST" && endpoint.includes("/submit"))
      return "FORM_SUBMITTED";
    if (method === "POST") return "FORM_CREATED";
    if (method === "PUT" || method === "PATCH") return "FORM_UPDATED";
    if (method === "DELETE") return "FORM_DELETED";
  }

  // PDF endpoints
  if (endpoint.includes("/pdf")) {
    if (method === "POST" && endpoint.includes("/template"))
      return "PDF_TEMPLATE_CREATED";
    if (method === "PUT" && endpoint.includes("/template"))
      return "PDF_TEMPLATE_UPDATED";
    if (method === "DELETE" && endpoint.includes("/template"))
      return "PDF_TEMPLATE_DELETED";
    if (method === "POST" && endpoint.includes("/generate"))
      return "PDF_GENERATED";
    if (method === "GET" && endpoint.includes("/download"))
      return "PDF_DOWNLOADED";
    if (method === "POST") return "PDF_UPLOADED";
    if (method === "DELETE") return "PDF_DELETED";
  }

  // Embedding endpoints
  if (endpoint.includes("/embedding")) {
    if (method === "POST" && endpoint.includes("/query"))
      return "EMBEDDING_QUERIED";
    if (method === "POST") return "EMBEDDING_CREATED";
    if (method === "DELETE") return "EMBEDDING_DELETED";
  }

  // HIPAA: Medical/PHI endpoints - MUST be logged
  if (endpoint.includes("/medications")) {
    if (method === "GET") return "PHI_ACCESS_MEDICATIONS";
    if (method === "POST") return "PHI_CREATE_MEDICATION";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_MEDICATION";
    if (method === "DELETE") return "PHI_DELETE_MEDICATION";
  }

  if (endpoint.includes("/mar")) {
    if (method === "GET") return "PHI_ACCESS_MAR";
    if (method === "POST") return "PHI_CREATE_MAR_RECORD";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_MAR_RECORD";
  }

  if (endpoint.includes("/prn")) {
    if (method === "GET") return "PHI_ACCESS_PRN";
    if (method === "POST") return "PHI_CREATE_PRN_RECORD";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_PRN_RECORD";
  }

  if (endpoint.includes("/vitals")) {
    if (method === "GET") return "PHI_ACCESS_VITALS";
    if (method === "POST") return "PHI_CREATE_VITAL_SIGN";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_VITAL_SIGN";
  }

  if (endpoint.includes("/care-plans")) {
    if (method === "GET") return "PHI_ACCESS_CARE_PLAN";
    if (method === "POST") return "PHI_CREATE_CARE_PLAN";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_CARE_PLAN";
    if (method === "DELETE") return "PHI_DELETE_CARE_PLAN";
  }

  if (endpoint.includes("/behavioral")) {
    if (method === "GET") return "PHI_ACCESS_BEHAVIORAL";
    if (method === "POST") return "PHI_CREATE_BEHAVIORAL_LOG";
    if (method === "PUT" || method === "PATCH")
      return "PHI_UPDATE_BEHAVIORAL_LOG";
  }

  if (endpoint.includes("/notes")) {
    if (method === "GET") return "PHI_ACCESS_NOTE";
    if (method === "POST") return "PHI_CREATE_NOTE";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_NOTE";
    if (method === "DELETE") return "PHI_DELETE_NOTE";
  }

  if (endpoint.includes("/residents")) {
    if (method === "GET") return "PHI_ACCESS_RESIDENT";
    if (method === "POST") return "PHI_CREATE_RESIDENT";
    if (method === "PUT" || method === "PATCH") return "PHI_UPDATE_RESIDENT";
    if (method === "DELETE") return "PHI_DELETE_RESIDENT";
  }

  return null;
}

/**
 * Determine resource type from endpoint
 * @param {string} endpoint - Request endpoint
 * @returns {string} Resource type
 */
function inferResource(endpoint) {
  if (endpoint.includes("/auth")) return "auth";
  if (endpoint.includes("/users")) return "user";
  if (endpoint.includes("/tenants")) return "tenant";
  if (endpoint.includes("/forms")) return "form";
  if (endpoint.includes("/pdf")) return "pdf";
  if (endpoint.includes("/embedding")) return "embedding";
  // HIPAA: Medical/PHI resources
  if (endpoint.includes("/medications")) return "medication";
  if (endpoint.includes("/mar")) return "mar_record";
  if (endpoint.includes("/prn")) return "prn_record";
  if (endpoint.includes("/vitals")) return "vital_sign";
  if (endpoint.includes("/care-plans")) return "care_plan";
  if (endpoint.includes("/behavioral")) return "behavioral_log";
  if (endpoint.includes("/notes")) return "note";
  if (endpoint.includes("/residents")) return "resident";
  return "unknown";
}

/**
 * Audit middleware factory
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function auditMiddleware(options = {}) {
  const {
    logGET = false, // By default, don't log GET requests (read operations)
    logOptions = false, // By default, don't log OPTIONS requests
    excludeEndpoints = ["/health", "/api-docs"], // Endpoints to skip
    onlyLogErrors = false, // Only log failed requests
  } = options;

  // HIPAA: List of PHI endpoints that MUST be logged (even GET requests)
  const phiEndpoints = [
    "/medications",
    "/mar",
    "/prn",
    "/vitals",
    "/care-plans",
    "/behavioral",
    "/notes",
    "/residents",
  ];

  return async (req, res, next) => {
    // Skip excluded endpoints
    const fullPath = req.originalUrl || req.url || req.path;
    if (excludeEndpoints.some((endpoint) => fullPath.includes(endpoint))) {
      return next();
    }

    // Skip OPTIONS requests unless configured
    if (req.method === "OPTIONS" && !logOptions) {
      return next();
    }

    // HIPAA: Always log PHI access (even GET requests)
    const isPHIEndpoint = phiEndpoints.some((phiPath) =>
      fullPath.includes(phiPath)
    );

    // Skip GET requests unless configured OR if it's a PHI endpoint
    if (req.method === "GET" && !logGET && !isPHIEndpoint) {
      return next();
    }

    const startTime = Date.now();

    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseBody = null;

    // Intercept response
    res.json = function (body) {
      responseBody = body;
      return originalJson(body);
    };

    res.send = function (body) {
      if (!responseBody) {
        try {
          responseBody = typeof body === "string" ? JSON.parse(body) : body;
        } catch {
          responseBody = null;
        }
      }
      return originalSend(body);
    };

    // Handle response finish
    res.on("finish", async () => {
      try {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        // If only logging errors, skip successful requests
        if (onlyLogErrors && statusCode < 400) {
          return;
        }

        const action = inferAction(
          req.method,
          req.originalUrl || req.url,
          req.user
        );
        const resource = inferResource(req.originalUrl || req.url);

        // Only log if we can determine an action
        if (!action) {
          return;
        }

        // Extract resource ID from URL if available
        let resourceId = null;
        const idMatch = (req.originalUrl || req.url).match(
          /\/([a-f0-9-]{36})(?:\/|$|\?)/i
        );
        if (idMatch) {
          resourceId = idMatch[1];
        }

        // HIPAA: Extract resident ID from request (for PHI access tracking)
        let residentId = null;
        if (req.params?.residentId) {
          residentId = req.params.residentId;
        } else if (req.body?.residentId) {
          residentId = req.body.residentId;
        } else if (req.query?.residentId) {
          residentId = req.query.residentId;
        }

        // Prepare audit log data
        const auditData = {
          userId: req.user?.id || null,
          userName: req.user?.name || null,
          userEmail: req.user?.email || null,
          userRole: req.user?.role || null,
          tenantId: req.user?.tenantId || null,
          action,
          resource,
          resourceId: resourceId || resourceId, // Use extracted residentId if available
          method: req.method,
          endpoint: req.originalUrl || req.url,
          statusCode,
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
          duration,
          // HIPAA: Sanitize request/response data - don't log actual PHI
          // Visitor QR: never log the sign-in token (security)
          requestData: (() => {
            if (isPHIEndpoint) {
              return {
                residentId: "REDACTED",
                ...Object.keys(req.body || {}).reduce((acc, key) => {
                  acc[key] = "REDACTED";
                  return acc;
                }, {}),
              };
            }
            const endpoint = (req.originalUrl || req.url || "").split("?")[0];
            if (endpoint.includes("visitor-sign-in/submit") && req.body?.token) {
              return { ...req.body, token: "[REDACTED]" };
            }
            return req.body || null;
          })(),
          responseData: isPHIEndpoint
            ? { data: "REDACTED" }
            : responseBody || null,
          errorMessage: statusCode >= 400 ? responseBody?.message : null,
          metadata: isPHIEndpoint
            ? { phiAccess: true, residentId: residentId ? "REDACTED" : null }
            : null,
        };

        // Log asynchronously (don't wait)
        setImmediate(() => {
          auditService.createAuditLog(auditData).catch((err) => {
            console.error("Audit logging failed:", err.message);
          });
        });
      } catch (error) {
        // Silently fail - audit logging should not break the application
        console.error("Audit middleware error:", error.message);
      }
    });

    next();
  };
}

/**
 * Error audit middleware
 * Logs errors and security events
 */
function auditErrorMiddleware() {
  return async (err, req, res, next) => {
    try {
      let action = "SYSTEM_ERROR";

      // Determine action based on error status
      if (err.status === 401 || err.statusCode === 401) {
        action = "UNAUTHORIZED_ACCESS";
      } else if (err.status === 403 || err.statusCode === 403) {
        action = "ACCESS_DENIED";
      }

      const resource = inferResource(req.originalUrl || req.url);

      // Log security and error events
      setImmediate(() => {
        auditService
          .createAuditLog({
            userId: req.user?.id || null,
            tenantId: req.user?.tenantId || null,
            action,
            resource,
            method: req.method,
            endpoint: req.originalUrl || req.url,
            statusCode: err.status || err.statusCode || 500,
            req,
            errorMessage: err.message || "Unknown error",
            metadata: {
              errorName: err.name,
              errorStack:
                process.env.NODE_ENV === "development" ? err.stack : undefined,
            },
          })
          .catch((logErr) => {
            console.error("Audit logging failed:", logErr.message);
          });
      });
    } catch (error) {
      // Silently fail
      console.error("Error audit middleware error:", error.message);
    }

    // Pass error to next error handler
    next(err);
  };
}

module.exports = {
  auditMiddleware,
  auditErrorMiddleware,
};

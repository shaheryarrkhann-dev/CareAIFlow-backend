const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
require("dotenv").config();

const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth/auth.routes");
const tenantRoutes = require("./routes/tenant/tenant.routes");
const userRoutes = require("./routes/user/user.routes");
const dashboardRoutes = require("./routes/dashboard/dashboard.routes");
const embeddingRoutes = require("./routes/embedding/embedding.routes");
const formRoutes = require("./routes/form/form.routes");
const pdfRoutes = require("./routes/pdf/pdf.routes");
const outboundDeliveryRoutes = require("./routes/outbound-delivery/outbound-delivery.routes");
const auditRoutes = require("./routes/compliance/audit.routes");
const residentRoutes = require("./routes/resident/resident.routes");
const noteRoutes = require("./routes/note/note.routes");
const billingTierRoutes = require("./routes/billing/billing-tiers.routes");
const invoiceRoutes = require("./routes/billing/invoice.routes");
const claimsBillingRoutes = require("./routes/claims-billing/claims-billing.routes");
const claimsTierRoutes = require("./routes/claims-billing/claims-tier.routes");
const claimsProviderRoutes = require("./routes/claims-billing/claims-provider.routes");
const claimsExcelRoutes = require("./routes/claims-billing/claims-excel.routes");
const medicationRoutes = require("./routes/medication/medication.routes");
const marRoutes = require("./routes/medication/mar.routes");
const marGridRoutes = require("./routes/medication/mar-grid.routes");
const marExportRoutes = require("./routes/medication/mar-export.routes");
const prnRoutes = require("./routes/medication/prn-record.routes");
const vitalsRoutes = require("./routes/vitals/vitals.routes");
const carePlanRoutes = require("./routes/care-plan/care-plan.routes");
const careLibraryRoutes = require("./routes/care-plan/care-library.routes");
const ncpRoutes = require("./routes/ncp/ncp.routes");
const facilityRoutes = require("./routes/facility/facility.routes");
const staffRoutes = require("./routes/staff/staff.routes");
const appointmentRoutes = require("./routes/appointment/appointment.routes");
const birthdayRoutes = require("./routes/birthday/birthday.routes");
const fcmRoutes = require("./routes/firebase/fcm.routes");
const taskRoutes = require("./routes/task/task.routes");
const permissionsRoutes = require("./routes/role/permissions.routes");
const rolesRoutes = require("./routes/role/roles.routes");
const { apiLimiter } = require("./middlewares/rateLimit.middleware");
const {
  auditMiddleware,
  auditErrorMiddleware,
} = require("./middlewares/audit.middleware");
const swaggerSpec = require("./config/swagger");

const app = express();

// DocuSign webhook — registered FIRST before any middleware (no auth, no body parser needed)
// DocuSign posts here when envelope status changes
app.post("/api/docusign/webhook", express.json(), (req, res) => {
  console.log("[DocuSign Webhook] Handler reached");
  require("./controllers/docusign/docusign.controller").handleWebhook(req, res);
});

/** Verbose HTTP/CORS console logging (dev only, or set LOG_HTTP=true on EC2) */
const verboseHttp =
  process.env.NODE_ENV === "development" || process.env.LOG_HTTP === "true";

// APIs must always return fresh JSON, never 304 w/ empty body
app.disable("etag");
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});

// Trust proxy - enables req.ip to get real client IP through reverse proxies
// Set to 'true' to trust all proxies, or specify number of hops
app.set("trust proxy", true);

// Security middleware - configure helmet to allow CORS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration - ALLOW ALL ORIGINS (TEMPORARY for debugging)
// ⚠️ WARNING: This allows all origins. Use only for development/debugging.
// For production, restrict to specific origins for security.
if (verboseHttp) {
  console.log("🌐 CORS Configuration: ALLOWING ALL ORIGINS (permissive mode)");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (verboseHttp) {
        if (origin) {
          console.log(`🔍 CORS: Request from origin: ${origin}`);
        } else {
          console.log(`🔍 CORS: Request with no origin (allowed)`);
        }
      }

      // Allow ALL origins - dynamically sets Access-Control-Allow-Origin to the request origin
      callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "X-Folder-Password", // Required for facility/staff/resident password-protected folder access
      "X-Seed-Secret", // TEMPORARY: /api/seed routes — remove when seed API is removed
    ],
    exposedHeaders: ["Authorization"],
    credentials: true,
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
  })
);

// Optional: log each request (development or LOG_HTTP=true). Production uses morgan only.
app.use((req, res, next) => {
  if (!verboseHttp) return next();
  if (req.method === "OPTIONS") {
    console.log(
      `🔄 OPTIONS preflight: ${req.path} from origin: ${
        req.headers.origin || "none"
      }`
    );
  } else {
    console.log(
      `📨 ${req.method} ${req.path} from origin: ${
        req.headers.origin || "none"
      }`
    );
  }
  next();
});

// CORS headers are now handled entirely by the cors() middleware above
// No need for additional middleware since we're allowing all origins

// Body parser with increased limits for file uploads
// Skip JSON parsing for upload routes to avoid conflicts with multipart/form-data
app.use((req, res, next) => {
  if (
    req.path === "/api/embeddings/upload" ||
    req.path === "/api/facility/documents/upload" ||
    /^\/api\/staff\/[^/]+\/documents\/upload$/.test(req.path)
  ) {
    return next(); // Skip JSON parsing for multipart upload routes
  }
  express.json({ limit: "100mb" })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Access log: one line per request in production (skip noisy health probes)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan("combined", {
      skip: (req, res) =>
        req.url === "/health" ||
        req.url === "/favicon.ico" ||
        req.url.startsWith("/health?"),
    })
  );
}

// General rate limiting
app.use("/api/", apiLimiter);

// Audit middleware - logs all API requests
// HIPAA: PHI access is automatically logged (even GET requests)
app.use(
  "/api/",
  auditMiddleware({
    logGET: false, // Don't log read operations by default (but PHI endpoints are always logged)
    excludeEndpoints: [
      "/health",
      "/api-docs",
      "/api-docs.json",
      "/api/auth/login", // Handled in controller
      "/api/auth/logout", // Handled in controller
    ],
    onlyLogErrors: false,
  })
);

// Swagger documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "AI Onboarding API Documentation",
  })
);

// Swagger JSON endpoint
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Health check endpoint (lightweight - no DB connection needed)
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Database health check endpoint (tests DB connection)
app.get("/health/db", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: "Database connection is healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Database health check failed:", error.message);
    res.status(503).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug endpoint to check CORS origin (for troubleshooting)
app.get("/api/cors-debug", (req, res) => {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  const isAllowed = origin
    ? allowedOrigins.some((allowedOrigin) => {
        if (typeof allowedOrigin === "string") {
          return origin === allowedOrigin;
        }
        if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      })
    : null;

  res.json({
    success: true,
    origin,
    referer,
    host,
    isAllowed,
    allowedOrigins: allowedOrigins.filter((o) => typeof o === "string"),
    allowedPatterns: allowedOrigins
      .filter((o) => o instanceof RegExp)
      .map((r) => r.toString()),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      FRONTEND_URL: process.env.FRONTEND_URL,
    },
    headers: {
      origin: req.headers.origin,
      referer: req.headers.referer,
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
    },
  });
});

// API routes – public (no auth) routes first so they are not caught by /api catch-all
// TEMPORARY: seed permissions + role templates via HTTP (set SEED_API_SECRET; remove after live seed)
app.use("/api/seed", require("./routes/seed/seed.routes"));
app.use("/api/auth", authRoutes);
app.use("/api/public/visitor-sign-in", require("./routes/public/visitor-sign-in.routes"));
app.use("/api/tenants", tenantRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/embeddings", embeddingRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/pdfs", pdfRoutes);
app.use("/api/outbound-deliveries", outboundDeliveryRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/residents", residentRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/billing-tiers", billingTierRoutes);
app.use("/api/invoices", invoiceRoutes);
// Register specific claims-billing routes BEFORE generic /:id route to avoid route conflicts
app.use("/api/claims-billing/tiers", claimsTierRoutes);
app.use("/api/claims-billing/provider", claimsProviderRoutes);
app.use("/api/claims-billing/excel", claimsExcelRoutes);
app.use("/api/claims-billing", claimsBillingRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/mar", marRoutes);
app.use("/api/mar", marGridRoutes);
app.use("/api", marExportRoutes);
app.use("/api/prn", prnRoutes);
app.use("/api/vitals", vitalsRoutes);
app.use("/api/behavioral", require("./routes/behavioral/behavioral.routes"));
app.use("/api/incidents", require("./routes/incident/incident.routes"));
app.use("/api/care-plans", carePlanRoutes);
app.use("/api/care-library", careLibraryRoutes);
app.use("/api/ncp", ncpRoutes);
app.use("/api/facility", facilityRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/birthdays", birthdayRoutes);
app.use("/api/fcm", fcmRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/roles", rolesRoutes);
app.use(
  "/api/background-jobs",
  require("./routes/background-jobs/background-jobs.routes")
);
app.use("/api/compliance", require("./routes/compliance/compliance.routes")); // WAC/RCW compliance
app.use(
  "/api/document-compliance",
  require("./routes/compliance/document-compliance.routes")
); // Folder compliance catalogs & monitoring
app.use("/api/docusign", require("./routes/docusign/docusign.routes"));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Audit error middleware - logs errors and security events
app.use(auditErrorMiddleware());

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  const status = err.status || 500;
  const message = err.message || "Internal server error";

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

/**
 * Initialize database connection
 * Optimized for t3.micro RDS instance (limited connections)
 */
async function initDb() {
  try {
    // Test connection with a simple query
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connected successfully");

    // Warn if using t3.micro (limited resources)
    if (process.env.NODE_ENV === "production") {
      console.log("⚠️  RDS Instance Type: t3.micro detected");
      console.log("⚠️  Limited to ~25-50 concurrent connections");
      console.log(
        "⚠️  Consider using connection pooling with PgBouncer if experiencing connection issues"
      );
    }
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.error("❌ Error details:", err);

    // Don't exit immediately - let server start but log the issue
    // This allows health checks to report DB status
    console.warn("⚠️  Server will continue but database queries will fail");
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log("\n🔄 Shutting down gracefully...");
  await prisma.$disconnect();
  console.log("✅ Database disconnected");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = { app, initDb };

const swaggerJsdoc = require("swagger-jsdoc");

// Allow dynamic public base URL (e.g., ngrok) to avoid mixed-content/CORS when Swagger is served over HTTPS
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.NGROK_URL || "";
const DEV_BASE_URL = process.env.DEV_BASE_URL || "http://localhost:4000";
const PROD_BASE_URL = process.env.PROD_BASE_URL || "https://api.yourdomain.com";

const servers = [
  ...(PUBLIC_URL
    ? [{ url: PUBLIC_URL, description: "Public (ngrok/edge) server" }]
    : []),
  { url: DEV_BASE_URL, description: "Development server" },
  { url: PROD_BASE_URL, description: "Production server" },
];

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AI Onboarding Platform APIs",
      version: "1.0.0",
      description:
        "Multi-tenant Authentication API with JWT, RBAC, and Rate Limiting",
      contact: {
        name: "API Support",
        email: "alirazaarif@yopmail.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT access token",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "User unique identifier",
            },
            email: {
              type: "string",
              format: "email",
              description: "User email address",
            },
            name: {
              type: "string",
              description: "User full name",
            },
            role: {
              type: "string",
              enum: ["SUPER_ADMIN", "ADMIN", "STAFF", "GUARDIAN"],
              description: "User role",
            },
            isEmailVerified: {
              type: "boolean",
              description: "Email verification status",
            },
            isActive: {
              type: "boolean",
              description: "User account status",
            },
            tenantId: {
              type: "string",
              format: "uuid",
              description: "Organization/Tenant ID",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Tenant: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Tenant unique identifier",
            },
            name: {
              type: "string",
              description: "Tenant name",
            },
            slug: {
              type: "string",
              description: "Tenant slug",
            },
            isActive: {
              type: "boolean",
              description: "Tenant active status",
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "alirazaarif@yopmail.com",
            },
            password: {
              type: "string",
              format: "password",
              example: "Admin@12345",
            },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            user: {
              $ref: "#/components/schemas/User",
            },
            accessToken: {
              type: "string",
              description: "JWT access token (expires in 15 minutes)",
            },
            refreshToken: {
              type: "string",
              description: "JWT refresh token (expires in 30 days)",
            },
          },
        },
        RefreshTokenRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: {
              type: "string",
              description: "Valid refresh token",
            },
          },
        },
        RefreshTokenResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            accessToken: {
              type: "string",
            },
            refreshToken: {
              type: "string",
            },
          },
        },
        LogoutRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: {
              type: "string",
            },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
            },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["token", "newPassword"],
          properties: {
            token: {
              type: "string",
              description: "Password reset token from email",
            },
            newPassword: {
              type: "string",
              format: "password",
              description:
                "New password (min 8 chars, must include uppercase, lowercase, number, special char)",
              example: "NewSecure@123",
            },
          },
        },
        InviteUserRequest: {
          type: "object",
          required: ["email", "name", "tenantId"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "newuser@example.com",
            },
            name: {
              type: "string",
              example: "John Doe",
            },
            role: {
              type: "string",
              enum: ["STAFF", "GUARDIAN", "ADMIN"],
              default: "STAFF",
              description:
                "User role - STAFF: staff member, GUARDIAN: guardian/parent, ADMIN: organization admin",
            },
            tenantId: {
              type: "string",
              format: "uuid",
              description: "Organization ID to invite user to",
            },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Error message",
            },
          },
        },
        PaginationResponse: {
          type: "object",
          properties: {
            page: {
              type: "integer",
              description: "Current page number",
            },
            limit: {
              type: "integer",
              description: "Items per page",
            },
            total: {
              type: "integer",
              description: "Total number of items",
            },
            totalPages: {
              type: "integer",
              description: "Total number of pages",
            },
            hasNext: {
              type: "boolean",
              description: "Whether there is a next page",
            },
            hasPrev: {
              type: "boolean",
              description: "Whether there is a previous page",
            },
          },
        },
        BillingTier: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Billing tier unique identifier",
            },
            tenantId: {
              type: "string",
              format: "uuid",
              description: "Tenant ID",
            },
            name: {
              type: "string",
              description:
                "Billing tier name (e.g., 'Tier 1', 'Basic ADL Support')",
              example: "Tier 1",
            },
            description: {
              type: "string",
              nullable: true,
              description: "Notes about tier care level",
            },
            monthlyRate: {
              type: "number",
              format: "decimal",
              description: "Monthly cost",
              example: 5000.0,
            },
            isActive: {
              type: "boolean",
              description: "Whether the tier is active",
              default: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        CreateBillingTierRequest: {
          type: "object",
          required: ["name", "monthlyRate"],
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              description: "Billing tier name",
              example: "Tier 1",
            },
            description: {
              type: "string",
              maxLength: 500,
              nullable: true,
              description: "Optional description",
            },
            monthlyRate: {
              type: "number",
              format: "decimal",
              minimum: 0.01,
              maximum: 999999.99,
              description: "Monthly rate",
              example: 5000.0,
            },
            isActive: {
              type: "boolean",
              default: true,
              description: "Whether the tier is active",
            },
          },
        },
        UpdateBillingTierRequest: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              description: "Billing tier name",
            },
            description: {
              type: "string",
              maxLength: 500,
              nullable: true,
              description: "Optional description",
            },
            monthlyRate: {
              type: "number",
              format: "decimal",
              minimum: 0.01,
              maximum: 999999.99,
              description: "Monthly rate",
            },
            isActive: {
              type: "boolean",
              description: "Whether the tier is active",
            },
          },
        },
        Invoice: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Invoice unique identifier",
            },
            tenantId: {
              type: "string",
              format: "uuid",
              description: "Tenant ID",
            },
            invoiceNumber: {
              type: "string",
              description:
                "Auto-generated invoice number (e.g., INV-2025-01-001)",
              example: "INV-2025-01-001",
            },
            residentId: {
              type: "string",
              format: "uuid",
              description: "Resident UUID from Resident model",
            },
            residentName: {
              type: "string",
              nullable: true,
              description: "Cached resident name for display",
            },
            residentBillingId: {
              type: "string",
              format: "uuid",
              nullable: true,
              description: "Reference to resident billing record",
            },
            billingTierId: {
              type: "string",
              format: "uuid",
              description: "Billing tier ID",
            },
            billingTier: {
              $ref: "#/components/schemas/BillingTier",
            },
            amount: {
              type: "number",
              format: "decimal",
              description: "Invoice amount (based on tier monthly rate)",
              example: 5000.0,
            },
            month: {
              type: "string",
              format: "date-time",
              description: "Billing period (first day of month)",
            },
            status: {
              type: "string",
              enum: ["Pending", "Paid", "Overdue"],
              description: "Invoice status",
              default: "Pending",
            },
            dueDate: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Due date (calculated based on month)",
            },
            generatedBy: {
              type: "string",
              nullable: true,
              description: "User ID or 'System' who generated the invoice",
            },
            paidAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "When the invoice was marked as paid",
            },
            paidBy: {
              type: "string",
              format: "uuid",
              nullable: true,
              description: "User ID who marked the invoice as paid",
            },
            notes: {
              type: "string",
              nullable: true,
              description: "Additional notes",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        GenerateInvoiceRequest: {
          type: "object",
          required: ["month"],
          properties: {
            residentId: {
              type: "string",
              description:
                "Resident ID (optional for single resident generation)",
            },
            month: {
              type: "string",
              format: "date-time",
              description: "Month for invoice (ISO 8601 date)",
              example: "2025-01-01T00:00:00Z",
            },
          },
        },
        UpdateInvoiceStatusRequest: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["Pending", "Paid", "Overdue"],
              description: "New invoice status",
            },
            notes: {
              type: "string",
              nullable: true,
              description: "Optional notes about the status change",
            },
          },
        },
        Medication: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            residentId: { type: "string" },
            residentName: { type: "string", nullable: true },
            tenantId: { type: "string", format: "uuid" },
            name: { type: "string" },
            dosage: { type: "string" },
            frequency: { type: "string" },
            route: {
              type: "string",
              enum: ["ORAL", "INJECTION", "TOPICAL", "INHALATION", "OTHER"],
            },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time", nullable: true },
            isActive: { type: "boolean" },
            isPrn: { type: "boolean" },
            instructions: { type: "string", nullable: true },
            prescribedBy: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        MarRecord: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            medicationId: { type: "string", format: "uuid" },
            scheduleId: { type: "string", format: "uuid", nullable: true },
            residentId: { type: "string" },
            tenantId: { type: "string", format: "uuid" },
            administeredAt: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["GIVEN", "MISSED", "REFUSED", "HELD", "LATE"],
            },
            caregiverId: { type: "string", format: "uuid" },
            caregiverInitials: { type: "string", nullable: true },
            signature: { type: "string", nullable: true },
            notes: { type: "string", nullable: true },
            vitalsId: { type: "string", format: "uuid", nullable: true },
            isLocked: { type: "boolean" },
            lockedAt: { type: "string", format: "date-time", nullable: true },
            lockedBy: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        PrnRecord: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            medicationId: { type: "string", format: "uuid" },
            residentId: { type: "string" },
            tenantId: { type: "string", format: "uuid" },
            symptom: { type: "string" },
            givenAt: { type: "string", format: "date-time" },
            caregiverId: { type: "string", format: "uuid" },
            caregiverInitials: { type: "string", nullable: true },
            signature: { type: "string", nullable: true },
            notes: { type: "string", nullable: true },
            vitalsId: { type: "string", format: "uuid", nullable: true },
            response: { type: "string", nullable: true },
            responseRecordedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            physicianNotified: { type: "boolean" },
            physicianNotifiedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        VitalSign: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            residentId: { type: "string" },
            residentName: { type: "string", nullable: true },
            tenantId: { type: "string", format: "uuid" },
            bloodPressureSystolic: { type: "integer", nullable: true },
            bloodPressureDiastolic: { type: "integer", nullable: true },
            pulse: { type: "integer", nullable: true },
            temperature: { type: "number", format: "float", nullable: true },
            temperatureUnit: { type: "string", enum: ["F", "C"], default: "F" },
            oxygenSaturation: { type: "integer", nullable: true },
            weight: { type: "number", format: "float", nullable: true },
            weightUnit: { type: "string", enum: ["lbs", "kg"], default: "lbs" },
            recordedAt: { type: "string", format: "date-time" },
            recordedBy: { type: "string", format: "uuid" },
            recordedByName: { type: "string", nullable: true },
            medicationId: { type: "string", format: "uuid", nullable: true },
            notes: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: "Access token is missing or invalid",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
              example: {
                success: false,
                message: "Authentication required",
              },
            },
          },
        },
        ForbiddenError: {
          description: "Insufficient permissions",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
              example: {
                success: false,
                message: "Insufficient permissions",
              },
            },
          },
        },
        ValidationError: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
              example: {
                success: false,
                message: "Validation error (field_name)",
              },
            },
          },
        },
        RateLimitError: {
          description: "Too many requests",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
              example: {
                success: false,
                message:
                  "Too many requests from this IP, please try again later",
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "User authentication and authorization endpoints",
      },
      {
        name: "User Management",
        description: "User management operations (Admin only)",
      },
      {
        name: "Tenant Management",
        description:
          "Organization/tenant management with multi-tenancy support",
      },
      {
        name: "Embeddings",
        description:
          "PDF upload, text chunking, and vector embeddings per tenant",
      },
      {
        name: "PDF Management",
        description: "PDF template management and filled PDF retrieval",
      },
      {
        name: "AI-Powered Forms",
        description:
          "RAG-based dynamic form schema generation and tenant-isolated data storage",
      },
      {
        name: "Form Drafts",
        description: "Save and manage partial form submissions as drafts",
      },
      {
        name: "Audit",
        description:
          "Audit trail and logging management for security and compliance",
      },
      {
        name: "Medications",
        description:
          "Medication management - create, update, and manage resident medications",
      },
      {
        name: "MAR (Medication Administration Record)",
        description:
          "Record and manage medication administration with scheduling and tracking",
      },
      {
        name: "PRN (As Needed Medications)",
        description:
          "Manage PRN medications with symptom tracking and physician notifications",
      },
      {
        name: "Vitals",
        description:
          "Record and track vital signs with trends and medication integration",
      },
      {
        name: "MAR Grid & Dashboard",
        description: "MAR grid visualization and resident medication dashboard",
      },
      {
        name: "Billing Tiers",
        description:
          "Billing tier management - create, update, and manage care level pricing tiers",
      },
      {
        name: "Invoices",
        description:
          "Invoice management - generate, view, and manage monthly billing invoices",
      },
      {
        name: "Behavioral Tracking",
        description:
          "CBHS Behavioral Tracking - log, track, and analyze behavioral data with AI-powered narrative generation",
      },
      {
        name: "Nursing Care Plans",
        description:
          "Nursing Care Plan management - create, manage, and track individualized care plans with problems, goals, interventions, version control, and AI-powered problem detection",
      },
      {
        name: "Care Library",
        description:
          "Care instruction library - reusable templates for problems, goals, and interventions to standardize care planning",
      },
      {
        name: "NCP",
        description:
          "AFH Negotiated Care Plan - upload assessment PDFs, extract structured data using AI, and generate populated DOCX documents",
      },
      {
        name: "Facility",
        description:
          "Facility management - profile, documents, evacuation drills, visitor log",
      },
      {
        name: "Staff Documents",
        description:
          "Staff document management - members, folders, documents, compliance, alerts, audit history",
      },
      {
        name: "Appointments",
        description:
          "Appointment tracking - create, list, update, delete appointments linked to residents, staff, and facilities with reminders",
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/docs/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

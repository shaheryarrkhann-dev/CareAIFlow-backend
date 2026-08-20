const {
  generateFormSchema,
  getFormSchemas,
  getFormSchemaById,
} = require("../../services/ai/ai.service");
const {
  saveFormSubmission,
  getFormSubmissions,
  getAllFormSubmissions,
  getTableSchema,
  getUserFormResponse,
  updateUserFormResponse,
  deleteUserFormResponse,
} = require("../../services/form/formData.service");
const { fillAllTenantPdfTemplates } = require("../../services/pdf/pdf.service");

async function generateSchema(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.body.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { formName, description } = req.body;
    if (!formName || !formName.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "formName is required" });
    }

    const result = await generateFormSchema({
      tenantId,
      formName: formName.trim(),
      description: description?.trim(),
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Form schema generated successfully",
      formSchema: result,
    });
  } catch (err) {
    console.error("Generate schema error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate form schema",
    });
  }
}

/**
 * Get all form schemas for tenant
 * GET /api/forms/schemas
 */
async function getSchemas(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // For SUPER_ADMIN: allow querying any tenant via tenantId query param, or fetch all if no tenantId provided
    // For other roles (Admin, Staff): use tenantId from query if provided and matches user's tenant, otherwise use user's tenantId
    let tenantId;
    if (req.user.role === "SUPER_ADMIN") {
      tenantId = req.query.tenantId; // undefined if not provided = fetch all
    } else {
      // For Admin/Staff: if tenantId is provided in query, verify it matches user's tenantId
      if (req.query.tenantId) {
        if (req.query.tenantId !== req.user.tenantId) {
          return res.status(403).json({
            success: false,
            message: "Access denied: tenantId mismatch",
          });
        }
        tenantId = req.query.tenantId;
      } else {
        tenantId = req.user.tenantId;
      }
    }

    // Only require tenantId for non-SUPER_ADMIN users
    if (!tenantId && req.user.role !== "SUPER_ADMIN") {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const activeOnly = req.query.activeOnly !== "false";
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const schemas = await getFormSchemas(tenantId, activeOnly);

    // Apply pagination
    const total = schemas.length;
    const paginatedSchemas = schemas.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      count: paginatedSchemas.length,
      total: total,
      schemas: paginatedSchemas,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (err) {
    console.error("Get schemas error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve form schemas",
    });
  }
}

/**
 * Get single form schema by ID
 * GET /api/forms/schemas/:id
 */
async function getSchemaById(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // SUPER_ADMIN: can query any schema (tenantId optional)
    // Regular users: must use their own tenantId
    let tenantId;
    if (req.user.role === "SUPER_ADMIN") {
      tenantId = req.query.tenantId || null; // null means search across all tenants
    } else {
      tenantId = req.user.tenantId;
      if (!tenantId) {
        return res
          .status(400)
          .json({ success: false, message: "tenantId is required" });
      }
    }

    const { id } = req.params;
    const schema = await getFormSchemaById(tenantId, id);

    return res.status(200).json({
      success: true,
      schema,
    });
  } catch (err) {
    console.error("Get schema by ID error:", err);
    return res.status(err.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: err.message || "Failed to retrieve form schema",
    });
  }
}

/**
 * Submit form data
 * POST /api/forms/:formId/submit
 */
async function submitForm(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "User must belong to a tenant" });
    }

    const { formId } = req.params;
    const formData = req.body;

    // Get schema to validate
    const schemaRecord = await getFormSchemaById(tenantId, formId);
    if (!schemaRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Form schema not found" });
    }

    const schema = schemaRecord.schemaJson;

    // Normalize field names: convert labels to snake_case if 'name' not present
    schema.fields.forEach((field) => {
      if (!field.name) {
        field.name = field.label.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
      }
    });

    // Create a map for flexible field matching (both original and snake_case)
    const fieldMap = {};
    schema.fields.forEach((field) => {
      const snakeCaseName = field.name
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase();
      fieldMap[field.name] = field;
      fieldMap[snakeCaseName] = field;
      fieldMap[field.label] = field;
    });

    // Basic validation: check required fields (flexible matching)
    const missingFields = schema.fields
      .filter((f) => f.required)
      .filter((f) => {
        const snakeCaseName = f.name
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase();
        return (
          !formData[f.name] && !formData[snakeCaseName] && !formData[f.label]
        );
      })
      .map((f) => f.label);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        missingFields,
      });
    }

    // Normalize formData keys to match schema field names
    const normalizedFormData = {};
    Object.keys(formData).forEach((key) => {
      const field = fieldMap[key];
      if (field) {
        normalizedFormData[field.name] = formData[key];
      } else {
        normalizedFormData[key] = formData[key];
      }
    });

    // Save submission
    const result = await saveFormSubmission({
      tenantId,
      userId: req.user.id,
      formId,
      schema,
      formData: normalizedFormData,
    });

    // Automatically fill all PDF templates with the submitted form data
    let pdfFillResult = null;
    try {
      // Use submission ID as the unique identifier for PDFs
      // This way each form submission has its own folder
      const pdfTargetSubmissionId = result.id;

      console.log(
        `[PDF-FILL] Auto-filling PDF templates for submission ${pdfTargetSubmissionId} in tenant ${tenantId}`
      );
      pdfFillResult = await fillAllTenantPdfTemplates({
        tenantId,
        userId: pdfTargetSubmissionId,
        formData: normalizedFormData,
      });
      console.log(
        `[PDF-FILL] Successfully filled ${pdfFillResult.successfulFills} PDFs`
      );
    } catch (error) {
      console.error("[PDF-FILL] Failed to fill PDFs:", error.message);
      // Don't fail the form submission if PDF filling fails
    }

    return res.status(201).json({
      success: true,
      message: "Form submitted successfully",
      submissionId: result.id,
      tableName: result.tableName,
      pdfGeneration: pdfFillResult
        ? {
            success: true,
            totalTemplates: pdfFillResult.totalTemplates,
            successfulFills: pdfFillResult.successfulFills,
            failedFills: pdfFillResult.failedFills,
            filledPdfs: pdfFillResult.filledPdfs,
          }
        : null,
    });
  } catch (err) {
    console.error("Submit form error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to submit form",
    });
  }
}

/**
 * Get form responses/submissions
 * GET /api/forms/:formId/responses (specific form)
 * GET /api/forms/responses (all forms)
 */
async function getResponses(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    let { formId } = req.params;
    // Treat string "null" as if formId is not provided
    if (formId === "null" || formId === "undefined") {
      formId = undefined;
    }
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    // Determine tenantId first
    let tenantId;
    if (req.user.role === "SUPER_ADMIN") {
      // SUPER_ADMIN can specify tenantId in query, or use their own, or null for all tenants
      tenantId = req.query.tenantId || req.user.tenantId || null;
    } else {
      tenantId = req.user.tenantId;
    }
    if (!tenantId && req.user.role !== "SUPER_ADMIN") {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    // If formId is not provided but tenantId exists, get formId from tenant (tenant has only 1 form)
    if (!formId && tenantId) {
      try {
        const schemas = await getFormSchemas(tenantId, true); // Get active forms only
        if (schemas.length === 0) {
          // Return empty array instead of 404 when no forms exist
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
            pagination: {
              limit,
              offset,
              total: 0,
            },
            note: `No active forms found for tenant ${tenantId}. No submissions available.`,
          });
        }
        if (schemas.length > 1) {
          return res.status(400).json({
            success: false,
            message:
              "Multiple forms found for this tenant. Please specify formId.",
          });
        }
        // Tenant has exactly one form, use its ID
        formId = schemas[0].id;
        console.log(
          `[getResponses] Auto-fetched formId: ${formId} for tenantId: ${tenantId}`
        );
      } catch (err) {
        console.error("Error fetching form schema:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to retrieve form schema for tenant",
        });
      }
    }

    // If formId is provided (or was auto-fetched), get responses for specific form
    if (formId) {
      // Guardian can only see their own submissions, STAFF/ADMIN/SUPER_ADMIN can see all
      const userId = req.user.role === "GUARDIAN" ? req.user.id : null;

      console.log(
        `[getResponses] FormId-specific branch - Role: ${req.user.role}, userId: ${userId}, formId: ${formId}, tenantId: ${tenantId}`
      );

      const result = await getFormSubmissions({
        tenantId,
        formId,
        userId,
        limit,
        offset,
      });

      const response = {
        success: true,
        count: result.count,
        data: result.data,
        pagination: {
          limit,
          offset,
          total: result.count,
        },
      };

      // Include tableName if single table, or tables if multiple
      if (result.tableName) {
        response.tableName = result.tableName;
      } else if (result.tables) {
        response.tables = result.tables;
        response.note = tenantId
          ? `Showing responses for form ${formId} in tenant ${tenantId}`
          : `Showing responses for form ${formId} across all tenants`;
      }

      return res.status(200).json(response);
    }

    // If formId is NOT provided, get all responses across all forms
    // SUPER_ADMIN with no tenantId gets ALL data from all tenants
    // SUPER_ADMIN with tenantId gets data for that tenant
    // Other roles get data for their tenant only
    // Note: tenantId is already determined above, but we may need to adjust for this branch
    if (req.user.role === "SUPER_ADMIN") {
      tenantId = req.query.tenantId || null; // null means all tenants
    } else {
      tenantId = req.user.tenantId;
      if (!tenantId) {
        return res
          .status(400)
          .json({ success: false, message: "tenantId is required" });
      }
    }

    // STAFF/GUARDIAN can only see their own submissions
    const userId = req.user.role === "GUARDIAN" ? req.user.id : null;

    console.log(
      `[getResponses] All forms branch - Role: ${req.user.role}, userId: ${userId}, tenantId: ${tenantId}`
    );

    const result = await getAllFormSubmissions({
      tenantId,
      userId,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      count: result.count,
      data: result.data,
      tables: result.tables,
      pagination: {
        limit,
        offset,
        total: result.count,
      },
      note: tenantId
        ? `Showing responses for tenant ${tenantId}`
        : "Showing responses from all tenants",
    });
  } catch (err) {
    console.error("Get responses error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve form responses",
    });
  }
}

/**
 * Get table schema/structure for a form
 * GET /api/forms/:formId/table-schema
 */
async function getFormTableSchema(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { formId } = req.params;
    const schema = await getTableSchema(tenantId, formId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        message: "Form table not found. No submissions yet.",
      });
    }

    return res.status(200).json({
      success: true,
      schema,
    });
  } catch (err) {
    console.error("Get table schema error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve table schema",
    });
  }
}

/**
 * Get specific user's form response
 * GET /api/forms/:formId/user/:userId/response
 */
async function getUserResponse(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { formId, userId } = req.params;

    // Validate that userId is provided
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }

    // Authorization check: STAFF/GUARDIAN can only view their own responses
    if (
      (req.user.role === "STAFF" || req.user.role === "GUARDIAN") &&
      req.user.id !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view other users' responses",
      });
    }

    const result = await getUserFormResponse({
      tenantId,
      formId,
      userId,
    });

    return res.status(200).json({
      success: true,
      count: result.count,
      data: result.data,
      tableName: result.tableName,
      userId,
    });
  } catch (err) {
    console.error("Get user response error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve user response",
    });
  }
}

/**
 * Update specific user's form response
 * PUT /api/forms/:formId/user/:userId/response/:responseId
 */
async function updateUserResponse(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { formId, userId, responseId } = req.params;
    const formData = req.body;

    // Validate parameters
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }
    if (!responseId) {
      return res
        .status(400)
        .json({ success: false, message: "responseId is required" });
    }

    // Authorization check: STAFF/GUARDIAN can only update their own responses
    if (
      (req.user.role === "STAFF" || req.user.role === "GUARDIAN") &&
      req.user.id !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update other users' responses",
      });
    }

    // Get schema to validate
    const schemaRecord = await getFormSchemaById(tenantId, formId);
    if (!schemaRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Form schema not found" });
    }

    const schema = schemaRecord.schemaJson;

    // Normalize field names
    schema.fields.forEach((field) => {
      if (!field.name) {
        field.name = field.label.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
      }
    });

    // Create a map for flexible field matching
    const fieldMap = {};
    schema.fields.forEach((field) => {
      const snakeCaseName = field.name
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase();
      fieldMap[field.name] = field;
      fieldMap[snakeCaseName] = field;
      fieldMap[field.label] = field;
    });

    // Normalize formData keys to match schema field names
    const normalizedFormData = {};
    Object.keys(formData).forEach((key) => {
      const field = fieldMap[key];
      if (field) {
        normalizedFormData[field.name] = formData[key];
      } else {
        normalizedFormData[key] = formData[key];
      }
    });

    // Update the response
    const result = await updateUserFormResponse({
      tenantId,
      formId,
      userId,
      responseId,
      schema,
      formData: normalizedFormData,
    });

    return res.status(200).json({
      success: true,
      message: "Response updated successfully",
      data: result.data,
      tableName: result.tableName,
    });
  } catch (err) {
    console.error("Update user response error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update user response",
    });
  }
}

/**
 * Delete specific user's form response
 * DELETE /api/forms/:formId/user/:userId/response/:responseId
 */
async function deleteUserResponse(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { formId, userId, responseId } = req.params;

    // Validate parameters
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }
    if (!responseId) {
      return res
        .status(400)
        .json({ success: false, message: "responseId is required" });
    }

    // Authorization check: STAFF/GUARDIAN can only delete their own responses
    // ADMIN can delete any response in their tenant
    if (
      (req.user.role === "STAFF" || req.user.role === "GUARDIAN") &&
      req.user.id !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete other users' responses",
      });
    }

    // Delete the response
    const result = await deleteUserFormResponse({
      tenantId,
      formId,
      userId,
      responseId,
    });

    return res.status(200).json({
      success: true,
      message: "Response deleted successfully",
      deleted: result.deleted,
      deletedData: result.data,
      tableName: result.tableName,
    });
  } catch (err) {
    console.error("Delete user response error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete user response",
    });
  }
}

/**
 * Delete a form schema by ID
 * DELETE /api/forms/schemas/:id
 * Only ADMIN and SUPER_ADMIN can delete form schemas
 * Note: This will also delete the dynamic table and all form responses
 */
async function deleteFormSchema(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { id } = req.params;

    // Get the form schema first to verify it exists
    const formSchema = await getFormSchemaById(tenantId, id);

    if (!formSchema) {
      return res.status(404).json({
        success: false,
        message: "Form schema not found",
      });
    }

    // Delete the form schema
    const prisma = require("../../lib/prisma");
    await prisma.formSchema.delete({
      where: { id },
    });

    // Try to drop the dynamic table if it exists
    const tableName = `tenant_${tenantId.replace(/-/g, "_")}_form_${id.replace(
      /-/g,
      "_"
    )}`;

    try {
      const tableExists = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = '${tableName}'
        );
      `);

      if (tableExists[0].exists) {
        await prisma.$executeRawUnsafe(
          `DROP TABLE IF EXISTS "${tableName}" CASCADE`
        );
        console.log(`[FORM-DELETE] Dropped dynamic table: ${tableName}`);
      }
    } catch (tableError) {
      console.error(
        "[FORM-DELETE] Could not drop dynamic table:",
        tableError.message
      );
      // Don't fail the delete operation if table drop fails
    }

    return res.status(200).json({
      success: true,
      message: "Form schema deleted successfully",
      deletedForm: {
        id: formSchema.id,
        formName: formSchema.formName,
        description: formSchema.description,
      },
      tableName,
    });
  } catch (err) {
    console.error("Delete form schema error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete form schema",
    });
  }
}

module.exports = {
  generateSchema,
  getSchemas,
  getSchemaById,
  submitForm,
  getResponses,
  getFormTableSchema,
  getUserResponse,
  updateUserResponse,
  deleteUserResponse,
  deleteFormSchema,
};

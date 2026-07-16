/**
 * @swagger
 * /api/forms/generate-schema:
 *   post:
 *     summary: Generate form schema from PDF embeddings using AI
 *     description: Analyzes tenant's embedded PDF data and generates a dynamic form schema using OpenAI. Requires PDF uploads first.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - formName
 *             properties:
 *               formName:
 *                 type: string
 *                 example: Employee Onboarding Form
 *                 description: Name of the form to generate
 *               description:
 *                 type: string
 *                 example: Form for collecting new employee information
 *                 description: Optional description
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. SUPER_ADMIN can target a specific tenant.
 *     responses:
 *       201:
 *         description: Form schema generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 formSchema:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     schema:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/forms/schemas:
 *   get:
 *     summary: Get all form schemas for tenant
 *     description: Retrieve all AI-generated form schemas for the authenticated user's tenant with optional pagination
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter active schemas only
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of form schemas with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 20
 *                   description: Number of items in current response
 *                 total:
 *                   type: integer
 *                   example: 75
 *                   description: Total number of items available
 *                 schemas:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 100
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     total:
 *                       type: integer
 *                       example: 75
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/forms/schemas/{id}:
 *   get:
 *     summary: Get single form schema by ID
 *     description: Retrieve a specific form schema with full field definitions
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Form schema details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 schema:
 *                   type: object
 *       404:
 *         description: Schema not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/forms/schemas/{id}:
 *   delete:
 *     summary: Delete form schema
 *     description: |
 *       Permanently delete an AI-generated form schema and all associated data (form responses, dynamic table).
 *       Only ADMIN and SUPER_ADMIN can delete form schemas.
 *       WARNING - This action cannot be undone and will delete all form submissions!
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID to delete
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can target specific tenant.
 *     responses:
 *       200:
 *         description: Form schema deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Form schema deleted successfully
 *                 deleted:
 *                   type: object
 *                   properties:
 *                     schemaId:
 *                       type: string
 *                       format: uuid
 *                     formName:
 *                       type: string
 *                       example: Employee Onboarding Form
 *                     tableName:
 *                       type: string
 *                       example: tenant_abc123_form_xyz789
 *                       description: Name of the dynamic table that was dropped
 *                     tableDropped:
 *                       type: boolean
 *                       example: true
 *                       description: Whether the dynamic table was successfully dropped
 *       404:
 *         description: Form schema not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Form schema not found
 *       403:
 *         description: Access denied - only ADMIN and SUPER_ADMIN can delete form schemas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Insufficient permissions
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /api/forms/{formId}/submit:
 *   post:
 *     summary: Submit form data
 *     description: Submit filled form data. Creates dynamic tenant table if needed. All authenticated users can submit.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Form field values (dynamic based on schema)
 *             example:
 *               employee_name: John Doe
 *               joining_date: "2025-01-15"
 *               department: IT
 *     responses:
 *       201:
 *         description: Form submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 submissionId:
 *                   type: string
 *                 tableName:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Form schema not found
 */

/**
 * @swagger
 * /api/forms/responses:
 *   get:
 *     summary: Get all form submissions across all forms
 *     description: |
 *       Retrieve form submissions across all forms. SUPER_ADMIN without tenantId gets ALL data from ALL tenants. 
 *       SUPER_ADMIN with tenantId gets data for specific tenant. Other roles get data for their tenant only.
 *       STAFF/GUARDIAN see only their own submissions.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can filter by tenant or omit for all tenants.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: All form submissions across multiple forms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 100
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       tenant_id:
 *                         type: string
 *                       user_id:
 *                         type: string
 *                       form_id:
 *                         type: string
 *                       source_table:
 *                         type: string
 *                         example: tenant_abc_form_xyz
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 tables:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["tenant_abc_form_xyz", "tenant_def_form_123"]
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                 note:
 *                   type: string
 *                   example: "Showing responses from all tenants"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /api/forms/{formId}/responses:
 *   get:
 *     summary: Get form submissions for specific form
 *     description: Retrieve form submissions for a specific form. STAFF see only their own, ADMIN/SUPER_ADMIN see all for tenant.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: Form submissions for specific form
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 12
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 tableName:
 *                   type: string
 *                   example: tenant_abc_form_xyz
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/forms/{formId}/user/{userId}/response:
 *   get:
 *     summary: Get specific user's form response
 *     description: Retrieve form submissions for a specific user. STAFF/GUARDIAN can only view their own responses, ADMIN/SUPER_ADMIN can view any user's response in their tenant.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID whose response to retrieve
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *     responses:
 *       200:
 *         description: User's form submissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 tableName:
 *                   type: string
 *                   example: tenant_abc123_form_def456
 *                 userId:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Missing or invalid parameters
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Insufficient permissions to view this user's response
 *
 * /api/forms/{formId}/user/{userId}/response/{responseId}:
 *   put:
 *     summary: Update specific user's form response
 *     description: |
 *       Update a specific form response. STAFF/GUARDIAN can only update their own responses, 
 *       ADMIN/SUPER_ADMIN can update any user's response in their tenant.
 *       Supports partial updates - only fields provided in request body will be updated.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID whose response to update
 *       - in: path
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Response/submission ID to update
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can specify tenant.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Updated form fields (partial update supported)
 *             example:
 *               employee_name: Jane Smith Updated
 *               department: Engineering
 *               salary: 75000
 *     responses:
 *       200:
 *         description: Response updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Response updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     tenant_id:
 *                       type: string
 *                     user_id:
 *                       type: string
 *                     form_id:
 *                       type: string
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                 tableName:
 *                   type: string
 *                   example: tenant_abc123_form_def456
 *       400:
 *         description: Missing or invalid parameters / No valid fields to update
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Insufficient permissions to update this response
 *       404:
 *         description: Response not found or access denied
 *   delete:
 *     summary: Delete specific user's form response
 *     description: |
 *       Delete a specific form response permanently. STAFF/GUARDIAN can only delete their own responses, 
 *       ADMIN/SUPER_ADMIN can delete any user's response in their tenant.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID whose response to delete
 *       - in: path
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Response/submission ID to delete
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can specify tenant.
 *     responses:
 *       200:
 *         description: Response deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Response deleted successfully
 *                 deleted:
 *                   type: boolean
 *                   example: true
 *                 deletedData:
 *                   type: object
 *                   description: The deleted response data
 *                 tableName:
 *                   type: string
 *                   example: tenant_abc123_form_def456
 *       400:
 *         description: Missing or invalid parameters
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Insufficient permissions to delete this response
 *       404:
 *         description: Response not found or access denied
 */

/**
 * @swagger
 * /api/forms/{formId}/table-schema:
 *   get:
 *     summary: Get database table schema for form
 *     description: View the dynamically created table structure. Admin only.
 *     tags: [AI-Powered Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Table schema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 schema:
 *                   type: object
 *       404:
 *         description: Table not found (no submissions yet)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/forms/{formId}/draft:
 *   post:
 *     summary: Save form draft
 *     description: Save partial/incomplete form data as a draft. No validation required. Users can only save drafts for their own account.
 *     tags: [Form Drafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Partial form data (any fields)
 *             example:
 *               employee_name: Jane Smith
 *               department: HR
 *     responses:
 *       201:
 *         description: Draft saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Draft saved successfully
 *                 draft:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     formId:
 *                       type: string
 *                       format: uuid
 *                     draftData:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Form schema not found
 */

/**
 * @swagger
 * /api/forms/{formId}/drafts:
 *   get:
 *     summary: Get user's drafts for a specific form
 *     description: Retrieve all drafts saved by the current user for a specific form with optional pagination
 *     tags: [Form Drafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Form schema ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of drafts with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 10
 *                   description: Number of items in current response
 *                 total:
 *                   type: integer
 *                   example: 35
 *                   description: Total number of items available
 *                 drafts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       formId:
 *                         type: string
 *                         format: uuid
 *                       formName:
 *                         type: string
 *                       formDescription:
 *                         type: string
 *                       draftData:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/forms/drafts:
 *   get:
 *     summary: Get all user's drafts (all forms)
 *     description: Retrieve all drafts saved by the current user across all forms with optional pagination
 *     tags: [Form Drafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of all user drafts with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 20
 *                   description: Number of items in current response
 *                 total:
 *                   type: integer
 *                   example: 50
 *                   description: Total number of items available
 *                 drafts:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/forms/{formId}/draft/{draftId}:
 *   get:
 *     summary: Get specific draft by ID
 *     description: Retrieve a specific draft with full schema and data. Users can only access their own drafts.
 *     tags: [Form Drafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: draftId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Draft details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 draft:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     formId:
 *                       type: string
 *                       format: uuid
 *                     formName:
 *                       type: string
 *                     formSchema:
 *                       type: object
 *                       description: Full form schema for rendering
 *                     draftData:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Draft not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   put:
 *     summary: Update existing draft
 *     description: Update draft data. Users can only update their own drafts.
 *     tags: [Form Drafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: draftId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Updated partial form data
 *             example:
 *               employee_name: Jane Doe Updated
 *               department: Engineering
 *               joining_date: "2025-02-01"
 *     responses:
 *       200:
 *         description: Draft updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 draft:
 *                   type: object
 *       404:
 *         description: Draft not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   delete:
 *     summary: Delete draft
 *     description: Delete a saved draft. Users can only delete their own drafts.
 *     tags: [Form Drafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: draftId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Draft deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Draft not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */


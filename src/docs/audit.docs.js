/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: Audit trail and logging management
 */

/**
 * @swagger
 * /api/audit/logs:
 *   get:
 *     summary: Get audit logs with filtering and pagination
 *     description: Retrieve audit logs with optional filters. SUPER_ADMIN can see all logs, ADMIN can only see logs from their tenant.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by tenant ID (SUPER_ADMIN only)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, TOKEN_REFRESH, PASSWORD_RESET_REQUEST, PASSWORD_RESET_SUCCESS, EMAIL_VERIFICATION, USER_CREATED, USER_UPDATED, USER_DELETED, USER_INVITED, USER_ACTIVATED, USER_DEACTIVATED, TENANT_CREATED, TENANT_UPDATED, TENANT_DELETED, TENANT_ACTIVATED, TENANT_DEACTIVATED, FORM_CREATED, FORM_UPDATED, FORM_DELETED, FORM_SUBMITTED, FORM_DRAFT_SAVED, FORM_DRAFT_DELETED, PDF_UPLOADED, PDF_GENERATED, PDF_DOWNLOADED, PDF_DELETED, PDF_TEMPLATE_CREATED, PDF_TEMPLATE_UPDATED, PDF_TEMPLATE_DELETED, EMBEDDING_CREATED, EMBEDDING_DELETED, EMBEDDING_QUERIED, SYSTEM_ERROR, ACCESS_DENIED, UNAUTHORIZED_ACCESS]
 *         description: Filter by action type
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource type (e.g., "user", "tenant", "form", "pdf")
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date onwards
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs up to this date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Number of logs per page (max 100)
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (requires ADMIN or SUPER_ADMIN role)
 */

/**
 * @swagger
 * /api/audit/logs/{id}:
 *   get:
 *     summary: Get a specific audit log by ID
 *     description: Retrieve details of a single audit log entry
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Audit log ID
 *     responses:
 *       200:
 *         description: Audit log retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/AuditLog'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Audit log not found
 */

/**
 * @swagger
 * /api/audit/stats:
 *   get:
 *     summary: Get audit log statistics
 *     description: Retrieve aggregated statistics about audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by tenant ID (SUPER_ADMIN only)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter stats from this date onwards
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter stats up to this date
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalLogs:
 *                       type: integer
 *                       example: 1523
 *                     byAction:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     byResource:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           resource:
 *                             type: string
 *                           count:
 *                             type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */

/**
 * @swagger
 * /api/audit/user/{userId}:
 *   get:
 *     summary: Get audit logs for a specific user
 *     description: Retrieve all audit logs associated with a specific user
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date onwards
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs up to this date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Number of logs per page (max 100)
 *     responses:
 *       200:
 *         description: User audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /api/audit/security-events:
 *   get:
 *     summary: Get security-related audit events
 *     description: Retrieve audit logs for security events like failed logins, unauthorized access, etc.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by tenant ID (SUPER_ADMIN only)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter events from this date onwards
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter events up to this date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Number of events per page (max 100)
 *     responses:
 *       200:
 *         description: Security events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuditLog:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the audit log
 *         userId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: ID of the user who performed the action (null for unauthenticated actions)
 *         tenantId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: ID of the tenant associated with the action (null for system-wide actions)
 *         action:
 *           type: string
 *           enum: [LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, TOKEN_REFRESH, PASSWORD_RESET_REQUEST, PASSWORD_RESET_SUCCESS, EMAIL_VERIFICATION, USER_CREATED, USER_UPDATED, USER_DELETED, USER_INVITED, USER_ACTIVATED, USER_DEACTIVATED, TENANT_CREATED, TENANT_UPDATED, TENANT_DELETED, TENANT_ACTIVATED, TENANT_DEACTIVATED, FORM_CREATED, FORM_UPDATED, FORM_DELETED, FORM_SUBMITTED, FORM_DRAFT_SAVED, FORM_DRAFT_DELETED, PDF_UPLOADED, PDF_GENERATED, PDF_DOWNLOADED, PDF_DELETED, PDF_TEMPLATE_CREATED, PDF_TEMPLATE_UPDATED, PDF_TEMPLATE_DELETED, EMBEDDING_CREATED, EMBEDDING_DELETED, EMBEDDING_QUERIED, SYSTEM_ERROR, ACCESS_DENIED, UNAUTHORIZED_ACCESS]
 *           description: Type of action performed
 *         resource:
 *           type: string
 *           description: Resource affected (e.g., "user", "tenant", "form", "pdf")
 *         resourceId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: ID of the affected resource
 *         method:
 *           type: string
 *           nullable: true
 *           description: HTTP method (GET, POST, PUT, DELETE, etc.)
 *         endpoint:
 *           type: string
 *           nullable: true
 *           description: API endpoint called
 *         statusCode:
 *           type: integer
 *           nullable: true
 *           description: HTTP status code
 *         ipAddress:
 *           type: string
 *           nullable: true
 *           description: IP address of the requester
 *         userAgent:
 *           type: string
 *           nullable: true
 *           description: User agent string
 *         requestData:
 *           type: object
 *           nullable: true
 *           description: Sanitized request payload (sensitive data removed)
 *         responseData:
 *           type: object
 *           nullable: true
 *           description: Sanitized response data
 *         errorMessage:
 *           type: string
 *           nullable: true
 *           description: Error message if action failed
 *         duration:
 *           type: integer
 *           nullable: true
 *           description: Request duration in milliseconds
 *         metadata:
 *           type: object
 *           nullable: true
 *           description: Additional metadata
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the log was created
 *       example:
 *         id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         userId: "user-123-456"
 *         tenantId: "tenant-789-012"
 *         action: "LOGIN_SUCCESS"
 *         resource: "auth"
 *         resourceId: null
 *         method: "POST"
 *         endpoint: "/api/auth/login"
 *         statusCode: 200
 *         ipAddress: "192.168.1.100"
 *         userAgent: "Mozilla/5.0..."
 *         requestData: { "email": "user@example.com", "password": "[REDACTED]" }
 *         responseData: { "success": true }
 *         errorMessage: null
 *         duration: 234
 *         metadata: { "loginMethod": "password" }
 *         createdAt: "2025-10-28T12:34:56.789Z"
 */

module.exports = {};


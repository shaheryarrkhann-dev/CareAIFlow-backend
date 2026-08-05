/**
 * @swagger
 * tags:
 *   name: Staff Documents
 *   description: "Staff document management - members, folders, documents, compliance, alerts, audit history"
 */

/**
 * @swagger
 * /api/staff:
 *   get:
 *     summary: List staff members
 *     description: "List staff members with document management. Paginated. Query: page, limit, facilityId, search. Roles: ADMIN, SUPER_ADMIN, STAFF (tenant-scoped)."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: facilityId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff list retrieved successfully
 *       401:
 *         description: Unauthorized
 *
 *   post:
 *     summary: Create staff member
 *     description: "Add a user (role STAFF) to staff document management. Roles: ADMIN, SUPER_ADMIN."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Staff member created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/available-users:
 *   get:
 *     summary: Get available staff users
 *     description: "Get users with role STAFF not yet linked as StaffMembers (for create dropdown). Roles: ADMIN, SUPER_ADMIN."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available users retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/compliance-summary:
 *   get:
 *     summary: Get compliance summary
 *     description: "List all staff with compliance status for dashboard. Roles: ADMIN, SUPER_ADMIN, STAFF."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance summary retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/alerts:
 *   get:
 *     summary: Get document alerts
 *     description: "Get staff document alerts (expired / expiring within 30 days). Roles: ADMIN, SUPER_ADMIN, STAFF."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/audit-history:
 *   get:
 *     summary: Get staff audit history
 *     description: "Get staff document audit logs. Query: action, resource, startDate, endDate, page, limit. Roles: ADMIN, SUPER_ADMIN."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Audit history retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/{id}:
 *   get:
 *     summary: Get staff member by ID
 *     description: "Get staff member details. Roles: ADMIN, SUPER_ADMIN, STAFF."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Staff member retrieved successfully
 *       404:
 *         description: Staff member not found
 *       401:
 *         description: Unauthorized
 *
 *   delete:
 *     summary: Delete staff member
 *     description: "Remove staff member from document management. Roles: ADMIN, SUPER_ADMIN."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Staff member removed successfully
 *       404:
 *         description: Staff member not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/{id}/compliance:
 *   get:
 *     summary: Get staff compliance status
 *     description: "Get document compliance status for a staff member. Returns COMPLIANT, EXPIRING_SOON, or NON_COMPLIANT."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Compliance status retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/{id}/folders:
 *   get:
 *     summary: Get folder tree
 *     description: "Get staff document folder tree."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Folder tree retrieved successfully
 *       401:
 *         description: Unauthorized
 *
 *   post:
 *     summary: Create folder
 *     description: "Create a staff document folder."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               parentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Folder created successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/{id}/documents:
 *   get:
 *     summary: List documents
 *     description: "List staff documents. Query: folderId, documentType, page, limit."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: documentType
 *         schema:
 *           type: string
 *           enum: [LICENSE, CERTIFICATION, TRAINING]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/staff/{id}/documents/upload:
 *   post:
 *     summary: Upload document
 *     description: "Upload staff document (multipart). Form fields: file, documentType (LICENSE|CERTIFICATION|TRAINING), folderId?, expirationDate?."
 *     tags: [Staff Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - documentType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               documentType:
 *                 type: string
 *                 enum: [LICENSE, CERTIFICATION, TRAINING]
 *               folderId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               expirationDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * tags:
 *   name: Facility
 *   description: "Facility management - profile, documents, evacuation drills, visitor log"
 */

/**
 * @swagger
 * /api/facility/profile:
 *   get:
 *     summary: Get facility profile
 *     description: "Get facility profile for current tenant. Roles: ADMIN, STAFF (tenant-scoped), SUPER_ADMIN (with tenantId)."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Facility profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 facility:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     tenantId:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     licenseNumber:
 *                       type: string
 *                       nullable: true
 *                     address:
 *                       type: string
 *                       nullable: true
 *                     capacity:
 *                       type: integer
 *                       nullable: true
 *                     licenseExpirationDate:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                     profilePhotoUrl:
 *                       type: string
 *                       nullable: true
 *                     profilePhotoDisplayUrl:
 *                       type: string
 *                       nullable: true
 *                       description: Present on GET when photo is available (S3 proxy or external URL)
 *                     contactInformation:
 *                       type: string
 *                       nullable: true
 *                       description: Main contact phone (7-15 digits; optional +, spaces, dashes, parentheses)
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/profile:
 *   put:
 *     summary: Update facility profile
 *     description: "Update facility profile. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               licenseNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               capacity:
 *                 type: integer
 *               licenseExpirationDate:
 *                 type: string
 *                 format: date
 *               profilePhotoUrl:
 *                 type: string
 *                 nullable: true
 *               contactInformation:
 *                 type: string
 *                 nullable: true
 *                 description: Contact phone only
 *     responses:
 *       200:
 *         description: Facility profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/audit-history:
 *   get:
 *     summary: Get facility audit history
 *     description: "Get facility-specific audit logs (profile, folders, documents, drills, visitors). Query: action, resource, startDate, endDate, page, limit."
 *     tags: [Facility]
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
 * /api/facility/folders:
 *   get:
 *     summary: Get folder tree
 *     description: Get facility document folder tree.
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Folder tree retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/folders:
 *   post:
 *     summary: Create folder
 *     description: "Create a new document folder. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/documents:
 *   get:
 *     summary: List documents
 *     description: List facility documents with optional folder filter and pagination.
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *           format: uuid
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
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/documents/upload:
 *   post:
 *     summary: Upload document
 *     description: "Upload a document to facility storage. Max 50MB. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folderId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       413:
 *         description: File too large (max 50MB)
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/drills:
 *   get:
 *     summary: List evacuation drills
 *     description: List evacuation drills with optional drillType filter and pagination.
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: drillType
 *         schema:
 *           type: string
 *           enum: [REGULAR, ANNUAL_FULL]
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
 *         description: Drills retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/drills:
 *   post:
 *     summary: Create evacuation drill
 *     description: "Schedule a new evacuation drill. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - drillType
 *               - scheduledDate
 *             properties:
 *               drillType:
 *                 type: string
 *                 enum: [REGULAR, ANNUAL_FULL]
 *               scheduledDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Drill created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/drills/compliance:
 *   get:
 *     summary: Get drill compliance status
 *     description: Get compliance status for regular (60-day) and annual full evacuation drills.
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance status retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/drills/alerts:
 *   get:
 *     summary: Get drill alerts
 *     description: Get upcoming and overdue drill alerts for the facility.
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Drill alerts retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/drills/{id}/complete:
 *   patch:
 *     summary: Complete evacuation drill
 *     description: "Mark a drill as completed. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
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
 *             properties:
 *               completedDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Drill completed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Drill not found
 */

/**
 * @swagger
 * /api/facility/visitors:
 *   get:
 *     summary: List visitors
 *     description: List visitor log entries with optional filters (residentId, startDate, endDate, activeOnly) and pagination.
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *           format: uuid
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
 *         name: activeOnly
 *         schema:
 *           type: boolean
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
 *         description: Visitors retrieved successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/visitors/check-in:
 *   post:
 *     summary: Check in visitor
 *     description: "Check in a visitor. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - visitorName
 *             properties:
 *               visitorName:
 *                 type: string
 *               residentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Visitor checked in successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/facility/visitors/{id}/check-out:
 *   patch:
 *     summary: Check out visitor
 *     description: "Check out a visitor. Roles: ADMIN, STAFF, SUPER_ADMIN."
 *     tags: [Facility]
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
 *         description: Visitor checked out successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Visitor not found
 */

/**
 * @swagger
 * /api/facility/visitors/export:
 *   get:
 *     summary: Export visitor log
 *     description: "Export visitor log as CSV. Optional filters: residentId, startDate, endDate."
 *     tags: [Facility]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *           format: uuid
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
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 */

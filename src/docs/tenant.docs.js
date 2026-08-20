/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Create new organization
 *     description: Create a new tenant/organization. Only SUPER_ADMIN can create tenants.
 *     tags: [Tenant Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 example: Acme Corporation
 *                 description: Organization display name
 *               slug:
 *                 type: string
 *                 example: acme-corp
 *                 description: URL-friendly unique identifier (lowercase, numbers, hyphens only)
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tenant:
 *                   $ref: '#/components/schemas/Tenant'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *   get:
 *     summary: Get all organizations
 *     description: Get list of organizations. SUPER_ADMIN sees all, others see only their own.
 *     tags: [Tenant Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *           default: 10
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in organization name or slug
 *     responses:
 *       200:
 *         description: List of organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tenants:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tenant'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/tenants/{id}:
 *   get:
 *     summary: Get organization by ID
 *     description: Get detailed information about a specific organization
 *     tags: [Tenant Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tenant:
 *                   $ref: '#/components/schemas/Tenant'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Organization not found
 *   patch:
 *     summary: Update organization
 *     description: Update organization details. SUPER_ADMIN can update any, ADMIN can update own.
 *     tags: [Tenant Management]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Acme Corporation Updated
 *               slug:
 *                 type: string
 *                 example: acme-corp-new
 *     responses:
 *       200:
 *         description: Organization updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *   delete:
 *     summary: Delete organization
 *     description: Permanently delete an organization and all associated data (users, forms, embeddings, etc). Only SUPER_ADMIN can perform this action. WARNING - This action cannot be undone!
 *     tags: [Tenant Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Organization ID to delete
 *     responses:
 *       200:
 *         description: Organization deleted successfully
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
 *                   example: Organization deleted successfully
 *                 deletedTenant:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                 deletedRelatedData:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: integer
 *                       description: Number of users deleted
 *                     pdfEmbeddings:
 *                       type: integer
 *                       description: Number of PDF embeddings deleted
 *                     formSchemas:
 *                       type: integer
 *                       description: Number of form schemas deleted
 *                     formDrafts:
 *                       type: integer
 *                       description: Number of form drafts deleted
 *                     pdfTemplates:
 *                       type: integer
 *                       description: Number of PDF templates deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Only SUPER_ADMIN can delete organizations
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
 *                   example: Only system administrators can delete organizations
 *       404:
 *         description: Organization not found
 */

/**
 * @swagger
 * /api/tenants/{id}/deactivate:
 *   post:
 *     summary: Deactivate organization
 *     description: Deactivate an organization. Only SUPER_ADMIN can perform this action.
 *     tags: [Tenant Management]
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
 *         description: Organization deactivated
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/tenants/{id}/activate:
 *   post:
 *     summary: Activate organization
 *     description: Activate an organization. Only SUPER_ADMIN can perform this action.
 *     tags: [Tenant Management]
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
 *         description: Organization activated
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/tenants/{id}/users:
 *   get:
 *     summary: Get organization users
 *     description: Get all users in an organization. SUPER_ADMIN can view any, ADMIN can view own.
 *     tags: [Tenant Management]
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
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/tenants/{id}/stats:
 *   get:
 *     summary: Get organization statistics
 *     description: Get statistics about an organization (users, activity, etc)
 *     tags: [Tenant Management]
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
 *         description: Organization statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         inactive:
 *                           type: integer
 *                         byRole:
 *                           type: object
 *                     activity:
 *                       type: object
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */


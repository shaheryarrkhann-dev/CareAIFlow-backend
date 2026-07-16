/**
 * @swagger
 * /api/care-library:
 *   post:
 *     summary: Create new library item
 *     description: Create a new reusable care instruction template in the library. Only ADMIN and SUPER_ADMIN can create library items. SUPER_ADMIN can specify tenantId in query param.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can target a specific tenant.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - title
 *               - template
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [Problem, Goal, Intervention]
 *                 description: Type of library item
 *                 example: "Problem"
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Library item title
 *                 example: "Chronic Pain Management"
 *               category:
 *                 type: string
 *                 description: Category for organization
 *                 example: "Medical"
 *               description:
 *                 type: string
 *                 description: Description of the library item
 *                 example: "Standard template for chronic pain management"
 *               template:
 *                 type: object
 *                 description: Template structure (varies by type)
 *                 example:
 *                   title: "Chronic Pain Management"
 *                   category: "Medical"
 *                   priority: "High"
 *                   description: "Patient experiences chronic pain"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags for searching
 *                 example: ["pain", "chronic", "medical"]
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. SUPER_ADMIN can specify tenant in body.
 *     responses:
 *       201:
 *         description: Library item created successfully
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
 *                   example: "Library item created successfully"
 *                 libraryItem:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     type:
 *                       type: string
 *                     title:
 *                       type: string
 *                     category:
 *                       type: string
 *                     template:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden - Only ADMIN and SUPER_ADMIN can create library items
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-library:
 *   get:
 *     summary: Get library items with filtering
 *     description: Retrieve paginated list of library items with optional filtering. All authenticated users can view library items within their tenant. SUPER_ADMIN can query across tenants.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Problem, Goal, Intervention]
 *         description: Filter by type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, description, and tags
 *     responses:
 *       200:
 *         description: List of library items with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 libraryItems:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       type:
 *                         type: string
 *                       title:
 *                         type: string
 *                       category:
 *                         type: string
 *                       description:
 *                         type: string
 *                       template:
 *                         type: object
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-library/{id}:
 *   get:
 *     summary: Get library item by ID
 *     description: Retrieve a specific library item by ID. All authenticated users can view library items within their tenant.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Library item ID
 *     responses:
 *       200:
 *         description: Library item details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 libraryItem:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     type:
 *                       type: string
 *                     title:
 *                       type: string
 *                     category:
 *                       type: string
 *                     description:
 *                       type: string
 *                     template:
 *                       type: object
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     tenantId:
 *                       type: string
 *                       format: uuid
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Library item not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-library/{id}:
 *   put:
 *     summary: Update library item
 *     description: Update an existing library item. Only ADMIN and SUPER_ADMIN can update library items.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Library item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               template:
 *                 type: object
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Library item updated successfully
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
 *                   example: "Library item updated successfully"
 *                 libraryItem:
 *                   type: object
 *       404:
 *         description: Library item not found
 *       403:
 *         description: Forbidden - Only ADMIN and SUPER_ADMIN can update library items
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-library/{id}:
 *   delete:
 *     summary: Delete library item
 *     description: Delete (soft delete) a library item. Only ADMIN and SUPER_ADMIN can delete library items.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Library item ID
 *     responses:
 *       200:
 *         description: Library item deleted successfully
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
 *                   example: "Library item deleted successfully"
 *       404:
 *         description: Library item not found
 *       403:
 *         description: Forbidden - Only ADMIN and SUPER_ADMIN can delete library items
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-library/{id}/apply:
 *   post:
 *     summary: Apply library item to care plan
 *     description: Apply a library item template to an existing care plan. The template will be added as a problem, goal, or intervention based on the library item type. All authenticated users can apply library items.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Library item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - carePlanId
 *             properties:
 *               carePlanId:
 *                 type: string
 *                 format: uuid
 *                 description: Care plan ID to apply the template to
 *                 example: "care-plan-uuid-123"
 *               problemId:
 *                 type: string
 *                 format: uuid
 *                 description: Problem ID (required if library item type is Goal or Intervention)
 *                 example: "problem-uuid-123"
 *               goalId:
 *                 type: string
 *                 format: uuid
 *                 description: Goal ID (required if library item type is Intervention)
 *                 example: "goal-uuid-123"
 *               customizations:
 *                 type: object
 *                 description: Optional customizations to apply to the template
 *                 example:
 *                   title: "Customized Title"
 *                   description: "Customized description"
 *     responses:
 *       200:
 *         description: Library item applied successfully
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
 *                   example: "Library item applied successfully"
 *                 result:
 *                   type: object
 *                   description: Created problem, goal, or intervention
 *       404:
 *         description: Library item or care plan not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-library/{id}/duplicate:
 *   post:
 *     summary: Duplicate library item
 *     description: Create a copy of an existing library item. Only ADMIN and SUPER_ADMIN can duplicate library items.
 *     tags: [Care Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Library item ID to duplicate
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Optional new title for the duplicated item
 *                 example: "Copy of Chronic Pain Management"
 *     responses:
 *       201:
 *         description: Library item duplicated successfully
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
 *                   example: "Library item duplicated successfully"
 *                 libraryItem:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     type:
 *                       type: string
 *                     title:
 *                       type: string
 *                     category:
 *                       type: string
 *                     template:
 *                       type: object
 *       404:
 *         description: Library item not found
 *       403:
 *         description: Forbidden - Only ADMIN and SUPER_ADMIN can duplicate library items
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */


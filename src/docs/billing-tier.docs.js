/**
 * @swagger
 * /api/billing-tiers:
 *   post:
 *     summary: Create new billing tier
 *     description: "Create a new billing tier for the tenant. Roles: ADMIN, SUPER_ADMIN, STAFF"
 *     tags: [Billing Tiers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateBillingTierRequest'
 *               - type: object
 *                 properties:
 *                   tenantId:
 *                     type: string
 *                     format: uuid
 *                     description: Optional. SUPER_ADMIN can target a specific tenant.
 *     responses:
 *       201:
 *         description: Billing tier created successfully
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
 *                   example: "Billing tier created successfully"
 *                 billingTier:
 *                   $ref: '#/components/schemas/BillingTier'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/billing-tiers:
 *   get:
 *     summary: Get billing tiers with filtering
 *     description: Retrieve paginated list of billing tiers with optional filtering. All authenticated users can view billing tiers within their tenant.
 *     tags: [Billing Tiers]
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
 *           default: 10
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
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Search by name or description
 *     responses:
 *       200:
 *         description: List of billing tiers with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 billingTiers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BillingTier'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/billing-tiers/{id}:
 *   get:
 *     summary: Get billing tier by ID
 *     description: Retrieve a specific billing tier by ID. All authenticated users can view billing tiers within their tenant.
 *     tags: [Billing Tiers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing tier ID
 *     responses:
 *       200:
 *         description: Billing tier details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 billingTier:
 *                   $ref: '#/components/schemas/BillingTier'
 *       404:
 *         description: Billing tier not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/billing-tiers/{id}:
 *   put:
 *     summary: Update billing tier
 *     description: "Update a billing tier. Roles: ADMIN, SUPER_ADMIN, STAFF"
 *     tags: [Billing Tiers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing tier ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateBillingTierRequest'
 *     responses:
 *       200:
 *         description: Billing tier updated successfully
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
 *                   example: "Billing tier updated successfully"
 *                 billingTier:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Billing tier not found
 */

/**
 * @swagger
 * /api/billing-tiers/{id}:
 *   delete:
 *     summary: Delete billing tier
 *     description: "Delete a billing tier. Cannot delete if assigned to residents or has invoices. Roles: ADMIN, SUPER_ADMIN, STAFF"
 *     tags: [Billing Tiers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing tier ID
 *     responses:
 *       200:
 *         description: Billing tier deleted successfully
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
 *                   example: "Billing tier deleted successfully"
 *       400:
 *         description: Cannot delete tier assigned to residents or with invoices
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Billing tier not found
 */

/**
 * @swagger
 * /api/billing-tiers/{tierId}/residents:
 *   get:
 *     summary: Get all residents assigned to a billing tier
 *     description: Retrieve all residents assigned to a specific billing tier. All authenticated users can view this information within their tenant.
 *     tags: [Billing Tiers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tierId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing tier ID
 *     responses:
 *       200:
 *         description: List of residents assigned to the tier
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 residents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *       404:
 *         description: Billing tier not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

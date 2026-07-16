/**
 * @swagger
 * /api/invoices/generate:
 *   post:
 *     summary: Generate invoice for a single resident
 *     description: "Generate an invoice for a specific resident for a given month. Roles: ADMIN, SUPER_ADMIN, STAFF"
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/GenerateInvoiceRequest'
 *               - type: object
 *                 properties:
 *                   tenantId:
 *                     type: string
 *                     format: uuid
 *                     description: Optional. SUPER_ADMIN can target a specific tenant.
 *     responses:
 *       201:
 *         description: Invoice generated successfully
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
 *                   example: "Invoice generated successfully"
 *                 invoice:
 *                   $ref: '#/components/schemas/Invoice'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/invoices/generate-month:
 *   post:
 *     summary: Generate invoices for all active residents for a month
 *     description: "Generate invoices for all active residents in the tenant for a given month. Roles: ADMIN, SUPER_ADMIN, STAFF"
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - type: object
 *                 required:
 *                   - month
 *                 properties:
 *                   month:
 *                     type: string
 *                     format: date-time
 *                     description: Month for invoices (ISO 8601 date)
 *                     example: "2025-01-01T00:00:00Z"
 *               - type: object
 *                 properties:
 *                   tenantId:
 *                     type: string
 *                     format: uuid
 *                     description: Optional. SUPER_ADMIN can target a specific tenant.
 *     responses:
 *       201:
 *         description: Invoices generated successfully
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
 *                   example: "Invoices generated successfully"
 *                 count:
 *                   type: integer
 *                   description: Number of invoices generated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: Get invoices with filtering
 *     description: Retrieve paginated list of invoices with optional filtering. All authenticated users can view invoices within their tenant.
 *     tags: [Invoices]
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
 *         name: month
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by month (ISO 8601 date)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Paid, Overdue]
 *         description: Filter by invoice status
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID
 *       - in: query
 *         name: billingTierId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by billing tier ID
 *     responses:
 *       200:
 *         description: List of invoices with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 invoices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Invoice'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/invoices/{id}:
 *   get:
 *     summary: Get invoice by ID
 *     description: Retrieve a specific invoice by ID with all details. All authenticated users can view invoices within their tenant.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 invoice:
 *                   $ref: '#/components/schemas/Invoice'
 *       404:
 *         description: Invoice not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/invoices/{id}/status:
 *   patch:
 *     summary: Update invoice status
 *     description: "Update the status of an invoice. Roles: ADMIN, SUPER_ADMIN, STAFF"
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Invoice ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateInvoiceStatusRequest'
 *     responses:
 *       200:
 *         description: Invoice status updated successfully
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
 *                   example: "Invoice status updated successfully"
 *                 invoice:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Invoice not found
 */


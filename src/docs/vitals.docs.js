/**
 * @swagger
 * /api/vitals:
 *   post:
 *     summary: Record vitals
 *     tags: [Vitals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (required for SUPER_ADMIN only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - residentId
 *               - recordedAt
 *             properties:
 *               residentId:
 *                 type: string
 *               recordedAt:
 *                 type: string
 *                 format: date-time
 *               bloodPressureSystolic:
 *                 type: integer
 *                 minimum: 50
 *                 maximum: 250
 *               bloodPressureDiastolic:
 *                 type: integer
 *                 minimum: 30
 *                 maximum: 150
 *               pulse:
 *                 type: integer
 *                 minimum: 30
 *                 maximum: 200
 *               temperature:
 *                 type: number
 *                 format: float
 *               temperatureUnit:
 *                 type: string
 *                 enum: [F, C]
 *                 default: F
 *               oxygenSaturation:
 *                 type: integer
 *                 minimum: 70
 *                 maximum: 100
 *               weight:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *               weightUnit:
 *                 type: string
 *                 enum: [lbs, kg]
 *                 default: lbs
 *               medicationId:
 *                 type: string
 *                 format: uuid
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vitals recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 record:
 *                   $ref: '#/components/schemas/VitalSign'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/vitals:
 *   get:
 *     summary: Get vitals records with filtering
 *     tags: [Vitals]
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
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: medicationId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *       - in: query
 *         name: forRecordCreation
 *         schema:
 *           type: boolean
 *         description: If true, only returns vitals not linked to MAR or PRN records (useful when selecting vitals for MAR/PRN creation)
 *     responses:
 *       200:
 *         description: Vitals records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 records:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VitalSign'
 *                 pagination:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/vitals/{id}:
 *   get:
 *     summary: Get vitals record by ID
 *     tags: [Vitals]
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
 *         description: Vitals record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 record:
 *                   $ref: '#/components/schemas/VitalSign'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/vitals/{id}:
 *   put:
 *     summary: Update vitals record
 *     tags: [Vitals]
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
 *               recordedAt:
 *                 type: string
 *                 format: date-time
 *               bloodPressureSystolic:
 *                 type: integer
 *               bloodPressureDiastolic:
 *                 type: integer
 *               pulse:
 *                 type: integer
 *               temperature:
 *                 type: number
 *                 format: float
 *               temperatureUnit:
 *                 type: string
 *                 enum: [F, C]
 *               oxygenSaturation:
 *                 type: integer
 *               weight:
 *                 type: number
 *                 format: float
 *               weightUnit:
 *                 type: string
 *                 enum: [lbs, kg]
 *               medicationId:
 *                 type: string
 *                 format: uuid
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vitals updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 record:
 *                   $ref: '#/components/schemas/VitalSign'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/vitals/{id}:
 *   delete:
 *     summary: Delete vitals record
 *     tags: [Vitals]
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
 *         description: Vitals record deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 record:
 *                   $ref: '#/components/schemas/VitalSign'
 *       400:
 *         description: Bad request (record not found, locked after 24 hours, or linked to MAR/PRN record)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/vitals/trends:
 *   get:
 *     summary: Get vitals trends for resident and date range
 *     tags: [Vitals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: Vitals trends retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 trends:
 *                   type: object
 *                   description: Vitals trends with averages, min, max
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */


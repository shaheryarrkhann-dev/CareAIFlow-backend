/**
 * @swagger
 * /api/mar/record:
 *   post:
 *     summary: Record dose administration
 *     tags: [MAR (Medication Administration Record)]
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
 *               - medicationId
 *               - residentId
 *               - administeredAt
 *               - status
 *             properties:
 *               medicationId:
 *                 type: string
 *                 format: uuid
 *               scheduleId:
 *                 type: string
 *                 format: uuid
 *               residentId:
 *                 type: string
 *               administeredAt:
 *                 type: string
 *                 format: date-time
 *               scheduledTime:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [Given, Missed, Late, Skipped, Hold, GIVEN, MISSED, LATE, SKIPPED, HOLD, REFUSED, HELD]
 *               signature:
 *                 type: string
 *               signatureType:
 *                 type: string
 *                 enum: [drawing, typed, stored]
 *               notes:
 *                 type: string
 *               residentResponse:
 *                 type: string
 *               vitalsId:
 *                 type: string
 *                 format: uuid
 *                 description: Existing vitals record ID (if vitals were recorded separately)
 *               vitals:
 *                 type: object
 *                 description: Inline vitals data (alternative to vitalsId). Required if medication requiresVitals is true and vitalsId is not provided.
 *                 properties:
 *                   temperature:
 *                     type: number
 *                   temperatureUnit:
 *                     type: string
 *                     enum: [F, C]
 *                   bloodPressureSystolic:
 *                     type: integer
 *                   bloodPressureDiastolic:
 *                     type: integer
 *                   pulse:
 *                     type: integer
 *                   oxygenSaturation:
 *                     type: integer
 *                   weight:
 *                     type: number
 *                   weightUnit:
 *                     type: string
 *                     enum: [lbs, kg]
 *                   recordedAt:
 *                     type: string
 *                     format: date-time
 *                   notes:
 *                     type: string
 *     responses:
 *       201:
 *         description: Dose recorded successfully
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
 *                   $ref: '#/components/schemas/MarRecord'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/mar/records:
 *   get:
 *     summary: Get MAR records with filtering
 *     tags: [MAR (Medication Administration Record)]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Given, Missed, Late, Skipped, Hold, GIVEN, MISSED, LATE, SKIPPED, HOLD, REFUSED, HELD]
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
 *     responses:
 *       200:
 *         description: MAR records retrieved successfully
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
 *                     $ref: '#/components/schemas/MarRecord'
 *                 pagination:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/mar/records/{id}:
 *   get:
 *     summary: Get MAR record by ID
 *     tags: [MAR (Medication Administration Record)]
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
 *         description: MAR record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 record:
 *                   $ref: '#/components/schemas/MarRecord'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/mar/records/{id}:
 *   put:
 *     summary: Update MAR record
 *     tags: [MAR (Medication Administration Record)]
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
 *               administeredAt:
 *                 type: string
 *                 format: date-time
 *               scheduledTime:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [Given, Missed, Late, Skipped, Hold, GIVEN, MISSED, LATE, SKIPPED, HOLD, REFUSED, HELD]
 *               signature:
 *                 type: string
 *               signatureType:
 *                 type: string
 *                 enum: [drawing, typed, stored]
 *               notes:
 *                 type: string
 *               residentResponse:
 *                 type: string
 *               vitalsId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: MAR record updated successfully
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
 *                   $ref: '#/components/schemas/MarRecord'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/mar/records/{id}:
 *   delete:
 *     summary: Delete MAR record
 *     tags: [MAR (Medication Administration Record)]
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
 *         description: MAR record deleted successfully
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
 * /api/mar/records/{id}/lock:
 *   post:
 *     summary: Lock MAR record (admin override)
 *     tags: [MAR (Medication Administration Record)]
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
 *         description: MAR record locked successfully
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
 *                   $ref: '#/components/schemas/MarRecord'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/mar/records/{id}/unlock:
 *   post:
 *     summary: Unlock MAR record (admin only)
 *     tags: [MAR (Medication Administration Record)]
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
 *         description: MAR record unlocked successfully
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
 *                   $ref: '#/components/schemas/MarRecord'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */


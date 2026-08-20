/**
 * @swagger
 * /api/prn/record:
 *   post:
 *     summary: Record PRN dose administration
 *     tags: [PRN (As Needed Medications)]
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
 *               - symptom
 *               - givenAt
 *             properties:
 *               medicationId:
 *                 type: string
 *                 format: uuid
 *               residentId:
 *                 type: string
 *               symptom:
 *                 type: string
 *                 minLength: 10
 *                 description: Reason for giving PRN (minimum 10 characters)
 *               givenAt:
 *                 type: string
 *                 format: date-time
 *               signature:
 *                 type: string
 *               notes:
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
 *         description: PRN dose recorded successfully
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
 *                   $ref: '#/components/schemas/PrnRecord'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/prn/pending-followups:
 *   get:
 *     summary: Get pending PRN follow-ups (records given in last 2 hours without response)
 *     tags: [PRN (As Needed Medications)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID (optional)
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: Pending follow-ups retrieved successfully
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
 *                     $ref: '#/components/schemas/PrnRecord'
 *                 count:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/prn/records:
 *   get:
 *     summary: Get PRN records with filtering
 *     tags: [PRN (As Needed Medications)]
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
 *         name: hasResponse
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: physicianNotified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: PRN records retrieved successfully
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
 *                     $ref: '#/components/schemas/PrnRecord'
 *                 pagination:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/prn/records/{id}:
 *   get:
 *     summary: Get PRN record by ID
 *     tags: [PRN (As Needed Medications)]
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
 *         description: PRN record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 record:
 *                   $ref: '#/components/schemas/PrnRecord'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/prn/records/{id}/response:
 *   put:
 *     summary: Record PRN response (follow-up after 30-60 minutes)
 *     tags: [PRN (As Needed Medications)]
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
 *             required:
 *               - response
 *             properties:
 *               response:
 *                 type: string
 *                 minLength: 10
 *                 description: Response/outcome after PRN administration (minimum 10 characters)
 *               physicianNotified:
 *                 type: boolean
 *               physicianNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: PRN response recorded successfully
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
 *                   $ref: '#/components/schemas/PrnRecord'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/prn/records/{id}/notify-physician:
 *   post:
 *     summary: Notify physician about PRN dose
 *     tags: [PRN (As Needed Medications)]
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
 *               notes:
 *                 type: string
 *                 description: Physician notes
 *     responses:
 *       200:
 *         description: Physician notified successfully
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
 *                   $ref: '#/components/schemas/PrnRecord'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 */


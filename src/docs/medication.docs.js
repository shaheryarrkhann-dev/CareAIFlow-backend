/**
 * @swagger
 * /api/medications:
 *   post:
 *     summary: Create new medication
 *     tags: [Medications]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - residentId
 *               - name
 *               - dosage
 *               - frequency
 *               - route
 *               - startDate
 *             properties:
 *               residentId:
 *                 type: string
 *                 description: Resident ID
 *               name:
 *                 type: string
 *                 description: Medication name
 *               dosage:
 *                 type: string
 *                 description: Dosage (e.g., "10mg", "1 tablet")
 *               frequency:
 *                 type: string
 *                 description: Frequency (e.g., "BID", "TID", "8:00 AM, 2:00 PM")
 *               route:
 *                 type: string
 *                 enum: [ORAL, INJECTION, TOPICAL, INHALATION, OTHER]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               isPrn:
 *                 type: boolean
 *                 default: false
 *               requiresVitals:
 *                 type: boolean
 *                 default: false
 *               vitalsType:
 *                 type: string
 *                 enum: [Temperature, BloodPressure, Pulse, All]
 *                 description: Type of vitals required (if requiresVitals is true)
 *               instructions:
 *                 type: string
 *               prescribedBy:
 *                 type: string
 *               prescriptionPdf:
 *                 type: string
 *                 format: binary
 *                 description: Prescription PDF file (optional, max 10MB)
 *     responses:
 *       201:
 *         description: Medication created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 medication:
 *                   $ref: '#/components/schemas/Medication'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/medications:
 *   get:
 *     summary: Get medications with filtering
 *     tags: [Medications]
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
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: isPrn
 *         schema:
 *           type: boolean
 *         description: Filter by PRN status
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: Medications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 medications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Medication'
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
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/medications/{id}:
 *   get:
 *     summary: Get medication by ID with all relations
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Medication ID
 *     responses:
 *       200:
 *         description: Medication retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 medication:
 *                   $ref: '#/components/schemas/Medication'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/medications/{id}:
 *   put:
 *     summary: Update medication
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Medication ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               residentId:
 *                 type: string
 *               name:
 *                 type: string
 *               dosage:
 *                 type: string
 *               frequency:
 *                 type: string
 *               route:
 *                 type: string
 *                 enum: [ORAL, INJECTION, TOPICAL, INHALATION, OTHER]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               isPrn:
 *                 type: boolean
 *               requiresVitals:
 *                 type: boolean
 *               vitalsType:
 *                 type: string
 *                 enum: [Temperature, BloodPressure, Pulse, All]
 *               instructions:
 *                 type: string
 *               prescribedBy:
 *                 type: string
 *               prescriptionPdf:
 *                 type: string
 *                 format: binary
 *                 description: Prescription PDF file (optional, max 10MB)
 *     responses:
 *       200:
 *         description: Medication updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 medication:
 *                   $ref: '#/components/schemas/Medication'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/medications/{id}:
 *   delete:
 *     summary: Delete medication (soft delete)
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Medication ID
 *     responses:
 *       200:
 *         description: Medication deleted successfully
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
 * /api/medications/{id}/activate:
 *   post:
 *     summary: Activate medication
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Medication ID
 *     responses:
 *       200:
 *         description: Medication activated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 medication:
 *                   $ref: '#/components/schemas/Medication'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/medications/{id}/deactivate:
 *   post:
 *     summary: Deactivate medication
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Medication ID
 *     responses:
 *       200:
 *         description: Medication deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 medication:
 *                   $ref: '#/components/schemas/Medication'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ErrorResponse'
 */


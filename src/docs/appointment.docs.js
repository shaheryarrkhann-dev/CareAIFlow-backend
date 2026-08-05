/**
 * @swagger
 * /api/appointments:
 *   post:
 *     summary: Create appointment
 *     description: Create an appointment linked to at least one of resident, staff, or facility. Requires APPOINTMENTS:create.
 *     tags: [Appointments]
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
 *               - title
 *               - scheduledAt
 *               - appointmentType
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 500
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *               appointmentType:
 *                 type: string
 *                 enum: [MEDICAL, THERAPY, INSPECTION, INTERNAL_OTHER]
 *               residentId:
 *                 type: string
 *                 format: uuid
 *               staffId:
 *                 type: string
 *                 format: uuid
 *               facilityId:
 *                 type: string
 *                 format: uuid
 *               location:
 *                 type: string
 *                 maxLength: 500
 *               notes:
 *                 type: string
 *                 maxLength: 10000
 *               reminderMinutesBefore:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 0
 *                 example: [60, 1440]
 *               status:
 *                 type: string
 *                 enum: [SCHEDULED, COMPLETED, CANCELLED, NO_SHOW]
 *                 description: Optional; defaults to SCHEDULED.
 *     responses:
 *       201:
 *         description: Appointment created successfully
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
 *                 appointment:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Resident, staff, or facility not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/calendar:
 *   get:
 *     summary: Calendar appointments (day / week / month)
 *     description: Returns appointments for a given date range derived from view and date. Use for calendar UI. Same response shape as list (id, title, scheduledAt, type, resident, staff, facility, location). No pagination; limit 500. Requires APPOINTMENTS:view.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Calendar view; determines date range (UTC).
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-02-17"
 *         description: Reference date (YYYY-MM-DD). Day = that day; week = week containing it (Mon–Sun); month = that month.
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SUPER_ADMIN only.
 *     responses:
 *       200:
 *         description: Appointments for the requested range
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointments:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid date or validation error
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     summary: List appointments
 *     description: Paginated list with optional filters. Requires APPOINTMENTS:view.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SUPER_ADMIN only
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: facilityId
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [MEDICAL, THERAPY, INSPECTION, INTERNAL_OTHER]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, COMPLETED, CANCELLED, NO_SHOW]
 *     responses:
 *       200:
 *         description: List of appointments with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointments:
 *                   type: array
 *                   items:
 *                     type: object
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
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/{id}:
 *   get:
 *     summary: Get appointment by ID
 *     description: Returns a single appointment with resident, staff, facility, and reminders. Requires APPOINTMENTS:view.
 *     tags: [Appointments]
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
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointment:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/{id}:
 *   put:
 *     summary: Update appointment
 *     description: Update an existing appointment. All body fields optional. Requires APPOINTMENTS:update.
 *     tags: [Appointments]
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
 *               title:
 *                 type: string
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *               appointmentType:
 *                 type: string
 *                 enum: [MEDICAL, THERAPY, INSPECTION, INTERNAL_OTHER]
 *               residentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               staffId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               facilityId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               location:
 *                 type: string
 *               notes:
 *                 type: string
 *               reminderMinutesBefore:
 *                 type: array
 *                 items:
 *                   type: integer
 *               status:
 *                 type: string
 *                 enum: [SCHEDULED, COMPLETED, CANCELLED, NO_SHOW]
 *     responses:
 *       200:
 *         description: Appointment updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/export:
 *   get:
 *     summary: Export appointments (CSV or PDF)
 *     description: Returns appointments in the given date range as CSV or PDF file. Requires APPOINTMENTS:view.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: dateTo
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO 8601)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *           default: csv
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SUPER_ADMIN only
 *     responses:
 *       200:
 *         description: File attachment (CSV or PDF)
 *       400:
 *         description: Validation error (e.g. missing dateFrom/dateTo)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/{id}:
 *   delete:
 *     summary: Delete appointment
 *     description: Soft-delete an appointment. Requires APPOINTMENTS:delete.
 *     tags: [Appointments]
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
 *         description: Appointment deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/notifications:
 *   get:
 *     summary: List my appointment notifications
 *     description: Returns in-app appointment reminder notifications for the current user. Requires APPOINTMENTS:view.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *         description: If true, return only unread notifications
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       appointmentId:
 *                         type: string
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       readAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/appointments/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     description: Sets readAt for the notification. Requires APPOINTMENTS:view.
 *     tags: [Appointments]
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
 *         description: Notification marked as read
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */

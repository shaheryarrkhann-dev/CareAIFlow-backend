/**
 * @swagger
 * /api/mar/grid:
 *   get:
 *     summary: Get MAR grid for resident and date
 *     tags: [MAR Grid & Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resident UUID from Resident model
 *         format: uuid
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for MAR grid (YYYY-MM-DD)
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: MAR grid retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 residentId:
 *                   type: string
 *                 residentName:
 *                   type: string
 *                 date:
 *                   type: string
 *                   format: date
 *                 timeSlots:
 *                   type: array
 *                   items:
 *                     type: string
 *                 grid:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/mar/grid/range:
 *   get:
 *     summary: Get MAR grid for date range (maximum 30 days)
 *     tags: [MAR Grid & Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resident UUID from Resident model
 *         format: uuid
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD, must be after or equal to startDate)
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: MAR grids retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 residentId:
 *                   type: string
 *                 startDate:
 *                   type: string
 *                   format: date
 *                 endDate:
 *                   type: string
 *                   format: date
 *                 grids:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: integer
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */

/**
 * @swagger
 * /api/mar/dashboard:
 *   get:
 *     summary: Get resident medication dashboard
 *     tags: [MAR Grid & Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resident UUID from Resident model
 *         format: uuid
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: Dashboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 resident:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     activeMedications:
 *                       type: integer
 *                     scheduledToday:
 *                       type: integer
 *                     prnDosesPending:
 *                       type: integer
 *                     missedDoses:
 *                       type: integer
 *                     lateDoses:
 *                       type: integer
 *                 recentRecords:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pendingPrnFollowups:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */


/**
 * @swagger
 * /api/care-plans:
 *   post:
 *     summary: Create new care plan
 *     description: Create a new nursing care plan for a resident. All authenticated users can create care plans. SUPER_ADMIN can specify tenantId in query param.
 *     tags: [Nursing Care Plans]
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
 *               - residentId
 *             properties:
 *               residentId:
 *                 type: string
 *                 format: uuid
 *                 description: Resident UUID from Resident model
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               status:
 *                 type: string
 *                 enum: [Draft, Active, Archived]
 *                 default: Draft
 *                 description: Care plan status
 *                 example: "Draft"
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Care plan title
 *                 example: "Post-Surgery Recovery Plan"
 *               description:
 *                 type: string
 *                 description: Care plan description
 *                 example: "Comprehensive care plan for post-surgical recovery"
 *               nextReviewDate:
 *                 type: string
 *                 format: date
 *                 description: Next review date (optional, can be calculated from reviewIntervalDays)
 *                 example: "2025-02-17"
 *               reviewIntervalDays:
 *                 type: integer
 *                 default: 30
 *                 description: Review interval in days
 *                 example: 30
 *               approvedBy:
 *                 type: string
 *                 format: uuid
 *                 description: User ID who approved the care plan
 *               approvedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Approval date and time
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. SUPER_ADMIN can specify tenant in body.
 *     responses:
 *       201:
 *         description: Care plan created successfully
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
 *                   example: "Care plan created successfully"
 *                 carePlan:
 *                   $ref: '#/components/schemas/CarePlan'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans:
 *   get:
 *     summary: Get care plans with filtering
 *     description: Retrieve paginated list of care plans with optional filtering. All authenticated users can view care plans within their tenant. SUPER_ADMIN can query across tenants.
 *     tags: [Nursing Care Plans]
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
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Draft, Active, Archived]
 *         description: Filter by status
 *       - in: query
 *         name: createdBy
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by creator user ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from date (ISO 8601)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter to date (ISO 8601)
 *     responses:
 *       200:
 *         description: List of care plans with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 carePlans:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CarePlan'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}:
 *   get:
 *     summary: Get care plan by ID
 *     description: Retrieve a specific care plan with all problems, goals, and interventions. All authenticated users can view care plans within their tenant.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: Care plan details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 carePlan:
 *                   $ref: '#/components/schemas/CarePlan'
 *       404:
 *         description: Care plan not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}:
 *   put:
 *     summary: Update care plan
 *     description: Update an existing care plan. All authenticated users can update care plans within their tenant.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Draft, Active, Archived]
 *               title:
 *                 type: string
 *                 maxLength: 255
 *               description:
 *                 type: string
 *               nextReviewDate:
 *                 type: string
 *                 format: date
 *               reviewIntervalDays:
 *                 type: integer
 *               lastReviewedAt:
 *                 type: string
 *                 format: date-time
 *               approvedBy:
 *                 type: string
 *                 format: uuid
 *               approvedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Care plan updated successfully
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
 *                   example: "Care plan updated successfully"
 *                 carePlan:
 *                   $ref: '#/components/schemas/CarePlan'
 *       404:
 *         description: Care plan not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}:
 *   delete:
 *     summary: Archive care plan
 *     description: Archive (soft delete) a care plan. Only ADMIN and SUPER_ADMIN can archive care plans.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: Care plan archived successfully
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
 *                   example: "Care plan archived successfully"
 *       404:
 *         description: Care plan not found
 *       403:
 *         description: Forbidden - Only ADMIN and SUPER_ADMIN can archive care plans
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/dashboard/resident/{residentId}:
 *   get:
 *     summary: Get care plan dashboard for resident
 *     description: Get comprehensive dashboard summary for a resident including active care plan, statistics, upcoming reviews, recent changes, and alerts.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resident ID
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 dashboard:
 *                   type: object
 *                   properties:
 *                     residentId:
 *                       type: string
 *                     activeCarePlan:
 *                       type: object
 *                       nullable: true
 *                     statistics:
 *                       type: object
 *                       properties:
 *                         problemsCount:
 *                           type: integer
 *                         goalsCount:
 *                           type: integer
 *                         interventionsCount:
 *                           type: integer
 *                         goalsByStatus:
 *                           type: object
 *                     upcomingReviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                     recentChanges:
 *                       type: array
 *                       items:
 *                         type: object
 *                     alerts:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Resident not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/statistics:
 *   get:
 *     summary: Get care plan statistics
 *     description: Get comprehensive statistics for a tenant including care plans by status, goal achievement rates, review compliance, and most common problems.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for statistics (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for statistics (ISO 8601)
 *     responses:
 *       200:
 *         description: Statistics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                     averages:
 *                       type: object
 *                     goals:
 *                       type: object
 *                     review:
 *                       type: object
 *                     problems:
 *                       type: object
 *       400:
 *         description: Bad request - tenantId required
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/resident/{residentId}/active:
 *   get:
 *     summary: Get active care plan for resident
 *     description: Get the currently active care plan for a specific resident.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resident ID
 *     responses:
 *       200:
 *         description: Active care plan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 carePlan:
 *                   $ref: '#/components/schemas/CarePlan'
 *       404:
 *         description: No active care plan found for resident
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/export:
 *   get:
 *     summary: Export care plan to PDF
 *     description: Export a complete care plan to PDF format with all problems, goals, and interventions. Optionally include version history.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *       - in: query
 *         name: includeVersionHistory
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include version history in PDF
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Care plan not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/export-versions:
 *   get:
 *     summary: Export version history to PDF
 *     description: Export the complete version history of a care plan to PDF format.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Care plan or version history not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/resident/{residentId}/export-summary:
 *   get:
 *     summary: Export care plan summary for resident
 *     description: Export a summary report of all care plans for a resident to PDF format. Optionally filter by date range.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resident ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (optional)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (optional)
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No care plans found for resident
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/goal-progress:
 *   get:
 *     summary: Get goal progress tracking
 *     description: Get detailed goal progress tracking for a care plan including achievement rates, overdue goals, and timeline analysis.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: Goal progress data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 progress:
 *                   type: object
 *                   properties:
 *                     carePlanId:
 *                       type: string
 *                       format: uuid
 *                     totalGoals:
 *                       type: integer
 *                     goalsByStatus:
 *                       type: object
 *                     achievementRate:
 *                       type: number
 *                     goalsOverdue:
 *                       type: integer
 *                     goalsAchieved:
 *                       type: integer
 *       404:
 *         description: Care plan not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/intervention-compliance:
 *   get:
 *     summary: Get intervention compliance
 *     description: Get intervention compliance data for a care plan grouped by role and frequency.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: Intervention compliance data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 compliance:
 *                   type: object
 *                   properties:
 *                     carePlanId:
 *                       type: string
 *                       format: uuid
 *                     totalInterventions:
 *                       type: integer
 *                     statistics:
 *                       type: object
 *                     interventionsByRole:
 *                       type: array
 *                       items:
 *                         type: object
 *                     interventionsByFrequency:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Care plan not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/problems:
 *   post:
 *     summary: Add problem to care plan
 *     description: Add a new problem/diagnosis to a care plan. All authenticated users can add problems.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Problem title
 *                 example: "Chronic Pain Management"
 *               category:
 *                 type: string
 *                 enum: [Medical, Behavioral, Social, Functional, Other]
 *                 description: Problem category
 *                 example: "Medical"
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High, Critical]
 *                 default: Medium
 *                 description: Problem priority
 *                 example: "High"
 *               diagnosisCode:
 *                 type: string
 *                 maxLength: 50
 *                 description: Diagnosis code (ICD-10, etc.)
 *                 example: "M79.3"
 *               onsetDate:
 *                 type: string
 *                 format: date
 *                 description: Problem onset date
 *                 example: "2025-01-01"
 *               description:
 *                 type: string
 *                 description: Problem description
 *                 example: "Patient experiences chronic lower back pain"
 *     responses:
 *       201:
 *         description: Problem added successfully
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
 *                   example: "Problem added successfully"
 *                 problem:
 *                   type: object
 *       404:
 *         description: Care plan not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/problems/{problemId}:
 *   put:
 *     summary: Update problem
 *     description: Update an existing problem in a care plan. All authenticated users can update problems.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: problemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Problem ID
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
 *                 enum: [Medical, Behavioral, Social, Functional, Other]
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High, Critical]
 *               diagnosisCode:
 *                 type: string
 *                 maxLength: 50
 *               onsetDate:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Problem updated successfully
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
 *                   example: "Problem updated successfully"
 *                 problem:
 *                   type: object
 *       404:
 *         description: Problem not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/problems/{problemId}:
 *   delete:
 *     summary: Remove problem
 *     description: Remove (soft delete) a problem from a care plan. All authenticated users can remove problems.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: problemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Problem ID
 *     responses:
 *       200:
 *         description: Problem removed successfully
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
 *                   example: "Problem removed successfully"
 *       404:
 *         description: Problem not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/problems/{problemId}/goals:
 *   post:
 *     summary: Add goal to problem
 *     description: Add a new goal to a problem. All authenticated users can add goals.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: problemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Problem ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *                 description: Goal description
 *                 example: "Reduce pain level to 3/10 within 2 weeks"
 *               targetDate:
 *                 type: string
 *                 format: date
 *                 description: Target date for goal achievement
 *                 example: "2025-02-01"
 *               status:
 *                 type: string
 *                 enum: [InProgress, Achieved, NotMet, OnHold]
 *                 default: InProgress
 *                 description: Goal status
 *                 example: "InProgress"
 *     responses:
 *       201:
 *         description: Goal added successfully
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
 *                   example: "Goal added successfully"
 *                 goal:
 *                   type: object
 *       404:
 *         description: Problem not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/goals/{goalId}:
 *   put:
 *     summary: Update goal
 *     description: Update an existing goal. All authenticated users can update goals.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Goal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               targetDate:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [InProgress, Achieved, NotMet, OnHold]
 *               achievedDate:
 *                 type: string
 *                 format: date
 *               evaluationNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Goal updated successfully
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
 *                   example: "Goal updated successfully"
 *                 goal:
 *                   type: object
 *       404:
 *         description: Goal not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/goals/{goalId}/interventions:
 *   post:
 *     summary: Add intervention to goal
 *     description: Add a new intervention to a goal. All authenticated users can add interventions.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Goal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *                 description: Intervention description
 *                 example: "Administer pain medication as prescribed"
 *               frequency:
 *                 type: string
 *                 enum: [Once, Daily, TwiceDaily, ThreeTimesDaily, FourTimesDaily, AsNeeded, Weekly, Monthly, Other]
 *                 description: Intervention frequency
 *                 example: "TwiceDaily"
 *               responsibleRole:
 *                 type: string
 *                 enum: [RN, LPN, CNA, Therapist, Physician, Other]
 *                 description: Responsible role
 *                 example: "RN"
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *                 example: "Monitor for side effects"
 *     responses:
 *       201:
 *         description: Intervention added successfully
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
 *                   example: "Intervention added successfully"
 *                 intervention:
 *                   type: object
 *       404:
 *         description: Goal not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/interventions/{interventionId}:
 *   put:
 *     summary: Update intervention
 *     description: Update an existing intervention. All authenticated users can update interventions.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interventionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Intervention ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               frequency:
 *                 type: string
 *                 enum: [Once, Daily, TwiceDaily, ThreeTimesDaily, FourTimesDaily, AsNeeded, Weekly, Monthly, Other]
 *               responsibleRole:
 *                 type: string
 *                 enum: [RN, LPN, CNA, Therapist, Physician, Other]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Intervention updated successfully
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
 *                   example: "Intervention updated successfully"
 *                 intervention:
 *                   type: object
 *       404:
 *         description: Intervention not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/interventions/{interventionId}:
 *   delete:
 *     summary: Remove intervention
 *     description: Remove (soft delete) an intervention from a goal. All authenticated users can remove interventions.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interventionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Intervention ID
 *     responses:
 *       200:
 *         description: Intervention removed successfully
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
 *                   example: "Intervention removed successfully"
 *       404:
 *         description: Intervention not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/versions:
 *   get:
 *     summary: Get versions for care plan
 *     description: Get all versions (version history) for a care plan. All authenticated users can view versions.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: List of versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       version:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       creatorName:
 *                         type: string
 *                       changeDescription:
 *                         type: string
 *       404:
 *         description: Care plan not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/versions/{versionId}:
 *   get:
 *     summary: Get version by ID
 *     description: Get a specific version of a care plan with full snapshot data. All authenticated users can view versions.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Version ID
 *     responses:
 *       200:
 *         description: Version details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 version:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     version:
 *                       type: integer
 *                     carePlanId:
 *                       type: string
 *                       format: uuid
 *                     problemsSnapshot:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Version not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/versions/compare:
 *   get:
 *     summary: Compare two versions
 *     description: Compare two versions of a care plan and get a detailed diff. All authenticated users can compare versions.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: versionId1
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: First version ID
 *       - in: query
 *         name: versionId2
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Second version ID
 *     responses:
 *       200:
 *         description: Version comparison
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 comparison:
 *                   type: object
 *                   properties:
 *                     version1:
 *                       type: object
 *                     version2:
 *                       type: object
 *                     differences:
 *                       type: object
 *       404:
 *         description: One or both versions not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/rollback:
 *   post:
 *     summary: Rollback to version
 *     description: Rollback a care plan to a previous version. Only ADMIN and SUPER_ADMIN can rollback.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - versionId
 *             properties:
 *               versionId:
 *                 type: string
 *                 format: uuid
 *                 description: Version ID to rollback to
 *                 example: "version-uuid-123"
 *     responses:
 *       200:
 *         description: Care plan rolled back successfully
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
 *                   example: "Care plan rolled back successfully"
 *                 carePlan:
 *                   $ref: '#/components/schemas/CarePlan'
 *       404:
 *         description: Care plan or version not found
 *       403:
 *         description: Forbidden - Only ADMIN and SUPER_ADMIN can rollback
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/alerts:
 *   get:
 *     summary: Get alerts
 *     description: Get paginated list of care plan alerts with optional filtering. All authenticated users can view alerts within their tenant.
 *     tags: [Nursing Care Plans]
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
 *         name: carePlanId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by care plan ID
 *       - in: query
 *         name: alertType
 *         schema:
 *           type: string
 *           enum: [ReviewDue, NewDiagnosis, GoalNotMet, InterventionOverdue]
 *         description: Filter by alert type
 *       - in: query
 *         name: isDismissed
 *         schema:
 *           type: boolean
 *         description: Filter by dismissed status
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from date (ISO 8601)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter to date (ISO 8601)
 *     responses:
 *       200:
 *         description: List of alerts with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       alertType:
 *                         type: string
 *                       message:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       isDismissed:
 *                         type: boolean
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
 * /api/care-plans/alerts/{alertId}/dismiss:
 *   put:
 *     summary: Dismiss alert
 *     description: Dismiss a care plan alert. All authenticated users can dismiss alerts.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert dismissed successfully
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
 *                   example: "Alert dismissed successfully"
 *                 alert:
 *                   type: object
 *       404:
 *         description: Alert not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/schedule-review:
 *   post:
 *     summary: Schedule review reminder
 *     description: Schedule or update a review reminder for a care plan. All authenticated users can schedule reviews.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reviewDate
 *             properties:
 *               reviewDate:
 *                 type: string
 *                 format: date
 *                 description: Review date
 *                 example: "2025-02-17"
 *     responses:
 *       200:
 *         description: Review reminder scheduled successfully
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
 *                   example: "Review reminder scheduled successfully"
 *       404:
 *         description: Care plan not found
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/ai/detect-problems:
 *   post:
 *     summary: Detect problems from assessment using AI
 *     description: Use AI to detect potential problems from assessment data. All authenticated users can use this feature.
 *     tags: [Nursing Care Plans]
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
 *               - residentId
 *               - assessmentData
 *             properties:
 *               residentId:
 *                 type: string
 *                 description: Resident ID
 *                 example: "form-submission-123"
 *               assessmentData:
 *                 type: object
 *                 description: Assessment data (vitals, symptoms, observations, etc.)
 *                 example:
 *                   vitals:
 *                     bloodPressure: "140/90"
 *                     heartRate: 85
 *                   symptoms:
 *                     - "Headache"
 *                     - "Dizziness"
 *     responses:
 *       200:
 *         description: Problems detected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 problems:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       category:
 *                         type: string
 *                       priority:
 *                         type: string
 *                       description:
 *                         type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/ai/detect-problems-from-notes:
 *   post:
 *     summary: Detect problems from progress notes using AI
 *     description: Use AI to detect potential problems from progress notes. All authenticated users can use this feature.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - residentId
 *               - noteIds
 *             properties:
 *               residentId:
 *                 type: string
 *                 description: Resident ID
 *                 example: "form-submission-123"
 *               noteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of progress note IDs
 *                 example: ["note-uuid-1", "note-uuid-2"]
 *     responses:
 *       200:
 *         description: Problems detected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 problems:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/ai/generate-draft:
 *   post:
 *     summary: Generate care plan draft using AI
 *     description: Use AI to generate a complete care plan draft from assessment data. All authenticated users can use this feature.
 *     tags: [Nursing Care Plans]
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
 *               - residentId
 *               - assessmentData
 *             properties:
 *               residentId:
 *                 type: string
 *                 description: Resident ID
 *                 example: "form-submission-123"
 *               assessmentData:
 *                 type: object
 *                 description: Assessment data (vitals, symptoms, observations, medical history, etc.)
 *                 example:
 *                   vitals:
 *                     bloodPressure: "140/90"
 *                     heartRate: 85
 *                   symptoms:
 *                     - "Headache"
 *                     - "Dizziness"
 *                   medicalHistory:
 *                     - "Hypertension"
 *                     - "Diabetes"
 *     responses:
 *       200:
 *         description: Care plan draft generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 draft:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     problems:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/care-plans/{id}/ai/suggest-updates:
 *   post:
 *     summary: Suggest care plan updates using AI
 *     description: Use AI to suggest updates to an existing care plan based on recent progress notes or changes. All authenticated users can use this feature.
 *     tags: [Nursing Care Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Care plan ID
 *     responses:
 *       200:
 *         description: Suggestions generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 suggestions:
 *                   type: object
 *                   properties:
 *                     newProblems:
 *                       type: array
 *                       items:
 *                         type: object
 *                     updatedGoals:
 *                       type: array
 *                       items:
 *                         type: object
 *                     newInterventions:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Care plan not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */


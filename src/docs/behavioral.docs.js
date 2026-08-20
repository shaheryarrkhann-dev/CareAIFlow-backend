/**
 * @swagger
 * /api/behavioral/logs:
 *   post:
 *     summary: Create new behavioral log entry
 *     description: Create a new behavioral log entry for a resident. All authenticated users can create logs. STAFF can only create logs within their tenant.
 *     tags: [Behavioral Tracking]
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
 *               - dateTime
 *               - behaviorType
 *               - severity
 *             properties:
 *               residentId:
 *                 type: string
 *                 format: uuid
 *                 description: Resident UUID from Resident model
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               dateTime:
 *                 type: string
 *                 format: date-time
 *                 description: Date and time of the behavioral incident
 *                 example: "2025-01-17T14:30:00Z"
 *               behaviorType:
 *                 type: string
 *                 enum: [Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other]
 *                 description: Type of behavior observed
 *                 example: "Aggression"
 *               severity:
 *                 type: string
 *                 enum: [Low, Moderate, High]
 *                 description: Severity level of the behavior
 *                 example: "Moderate"
 *               trigger:
 *                 type: string
 *                 description: What triggered the behavior (optional)
 *                 example: "Refused medication"
 *               staffNotes:
 *                 type: string
 *                 description: Detailed notes about the incident
 *                 example: "Resident became agitated when asked to take medication. Required redirection and de-escalation."
 *               interventions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Redirect, Counseling, PrnMedication, TimeOut, DeEscalation, EnvironmentalModification, StaffSupport, FamilyNotification, PhysicianNotification, EmergencyResponse, Other]
 *                 description: List of interventions used
 *                 example: ["Redirect", "DeEscalation"]
 *               interventionDetails:
 *                 type: string
 *                 description: Additional details about interventions
 *                 example: "Staff redirected resident to quiet area and provided calming activities"
 *               prnRecordId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional link to PRN medication record if medication was given
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. SUPER_ADMIN can specify tenant in body.
 *     responses:
 *       201:
 *         description: Behavioral log created successfully
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
 *                   example: "Behavioral log created successfully"
 *                 log:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     residentId:
 *                       type: string
 *                     dateTime:
 *                       type: string
 *                       format: date-time
 *                     behaviorType:
 *                       type: string
 *                     severity:
 *                       type: string
 *                     trigger:
 *                       type: string
 *                     staffNotes:
 *                       type: string
 *                     interventions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     interventionDetails:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/behavioral/logs:
 *   get:
 *     summary: Get behavioral logs with filtering
 *     description: Retrieve paginated list of behavioral logs with optional filtering. All authenticated users can view logs within their tenant.
 *     tags: [Behavioral Tracking]
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
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID
 *       - in: query
 *         name: behaviorType
 *         schema:
 *           type: string
 *           enum: [Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other]
 *         description: Filter by behavior type
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [Low, Moderate, High]
 *         description: Filter by severity level
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
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by staff member who created the log
 *     responses:
 *       200:
 *         description: List of behavioral logs with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       residentId:
 *                         type: string
 *                       residentName:
 *                         type: string
 *                       dateTime:
 *                         type: string
 *                         format: date-time
 *                       behaviorType:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       trigger:
 *                         type: string
 *                       staffNotes:
 *                         type: string
 *                       interventions:
 *                         type: array
 *                         items:
 *                           type: string
 *                       interventionDetails:
 *                         type: string
 *                       staffId:
 *                         type: string
 *                         format: uuid
 *                       staffName:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/behavioral/logs/{id}:
 *   get:
 *     summary: Get behavioral log by ID
 *     description: Retrieve a specific behavioral log by ID. All authenticated users can view logs within their tenant.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Behavioral log ID
 *     responses:
 *       200:
 *         description: Behavioral log details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 log:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     residentId:
 *                       type: string
 *                     residentName:
 *                       type: string
 *                     dateTime:
 *                       type: string
 *                       format: date-time
 *                     behaviorType:
 *                       type: string
 *                     severity:
 *                       type: string
 *                     trigger:
 *                       type: string
 *                     staffNotes:
 *                       type: string
 *                     interventions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     interventionDetails:
 *                       type: string
 *                     staffId:
 *                       type: string
 *                       format: uuid
 *                     staffName:
 *                       type: string
 *                     canEdit:
 *                       type: boolean
 *                     isLocked:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Behavioral log not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/behavioral/logs/{id}:
 *   put:
 *     summary: Update behavioral log
 *     description: Update a behavioral log. STAFF can only edit within 24 hours of creation. ADMIN and SUPER_ADMIN can always edit (if not locked).
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Behavioral log ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dateTime:
 *                 type: string
 *                 format: date-time
 *                 description: Date and time of the behavioral incident
 *               behaviorType:
 *                 type: string
 *                 enum: [Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other]
 *                 description: Type of behavior observed
 *               severity:
 *                 type: string
 *                 enum: [Low, Moderate, High]
 *                 description: Severity level of the behavior
 *               trigger:
 *                 type: string
 *                 description: What triggered the behavior
 *               staffNotes:
 *                 type: string
 *                 description: Detailed notes about the incident
 *               interventions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Redirect, Counseling, PrnMedication, TimeOut, DeEscalation, EnvironmentalModification, StaffSupport, FamilyNotification, PhysicianNotification, EmergencyResponse, Other]
 *                 description: List of interventions used
 *               interventionDetails:
 *                 type: string
 *                 description: Additional details about interventions
 *               prnRecordId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional link to PRN medication record
 *     responses:
 *       200:
 *         description: Behavioral log updated successfully
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
 *                   example: "Behavioral log updated successfully"
 *                 log:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: STAFF can only edit within 24 hours
 *       404:
 *         description: Behavioral log not found
 */

/**
 * @swagger
 * /api/behavioral/logs/{id}:
 *   delete:
 *     summary: Delete behavioral log (soft delete)
 *     description: Soft delete a behavioral log. Preserves record for compliance. STAFF can only delete within 24 hours of creation.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Behavioral log ID
 *     responses:
 *       200:
 *         description: Behavioral log deleted successfully
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
 *                   example: "Behavioral log deleted successfully"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: STAFF can only delete within 24 hours
 *       404:
 *         description: Behavioral log not found
 */

/**
 * @swagger
 * /api/behavioral/dashboard:
 *   get:
 *     summary: Get behavioral dashboard summary
 *     description: Get a summary of behavioral activity for a given period, including total incidents, severity breakdown, most frequent behavior, daily counts, and escalation detection.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID (optional)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month (1-12) for filtering (defaults to current month)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 2000
 *         description: Year for filtering (defaults to current year)
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *     responses:
 *       200:
 *         description: Dashboard summary retrieved successfully
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
 *                     period:
 *                       type: object
 *                       properties:
 *                         month:
 *                           type: integer
 *                         year:
 *                           type: integer
 *                         startDate:
 *                           type: string
 *                           format: date-time
 *                         endDate:
 *                           type: string
 *                           format: date-time
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalIncidents:
 *                           type: integer
 *                           description: Total number of behavioral incidents
 *                         severityCounts:
 *                           type: object
 *                           properties:
 *                             Low:
 *                               type: integer
 *                             Moderate:
 *                               type: integer
 *                             High:
 *                               type: integer
 *                         mostFrequentBehavior:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             type:
 *                               type: string
 *                             count:
 *                               type: integer
 *                     trends:
 *                       type: object
 *                       properties:
 *                         dailyCounts:
 *                           type: object
 *                           additionalProperties:
 *                             type: integer
 *                           description: Daily counts as object with date keys
 *                         behaviorTypeCounts:
 *                           type: object
 *                           additionalProperties:
 *                             type: integer
 *                           description: Counts by behavior type
 *                     alerts:
 *                       type: object
 *                       properties:
 *                         escalationWeeks:
 *                           type: array
 *                           nullable: true
 *                           items:
 *                             type: object
 *                             properties:
 *                               week:
 *                                 type: string
 *                                 format: date
 *                               count:
 *                                 type: integer
 *                         hasEscalation:
 *                           type: boolean
 *                           description: Whether escalation patterns were detected
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/behavioral/notes:
 *   get:
 *     summary: Get behavioral notes with filtering and pagination
 *     description: Retrieve a paginated list of behavioral notes with optional filtering by resident, date range, and tenant. All authenticated users can view notes within their tenant.
 *     tags: [Behavioral Tracking]
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
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter notes that overlap with this start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter notes that overlap with this end date (YYYY-MM-DD)
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *     responses:
 *       200:
 *         description: List of behavioral notes with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 notes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       residentId:
 *                         type: string
 *                       residentName:
 *                         type: string
 *                         nullable: true
 *                       tenantId:
 *                         type: string
 *                         format: uuid
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *                       endDate:
 *                         type: string
 *                         format: date-time
 *                       narrative:
 *                         type: string
 *                         description: Full narrative text
 *                       isAiGenerated:
 *                         type: boolean
 *                       currentVersion:
 *                         type: integer
 *                       generatedBy:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       tenant:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/behavioral/notes/generate:
 *   post:
 *     summary: Generate behavioral note using AI
 *     description: Generate an AI-powered behavioral narrative note based on behavioral logs for a specific date range. All authenticated users can generate notes.
 *     tags: [Behavioral Tracking]
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
 *               - startDate
 *               - endDate
 *             properties:
 *               residentId:
 *                 type: string
 *                 description: Resident ID
 *                 example: "form-submission-123"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for the note period (YYYY-MM-DD)
 *                 example: "2025-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date for the note period (YYYY-MM-DD)
 *                 example: "2025-01-31"
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. SUPER_ADMIN can specify tenant in body.
 *     responses:
 *       201:
 *         description: Behavioral note generated successfully
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
 *                   example: "Behavioral note generated successfully"
 *                 note:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     residentId:
 *                       type: string
 *                     residentName:
 *                       type: string
 *                       nullable: true
 *                     tenantId:
 *                       type: string
 *                       format: uuid
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     narrative:
 *                       type: string
 *                       description: AI-generated narrative text
 *                     isAiGenerated:
 *                       type: boolean
 *                     currentVersion:
 *                       type: integer
 *                     generatedBy:
 *                       type: string
 *                       format: uuid
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: No behavioral logs found for the specified period
 *       500:
 *         description: Internal server error or AI service unavailable
 */

/**
 * @swagger
 * /api/behavioral/notes/{id}:
 *   get:
 *     summary: Get behavioral note by ID with version history
 *     description: Retrieve a specific behavioral note by ID including its version history. All authenticated users can view notes within their tenant.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Behavioral note ID
 *     responses:
 *       200:
 *         description: Behavioral note details with version history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 note:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     residentId:
 *                       type: string
 *                     residentName:
 *                       type: string
 *                       nullable: true
 *                     tenantId:
 *                       type: string
 *                       format: uuid
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     narrative:
 *                       type: string
 *                     isAiGenerated:
 *                       type: boolean
 *                     currentVersion:
 *                       type: integer
 *                     generatedBy:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     tenant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                     versions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           noteId:
 *                             type: string
 *                             format: uuid
 *                           version:
 *                             type: integer
 *                           residentId:
 *                             type: string
 *                           residentName:
 *                             type: string
 *                           tenantId:
 *                             type: string
 *                             format: uuid
 *                           startDate:
 *                             type: string
 *                             format: date-time
 *                           endDate:
 *                             type: string
 *                             format: date-time
 *                           narrative:
 *                             type: string
 *                           isAiGenerated:
 *                             type: boolean
 *                           createdBy:
 *                             type: string
 *                             format: uuid
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           creator:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *       404:
 *         description: Behavioral note not found or access denied
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/behavioral/notes/{id}:
 *   put:
 *     summary: Update behavioral note (manual edit)
 *     description: Manually update a behavioral note. Creates a new version while preserving history. All authenticated users can update notes within their tenant.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Behavioral note ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - narrative
 *             properties:
 *               narrative:
 *                 type: string
 *                 description: Updated narrative text
 *                 example: "Updated behavioral narrative with additional details..."
 *     responses:
 *       200:
 *         description: Behavioral note updated successfully
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
 *                   example: "Behavioral note updated successfully"
 *                 note:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     residentId:
 *                       type: string
 *                     residentName:
 *                       type: string
 *                       nullable: true
 *                     tenantId:
 *                       type: string
 *                       format: uuid
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     narrative:
 *                       type: string
 *                     isAiGenerated:
 *                       type: boolean
 *                     currentVersion:
 *                       type: integer
 *                     generatedBy:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Behavioral note not found or access denied
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/behavioral/notes/{id}/regenerate:
 *   post:
 *     summary: Regenerate behavioral note using AI
 *     description: Regenerate an existing behavioral note using AI. Creates a new version while preserving history. All authenticated users can regenerate notes within their tenant.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Behavioral note ID
 *     responses:
 *       200:
 *         description: Behavioral note regenerated successfully
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
 *                   example: "Behavioral note regenerated successfully"
 *                 note:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     residentId:
 *                       type: string
 *                     residentName:
 *                       type: string
 *                       nullable: true
 *                     tenantId:
 *                       type: string
 *                       format: uuid
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     narrative:
 *                       type: string
 *                     isAiGenerated:
 *                       type: boolean
 *                     currentVersion:
 *                       type: integer
 *                     generatedBy:
 *                       type: string
 *                       format: uuid
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Behavioral note not found or no behavioral logs found
 *       500:
 *         description: Internal server error or AI service unavailable
 */

/**
 * @swagger
 * /api/behavioral/trends:
 *   get:
 *     summary: Get behavior trends analysis
 *     description: Get comprehensive trend analysis of behavioral data including frequency, severity patterns, trigger analysis, and escalation detection. Response structure varies based on the type parameter.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID (optional)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for trend analysis (YYYY-MM-DD). Required for all types except escalations.
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for trend analysis (YYYY-MM-DD). Required for all types except escalations.
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [comprehensive, frequency, severity, triggers, escalations]
 *           default: comprehensive
 *         description: Type of trend analysis to perform
 *       - in: query
 *         name: lookbackDays
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to look back (only for escalations type)
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *     responses:
 *       200:
 *         description: Trend analysis retrieved successfully. Response structure varies by type parameter.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 trends:
 *                   type: object
 *                   description: Structure varies by type. See BEHAVIORAL_API_RESPONSE_FORMAT.md for detailed response formats.
 *                   oneOf:
 *                     - type: object
 *                       description: Comprehensive trends (default)
 *                       properties:
 *                         period:
 *                           type: object
 *                         summary:
 *                           type: object
 *                         trends:
 *                           type: object
 *                         patterns:
 *                           type: object
 *                     - type: object
 *                       description: Frequency trends
 *                       properties:
 *                         period:
 *                           type: object
 *                         totalIncidents:
 *                           type: integer
 *                         frequency:
 *                           type: array
 *                     - type: object
 *                       description: Severity trends
 *                       properties:
 *                         period:
 *                           type: object
 *                         totals:
 *                           type: object
 *                         percentages:
 *                           type: object
 *                         trends:
 *                           type: object
 *                     - type: object
 *                       description: Trigger analysis
 *                       properties:
 *                         period:
 *                           type: object
 *                         totalLogsWithTriggers:
 *                           type: integer
 *                         triggers:
 *                           type: array
 *                         topTriggers:
 *                           type: array
 *                     - type: object
 *                       description: Escalation detection
 *                       properties:
 *                         period:
 *                           type: object
 *                         escalations:
 *                           type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/behavioral/export:
 *   get:
 *     summary: Export behavioral report to PDF
 *     description: Export filtered behavioral logs to PDF format with summary statistics, AI-generated narrative (if available), and detailed log table. All authenticated users can export reports.
 *     tags: [Behavioral Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can target a specific tenant.
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *         description: Filter by resident ID
 *       - in: query
 *         name: behaviorType
 *         schema:
 *           type: string
 *           enum: [Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other]
 *         description: Filter by behavior type
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [Low, Moderate, High]
 *         description: Filter by severity level
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
 *         description: PDF file generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: No behavioral logs found to export
 */


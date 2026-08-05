/**
 * @swagger
 * /api/notes:
 *   post:
 *     summary: Create new progress note
 *     description: Create a new progress note for a resident. All authenticated users can create notes. STAFF can only create notes within their tenant.
 *     tags: [Progress Notes]
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
 *             allOf:
 *               - $ref: '#/components/schemas/CreateNoteRequest'
 *               - type: object
 *                 properties:
 *                   tenantId:
 *                     type: string
 *                     format: uuid
 *                     description: Optional. SUPER_ADMIN can specify tenant in body.
 *     responses:
 *       201:
 *         description: Note created successfully
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
 *                   example: "Note created successfully"
 *                 note:
 *                   $ref: '#/components/schemas/Note'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/notes/generate:
 *   post:
 *     summary: Generate progress note using AI
 *     description: Generate a progress note using AI based on resident data and context
 *     tags: [Progress Notes]
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
 *               - type
 *             properties:
 *               residentId:
 *                 type: string
 *                 description: Resident ID
 *                 example: "resident-123"
 *               type:
 *                 type: string
 *                 enum: [Care, Behavior]
 *                 example: "Care"
 *               context:
 *                 type: string
 *                 description: Optional context for AI generation
 *                 example: "Daily activities and health status"
 *     responses:
 *       200:
 *         description: Note generated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/notes/export:
 *   get:
 *     summary: Export notes to PDF
 *     description: Export filtered notes to PDF format. All authenticated users can export notes.
 *     tags: [Progress Notes]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Care, Behavior]
 *         description: Filter by note type
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
 */

/**
 * @swagger
 * /api/notes:
 *   get:
 *     summary: Get notes with filtering
 *     description: Retrieve paginated list of progress notes with optional filtering. All authenticated users can view notes within their tenant.
 *     tags: [Progress Notes]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Care, Behavior]
 *         description: Filter by note type
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
 *         description: List of notes with pagination
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
 *                     $ref: '#/components/schemas/Note'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/notes/{id}:
 *   get:
 *     summary: Get note by ID with version history
 *     description: Retrieve a specific note by ID including its version history. All authenticated users can view notes within their tenant.
 *     tags: [Progress Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note details with version history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 note:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Note'
 *                     - type: object
 *                       properties:
 *                         versions:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/NoteVersion'
 *       404:
 *         description: Note not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/notes/{id}:
 *   put:
 *     summary: Update note (creates new version)
 *     description: Update a note. Creates a new version while preserving history. STAFF can only edit their own notes.
 *     tags: [Progress Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Note ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateNoteRequest'
 *     responses:
 *       200:
 *         description: Note updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: STAFF can only edit their own notes
 *       404:
 *         description: Note not found
 */

/**
 * @swagger
 * /api/notes/{id}:
 *   delete:
 *     summary: Delete note (soft delete)
 *     description: Soft delete a note. Preserves note and versions for compliance. STAFF can only delete their own notes.
 *     tags: [Progress Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: STAFF can only delete their own notes
 *       404:
 *         description: Note not found
 */

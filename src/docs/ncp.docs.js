/**
 * @swagger
 * components:
 *   schemas:
 *     NcpExtraction:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Extraction ID
 *         tenantId:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         sourcePdfS3Key:
 *           type: string
 *         sourcePdfFileName:
 *           type: string
 *         sourcePdfSize:
 *           type: integer
 *         extractedData:
 *           type: object
 *           description: Extracted NCP data matching schema
 *         status:
 *           type: string
 *           enum: [PENDING, EXTRACTING, EXTRACTED, REVIEWED, POPULATED, FAILED]
 *         extractionMethod:
 *           type: string
 *         extractionModel:
 *           type: string
 *         errorMessage:
 *           type: string
 *         populatedDocxS3Key:
 *           type: string
 *         populatedDocxUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         extractedAt:
 *           type: string
 *           format: date-time
 *         populatedAt:
 *           type: string
 *           format: date-time
 *         residentId:
 *           type: string
 *           format: uuid
 *         residentName:
 *           type: string
 *           description: Resident name (for display)
 */

/**
 * @swagger
 * /api/ncp/extract:
 *   post:
 *     summary: Upload PDF(s) and queue NCP extraction
 *     description: Upload one or more assessment PDF files and queue them for background extraction. Supports both single and bulk uploads. Returns immediately with PENDING status.
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Single PDF file (max 100MB) - use this OR files for bulk
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Multiple PDF files (max 10 files, 100MB each) - use this OR file for single
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Tenant ID (optional for SUPER_ADMIN)
 *               residentId:
 *                 oneOf:
 *                   - type: string
 *                     format: uuid
 *                   - type: array
 *                     items:
 *                       type: string
 *                       format: uuid
 *                 description: Resident ID(s) - single UUID for single file, array of UUIDs for bulk (optional)
 *     responses:
 *       200:
 *         description: Upload successful. Extraction queued for background processing. Returns extraction ID(s) with PENDING status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 extractions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       status:
 *                         type: string
 *                         example: "PENDING"
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Array of errors for failed uploads (only present if any failed)
 *       400:
 *         description: Bad request (invalid file or missing data)
 *       401:
 *         description: Unauthorized
 *       413:
 *         description: File too large
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/ncp/extractions:
 *   get:
 *     summary: List NCP extractions
 *     description: Get a paginated list of NCP extractions
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, EXTRACTING, EXTRACTED, REVIEWED, POPULATED, FAILED]
 *         description: Filter by status
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (for SUPER_ADMIN only)
 *       - in: query
 *         name: residentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by resident ID
 *     responses:
 *       200:
 *         description: List of extractions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 extractions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/NcpExtraction'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/ncp/extractions/{id}:
 *   get:
 *     summary: Get NCP extraction by ID
 *     description: Retrieve a specific NCP extraction with all extracted data
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Extraction ID
 *     responses:
 *       200:
 *         description: Extraction details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 extraction:
 *                   $ref: '#/components/schemas/NcpExtraction'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Extraction not found
 *       500:
 *         description: Server error
 *   put:
 *     summary: Update NCP extraction data
 *     description: Update the extracted data for an NCP extraction
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Extraction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - extractedData
 *             properties:
 *               extractedData:
 *                 type: object
 *                 description: Updated extracted data matching NCP schema
 *     responses:
 *       200:
 *         description: Extraction updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 extraction:
 *                   $ref: '#/components/schemas/NcpExtraction'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Extraction not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/ncp/extractions/{id}/populate:
 *   post:
 *     summary: Generate populated DOCX
 *     description: Generate a populated DOCX file from the extracted NCP data
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Extraction ID
 *     responses:
 *       200:
 *         description: DOCX generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 extraction:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                     populatedDocxUrl:
 *                       type: string
 *                     populatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (extraction not ready)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Extraction not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/ncp/extractions/{id}/download:
 *   get:
 *     summary: Download populated DOCX
 *     description: Download the populated DOCX file
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Extraction ID
 *     responses:
 *       200:
 *         description: DOCX file
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: DOCX not generated yet
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Extraction not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/ncp/extractions/{id}:
 *   delete:
 *     summary: Delete NCP extraction
 *     description: Delete an NCP extraction record and all associated S3 files (source PDF and populated DOCX if they exist). This operation is irreversible.
 *     tags: [NCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Extraction ID
 *       - in: query
 *         name: tenantId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID (for SUPER_ADMIN only)
 *     responses:
 *       200:
 *         description: Extraction deleted successfully
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
 *                   example: "Extraction deleted successfully"
 *                 extraction:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     sourcePdfFileName:
 *                       type: string
 *                     deletedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Extraction not found or access denied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Extraction not found or access denied"
 *       500:
 *         description: Server error
 */

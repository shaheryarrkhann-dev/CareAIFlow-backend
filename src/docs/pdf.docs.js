/**
 * @swagger
 * /api/pdfs/convert-docx-to-pdf:
 *   post:
 *     summary: Convert DOCX/DOC to PDF
 *     description: Upload a Word document (.docx or .doc) and receive the converted PDF as a file download. Requires LibreOffice to be installed on the server.
 *     tags: [PDF Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: .docx or .doc file (max 50MB)
 *     responses:
 *       200:
 *         description: PDF file (attachment)
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: No file or invalid file type
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       413:
 *         description: File too large (max 50MB)
 *       503:
 *         description: LibreOffice not available
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /api/pdfs/templates/{templateId}:
 *   get:
 *     summary: Get PDF template details
 *     description: Retrieve detailed information about a specific PDF template including field mappings
 *     tags: [PDF Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Template ID
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can query specific tenant.
 *     responses:
 *       200:
 *         description: Template details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 template:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     fileName:
 *                       type: string
 *                       example: employee_form.pdf
 *                     displayName:
 *                       type: string
 *                       example: Employee Application Form
 *                     description:
 *                       type: string
 *                     s3Url:
 *                       type: string
 *                       format: uri
 *                     fieldMapping:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fieldName:
 *                             type: string
 *                             example: employee_name
 *                           page:
 *                             type: integer
 *                             example: 0
 *                           x:
 *                             type: number
 *                             example: 100
 *                           y:
 *                             type: number
 *                             example: 200
 *                           width:
 *                             type: number
 *                             example: 200
 *                           height:
 *                             type: number
 *                             example: 20
 *                           type:
 *                             type: string
 *                             example: text
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Template not found
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /api/pdfs/users/{userId}/filled-pdfs:
 *   get:
 *     summary: Get filled PDFs for a user
 *     description: Retrieve all filled PDFs for a specific user with pagination
 *     tags: [PDF Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of PDFs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of PDFs to skip
 *     responses:
 *       200:
 *         description: Filled PDFs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 10
 *                   description: Number of PDFs in current response
 *                 total:
 *                   type: integer
 *                   example: 45
 *                   description: Total number of PDFs available
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                         example: tenant-123/users/user-456/filled-pdfs/1729000000000_filled_form.pdf
 *                       fileName:
 *                         type: string
 *                         example: 1729000000000_filled_form.pdf
 *                       templateName:
 *                         type: string
 *                         example: Employee Form
 *                       s3Url:
 *                         type: string
 *                         format: uri
 *                         example: https://bucket.s3.region.amazonaws.com/path/to/file.pdf
 *                       size:
 *                         type: integer
 *                         example: 524288
 *                       sizeInKB:
 *                         type: integer
 *                         example: 512
 *                       lastModified:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     total:
 *                       type: integer
 *                       example: 45
 *                     hasMore:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Bad request (e.g., userId required)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */


















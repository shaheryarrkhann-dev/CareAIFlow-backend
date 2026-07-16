/**
 * @swagger
 * /api/embeddings/upload:
 *   post:
 *     summary: Upload PDF with automatic field detection
 *     description: Uploads a PDF, extracts text, generates embeddings, and automatically detects form fields (interactive fields, AI detection, or manual mapping). Creates a template for PDF filling.
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF file to upload
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. SUPER_ADMIN can target a specific tenant.
 *               displayName:
 *                 type: string
 *                 description: Optional display name for the template
 *               description:
 *                 type: string
 *                 description: Optional description for the template
 *               fieldMapping:
 *                 type: string
 *                 description: Optional JSON array of field mappings with coordinates (if not provided, interactive fields or AI detection will be used)
 *                 example: '[{"fieldName":"employee_name","page":0,"x":100,"y":200,"width":200,"height":20,"type":"text"}]'
 *               enableAIDetection:
 *                 type: boolean
 *                 description: "Enable AI-powered field detection (default: true)"
 *     responses:
 *       201:
 *         description: PDF uploaded successfully with field detection
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
 *                   example: 🤖 PDF uploaded with AI-detected field positions!
 *                 chunks:
 *                   type: integer
 *                   example: 42
 *                 schemaUpdated:
 *                   type: boolean
 *                 schemaId:
 *                   type: string
 *                   format: uuid
 *                 s3:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       format: uri
 *                     key:
 *                       type: string
 *                     bucket:
 *                       type: string
 *                 template:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     displayName:
 *                       type: string
 *                     hasFieldMapping:
 *                       type: boolean
 *                     fieldCount:
 *                       type: integer
 *                     aiGenerated:
 *                       type: boolean
 *                 interactiveFields:
 *                   type: object
 *                   properties:
 *                     found:
 *                       type: boolean
 *                       description: Whether interactive form fields were detected
 *                     count:
 *                       type: integer
 *                       description: Number of interactive fields found
 *                     fieldNames:
 *                       type: array
 *                       items:
 *                         type: string
 *                 aiDetection:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     fieldsDetected:
 *                       type: integer
 *                     usedAI:
 *                       type: boolean
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *
 * /api/embeddings/templates:
 *   get:
 *     summary: Get all PDF templates for tenant
 *     description: Retrieve all PDF templates uploaded for the tenant with optional pagination
 *     tags: [Embeddings]
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of PDF templates with pagination
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
 *                   example: 20
 *                   description: Number of items in current response
 *                 total:
 *                   type: integer
 *                   example: 45
 *                   description: Total number of items available
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       fileName:
 *                         type: string
 *                         example: employment_form.pdf
 *                       displayName:
 *                         type: string
 *                         example: Employment Application
 *                       description:
 *                         type: string
 *                       s3Url:
 *                         type: string
 *                         format: uri
 *                       fieldCount:
 *                         type: integer
 *                         example: 15
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /api/embeddings/{id}:
 *   delete:
 *     summary: Delete PDF template and embeddings
 *     description: |
 *       Permanently delete a PDF template and all its associated embeddings/chunks. 
 *       Also automatically cleans up master form fields that are no longer used by other PDFs.
 *       WARNING - This action cannot be undone!
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: PDF template ID to delete
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can target specific tenant.
 *     responses:
 *       200:
 *         description: PDF deleted successfully with field cleanup results
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
 *                   example: PDF deleted successfully and 3 unused field(s) removed from master form
 *                 deletedPdf:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     fileName:
 *                       type: string
 *                       example: employment_form.pdf
 *                     displayName:
 *                       type: string
 *                       example: Employment Application
 *                     chunksDeleted:
 *                       type: integer
 *                       example: 42
 *                       description: Number of embedding chunks deleted
 *                 fieldCleanup:
 *                   type: object
 *                   properties:
 *                     fieldsRemoved:
 *                       type: integer
 *                       example: 3
 *                       description: Number of fields removed from master form
 *                     fieldsStillInUse:
 *                       type: integer
 *                       example: 12
 *                       description: Number of fields still used by other PDFs
 *                     masterFormDeleted:
 *                       type: boolean
 *                       example: false
 *                       description: true if this was the last PDF and master form was deleted
 *                     masterFormUpdated:
 *                       type: boolean
 *                       example: true
 *       404:
 *         description: PDF not found
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
 *                   example: PDF not found
 *       403:
 *         description: Access denied - only ADMIN and SUPER_ADMIN can delete PDFs
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
 *                   example: Insufficient permissions
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /api/embeddings/{id}/preview-delete:
 *   get:
 *     summary: Preview field cleanup before deletion
 *     description: Shows which fields will be removed from master form if this PDF is deleted
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: PDF template ID
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. SUPER_ADMIN can target specific tenant.
 *     responses:
 *       200:
 *         description: Preview of cleanup results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 preview:
 *                   type: object
 *                   properties:
 *                     willRemoveFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["unique_field_1", "unique_field_2"]
 *                       description: Fields that will be removed (not used by other PDFs)
 *                     fieldsStillInUse:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["employee_name", "employee_email"]
 *                       description: Fields that will be kept (used by other PDFs)
 *                     willDeleteMasterForm:
 *                       type: boolean
 *                       example: false
 *                       description: true if this is the last PDF and master form will be deleted
 *                 pdfTemplate:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     displayName:
 *                       type: string
 *       404:
 *         description: PDF not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */



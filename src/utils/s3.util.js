const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Virtual-hosted–style public object URL (same pattern as uploads in this codebase).
 * Browser <img src> can use this when the bucket/object allows anonymous GET (or via CloudFront).
 * @param {string} s3Key
 * @returns {string|null}
 */
function buildPublicS3ObjectUrl(s3Key) {
  if (!s3Key || !process.env.S3_BUCKET_NAME || !process.env.AWS_REGION) {
    return null;
  }
  const key = String(s3Key).replace(/^\/+/, "");
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Upload a PDF file to S3 with tenant-wise folder structure
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID for folder organization
 * @param {string} params.fileName - Original file name
 * @param {Buffer} params.buffer - File buffer
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadPdfToS3({ tenantId, fileName, buffer }) {
  try {
    // Generate unique filename with timestamp to avoid collisions
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `${tenantId}/${timestamp}_${sanitizedFileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256", // Enable server-side encryption
      Metadata: {
        tenantId: tenantId,
        originalFileName: fileName,
        uploadedAt: new Date().toISOString(),
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Construct the S3 URL
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded PDF to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
      tenantFolder: tenantId,
    };
  } catch (error) {
    console.error("[S3] Upload error:", error);
    throw new Error(`Failed to upload PDF to S3: ${error.message}`);
  }
}

/**
 * Download a PDF file from S3
 * @param {string} s3Key - S3 key of the file to download
 * @returns {Promise<Buffer>} File buffer
 */
async function downloadPdfFromS3(s3Key) {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    };

    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log(`[S3] Successfully downloaded PDF from: ${s3Key}`);
    return buffer;
  } catch (error) {
    console.error("[S3] Download error:", error);
    throw new Error(`Failed to download PDF from S3: ${error.message}`);
  }
}

/**
 * Upload a filled PDF to S3 in user-specific folder
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID for folder organization
 * @param {string} params.userId - User ID for subfolder organization
 * @param {string} params.fileName - File name for the filled PDF
 * @param {Buffer} params.buffer - PDF file buffer
 * @param {string} [params.templateId] - Optional template ID for tracking
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadFilledPdfToS3({
  tenantId,
  userId,
  fileName,
  buffer,
  templateId = null,
}) {
  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Structure: tenant-id/user-id/filled-pdfs/timestamp_filename.pdf
    const s3Key = `${tenantId}/users/${userId}/filled-pdfs/${timestamp}_${sanitizedFileName}`;

    const metadata = {
      tenantId: tenantId,
      userId: userId,
      filledAt: new Date().toISOString(),
      type: "filled-pdf",
    };

    if (templateId) {
      metadata.templateId = templateId;
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
      Metadata: metadata,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Construct the S3 URL
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded filled PDF to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
      tenantFolder: tenantId,
      userFolder: userId,
    };
  } catch (error) {
    console.error("[S3] Upload filled PDF error:", error);
    throw new Error(`Failed to upload filled PDF to S3: ${error.message}`);
  }
}

/**
 * List all filled PDFs for a specific user from S3
 * @param {Object} params - List parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {number} [params.limit] - Maximum number of files to return
 * @param {number} [params.offset] - Number of files to skip
 * @returns {Promise<Object>} List of filled PDFs
 */
async function listUserFilledPdfs({
  tenantId,
  userId,
  limit = 10,
  offset = 0,
}) {
  try {
    // S3 key prefix for this user's filled PDFs
    const prefix = `${tenantId}/users/${userId}/filled-pdfs/`;

    console.log(
      `[S3] Listing filled PDFs for user ${userId} in tenant ${tenantId}`
    );
    console.log(`[S3] Prefix: ${prefix}`);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: prefix,
    };

    const command = new ListObjectsV2Command(params);
    const response = await s3Client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      console.log(`[S3] No filled PDFs found for user ${userId}`);
      return {
        success: true,
        count: 0,
        total: 0,
        files: [],
        pagination: {
          limit,
          offset,
          total: 0,
        },
      };
    }

    // Format the response
    let files = response.Contents.map((item) => {
      // Extract filename from key (remove prefix)
      const filename = item.Key.replace(prefix, "");

      // Extract template name from filename (format: timestamp_filled_originalname.pdf)
      const templateNameMatch = filename.match(/filled_(.+)\.pdf$/);
      const templateName = templateNameMatch
        ? templateNameMatch[1].replace(/_/g, " ")
        : filename;

      return {
        key: item.Key,
        fileName: filename,
        templateName: templateName,
        s3Url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`,
        size: item.Size,
        lastModified: item.LastModified,
        sizeInKB: Math.round(item.Size / 1024),
      };
    });

    // Sort by last modified date (newest first)
    files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // Get total count before pagination
    const total = files.length;

    // Apply pagination
    const paginatedFiles = files.slice(offset, offset + limit);

    console.log(
      `[S3] Found ${total} total filled PDFs for user ${userId}, returning ${paginatedFiles.length} with pagination (limit: ${limit}, offset: ${offset})`
    );

    return {
      success: true,
      count: paginatedFiles.length,
      total: total,
      files: paginatedFiles,
      pagination: {
        limit,
        offset,
        total: total,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    console.error("[S3] List filled PDFs error:", error);
    throw new Error(`Failed to list filled PDFs: ${error.message}`);
  }
}

/**
 * Download the NCP DOCX template from S3
 * @param {string} [s3Key] - Optional S3 key, defaults to NCP_TEMPLATE_S3_KEY env var
 * @returns {Promise<Buffer>} DOCX file buffer
 */
async function getNcpTemplateFromS3(s3Key = null) {
  try {
    const templateKey =
      s3Key ||
      process.env.NCP_TEMPLATE_S3_KEY ||
      "templates/afh-ncp-template.docx";

    console.log(`[S3] Downloading NCP template from: ${templateKey}`);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: templateKey,
    };

    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log(
      `[S3] Successfully downloaded NCP template (${buffer.length} bytes)`
    );
    return buffer;
  } catch (error) {
    console.error("[S3] Download NCP template error:", error);
    throw new Error(
      `Failed to download NCP template from S3: ${error.message}`
    );
  }
}

/**
 * Upload a populated DOCX file to S3
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID for folder organization
 * @param {string} params.userId - User ID for subfolder organization
 * @param {string} params.extractionId - NCP extraction ID
 * @param {string} params.fileName - File name for the populated DOCX
 * @param {Buffer} params.buffer - DOCX file buffer
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadPopulatedDocxToS3({
  tenantId,
  userId,
  extractionId,
  fileName,
  buffer,
}) {
  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Structure: tenant-id/users/user-id/ncp-extractions/extraction-id/timestamp_filename.docx
    const s3Key = `${tenantId}/users/${userId}/ncp-extractions/${extractionId}/${timestamp}_${sanitizedFileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ServerSideEncryption: "AES256", // Enable server-side encryption
      Metadata: {
        tenantId: tenantId,
        userId: userId,
        extractionId: extractionId,
        populatedAt: new Date().toISOString(),
        type: "ncp-populated-docx",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Construct the S3 URL
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded populated DOCX to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
      tenantFolder: tenantId,
      userFolder: userId,
    };
  } catch (error) {
    console.error("[S3] Upload populated DOCX error:", error);
    throw new Error(`Failed to upload populated DOCX to S3: ${error.message}`);
  }
}

/**
 * Upload a resident photo to S3
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID for folder organization
 * @param {string} params.residentId - Resident ID for subfolder organization
 * @param {string} params.fileName - Original file name
 * @param {Buffer} params.buffer - Image file buffer
 * @param {string} params.mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png')
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadResidentPhotoToS3({
  tenantId,
  residentId,
  fileName,
  buffer,
  mimeType,
}) {
  try {
    // Generate unique filename with timestamp to avoid collisions
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Structure: tenant-id/residents/resident-id/photos/timestamp_filename
    const s3Key = `${tenantId}/residents/${residentId}/photos/${timestamp}_${sanitizedFileName}`;

    // Validate MIME type (only allow image types)
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      throw new Error(
        `Invalid image type. Allowed types: ${allowedMimeTypes.join(", ")}`
      );
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: "AES256", // Enable server-side encryption
      Metadata: {
        tenantId: tenantId,
        residentId: residentId,
        originalFileName: fileName,
        uploadedAt: new Date().toISOString(),
        type: "resident-photo",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Construct the S3 URL
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded resident photo to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
      tenantFolder: tenantId,
      residentFolder: residentId,
    };
  } catch (error) {
    console.error("[S3] Upload resident photo error:", error);
    throw new Error(`Failed to upload resident photo to S3: ${error.message}`);
  }
}

/**
 * Upload an e-signature image to S3
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID for folder organization
 * @param {string} params.residentId - Resident ID for subfolder organization
 * @param {string} params.fileName - Original file name (e.g. 'signature.png')
 * @param {Buffer} params.buffer - Image file buffer
 * @param {string} params.mimeType - Image MIME type (e.g. 'image/png', 'image/jpeg')
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadESignatureToS3({
  tenantId,
  residentId,
  fileName,
  buffer,
  mimeType,
}) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = (fileName || "signature.png").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    const s3Key = `${tenantId}/residents/${residentId}/esignature/${timestamp}_${sanitizedFileName}`;

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes((mimeType || "").toLowerCase())) {
      throw new Error(
        `Invalid image type. Allowed types: ${allowedMimeTypes.join(", ")}`
      );
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType || "image/png",
      ServerSideEncryption: "AES256",
      Metadata: {
        tenantId: tenantId,
        residentId: residentId,
        originalFileName: fileName || "signature.png",
        uploadedAt: new Date().toISOString(),
        type: "e-signature",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded e-signature to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
      tenantFolder: tenantId,
      residentFolder: residentId,
    };
  } catch (error) {
    console.error("[S3] Upload e-signature error:", error);
    throw new Error(`Failed to upload e-signature to S3: ${error.message}`);
  }
}

/**
 * Upload a facility document to S3
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} [params.folderId] - Optional folder ID for path
 * @param {string} params.fileName - Original file name
 * @param {Buffer} params.buffer - File buffer
 * @param {string} [params.mimeType] - MIME type (default: application/octet-stream)
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadFacilityDocumentToS3({
  tenantId,
  folderId = null,
  fileName,
  buffer,
  mimeType = "application/octet-stream",
}) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folderPath = folderId ? `folders/${folderId}/` : "";
    const s3Key = `${tenantId}/facility/documents/${folderPath}${timestamp}_${sanitizedFileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
      Metadata: {
        tenantId,
        originalFileName: fileName,
        folderId: folderId || "",
        uploadedAt: new Date().toISOString(),
        type: "facility-document",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded facility document to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
    };
  } catch (error) {
    console.error("[S3] Upload facility document error:", error);
    throw new Error(
      `Failed to upload facility document to S3: ${error.message}`
    );
  }
}

/**
 * Upload a staff document to S3
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.staffId - Staff member ID
 * @param {string} [params.folderId] - Optional folder ID for path
 * @param {string} params.fileName - Original file name
 * @param {Buffer} params.buffer - File buffer
 * @param {string} [params.mimeType] - MIME type (default: application/octet-stream)
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadStaffDocumentToS3({
  tenantId,
  staffId,
  folderId = null,
  fileName,
  buffer,
  mimeType = "application/octet-stream",
}) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folderPath = folderId ? `folders/${folderId}/` : "";
    const s3Key = `${tenantId}/staff/documents/${staffId}/${folderPath}${timestamp}_${sanitizedFileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
      Metadata: {
        tenantId,
        staffId,
        originalFileName: fileName,
        folderId: folderId || "",
        uploadedAt: new Date().toISOString(),
        type: "staff-document",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded staff document to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
    };
  } catch (error) {
    console.error("[S3] Upload staff document error:", error);
    throw new Error(`Failed to upload staff document to S3: ${error.message}`);
  }
}

/**
 * Upload a resident document to S3
 * @param {Object} params - Upload parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.residentId - Resident ID
 * @param {string} [params.folderId] - Optional folder ID for path
 * @param {string} params.fileName - Original file name
 * @param {Buffer} params.buffer - File buffer
 * @param {string} [params.mimeType] - MIME type (default: application/octet-stream)
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadResidentDocumentToS3({
  tenantId,
  residentId,
  folderId = null,
  fileName,
  buffer,
  mimeType = "application/octet-stream",
}) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folderPath = folderId ? `folders/${folderId}/` : "";
    const s3Key = `${tenantId}/residents/${residentId}/documents/${folderPath}${timestamp}_${sanitizedFileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
      Metadata: {
        tenantId,
        residentId,
        originalFileName: fileName,
        folderId: folderId || "",
        uploadedAt: new Date().toISOString(),
        type: "resident-document",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded resident document to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
      bucket: process.env.S3_BUCKET_NAME,
    };
  } catch (error) {
    console.error("[S3] Upload resident document error:", error);
    throw new Error(
      `Failed to upload resident document to S3: ${error.message}`
    );
  }
}

/**
 * Download a file from S3 (generic - works for any file type)
 * @param {string} s3Key - S3 key of the file
 * @returns {Promise<Buffer>} File buffer
 */
async function downloadFileFromS3(s3Key) {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    };
    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error("[S3] Download file error:", error);
    throw new Error(`Failed to download file from S3: ${error.message}`);
  }
}

/**
 * Delete a file from S3
 * @param {string} s3Key - S3 key of the file to delete
 */
async function deleteFileFromS3(s3Key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });
    await s3Client.send(command);
    console.log(`[S3] Successfully deleted file: ${s3Key}`);
  } catch (error) {
    console.error("[S3] Delete file error:", error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
}

/**
 * Upload visitor QR logo image to S3 (per-facility).
 * @param {Object} params - { tenantId, facilityId, buffer, mimeType, fileName }
 * @returns {Promise<Object>} { s3Key, success }
 */
async function uploadVisitorQrLogoToS3({
  tenantId,
  facilityId,
  buffer,
  mimeType = "image/png",
  fileName = "logo.png",
}) {
  const allowedMime = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedMime.includes((mimeType || "").toLowerCase())) {
    throw new Error("Logo must be JPEG, PNG, GIF, or WebP");
  }
  const timestamp = Date.now();
  const ext = (fileName || "logo").split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? ext : "png";
  const s3Key = `${tenantId}/visitor-qr-logos/${facilityId}_${timestamp}.${safeExt}`;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
    ServerSideEncryption: "AES256",
    Metadata: {
      tenantId,
      facilityId,
      uploadedAt: new Date().toISOString(),
      type: "visitor-qr-logo",
    },
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  console.log(`[S3] Uploaded visitor QR logo: ${s3Key}`);
  return { success: true, s3Key };
}

/**
 * Upload facility profile photo to S3.
 * @param {Object} params - { tenantId, facilityId, buffer, mimeType, fileName }
 * @returns {Promise<Object>} { s3Key, success }
 */
async function uploadFacilityProfilePhotoToS3({
  tenantId,
  facilityId,
  buffer,
  mimeType = "image/png",
  fileName = "photo.png",
}) {
  const allowedMime = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedMime.includes((mimeType || "").toLowerCase())) {
    throw new Error("Photo must be JPEG, PNG, GIF, or WebP");
  }
  const timestamp = Date.now();
  const ext = (fileName || "photo").split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? ext : "png";
  const s3Key = `${tenantId}/facility-profile-photos/${facilityId}_${timestamp}.${safeExt}`;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
    ServerSideEncryption: "AES256",
    Metadata: {
      tenantId,
      facilityId,
      uploadedAt: new Date().toISOString(),
      type: "facility-profile-photo",
    },
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  const s3Url = buildPublicS3ObjectUrl(s3Key);
  console.log(`[S3] Uploaded facility profile photo: ${s3Key}`);
  return { success: true, s3Key, s3Url };
}

/**
 * Upload staff employee profile photo to S3.
 * @param {Object} params - { tenantId, staffMemberId, buffer, mimeType, fileName }
 * @returns {Promise<Object>} { s3Key, s3Url, success }
 */
async function uploadStaffProfilePhotoToS3({
  tenantId,
  staffMemberId,
  buffer,
  mimeType = "image/png",
  fileName = "photo.png",
}) {
  const allowedMime = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedMime.includes((mimeType || "").toLowerCase())) {
    throw new Error("Photo must be JPEG, PNG, GIF, or WebP");
  }
  const timestamp = Date.now();
  const ext = (fileName || "photo").split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? ext : "png";
  const s3Key = `${tenantId}/staff-profile-photos/${staffMemberId}_${timestamp}.${safeExt}`;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
    ServerSideEncryption: "AES256",
    Metadata: {
      tenantId,
      staffMemberId,
      uploadedAt: new Date().toISOString(),
      type: "staff-profile-photo",
    },
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  const s3Url = buildPublicS3ObjectUrl(s3Key);
  console.log(`[S3] Uploaded staff profile photo: ${s3Key}`);
  return { success: true, s3Key, s3Url };
}

/**
 * Get a presigned URL for viewing a file inline in the browser (e.g. PDF, images).
 * Short expiry (15 min) limits link sharing; add route-level rate limiting if needed.
 * @param {string} s3Key - S3 key of the file
 * @param {number} [expiresIn=900] - URL expiry in seconds (default 15 min)
 * @returns {Promise<string>} Presigned URL with Content-Disposition: inline
 */
async function getPresignedViewUrl(s3Key, expiresIn = 900) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    ResponseContentDisposition: "inline",
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

module.exports = {
  uploadPdfToS3,
  downloadPdfFromS3,
  uploadFilledPdfToS3,
  listUserFilledPdfs,
  getNcpTemplateFromS3,
  uploadPopulatedDocxToS3,
  uploadResidentPhotoToS3,
  uploadESignatureToS3,
  uploadFacilityDocumentToS3,
  uploadStaffDocumentToS3,
  uploadResidentDocumentToS3,
  uploadVisitorQrLogoToS3,
  uploadFacilityProfilePhotoToS3,
  uploadStaffProfilePhotoToS3,
  buildPublicS3ObjectUrl,
  downloadFileFromS3,
  deleteFileFromS3,
  getPresignedViewUrl,
  s3Client,
};

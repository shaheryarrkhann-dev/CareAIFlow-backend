# AWS S3 Integration for PDF Storage

## Overview

PDFs uploaded via the `/api/embeddings/upload` endpoint are now automatically stored in AWS S3 **before** being processed for embeddings and schema generation. This provides:

- **Persistent Storage**: PDFs are permanently stored in S3
- **Tenant Isolation**: Each tenant has their own folder in the bucket
- **Backup & Recovery**: Easy access to original PDFs
- **Scalability**: S3 handles storage scaling automatically

---

## Architecture

### Upload Flow

1. **User uploads PDF** → Controller receives file buffer
2. **Upload to S3** → PDF saved to `{tenantId}/{timestamp}_{filename}.pdf`
3. **Process PDF** → Extract text, create embeddings, generate schema
4. **Return Response** → Includes S3 URL and metadata

### S3 Folder Structure

```
s3://pdf-storage-project/
├── tenant-uuid-1/
│   ├── 1697123456789_employee_form.pdf
│   ├── 1697234567890_onboarding_guide.pdf
│   └── 1697345678901_benefits_form.pdf
├── tenant-uuid-2/
│   ├── 1697456789012_student_enrollment.pdf
│   └── 1697567890123_parent_consent.pdf
└── tenant-uuid-3/
    └── 1697678901234_health_questionnaire.pdf
```

**Benefits:**
- ✅ Easy to identify which PDFs belong to each tenant
- ✅ Simple access control via S3 bucket policies
- ✅ Clear audit trail with timestamps
- ✅ No filename collisions (timestamp prefix)

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
S3_BUCKET_NAME=pdf-storage-project
```

### AWS IAM Permissions

Your AWS user/role needs these S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::pdf-storage-project",
        "arn:aws:s3:::pdf-storage-project/*"
      ]
    }
  ]
}
```

### S3 Bucket Setup

1. **Create Bucket**
   ```bash
   aws s3 mb s3://pdf-storage-project --region us-east-1
   ```

2. **Enable Encryption** (Recommended)
   - Server-side encryption is enabled by default in the upload code
   - Files are encrypted with AES-256

3. **Block Public Access** (Recommended)
   - Enable "Block all public access" in S3 settings
   - PDFs should only be accessible via authenticated API requests

4. **Lifecycle Policies** (Optional)
   - Configure automatic archival to Glacier after 90 days
   - Or delete PDFs older than X years if needed

---

## API Response

### Before S3 Integration

```json
{
  "success": true,
  "message": "PDF uploaded and form schema updated",
  "chunks": 15,
  "schemaUpdated": true,
  "schemaId": "schema-uuid",
  "merged": true,
  "newFieldsAdded": 5
}
```

### After S3 Integration

```json
{
  "success": true,
  "message": "PDF uploaded and form schema updated",
  "chunks": 15,
  "schemaUpdated": true,
  "schemaId": "schema-uuid",
  "merged": true,
  "newFieldsAdded": 5,
  "s3": {
    "url": "https://pdf-storage-project.s3.us-east-1.amazonaws.com/tenant-uuid/1697123456789_employee_form.pdf",
    "key": "tenant-uuid/1697123456789_employee_form.pdf",
    "bucket": "pdf-storage-project"
  }
}
```

---

## Implementation Details

### Files Modified

1. **`src/utils/s3.util.js`** (NEW)
   - S3 client initialization
   - `uploadPdfToS3()` function
   - Handles file naming, metadata, encryption

2. **`src/services/embedding.service.js`**
   - Added S3 upload BEFORE processing
   - Returns S3 metadata in response
   - Fails fast if S3 upload fails

3. **`src/controllers/embedding.controller.js`**
   - Updated response to include S3 data

4. **`package.json`**
   - Added `@aws-sdk/client-s3` dependency

### S3 Upload Function

```javascript
const { uploadPdfToS3 } = require('../utils/s3.util');

// In processPdfAndStore()
const s3Result = await uploadPdfToS3({ 
  tenantId, 
  fileName, 
  buffer 
});

// Returns:
// {
//   success: true,
//   s3Key: "tenant-uuid/1697123456789_filename.pdf",
//   s3Url: "https://...",
//   bucket: "pdf-storage-project",
//   tenantFolder: "tenant-uuid"
// }
```

### File Naming Convention

- **Pattern**: `{tenantId}/{timestamp}_{sanitizedFilename}.pdf`
- **Timestamp**: Unix timestamp in milliseconds
- **Sanitization**: Special characters replaced with underscore
- **Example**: `tenant-a1b2c3/1697123456789_Employee_Onboarding_Form.pdf`

### Metadata

Each PDF includes these S3 metadata tags:

| Key | Value |
|-----|-------|
| `tenantId` | Tenant UUID |
| `originalFileName` | Original uploaded filename |
| `uploadedAt` | ISO 8601 timestamp |

---

## Error Handling

### S3 Upload Fails

If S3 upload fails, the entire PDF upload operation fails **before** any processing:

```javascript
catch (error) {
  throw new Error(`Failed to upload PDF to S3: ${error.message}`);
}
```

**Why fail fast?**
- Ensures PDFs are always backed up before processing
- Prevents orphaned embeddings without source files
- Maintains data consistency

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing credentials` | AWS env vars not set | Check `.env` file |
| `Access Denied` | Insufficient IAM permissions | Update IAM policy |
| `NoSuchBucket` | Bucket doesn't exist | Create bucket first |
| `InvalidBucketName` | Invalid bucket name | Use valid DNS name |

---

## Security Considerations

### 1. Private Bucket Access

PDFs are stored in a **private** S3 bucket (not publicly accessible). Access options:

- **Signed URLs**: Generate temporary pre-signed URLs for downloads
- **API Gateway**: Serve PDFs through authenticated API endpoints
- **CloudFront**: Use private CloudFront distribution with signed cookies

### 2. Encryption

- **In Transit**: HTTPS by default
- **At Rest**: AES-256 server-side encryption
- **Key Management**: AWS managed keys (SSE-S3) or customer keys (SSE-KMS)

### 3. Access Logs

Enable S3 access logging to track who accessed which PDFs:

```bash
aws s3api put-bucket-logging \
  --bucket pdf-storage-project \
  --bucket-logging-status file://logging.json
```

---

## Cost Considerations

### S3 Pricing (us-east-1)

| Component | Cost |
|-----------|------|
| Storage | $0.023/GB/month (Standard) |
| PUT Requests | $0.005 per 1,000 requests |
| GET Requests | $0.0004 per 1,000 requests |

### Example Calculation

- **100 tenants** × **50 PDFs** × **2 MB** = 10 GB
- **Monthly Cost**: ~$0.25/month storage + negligible request costs

### Cost Optimization

1. **Lifecycle Policies**: Move old PDFs to Glacier ($0.004/GB/month)
2. **Intelligent Tiering**: Auto-optimize based on access patterns
3. **Delete Old Files**: Remove PDFs older than retention period

---

## Testing

### Test Upload

```bash
curl -X POST http://localhost:4000/api/embeddings/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test.pdf"
```

**Expected Response:**
```json
{
  "success": true,
  "chunks": 8,
  "s3": {
    "url": "https://pdf-storage-project.s3.us-east-1.amazonaws.com/tenant-uuid/1697123456789_test.pdf",
    "key": "tenant-uuid/1697123456789_test.pdf",
    "bucket": "pdf-storage-project"
  }
}
```

### Verify in AWS Console

1. Go to S3 Console: https://s3.console.aws.amazon.com/s3/
2. Open bucket `pdf-storage-project`
3. Navigate to tenant folder
4. Verify PDF exists with metadata

### Verify via AWS CLI

```bash
# List tenant's PDFs
aws s3 ls s3://pdf-storage-project/tenant-uuid/

# Download a PDF
aws s3 cp s3://pdf-storage-project/tenant-uuid/1697123456789_test.pdf ./test.pdf

# Check metadata
aws s3api head-object \
  --bucket pdf-storage-project \
  --key tenant-uuid/1697123456789_test.pdf
```

---

## Production Checklist

- [ ] Create S3 bucket in production region
- [ ] Enable versioning (recommended)
- [ ] Enable server-side encryption
- [ ] Block all public access
- [ ] Set up lifecycle policies
- [ ] Configure CORS if needed for direct browser uploads
- [ ] Set up CloudWatch alarms for failed uploads
- [ ] Enable S3 access logging
- [ ] Create IAM role with least privilege
- [ ] Add bucket policy for cross-account access (if needed)
- [ ] Set up S3 replication for disaster recovery (optional)
- [ ] Configure S3 bucket notifications (optional)

---

## Future Enhancements

### 1. Signed URLs for Downloads

```javascript
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

async function getDownloadUrl(s3Key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}
```

### 2. PDF Deletion on Data Cleanup

```javascript
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

async function deletePdfFromS3(s3Key) {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key
  }));
}
```

### 3. Store S3 Key in Database

Add `s3Key` column to `pdf_embeddings` table:

```prisma
model PdfEmbedding {
  id        String   @id @default(cuid())
  tenantId  String
  fileName  String
  s3Key     String?  // NEW: S3 object key
  content   String
  embedding Unsupported("vector(1536)")
  createdAt DateTime @default(now())
}
```

### 4. Multi-Region Replication

Enable S3 replication to backup bucket in different region for disaster recovery.

---

## Troubleshooting

### Issue: "Missing credentials in config"

**Solution**: Verify `.env` has all AWS variables:
```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_NAME=pdf-storage-project
```

### Issue: "Access Denied" when uploading

**Solution**: Check IAM user has `s3:PutObject` permission on bucket.

### Issue: Slow uploads

**Solution**: 
- Use Transfer Acceleration: `s3-accelerate` endpoint
- Enable multipart upload for files > 100 MB
- Check network bandwidth

### Issue: PDFs uploaded but not visible in console

**Solution**: Check correct bucket and region. Verify with CLI:
```bash
aws s3 ls s3://pdf-storage-project/ --recursive
```

---

## Support

For issues or questions:
1. Check server logs for S3 errors
2. Verify AWS credentials and permissions
3. Test with AWS CLI to isolate API vs permissions issues
4. Review CloudWatch S3 metrics

---

**Last Updated**: October 14, 2025


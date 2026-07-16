const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const TEMPLATE_KEY = process.env.NCP_TEMPLATE_S3_KEY || 'templates/afh-ncp-template.docx';
const CURRENT_TEMPLATE_KEY = 'templates/afh-ncp-template.docx'; // The one currently in S3 to delete
const NEW_TEMPLATE_FILE = 'AFH_NCP_Template_with_placeholders_FINAL.docx';

async function uploadNewTemplate() {
  try {
    const templatePath = path.join(__dirname, '..', NEW_TEMPLATE_FILE);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    console.log(`[S3] Reading template file: ${templatePath}`);
    const fileBuffer = fs.readFileSync(templatePath);

    console.log(`[S3] Uploading new template to: ${TEMPLATE_KEY}`);
    const params = {
      Bucket: BUCKET_NAME,
      Key: TEMPLATE_KEY,
      Body: fileBuffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ServerSideEncryption: 'AES256',
      Metadata: {
        uploadedAt: new Date().toISOString(),
        version: 'FINAL',
        fileName: NEW_TEMPLATE_FILE
      }
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${TEMPLATE_KEY}`;
    console.log(`[S3] ✅ Successfully uploaded new template`);
    console.log(`[S3] S3 Key: ${TEMPLATE_KEY}`);
    console.log(`[S3] S3 URL: ${s3Url}`);

    return { success: true, s3Key: TEMPLATE_KEY, s3Url };
  } catch (error) {
    console.error('[S3] Error uploading new template:', error);
    throw error;
  }
}

async function deleteCurrentTemplate() {
  try {
    // First, check if the current template exists
    console.log(`[S3] Checking if current template exists: ${CURRENT_TEMPLATE_KEY}`);

    // Try to list objects with the template key prefix to see if it exists
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: 'templates/'
    };

    const listCommand = new ListObjectsV2Command(listParams);
    const listResponse = await s3Client.send(listCommand);

    const currentTemplateExists = listResponse.Contents?.some(
      obj => obj.Key === CURRENT_TEMPLATE_KEY
    );

    if (!currentTemplateExists) {
      console.log(`[S3] ⚠️  Current template not found in S3: ${CURRENT_TEMPLATE_KEY}`);
      console.log(`[S3] Skipping deletion (may have already been deleted or never uploaded)`);
      return { success: true, message: 'Current template not found, skipping deletion' };
    }

    console.log(`[S3] Deleting current template: ${CURRENT_TEMPLATE_KEY}`);
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: CURRENT_TEMPLATE_KEY
    };

    const deleteCommand = new DeleteObjectCommand(deleteParams);
    await s3Client.send(deleteCommand);

    console.log(`[S3] ✅ Successfully deleted current template: ${CURRENT_TEMPLATE_KEY}`);
    return { success: true, deletedKey: CURRENT_TEMPLATE_KEY };
  } catch (error) {
    // If it's a "NoSuchKey" error, that's okay - template doesn't exist
    if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
      console.log(`[S3] ⚠️  Current template not found in S3 (already deleted or never uploaded)`);
      return { success: true, message: 'Current template not found' };
    }
    console.error('[S3] Error deleting current template:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('NCP Template Update Script');
    console.log('='.repeat(60));
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Template Key: ${TEMPLATE_KEY}`);
    console.log(`New Template File: ${NEW_TEMPLATE_FILE}`);
    console.log(`Current Template to Delete: ${CURRENT_TEMPLATE_KEY}`);
    console.log('='.repeat(60));
    console.log('');

    // Step 1: Delete current template
    console.log('Step 1: Deleting current template...');
    await deleteCurrentTemplate();
    console.log('');

    // Step 2: Upload new template
    console.log('Step 2: Uploading new template (FINAL with placeholders)...');
    await uploadNewTemplate();
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ Template update completed successfully!');
    console.log('='.repeat(60));
    console.log('');
    console.log(`New template is now available at: ${TEMPLATE_KEY}`);
    console.log(`Make sure NCP_TEMPLATE_S3_KEY env var is set to: ${TEMPLATE_KEY}`);
    console.log('(or it will default to this path)');
  } catch (error) {
    console.error('');
    console.error('❌ Error updating template:', error.message);
    process.exit(1);
  }
}

// Run the script
main();

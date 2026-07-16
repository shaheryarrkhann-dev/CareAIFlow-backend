/**
 * DELETE FILES FROM SPECIFIC S3 BUCKET
 * 
 * Usage:
 *   node scripts/delete-specific-s3-bucket.js pdf-storage-project
 * 
 * Or set BUCKET_NAME in .env
 */

require('dotenv').config();
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const BUCKET_NAME = process.argv[2] || process.env.S3_BUCKET_NAME || 'pdf-storage-project';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

async function deleteBucketContents() {
  console.log(`\n⚠️  WARNING: This will delete ALL files from: ${BUCKET_NAME}`);
  console.log('This action is IRREVERSIBLE!\n');
  
  try {
    // List all objects
    console.log(`📊 Listing files in ${BUCKET_NAME}...`);
    const objects = [];
    let continuationToken = undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken
      });
      const response = await s3Client.send(command);
      
      if (response.Contents) {
        objects.push(...response.Contents);
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    if (objects.length === 0) {
      console.log('✅ Bucket is already empty!');
      return;
    }
    
    const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    console.log(`  Files found: ${objects.length}`);
    console.log(`  Total size: ${sizeMB} MB\n`);
    
    // Safety delay
    console.log('⏳ Starting deletion in 10 seconds...');
    console.log('   Press Ctrl+C NOW to cancel!\n');
    
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`\r   ${i}... `);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\n');
    
    // Delete in batches
    console.log('🗑️  Deleting files...\n');
    let totalDeleted = 0;
    
    for (let i = 0; i < objects.length; i += 1000) {
      const batch = objects.slice(i, i + 1000);
      
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: batch.map(obj => ({ Key: obj.Key }))
        }
      });
      
      const response = await s3Client.send(deleteCommand);
      
      if (response.Deleted) {
        totalDeleted += response.Deleted.length;
        process.stdout.write(`\r  Deleted ${totalDeleted}/${objects.length} files...`);
      }
    }
    
    console.log('\n');
    console.log(`✅ Successfully deleted ${totalDeleted} files from ${BUCKET_NAME}!`);
    
  } catch (error) {
    if (error.name === 'NoSuchBucket') {
      console.error(`❌ Bucket ${BUCKET_NAME} does not exist!`);
    } else if (error.name === 'AccessDenied') {
      console.error(`❌ Access denied! Make sure your AWS credentials have permission to delete from ${BUCKET_NAME}`);
      console.error('   Try using AWS CloudShell instead.');
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

deleteBucketContents()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });






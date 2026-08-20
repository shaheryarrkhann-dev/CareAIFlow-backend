/**
 * DELETE ALL S3 DATA SCRIPT
 * 
 * ⚠️  WARNING: This will PERMANENTLY DELETE ALL FILES from your S3 buckets!
 * 
 * What it deletes:
 * - All PDF files
 * - All uploaded documents
 * - All images
 * - All other files in S3 buckets
 * 
 * What it KEEPS:
 * - CloudTrail logs bucket (for compliance)
 * - Bucket structure (buckets themselves)
 * 
 * Usage:
 *   node scripts/delete-all-s3-data.js
 * 
 * IMPORTANT:
 * - This is IRREVERSIBLE!
 * - Make sure you have backups if needed
 */

require('dotenv').config();
const { S3Client, ListBucketsCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function logSuccess(message) {
  console.log(`${GREEN}✅ ${message}${RESET}`);
}

function logError(message) {
  console.log(`${RED}❌ ${message}${RESET}`);
}

function logWarning(message) {
  console.log(`${YELLOW}⚠️  ${message}${RESET}`);
}

function logInfo(message) {
  console.log(`${BLUE}ℹ️  ${message}${RESET}`);
}

async function listAllBuckets() {
  try {
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    return response.Buckets || [];
  } catch (error) {
    logError(`Failed to list buckets: ${error.message}`);
    throw error;
  }
}

async function listAllObjects(bucketName) {
  const objects = [];
  let continuationToken = undefined;
  
  do {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken
      });
      const response = await s3Client.send(command);
      
      if (response.Contents) {
        objects.push(...response.Contents);
      }
      
      continuationToken = response.NextContinuationToken;
    } catch (error) {
      logError(`Failed to list objects in ${bucketName}: ${error.message}`);
      throw error;
    }
  } while (continuationToken);
  
  return objects;
}

async function deleteObjects(bucketName, objects) {
  if (objects.length === 0) {
    return { deleted: 0, errors: 0 };
  }
  
  let totalDeleted = 0;
  let totalErrors = 0;
  
  // Delete in batches of 1000 (AWS limit)
  for (let i = 0; i < objects.length; i += 1000) {
    const batch = objects.slice(i, i + 1000);
    
    try {
      const command = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: batch.map(obj => ({ Key: obj.Key })),
          Quiet: false
        }
      });
      
      const response = await s3Client.send(command);
      
      if (response.Deleted) {
        totalDeleted += response.Deleted.length;
      }
      
      if (response.Errors && response.Errors.length > 0) {
        totalErrors += response.Errors.length;
        response.Errors.forEach(error => {
          logError(`Failed to delete ${error.Key}: ${error.Message}`);
        });
      }
    } catch (error) {
      logError(`Failed to delete batch from ${bucketName}: ${error.message}`);
      totalErrors += batch.length;
    }
  }
  
  return { deleted: totalDeleted, errors: totalErrors };
}

async function deleteAllS3Data() {
  console.log('\n⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
  console.log('This script will PERMANENTLY DELETE ALL FILES from S3 buckets!');
  console.log('This action is IRREVERSIBLE!');
  console.log('⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️\n');
  
  try {
    // List all buckets
    console.log('📦 Listing all S3 buckets...\n');
    const buckets = await listAllBuckets();
    
    if (buckets.length === 0) {
      logInfo('No S3 buckets found.');
      return;
    }
    
    console.log(`Found ${buckets.length} bucket(s):\n`);
    buckets.forEach((bucket, index) => {
      console.log(`  ${index + 1}. ${bucket.Name} (created: ${bucket.CreationDate})`);
    });
    
    // Check each bucket
    const bucketStats = [];
    
    for (const bucket of buckets) {
      const bucketName = bucket.Name;
      
      // Skip CloudTrail logs bucket (for compliance)
      if (bucketName.includes('audit') || bucketName.includes('cloudtrail') || bucketName.includes('logs')) {
        logWarning(`Skipping ${bucketName} (CloudTrail/Audit logs - should be preserved)`);
        continue;
      }
      
      console.log(`\n📊 Checking bucket: ${bucketName}`);
      const objects = await listAllObjects(bucketName);
      
      const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      
      console.log(`  Files: ${objects.length}`);
      console.log(`  Total size: ${sizeMB} MB`);
      
      bucketStats.push({
        name: bucketName,
        fileCount: objects.length,
        sizeMB: parseFloat(sizeMB),
        objects: objects
      });
    }
    
    // Summary
    const totalFiles = bucketStats.reduce((sum, b) => sum + b.fileCount, 0);
    const totalSize = bucketStats.reduce((sum, b) => sum + b.sizeMB, 0);
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total buckets to process: ${bucketStats.length}`);
    console.log(`Total files to delete: ${totalFiles}`);
    console.log(`Total size: ${totalSize.toFixed(2)} MB`);
    console.log('='.repeat(60) + '\n');
    
    if (totalFiles === 0) {
      logSuccess('All buckets are already empty!');
      return;
    }
    
    // Safety delay
    console.log('⏳ Starting deletion in 10 seconds...');
    console.log('   Press Ctrl+C NOW to cancel!\n');
    
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`\r   ${i}... `);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\n');
    
    // Delete from each bucket
    console.log('🗑️  Starting deletion...\n');
    
    let grandTotalDeleted = 0;
    let grandTotalErrors = 0;
    
    for (const bucketStat of bucketStats) {
      console.log(`Deleting from ${bucketStat.name}...`);
      console.log(`  Files: ${bucketStat.fileCount}`);
      
      const result = await deleteObjects(bucketStat.name, bucketStat.objects);
      
      if (result.errors === 0) {
        logSuccess(`  ✅ Deleted ${result.deleted} files from ${bucketStat.name}`);
      } else {
        logWarning(`  ⚠️  Deleted ${result.deleted} files, ${result.errors} errors from ${bucketStat.name}`);
      }
      
      grandTotalDeleted += result.deleted;
      grandTotalErrors += result.errors;
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ DELETION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total files deleted: ${grandTotalDeleted}`);
    if (grandTotalErrors > 0) {
      logWarning(`Errors: ${grandTotalErrors}`);
    }
    console.log('='.repeat(60) + '\n');
    
    logSuccess('All S3 data deleted successfully!');
    logInfo('Buckets are now empty (buckets themselves are preserved)');
    
  } catch (error) {
    logError(`\nDeletion failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    await deleteAllS3Data();
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { deleteAllS3Data };






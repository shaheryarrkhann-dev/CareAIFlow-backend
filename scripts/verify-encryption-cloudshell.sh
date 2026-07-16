#!/bin/bash

# HIPAA ENCRYPTION VERIFICATION COMMANDS
# Run these in AWS CloudShell to verify all encryption is enabled

echo "🔒 HIPAA ENCRYPTION VERIFICATION"
echo "=================================="
echo ""

# 1. Check S3 Bucket Encryption
echo "📦 Checking S3 Bucket Encryption..."
echo ""

for BUCKET in $(aws s3api list-buckets --query "Buckets[].Name" --output text); do
  echo "Bucket: $BUCKET"
  ENCRYPTION=$(aws s3api get-bucket-encryption --bucket $BUCKET 2>&1)
  
  if echo "$ENCRYPTION" | grep -q "ServerSideEncryptionConfiguration"; then
    echo "  ✅ Encrypted"
    echo "$ENCRYPTION" | grep -A 2 "SSEAlgorithm" | head -3
  else
    echo "  ❌ NOT ENCRYPTED"
  fi
  echo ""
done

# 2. Check RDS Encryption
echo "🗄️  Checking RDS Database Encryption..."
echo ""

aws rds describe-db-instances \
  --query "DBInstances[].{Name:DBInstanceIdentifier,Encrypted:StorageEncrypted,Engine:Engine,Status:DBInstanceStatus}" \
  --output table

echo ""
echo "✅ StorageEncrypted should be 'True'"
echo ""

# 3. Check CloudTrail Status
echo "📋 Checking CloudTrail Status..."
echo ""

TRAIL_NAME="residentcare-hipaa-audit-trail"

aws cloudtrail get-trail --name $TRAIL_NAME 2>&1 | grep -E "(Name|S3BucketName|IsLogging)" || echo "⚠️  CloudTrail not found or error"

echo ""
echo "Checking if CloudTrail is logging..."
aws cloudtrail get-trail-status --name $TRAIL_NAME 2>&1 | grep -E "(IsLogging|LatestCloudWatchLogsDeliveryTime)" || echo "⚠️  Could not check status"

echo ""
echo "=================================="
echo "✅ Verification Complete!"
echo ""
echo "What to check:"
echo "  - S3 buckets: Should show '✅ Encrypted'"
echo "  - RDS: StorageEncrypted should be 'True'"
echo "  - CloudTrail: Should be active and logging"






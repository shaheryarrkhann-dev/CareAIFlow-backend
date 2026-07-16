# Run these commands ONE BY ONE in CloudShell
# Copy each command, paste, press Enter, wait for it to finish, then do the next one

# Step 1: Check if CloudTrail exists
aws cloudtrail get-trail --name residentcare-hipaa-audit-trail 2>&1

# Step 2: If CloudTrail doesn't exist, create it (run these one by one)
BUCKET_NAME="residentcare-audit-logs-955719295925-$(date +%s)"
aws s3api create-bucket --bucket $BUCKET_NAME --region us-east-1

# Step 3: Encrypt the CloudTrail bucket
aws s3api put-bucket-encryption --bucket $BUCKET_NAME --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Step 4: Block public access
aws s3api put-public-access-block --bucket $BUCKET_NAME --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Step 5: Create CloudTrail
aws cloudtrail create-trail --name residentcare-hipaa-audit-trail --s3-bucket-name $BUCKET_NAME --is-multi-region-trail --enable-log-file-validation

# Step 6: Start CloudTrail logging
aws cloudtrail start-logging --name residentcare-hipaa-audit-trail

# Step 7: Encrypt all existing S3 buckets (this loops through all buckets)
for BUCKET in $(aws s3api list-buckets --query "Buckets[].Name" --output text); do echo "Encrypting: $BUCKET"; aws s3api put-bucket-encryption --bucket $BUCKET --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' 2>/dev/null && echo "  ✅ Encrypted" || echo "  ⚠️  Already encrypted or error"; done

# Step 8: Check RDS encryption status
aws rds describe-db-instances --query "DBInstances[].{Name:DBInstanceIdentifier,Encrypted:StorageEncrypted}" --output table







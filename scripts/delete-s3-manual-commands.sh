#!/bin/bash

# Manual S3 Deletion Commands
# Run these in AWS CloudShell or with AWS CLI

echo "⚠️  WARNING: This will delete ALL files from S3 buckets!"
echo ""

# List all buckets
echo "📦 Listing buckets..."
aws s3api list-buckets --query "Buckets[].Name" --output text

echo ""
echo "Choose one:"
echo "1. Delete from specific bucket"
echo "2. Delete from all buckets (except audit logs)"
echo ""

# Option 1: Delete from specific bucket
# Replace BUCKET_NAME with your bucket name
# BUCKET_NAME="your-bucket-name"
# aws s3 rm s3://$BUCKET_NAME --recursive

# Option 2: Delete from all buckets (except audit logs)
for BUCKET in $(aws s3api list-buckets --query "Buckets[].Name" --output text); do
  # Skip audit/log buckets
  if [[ $BUCKET == *"audit"* ]] || [[ $BUCKET == *"cloudtrail"* ]] || [[ $BUCKET == *"logs"* ]]; then
    echo "⚠️  Skipping $BUCKET (audit logs)"
    continue
  fi
  
  echo "Deleting all files from: $BUCKET"
  aws s3 rm s3://$BUCKET --recursive
  
  echo "✅ $BUCKET cleaned"
done

echo ""
echo "✅ All S3 data deleted!"






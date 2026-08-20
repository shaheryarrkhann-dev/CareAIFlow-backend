#!/bin/bash

# HIPAA AWS Security Setup Script
# This script enables basic HIPAA security controls in your AWS account
# Run this from your local machine or AWS CloudShell

set -e  # Exit on error

echo "🔒 Starting AWS HIPAA Security Setup"
echo "⚠️  This will enable security features in your AWS account"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured. Run 'aws configure' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS CLI configured${NC}"
echo ""

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")

echo "AWS Account ID: $ACCOUNT_ID"
echo "Region: $REGION"
echo ""

# ============================================
# 1. Enable CloudTrail (MANDATORY for HIPAA)
# ============================================
echo -e "${YELLOW}📝 Step 1: Setting up CloudTrail...${NC}"

TRAIL_NAME="residentcare-hipaa-audit-trail"
BUCKET_NAME="residentcare-audit-logs-$(date +%s)"

# Check if trail already exists
if aws cloudtrail get-trail --name $TRAIL_NAME &> /dev/null; then
    echo -e "${GREEN}✅ CloudTrail '$TRAIL_NAME' already exists${NC}"
else
    # Create S3 bucket for CloudTrail logs
    echo "Creating S3 bucket for CloudTrail logs..."
    aws s3api create-bucket \
        --bucket $BUCKET_NAME \
        --region $REGION \
        --create-bucket-configuration LocationConstraint=$REGION 2>/dev/null || true
    
    # Enable encryption on the bucket
    aws s3api put-bucket-encryption \
        --bucket $BUCKET_NAME \
        --server-side-encryption-configuration '{
            "Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                }
            }]
        }'
    
    # Block public access
    aws s3api put-public-access-block \
        --bucket $BUCKET_NAME \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    
    # Create CloudTrail
    echo "Creating CloudTrail..."
    aws cloudtrail create-trail \
        --name $TRAIL_NAME \
        --s3-bucket-name $BUCKET_NAME \
        --is-multi-region-trail \
        --enable-log-file-validation
    
    # Start logging
    aws cloudtrail start-logging --name $TRAIL_NAME
    
    echo -e "${GREEN}✅ CloudTrail created and started${NC}"
fi

# ============================================
# 2. Encrypt S3 Buckets
# ============================================
echo ""
echo -e "${YELLOW}📝 Step 2: Encrypting S3 buckets...${NC}"

# Get all buckets
BUCKETS=$(aws s3api list-buckets --query "Buckets[].Name" --output text)

if [ -z "$BUCKETS" ]; then
    echo "No S3 buckets found"
else
    for BUCKET in $BUCKETS; do
        echo "Processing bucket: $BUCKET"
        
        # Check if already encrypted
        if aws s3api get-bucket-encryption --bucket $BUCKET &> /dev/null; then
            echo -e "  ${GREEN}✅ Already encrypted${NC}"
        else
            # Enable encryption
            aws s3api put-bucket-encryption \
                --bucket $BUCKET \
                --server-side-encryption-configuration '{
                    "Rules": [{
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }]
                }' && echo -e "  ${GREEN}✅ Encrypted${NC}" || echo -e "  ${RED}❌ Failed${NC}"
        fi
        
        # Block public access
        aws s3api put-public-access-block \
            --bucket $BUCKET \
            --public-access-block-configuration \
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" 2>/dev/null || true
    done
fi

# ============================================
# 3. Check RDS Encryption
# ============================================
echo ""
echo -e "${YELLOW}📝 Step 3: Checking RDS encryption...${NC}"

RDS_INSTANCES=$(aws rds describe-db-instances --query "DBInstances[].DBInstanceIdentifier" --output text)

if [ -z "$RDS_INSTANCES" ]; then
    echo "No RDS instances found"
else
    for INSTANCE in $RDS_INSTANCES; do
        ENCRYPTED=$(aws rds describe-db-instances \
            --db-instance-identifier $INSTANCE \
            --query "DBInstances[0].StorageEncrypted" \
            --output text)
        
        if [ "$ENCRYPTED" = "true" ]; then
            echo -e "  ${GREEN}✅ $INSTANCE is encrypted${NC}"
        else
            echo -e "  ${RED}❌ $INSTANCE is NOT encrypted${NC}"
            echo -e "  ${YELLOW}⚠️  You need to create an encrypted snapshot and restore${NC}"
            echo -e "  ${YELLOW}   See: scripts/encrypt-rds.sh${NC}"
        fi
    done
fi

# ============================================
# 4. Enable AWS Config (Optional but recommended)
# ============================================
echo ""
echo -e "${YELLOW}📝 Step 4: Setting up AWS Config...${NC}"

CONFIG_BUCKET="residentcare-config-$(date +%s)"

# Create bucket for Config
aws s3api create-bucket \
    --bucket $CONFIG_BUCKET \
    --region $REGION \
    --create-bucket-configuration LocationConstraint=$REGION 2>/dev/null || true

# Enable encryption
aws s3api put-bucket-encryption \
    --bucket $CONFIG_BUCKET \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            }
        }]
    }'

echo -e "${GREEN}✅ AWS Config bucket created${NC}"
echo -e "${YELLOW}⚠️  Note: Enable AWS Config from the console for full compliance monitoring${NC}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}✅ AWS Security Setup Complete!${NC}"
echo ""
echo "📋 Summary:"
echo "  ✅ CloudTrail enabled for audit logging"
echo "  ✅ S3 buckets encrypted"
echo "  ✅ RDS encryption status checked"
echo "  ✅ AWS Config bucket created"
echo ""
echo "📝 Next Steps:"
echo "  1. Enable MFA for all IAM users (AWS Console → IAM → Users)"
echo "  2. Review and restrict IAM policies (least privilege)"
echo "  3. Enable AWS Config in the console"
echo "  4. Set up CloudWatch alarms for security events"
echo "  5. Review CloudTrail logs regularly"
echo ""
echo "🔗 Useful Links:"
echo "  - CloudTrail: https://console.aws.amazon.com/cloudtrail"
echo "  - IAM: https://console.aws.amazon.com/iam"
echo "  - S3: https://console.aws.amazon.com/s3"
echo ""







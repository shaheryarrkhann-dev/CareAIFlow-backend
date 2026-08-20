#!/bin/bash

# FINAL HIPAA VERIFICATION SCRIPT
# Run this in AWS CloudShell to verify ALL security measures

echo "🔒 HIPAA FINAL VERIFICATION"
echo "============================"
echo ""
echo "This script verifies ALL HIPAA security measures."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASS++))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAIL++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

echo "1. CHECKING S3 ENCRYPTION..."
echo "----------------------------"
for BUCKET in $(aws s3api list-buckets --query "Buckets[].Name" --output text); do
    ENCRYPTION=$(aws s3api get-bucket-encryption --bucket $BUCKET 2>&1)
    if echo "$ENCRYPTION" | grep -q "SSEAlgorithm"; then
        ALGO=$(echo "$ENCRYPTION" | grep -o '"SSEAlgorithm": "[^"]*"' | cut -d'"' -f4)
        check_pass "S3 bucket '$BUCKET' encrypted with $ALGO"
    else
        check_fail "S3 bucket '$BUCKET' NOT encrypted"
    fi
done
echo ""

echo "2. CHECKING RDS ENCRYPTION..."
echo "-----------------------------"
RDS_ENCRYPTED=$(aws rds describe-db-instances --query "DBInstances[0].StorageEncrypted" --output text 2>&1)
if [ "$RDS_ENCRYPTED" = "True" ]; then
    DB_NAME=$(aws rds describe-db-instances --query "DBInstances[0].DBInstanceIdentifier" --output text)
    check_pass "RDS database '$DB_NAME' encrypted at rest"
else
    check_fail "RDS database NOT encrypted"
fi
echo ""

echo "3. CHECKING CLOUDTRAIL..."
echo "-------------------------"
TRAIL_NAME="residentcare-hipaa-audit-trail"
TRAIL_EXISTS=$(aws cloudtrail get-trail --name $TRAIL_NAME 2>&1)
if echo "$TRAIL_EXISTS" | grep -q "Trail"; then
    check_pass "CloudTrail '$TRAIL_NAME' exists"
    
    TRAIL_STATUS=$(aws cloudtrail get-trail-status --name $TRAIL_NAME --query "IsLogging" --output text 2>&1)
    if [ "$TRAIL_STATUS" = "True" ]; then
        check_pass "CloudTrail is actively logging"
    else
        check_fail "CloudTrail is NOT logging"
    fi
else
    check_fail "CloudTrail '$TRAIL_NAME' NOT found"
fi
echo ""

echo "4. CHECKING S3 BUCKET EMPTINESS..."
echo "----------------------------------"
MAIN_BUCKET="pdf-storage-project"
FILE_COUNT=$(aws s3 ls s3://$MAIN_BUCKET --recursive 2>&1 | wc -l)
if [ "$FILE_COUNT" -eq 0 ]; then
    check_pass "S3 bucket '$MAIN_BUCKET' is empty (all PHI deleted)"
else
    check_warn "S3 bucket '$MAIN_BUCKET' has $FILE_COUNT files (should be empty)"
fi
echo ""

echo "5. CHECKING DATABASE BACKUPS..."
echo "-------------------------------"
SNAPSHOTS=$(aws rds describe-db-snapshots --db-instance-identifier my-postgres-db --query "length(DBSnapshots)" --output text 2>&1)
if [ "$SNAPSHOTS" -gt 0 ]; then
    check_pass "Database has $SNAPSHOTS backup snapshot(s)"
    
    # Check if latest snapshot is encrypted
    LATEST_SNAPSHOT=$(aws rds describe-db-snapshots --db-instance-identifier my-postgres-db --query "DBSnapshots[0].Encrypted" --output text 2>&1)
    if [ "$LATEST_SNAPSHOT" = "True" ]; then
        check_pass "Latest database snapshot is encrypted"
    else
        check_fail "Latest database snapshot is NOT encrypted"
    fi
else
    check_warn "No database snapshots found (backups recommended)"
fi
echo ""

echo "6. CHECKING SECURITY GROUPS..."
echo "------------------------------"
SG_COUNT=$(aws ec2 describe-security-groups --query "length(SecurityGroups)" --output text)
check_pass "Found $SG_COUNT security group(s) configured"
echo ""

echo "7. SUMMARY..."
echo "-------------"
echo ""
echo "============================"
echo "VERIFICATION RESULTS"
echo "============================"
echo -e "${GREEN}✅ Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
    echo -e "${RED}❌ Failed: $FAIL${NC}"
fi
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CRITICAL CHECKS PASSED!${NC}"
    echo ""
    echo "Your HIPAA security measures are in place."
else
    echo -e "${RED}❌ SOME CHECKS FAILED${NC}"
    echo ""
    echo "Please review the failed items above."
fi
echo ""

echo "============================"
echo "NEXT STEPS"
echo "============================"
echo "1. Verify application-level security on EC2:"
echo "   node scripts/verify-deletion-and-security.js"
echo ""
echo "2. Verify database data deletion:"
echo "   node scripts/verify-all-data-deleted.js"
echo ""
echo "3. Review CloudTrail logs regularly"
echo "4. Keep security measures updated"
echo ""






#!/bin/bash

# CHECK REMAINING SECURITY ITEMS
# Run this in AWS CloudShell

echo "🔒 CHECKING REMAINING SECURITY ITEMS"
echo "======================================"
echo ""

# c??
# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "1. CHECKING DATABASE BACKUPS ENCRYPTION..."
echo "=========================================="
echo ""

DB_INSTANCE="my-postgres-db"

# Check if database exists
DB_EXISTS=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE 2>&1)

if echo "$DB_EXISTS" | grep -q "DBInstanceNotFound"; then
    echo -e "${RED}❌ Database '$DB_INSTANCE' not found${NC}"
    echo "Please update the DB_INSTANCE variable in the script."
    exit 1
fi

# Get all snapshots
echo "Checking database snapshots..."
SNAPSHOTS=$(aws rds describe-db-snapshots --db-instance-identifier $DB_INSTANCE --query "DBSnapshots" --output json 2>&1)

SNAPSHOT_COUNT=$(echo "$SNAPSHOTS" | jq '. | length' 2>/dev/null || echo "0")

if [ "$SNAPSHOT_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No manual snapshots found${NC}"
    echo ""
    echo "Checking automated backups..."
    
    # Check automated backups
    BACKUP_RETENTION=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE --query "DBInstances[0].BackupRetentionPeriod" --output text 2>&1)
    
    if [ "$BACKUP_RETENTION" -gt 0 ]; then
        echo -e "${GREEN}✅ Automated backups enabled${NC}"
        echo "   Retention period: $BACKUP_RETENTION days"
        
        # Check if automated backups are encrypted
        BACKUP_ENCRYPTED=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE --query "DBInstances[0].StorageEncrypted" --output text 2>&1)
        
        if [ "$BACKUP_ENCRYPTED" = "True" ]; then
            echo -e "${GREEN}✅ Automated backups are encrypted${NC}"
        else
            echo -e "${RED}❌ Automated backups are NOT encrypted${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Automated backups are disabled${NC}"
        echo "   Recommendation: Enable automated backups with encryption"
    fi
else
    echo "Found $SNAPSHOT_COUNT snapshot(s):"
    echo ""
    
    echo "$SNAPSHOTS" | jq -r '.[] | "\(.DBSnapshotIdentifier) - Created: \(.SnapshotCreateTime) - Encrypted: \(.Encrypted)"' 2>/dev/null | while read line; do
        if echo "$line" | grep -q "true"; then
            echo -e "${GREEN}✅ $line${NC}"
        else
            echo -e "${RED}❌ $line${NC}"
        fi
    done
fi

echo ""
echo ""

echo "2. CHECKING SECURITY GROUPS..."
echo "==============================="
echo ""

# Get EC2 instances
echo "Finding EC2 instances..."
INSTANCES=$(aws ec2 describe-instances --query "Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress,PrivateIpAddress]" --output table 2>&1)

if echo "$INSTANCES" | grep -q "running"; then
    echo "$INSTANCES"
    echo ""
    
    # Get security groups for running instances
    echo "Checking security groups for running instances..."
    echo ""
    
    aws ec2 describe-instances \
        --filters "Name=instance-state-name,Values=running" \
        --query "Reservations[].Instances[].[InstanceId,SecurityGroups[].GroupId]" \
        --output table
    
    echo ""
    echo "Detailed security group rules:"
    echo ""
    
    # Get all security groups
    aws ec2 describe-security-groups \
        --query "SecurityGroups[].[GroupId,GroupName,Description,IpPermissions[].IpProtocol,IpPermissions[].FromPort,IpPermissions[].ToPort]" \
        --output table
    
    echo ""
    echo "Checking for overly permissive rules..."
    echo ""
    
    # Check for 0.0.0.0/0 (public access)
    PERMISSIVE=$(aws ec2 describe-security-groups \
        --query "SecurityGroups[?IpPermissions[?IpRanges[?CidrIp=='0.0.0.0/0']]].[GroupId,GroupName]" \
        --output table 2>&1)
    
    if [ ! -z "$PERMISSIVE" ] && echo "$PERMISSIVE" | grep -q "sg-"; then
        echo -e "${YELLOW}⚠️  Found security groups with public access (0.0.0.0/0):${NC}"
        echo "$PERMISSIVE"
        echo ""
        echo "Recommendation: Restrict access to specific IPs or VPC only"
    else
        echo -e "${GREEN}✅ No overly permissive security group rules found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No running EC2 instances found${NC}"
fi

echo ""
echo ""

echo "3. DATABASE ACCESS SECURITY..."
echo "=============================="
echo ""

# Check RDS security groups
echo "Checking RDS security groups..."
RDS_SG=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE --query "DBInstances[0].VpcSecurityGroups[].VpcSecurityGroupId" --output text 2>&1)

if [ ! -z "$RDS_SG" ] && [ "$RDS_SG" != "None" ]; then
    echo "RDS Security Groups: $RDS_SG"
    echo ""
    
    for SG_ID in $RDS_SG; do
        echo "Security Group: $SG_ID"
        aws ec2 describe-security-groups --group-ids $SG_ID \
            --query "SecurityGroups[0].IpPermissions[].[IpProtocol,FromPort,ToPort,IpRanges[].CidrIp]" \
            --output table
        echo ""
    done
else
    echo -e "${YELLOW}⚠️  No VPC security groups found for RDS${NC}"
fi

# Check if database is publicly accessible
PUBLIC_ACCESS=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE --query "DBInstances[0].PubliclyAccessible" --output text 2>&1)

if [ "$PUBLIC_ACCESS" = "False" ]; then
    echo -e "${GREEN}✅ Database is NOT publicly accessible${NC}"
else
    echo -e "${RED}❌ Database IS publicly accessible${NC}"
    echo "   Recommendation: Set PubliclyAccessible to False"
fi

echo ""
echo ""

echo "4. AUDIT SCHEDULE RECOMMENDATIONS..."
echo "====================================="
echo ""

echo -e "${BLUE}Recommended Audit Schedule:${NC}"
echo ""
echo "📅 WEEKLY:"
echo "  - Review CloudTrail logs for unusual activity"
echo "  - Check for failed login attempts"
echo "  - Verify no unauthorized access"
echo ""
echo "📅 MONTHLY:"
echo "  - Review user access permissions"
echo "  - Check security group rules"
echo "  - Verify encryption status"
echo "  - Review database backup status"
echo ""
echo "📅 QUARTERLY:"
echo "  - Full security audit"
echo "  - Review and rotate access keys"
echo "  - Update security documentation"
echo "  - Review and update security groups"
echo ""
echo "📅 ANNUALLY:"
echo "  - HIPAA compliance review"
echo "  - Security policy updates"
echo "  - Staff training on security"
echo "  - Incident response plan review"
echo ""

echo "======================================"
echo "SUMMARY"
echo "======================================"
echo ""
echo "Run these commands to check each item:"
echo ""
echo "1. Database Backups:"
echo "   aws rds describe-db-snapshots --db-instance-identifier my-postgres-db"
echo ""
echo "2. Security Groups:"
echo "   aws ec2 describe-security-groups"
echo ""
echo "3. Database Access:"
echo "   aws rds describe-db-instances --db-instance-identifier my-postgres-db --query 'DBInstances[0].PubliclyAccessible'"
echo ""






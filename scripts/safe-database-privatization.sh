#!/bin/bash

# SAFE DATABASE PRIVATIZATION CHECK
# Run this BEFORE making database private

echo "🔍 CHECKING IF DATABASE CAN BE SAFELY MADE PRIVATE"
echo "==================================================="
echo ""

DB_INSTANCE="my-postgres-db"

# 1. Get database VPC
echo "1. Checking database VPC..."
DB_VPC=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE \
  --query "DBInstances[0].DBSubnetGroup.VpcId" --output text 2>&1)

echo "   Database VPC: $DB_VPC"
echo ""

# 2. Get database security group
echo "2. Checking database security group..."
DB_SG=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE \
  --query "DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId" --output text 2>&1)

echo "   Database Security Group: $DB_SG"
echo ""

# 3. Check EC2 instances
echo "3. Checking EC2 instances..."
EC2_INSTANCES=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId,VpcId,PrivateIpAddress,PublicIpAddress]" \
  --output table 2>&1)

echo "$EC2_INSTANCES"
echo ""

# 4. Check if EC2 is in same VPC
EC2_VPC=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].VpcId" --output text 2>&1)

if [ "$EC2_VPC" = "$DB_VPC" ]; then
    echo "✅ EC2 and Database are in SAME VPC"
    echo "   ✅ Safe to make database private"
    echo "   ✅ Application will continue working"
    echo ""
    echo "⚠️  IMPACT:"
    echo "   - Brief connection interruption (1-2 minutes)"
    echo "   - Application may need to reconnect"
    echo "   - No data loss"
    echo "   - Clients may experience brief downtime"
else
    echo "❌ EC2 and Database are in DIFFERENT VPCs"
    echo "   ⚠️  Making database private may break connection"
    echo ""
    echo "   EC2 VPC: $EC2_VPC"
    echo "   DB VPC:  $DB_VPC"
    echo ""
    echo "   SOLUTION:"
    echo "   1. Move EC2 to same VPC as database, OR"
    echo "   2. Set up VPC peering, OR"
    echo "   3. Keep database public but restrict security group"
fi

echo ""
echo "4. Checking security group rules..."
echo ""

# Check if security group allows EC2 access
aws ec2 describe-security-groups --group-ids $DB_SG \
  --query "SecurityGroups[0].IpPermissions[].[IpProtocol,FromPort,ToPort,IpRanges[].CidrIp,UserIdGroupPairs[].GroupId]" \
  --output table

echo ""
echo "==================================================="
echo "RECOMMENDATION"
echo "==================================================="
echo ""

if [ "$EC2_VPC" = "$DB_VPC" ]; then
    echo "✅ SAFE TO PROCEED"
    echo ""
    echo "Run this command to make database private:"
    echo "  aws rds modify-db-instance \\"
    echo "    --db-instance-identifier $DB_INSTANCE \\"
    echo "    --no-publicly-accessible \\"
    echo "    --apply-immediately"
    echo ""
    echo "⚠️  EXPECTED IMPACT:"
    echo "   - 1-2 minute downtime"
    echo "   - Application will auto-reconnect"
    echo "   - No data loss"
else
    echo "❌ DO NOT PROCEED WITHOUT FIXING VPC"
    echo ""
    echo "Alternative: Restrict security group instead"
    echo "  (Remove 0.0.0.0/0, allow only EC2 IP or security group)"
fi






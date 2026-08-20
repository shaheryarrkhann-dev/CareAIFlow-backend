#!/bin/bash

# FIX DATABASE SECURITY ISSUES
# Run this in AWS CloudShell

echo "🔒 FIXING DATABASE SECURITY"
echo "============================"
echo ""

DB_INSTANCE="my-postgres-db"

echo "⚠️  WARNING: Making database private may require:"
echo "   1. EC2 instance must be in same VPC"
echo "   2. Security groups must allow EC2 to access database"
echo "   3. Brief connection interruption may occur"
echo ""
echo "Checking current setup..."
echo ""

# Check if database is in VPC
VPC_ID=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE \
  --query "DBInstances[0].DBSubnetGroup.VpcId" --output text 2>&1)

echo "Database VPC: $VPC_ID"
echo ""

# Check EC2 instances in same VPC
echo "Checking EC2 instances in same VPC..."
EC2_INSTANCES=$(aws ec2 describe-instances \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId,PrivateIpAddress]" \
  --output table 2>&1)

if echo "$EC2_INSTANCES" | grep -q "i-"; then
    echo "$EC2_INSTANCES"
    echo ""
    echo "✅ Found EC2 instances in same VPC"
    echo "   Database can be made private safely"
    echo ""
    read -p "Do you want to make the database private? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        echo ""
        echo "Making database private..."
        aws rds modify-db-instance \
          --db-instance-identifier $DB_INSTANCE \
          --no-publicly-accessible \
          --apply-immediately
        
        echo ""
        echo "✅ Database modification initiated"
        echo "   Status: Modifying (this may take a few minutes)"
        echo ""
        echo "Check status with:"
        echo "  aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE --query 'DBInstances[0].DBInstanceStatus'"
    else
        echo "Operation cancelled."
    fi
else
    echo "⚠️  No running EC2 instances found in same VPC"
    echo "   Please verify your EC2 can access the database through VPC"
    echo ""
    echo "If you're sure, you can still make it private with:"
    echo "  aws rds modify-db-instance --db-instance-identifier $DB_INSTANCE --no-publicly-accessible --apply-immediately"
fi






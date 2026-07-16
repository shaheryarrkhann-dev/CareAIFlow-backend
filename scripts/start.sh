#!/bin/bash
set -e

echo "🔍 Checking database connection..."
npx prisma migrate status || echo "⚠️ Migration status check failed, continuing..."

echo "🔍 Checking if residents table exists..."
TABLE_EXISTS=$(npx prisma db execute --stdin <<< "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'residents');" | grep -o 'true\|false' || echo "false")

if [ "$TABLE_EXISTS" = "false" ]; then
  echo "📋 Residents table doesn't exist. Creating schema with db push..."
  npx prisma db push --accept-data-loss
  echo "✅ Schema created. Marking migration as applied..."
  npx prisma migrate resolve --applied 20250101000000_update_resident_schema_with_all_fields || echo "⚠️ Could not mark migration as applied"
else
  echo "✅ Residents table exists. Running migrations..."
  npx prisma migrate deploy
fi

echo "🚀 Starting application..."
exec npm start


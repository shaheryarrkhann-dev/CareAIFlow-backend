# t3.micro RDS Configuration Guide

## Overview

AWS RDS **t3.micro** instances have very limited resources:
- **Memory**: 1 GB RAM
- **Max Connections**: ~25-50 concurrent connections (PostgreSQL default)
- **vCPUs**: 2 (burstable)

## Connection Pooling Configuration

To optimize for t3.micro, configure your `DATABASE_URL` with connection pooling parameters:

### Option 1: Direct Connection (Current - Limited to ~10 connections per Prisma client)

```env
DATABASE_URL="postgresql://user:password@host:5432/database"
```

### Option 2: Connection Pooling via Connection String (Recommended for t3.micro)

```env
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=5&pool_timeout=20"
```

**Parameters:**
- `connection_limit=5`: Limits Prisma to 5 connections per instance (prevents exhaustion)
- `pool_timeout=20`: Max seconds to wait for a connection from the pool

### Option 3: Use PgBouncer (Best for Production)

For better connection management, use PgBouncer as a connection pooler:

1. Set up PgBouncer on your EC2 instance or use AWS RDS Proxy
2. Update `DATABASE_URL` to point to PgBouncer:
   ```env
   DATABASE_URL="postgresql://user:password@pgbouncer-host:6432/database"
   ```

## Current Configuration

The Prisma client is configured with default connection pooling. For t3.micro:

- **Default Prisma pool**: ~10 connections per client instance
- **RDS t3.micro limit**: ~25-50 total connections
- **Recommendation**: Keep connection pool small (5-10 connections max)

## Monitoring Connection Usage

Check current connections on your RDS instance:

```sql
SELECT count(*) FROM pg_stat_activity;
```

Check max connections allowed:

```sql
SHOW max_connections;
```

## If You Experience Connection Exhaustion

Symptoms:
- Database connection errors
- Timeouts
- "Too many connections" errors

Solutions:
1. **Reduce connection pool size** (already configured)
2. **Upgrade to t3.small** (2 GB RAM, more connections)
3. **Use RDS Proxy** (AWS managed connection pooling)
4. **Implement connection pooling** at application level

## Performance Tips for t3.micro

1. ✅ **Keep connection pool small** (5-10 connections)
2. ✅ **Use connection timeouts** (prevent hanging connections)
3. ✅ **Monitor connection usage** (check `pg_stat_activity`)
4. ✅ **Optimize queries** (reduce query execution time)
5. ✅ **Add indexes** (faster queries = shorter connection hold times)
6. ⚠️ **Upgrade if needed** (t3.small or larger for production)

## Health Check Endpoints

The app now includes health check endpoints:

- `GET /health` - Server health (no DB check)
- `GET /health/db` - Database connection health check

Use these to monitor your RDS connection status.










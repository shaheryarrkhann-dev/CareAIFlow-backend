# Local Database Setup Guide (Docker)

docker start postgres-pgvector

This guide explains how to set up a local PostgreSQL database with pgvector extension using Docker for development.

## Prerequisites

- Docker Desktop installed and running
- Node.js and npm installed
- `.env` file configured (see Step 4)


---

## Step-by-Step Setup

### Step 1: Start Docker Desktop

1. Open **Docker Desktop** application
2. Wait until Docker is fully started (whale icon in system tray should be steady)
3. Verify Docker is running: `docker ps` should work in terminal

### Step 2: Run PostgreSQL Container with pgvector

Run this command in your terminal:

```bash
docker run --name postgres-pgvector -e POSTGRES_PASSWORD=123 -e POSTGRES_DB=ai_onboarding_local -p 5433:5432 -d pgvector/pgvector:pg16
```

**What this does:**
- Creates a PostgreSQL 16 container with pgvector extension
- Sets password to `123`
- Creates database `ai_onboarding_local`
- Maps container port 5432 to host port 5433
- Runs in detached mode (`-d`)

**Expected output:**
```
Unable to find image 'pgvector/pgvector:pg16' locally
pg16: Pulling from pgvector/pgvector
...
Status: Downloaded newer image for pgvector/pgvector:pg16
<container-id>
```

### Step 3: Enable Vector Extension

Enable the pgvector extension in the database:

```bash
docker exec postgres-pgvector psql -U postgres -d ai_onboarding_local -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**Expected output:**
```
CREATE EXTENSION
```

### Step 4: Configure Database URL

Make sure your `.env` file in `ai-onboarding-platform` directory has:

```env
DATABASE_URL="postgresql://postgres:123@localhost:5433/ai_onboarding_local"
```

**Important:** Port is `5433`, database is `ai_onboarding_local`, password is `123`

### Step 5: Push Database Schema

Run Prisma to create all tables:

```bash
cd ai-onboarding-platform
npx prisma db push
```

**Expected output:**
```
⚠️  There might be data loss when applying the changes:
  • (some warnings about constraints)

√ Do you want to ignore the warning(s)? ... yes

Your database is now in sync with your Prisma schema. Done in XX.XXs
✔ Generated Prisma Client (v5.22.0) to .\node_modules\@prisma\client in XXXms
```

### Step 6: Start Your Application

Now you can start your development server:

```bash
npm run dev
```

---

## Quick Reference Commands

### Check if container is running:
```bash
docker ps
```

You should see `postgres-pgvector` in the list.

### Stop the container:
```bash
docker stop postgres-pgvector
```

### Start the container (if stopped):
```bash
docker start postgres-pgvector
```

### Remove the container (if you want to start fresh):
```bash
docker stop postgres-pgvector
docker rm postgres-pgvector
```

Then run Step 2 again to recreate it.

### View container logs:
```bash
docker logs postgres-pgvector
```

---

## Troubleshooting

### Error: "Container name already in use"

If you see this error when running Step 2:
```
Error response from daemon: Conflict. The container name "/postgres-pgvector" is already in use
```

**Solution:** Remove the existing container first:
```bash
docker stop postgres-pgvector
docker rm postgres-pgvector
```

Then run Step 2 again.

### Error: "Cannot connect to database"

1. Make sure Docker Desktop is running
2. Check if container is running: `docker ps`
3. Verify the container is up: `docker start postgres-pgvector`
4. Check your `.env` file has the correct connection string

### Error: "type vector does not exist"

This means Step 3 (enabling extension) was skipped. Run:
```bash
docker exec postgres-pgvector psql -U postgres -d ai_onboarding_local -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Error: "Authentication failed"

1. Check your `.env` file has the correct password (`123`)
2. Verify the database name is `ai_onboarding_local`
3. Verify the port is `5433`

---

## Complete Setup Script (All Steps)

For convenience, here are all commands in order:

```bash
# Step 1: Start Docker Desktop (manually)

# Step 2: Run PostgreSQL container
docker run --name postgres-pgvector -e POSTGRES_PASSWORD=123 -e POSTGRES_DB=ai_onboarding_local -p 5433:5432 -d pgvector/pgvector:pg16

# Step 3: Enable vector extension
docker exec postgres-pgvector psql -U postgres -d ai_onboarding_local -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Step 4: Configure .env file (edit manually)
# DATABASE_URL="postgresql://postgres:123@localhost:5433/ai_onboarding_local"

# Step 5: Push schema
cd ai-onboarding-platform
npx prisma db push

# Step 6: Start application
npm run dev
```

---

## Notes

- The container will persist data even after Docker Desktop is closed
- Port `5433` is used to avoid conflicts with local PostgreSQL installations
- Password is `123` for local development only (not for production)
- Database name is `ai_onboarding_local` to distinguish from production

---

## Need Help?

If you encounter issues:
1. Check Docker Desktop is running
2. Verify container is running: `docker ps`
3. Check container logs: `docker logs postgres-pgvector`
4. Verify `.env` file configuration
5. Make sure you ran all steps in order














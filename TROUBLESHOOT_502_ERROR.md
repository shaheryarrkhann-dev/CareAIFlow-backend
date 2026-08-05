# Troubleshooting 502 Bad Gateway Error

## 🚨 Problem
Getting `502 Bad Gateway` error after deployment. Nginx can't connect to the backend.

## 🔍 Quick Diagnosis Steps

### Step 1: Check if Container is Running

SSH into your EC2 instance and run:

```bash
docker ps -a | grep backend
```

**What to look for:**
- ✅ Container status should be `Up` (running)
- ❌ If status is `Exited`, the container crashed

### Step 2: Check Container Logs

```bash
docker logs backend --tail 100
```

**Common errors you might see:**
- Database connection errors
- Missing environment variables
- Port already in use
- Application startup errors

### Step 3: Check if Port 4000 is Listening

```bash
netstat -tlnp | grep 4000
# or
ss -tlnp | grep 4000
```

**Expected output:**
```
tcp  0  0  0.0.0.0:4000  0.0.0.0:*  LISTEN  <pid>/node
```

### Step 4: Test Backend Directly

```bash
curl http://localhost:4000/health
```

**Expected response:**
- ✅ Should return `200 OK` or JSON response
- ❌ If connection refused, the app isn't running

## 🔧 Common Fixes

### Fix 1: Container Crashed on Startup

**Symptoms:** Container status shows `Exited`

**Solution:**
```bash
# Check logs
docker logs backend

# Common causes:
# 1. Database connection failed - check DATABASE_URL in .env
# 2. Missing environment variables
# 3. Port conflict - check if another process is using port 4000
```

### Fix 2: Database Connection Error

**Check your `.env` file:**
```bash
cat /home/ubuntu/.env | grep DATABASE_URL
```

**Make sure:**
- DATABASE_URL is correct
- Database is accessible from EC2
- Database credentials are valid

### Fix 3: Missing Environment Variables

**Check if .env file exists and has required variables:**
```bash
ls -la /home/ubuntu/.env
cat /home/ubuntu/.env
```

**Required variables:**
- DATABASE_URL
- JWT_ACCESS_SECRET
- JWT_REFRESH_SECRET
- PORT (optional, defaults to 4000)

### Fix 4: Port Already in Use

```bash
# Check what's using port 4000
sudo lsof -i :4000
# or
sudo netstat -tlnp | grep 4000

# Kill the process if needed (be careful!)
sudo kill -9 <PID>
```

### Fix 5: Application Takes Too Long to Start

The application might need more time to:
- Connect to database
- Run migrations
- Start services

**Check if it's still starting:**
```bash
# Watch logs in real-time
docker logs -f backend
```

Wait 30-60 seconds and check again.

### Fix 6: Nginx Configuration Issue

**Check nginx error logs:**
```bash
sudo tail -f /var/log/nginx/error.log
```

**Common nginx errors:**
- Connection refused (backend not running)
- Connection timeout (backend too slow)
- Upstream not found (wrong proxy_pass URL)

**Verify nginx config:**
```bash
sudo nginx -t
```

**Restart nginx:**
```bash
sudo systemctl restart nginx
```

## 🚀 Quick Recovery Steps

### Option 1: Restart Container

```bash
cd /home/ubuntu/ai-onboarding-platform
docker stop backend
docker rm backend
docker run -d -p 4000:4000 --env-file /home/ubuntu/.env --name backend backend
docker logs -f backend
```

### Option 2: Rebuild and Restart

```bash
cd /home/ubuntu/ai-onboarding-platform
docker stop backend
docker rm backend
docker build -t backend .
docker run -d -p 4000:4000 --env-file /home/ubuntu/.env --name backend backend
sleep 10
docker logs backend
```

### Option 3: Run Container Interactively (for debugging)

```bash
cd /home/ubuntu/ai-onboarding-platform
docker stop backend
docker rm backend
docker run -it --rm -p 4000:4000 --env-file /home/ubuntu/.env backend
```

This will show you the startup logs in real-time.

## 📋 Diagnostic Checklist

Run these commands and share the output:

```bash
# 1. Container status
docker ps -a | grep backend

# 2. Container logs (last 50 lines)
docker logs backend --tail 50

# 3. Port status
netstat -tlnp | grep 4000

# 4. Health check
curl -v http://localhost:4000/health

# 5. Nginx error logs
sudo tail -20 /var/log/nginx/error.log

# 6. Disk space (might still be full)
df -h

# 7. Environment file exists
ls -la /home/ubuntu/.env
```

## 🔍 Most Likely Causes

Based on the deployment workflow changes:

1. **Disk space cleanup removed something important** - Check if `.env` file still exists
2. **Database migration failed** - Check container logs for migration errors
3. **Container crashed on startup** - Check `docker logs backend`
4. **Port conflict** - Something else using port 4000
5. **Missing environment variables** - Check `.env` file

## ✅ Expected Working State

When everything is working:

```bash
# Container should be running
$ docker ps | grep backend
CONTAINER ID   IMAGE     COMMAND                  STATUS         PORTS
abc123def456   backend   "docker-entrypoint.s…"   Up 2 minutes   0.0.0.0:4000->4000/tcp

# Health check should work
$ curl http://localhost:4000/health
{"status":"ok"}  # or similar

# Port should be listening
$ netstat -tlnp | grep 4000
tcp  0  0  0.0.0.0:4000  0.0.0.0:*  LISTEN  12345/node
```

## 📞 Next Steps

1. **SSH into EC2** and run the diagnostic commands above
2. **Check container logs** - This will show you the exact error
3. **Share the error message** - The logs will tell us what's wrong
4. **Try the quick recovery steps** if it's a simple restart issue

The updated deployment workflow now includes better error checking and will show container logs if something fails during deployment.





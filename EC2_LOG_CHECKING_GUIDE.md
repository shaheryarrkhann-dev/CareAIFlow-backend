# EC2 Log Checking Guide for CORS Issues

## Quick Commands to Check Logs on EC2

### 1. SSH into your EC2 instance
```bash
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### 2. Check if Node.js server is running

**If using PM2:**
```bash
pm2 list
pm2 logs
pm2 logs --lines 100  # Last 100 lines
pm2 logs --err        # Only errors
```

**If using systemd:**
```bash
sudo systemctl status your-app-name
sudo journalctl -u your-app-name -f  # Follow logs in real-time
sudo journalctl -u your-app-name --lines 100  # Last 100 lines
```

**If using npm/node directly:**
```bash
# Check if process is running
ps aux | grep node

# Check log files (if logging to file)
tail -f /var/log/your-app.log
tail -f /home/ec2-user/your-app/logs/app.log
```

### 3. Check Application Logs

**Find your application directory:**
```bash
# Common locations
cd /var/www/your-app
cd /home/ec2-user/your-app
cd /opt/your-app
```

**Check for CORS-related logs:**
```bash
# Look for CORS configuration message on startup
grep -i "cors" logs/*.log
grep -i "cors" *.log

# Look for recent requests
tail -100 logs/app.log | grep -i "cors\|origin\|OPTIONS"
```

### 4. Real-time Log Monitoring

**PM2:**
```bash
pm2 logs --lines 0  # Watch logs in real-time
```

**Systemd:**
```bash
sudo journalctl -u your-app-name -f
```

**Direct file:**
```bash
tail -f /path/to/logfile.log
```

## What to Look For

### ✅ Good Signs (CORS is working):
```
🌐 CORS Configuration: ALLOWING ALL ORIGINS (permissive mode)
🔍 CORS: Request from origin: http://localhost:5173
🔄 OPTIONS preflight: /api/auth/login from origin: http://localhost:5173
📨 POST /api/auth/login from origin: http://localhost:5173
```

### ❌ Bad Signs (CORS is blocking):
```
❌ Blocked origin: http://localhost:5173
CORS error
Access-Control-Allow-Origin header missing
```

### 🔍 Check Server Startup:
Look for this message when server starts:
```
🌐 CORS Configuration: ALLOWING ALL ORIGINS (permissive mode)
🚀 Server running on http://localhost:4000
```

If you don't see this, the **updated code hasn't been deployed yet**.

## Common Issues

### Issue 1: Code Not Deployed
**Symptom:** No CORS logs, old configuration
**Solution:** Deploy updated `app.js` and restart server

### Issue 2: Server Not Restarted
**Symptom:** Old code still running
**Solution:**
```bash
# PM2
pm2 restart all
pm2 restart your-app-name

# Systemd
sudo systemctl restart your-app-name

# Direct
# Kill process and restart
pkill node
npm start
```

### Issue 3: Nginx/Reverse Proxy Blocking
**Symptom:** Requests don't reach Node.js server
**Check:**
```bash
# Check Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check Nginx config
sudo nano /etc/nginx/sites-available/your-site
```

### Issue 4: Firewall/Security Groups
**Symptom:** Connection refused
**Check:**
```bash
# Check if port is listening
sudo netstat -tulpn | grep :4000
# or
sudo ss -tulpn | grep :4000

# Check AWS Security Groups in AWS Console
# Ensure port 4000 (or your API port) is open
```

## Test CORS from EC2

### Test 1: Check if server is responding
```bash
curl -I http://localhost:4000/health
curl http://localhost:4000/health
```

### Test 2: Test CORS preflight from EC2
```bash
curl -X OPTIONS http://localhost:4000/api/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization" \
  -v
```

**Expected response headers:**
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

### Test 3: Test actual request
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}' \
  -v
```

## Quick Debug Steps

1. **SSH into EC2**
2. **Check if server is running:** `pm2 list` or `ps aux | grep node`
3. **Check recent logs:** `pm2 logs --lines 50`
4. **Look for CORS config message:** Should see `🌐 CORS Configuration: ALLOWING ALL ORIGINS`
5. **Make a test request** and watch logs in real-time: `pm2 logs --lines 0`
6. **Check Nginx logs** if using reverse proxy: `sudo tail -f /var/log/nginx/access.log`

## If Still Not Working

1. **Verify code is deployed:** Check file modification date
   ```bash
   ls -la /path/to/your-app/src/app.js
   ```

2. **Check for syntax errors:**
   ```bash
   node -c /path/to/your-app/src/app.js
   ```

3. **Restart server:**
   ```bash
   pm2 restart all
   # or
   sudo systemctl restart your-app-name
   ```

4. **Check environment variables:**
   ```bash
   # If using PM2, check ecosystem file
   cat ecosystem.config.js
   
   # Check .env file (if exists)
   cat .env | grep -i cors
   ```

5. **Test directly on EC2:**
   ```bash
   # From EC2, test if localhost works
   curl -v http://localhost:4000/health
   ```










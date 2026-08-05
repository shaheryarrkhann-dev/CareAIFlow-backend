# Nginx Configuration for Real Client IP Forwarding

## 🚨 Problem

You're seeing `172.17.0.1` (Docker internal IP) instead of the real client public IP in audit logs.

**Why this happens:**
- Your app is running in Docker
- Nginx is proxying requests to Docker
- Nginx is not configured to forward the real client IP
- The app only sees the Docker network IP

## ✅ Solution: Configure Nginx Properly

### Complete Nginx Configuration

Add this to your Nginx configuration file (usually `/etc/nginx/sites-available/your-app` or `/etc/nginx/conf.d/your-app.conf`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;  # Replace with your domain
    
    # Optional: Redirect HTTP to HTTPS
    # return 301 https://$server_name$request_uri;

    location / {
        # Proxy to your Node.js app (Docker)
        proxy_pass http://localhost:4000;  # Or your Docker container
        
        # ===== IMPORTANT: Forward Real Client IP =====
        
        # Set the real client IP (most important)
        proxy_set_header X-Real-IP $remote_addr;
        
        # Set the full chain of IPs (client, proxy1, proxy2, etc.)
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Forward the original host
        proxy_set_header Host $host;
        
        # Forward the original protocol (http/https)
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Forward the original port
        proxy_set_header X-Forwarded-Port $server_port;
        
        # ===== Other Recommended Headers =====
        
        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### For HTTPS (Recommended for Production)

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # SSL Certificate
    ssl_certificate /path/to/your/fullchain.pem;
    ssl_certificate_key /path/to/your/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://localhost:4000;
        
        # ===== Forward Real Client IP =====
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Other headers
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### For Docker Compose Setup

If you're using Docker Compose and Nginx is also in Docker:

```nginx
upstream nodejs_backend {
    server app:4000;  # 'app' is your Node.js container name
}

server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://nodejs_backend;
        
        # Forward real client IP
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔧 Apply the Configuration

### Step 1: Edit Nginx Configuration

```bash
# Edit your Nginx config
sudo nano /etc/nginx/sites-available/your-app

# Or for conf.d
sudo nano /etc/nginx/conf.d/your-app.conf
```

### Step 2: Test Configuration

```bash
# Test for syntax errors
sudo nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Step 3: Reload Nginx

```bash
# Reload Nginx (keeps connections alive)
sudo nginx -s reload

# OR restart Nginx (drops connections)
sudo systemctl restart nginx
```

### Step 4: Restart Your Node.js App

```bash
# If using PM2
pm2 restart your-app

# If using Docker
docker-compose restart

# If using systemd
sudo systemctl restart your-app
```

## ✅ Verify It's Working

### Test 1: Check Headers Received by Your App

Add temporary logging to see what headers you're receiving:

```javascript
// Temporarily add to your app.js or a route
app.use((req, res, next) => {
  console.log('=== Headers Debug ===');
  console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
  console.log('X-Real-IP:', req.headers['x-real-ip']);
  console.log('req.ip:', req.ip);
  console.log('remoteAddress:', req.connection.remoteAddress);
  next();
});
```

### Test 2: Make a Request

```bash
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

### Test 3: Check Server Logs

You should see in your Node.js logs:
```
=== Headers Debug ===
X-Forwarded-For: 203.0.113.45  ← Your real public IP
X-Real-IP: 203.0.113.45        ← Your real public IP
req.ip: 172.17.0.1             ← Docker IP (ignored now)
remoteAddress: 172.17.0.1      ← Docker IP (ignored now)
```

### Test 4: Check Audit Logs

```bash
curl -X GET "https://yourdomain.com/api/audit/logs?limit=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Result:**
```json
{
  "ipAddress": "203.0.113.45"  // ✅ Real public IP!
}
```

## 🔍 Troubleshooting

### Still Seeing 172.17.0.1?

**Check 1: Verify Nginx is sending headers**
```bash
# In your Node.js app logs, you should see:
X-Forwarded-For: YOUR_PUBLIC_IP
X-Real-IP: YOUR_PUBLIC_IP
```

If you don't see these, Nginx configuration didn't apply.

**Check 2: Verify Express trust proxy is enabled**

In your `src/app.js`, this should be present:
```javascript
app.set('trust proxy', true);
```

**Check 3: Restart both Nginx and your app**
```bash
sudo systemctl restart nginx
pm2 restart all  # or docker-compose restart
```

**Check 4: Check Nginx error logs**
```bash
sudo tail -f /var/log/nginx/error.log
```

### Getting null or undefined?

**Nginx might not be configured** - verify the proxy headers in your Nginx config:
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

### Multiple IPs in X-Forwarded-For?

This is normal! Example:
```
X-Forwarded-For: 203.0.113.45, 198.51.100.10, 192.0.2.5
                 ↑ Real client  ↑ Proxy 1      ↑ Proxy 2
```

Our code already extracts the **first IP** (the real client).

## 📊 Behind Cloudflare?

If you're using Cloudflare in front of Nginx:

```nginx
server {
    location / {
        proxy_pass http://localhost:4000;
        
        # Cloudflare-specific header (most reliable)
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        
        # Standard headers (backup)
        proxy_set_header X-Real-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

**Also configure Cloudflare:**
1. Go to Cloudflare Dashboard → your domain
2. SSL/TLS → Overview → Set to "Full" or "Full (strict)"
3. Network → Enable "True-Client-IP Header"

## 🔐 Security Considerations

### Only Trust Specific Proxies

Instead of trusting all proxies, trust only your Nginx:

```javascript
// In src/app.js
app.set('trust proxy', ['127.0.0.1', '::1', '172.17.0.0/16']);
```

### Validate IP Addresses

Our updated code now warns about private IPs, helping you detect misconfigurations.

## 📝 Quick Reference

### Essential Nginx Headers for Real IP

| Header | Purpose | Example |
|--------|---------|---------|
| `X-Real-IP` | Single IP of real client | `203.0.113.45` |
| `X-Forwarded-For` | Chain of all IPs | `203.0.113.45, 10.0.0.1` |
| `X-Forwarded-Proto` | Original protocol | `https` |
| `Host` | Original hostname | `yourdomain.com` |

### Minimal Working Config

```nginx
location / {
    proxy_pass http://localhost:4000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

## 🎯 Summary

1. ✅ **Updated IP extraction code** - Now prioritizes proxy headers
2. ✅ **Added private IP detection** - Warns if misconfigured
3. ⚠️ **Configure Nginx** - Add proxy headers (see above)
4. ✅ **Enable trust proxy** - Already done in your app
5. 🔄 **Restart services** - Nginx + your app

After configuring Nginx correctly, you'll see real public IPs like:
```
ipAddress: "203.0.113.45"  // ✅ Real user IP!
```

Instead of:
```
ipAddress: "172.17.0.1"    // ❌ Docker internal IP
```

---

**Need help?** Share your current Nginx configuration and I can help you fix it!


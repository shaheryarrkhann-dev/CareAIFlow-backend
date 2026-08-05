# Audit Trail - IP Address Handling Guide

## Understanding IP Addresses in Audit Logs

### Why You See `::1` or `127.0.0.1`

When testing locally (localhost), you'll see:
- `::1` - IPv6 loopback address
- `127.0.0.1` - IPv4 loopback address

**This is expected and correct** for local development! The request never leaves your computer, so the IP is the loopback address.

### ✅ Updates Made

I've enhanced the IP extraction to:

1. **Support More Proxy Headers**
   - `X-Forwarded-For` (standard)
   - `X-Real-IP` (Nginx)
   - `X-Client-IP` (Apache, various CDNs)
   - `CF-Connecting-IP` (Cloudflare)
   - `True-Client-IP` (Akamai, Cloudflare)
   - `X-Cluster-Client-IP` (Google Cloud Platform)

2. **Normalize IPv6 Addresses**
   - Converts `::1` → `127.0.0.1`
   - Removes `::ffff:` prefix for cleaner display

3. **Enable Proxy Trust**
   - Added `app.set('trust proxy', true)` in Express
   - Allows `req.ip` to get real client IP through reverse proxies

## How It Works in Different Environments

### 🏠 Local Development (Current)
```
Client (Browser) → localhost:4000 → Your App
IP Captured: 127.0.0.1 or ::1
```

### 🌐 Production (Typical Setup)
```
Client → Internet → Load Balancer/Proxy → Your App
IP Captured: Real public IP (e.g., 203.0.113.45)
```

### ☁️ Production with Cloudflare
```
Client → Cloudflare CDN → Your Server
IP Captured from: CF-Connecting-IP header
```

### 🔧 Production with Nginx
```
Client → Nginx → Your App
IP Captured from: X-Forwarded-For or X-Real-IP
```

## Testing Real IP Addresses

### Option 1: Test from Another Device

Access your API from a phone, tablet, or another computer:

```bash
# Find your local IP
# Windows: ipconfig
# Mac/Linux: ifconfig

# From another device on same network
curl -X POST http://192.168.1.100:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

**Expected Result:** You'll see the device's local network IP (e.g., `192.168.1.50`)

### Option 2: Use ngrok (Recommended for Testing)

ngrok creates a public tunnel to your localhost:

```bash
# 1. Install ngrok
# Download from: https://ngrok.com/download

# 2. Start your app
npm run dev

# 3. In another terminal, start ngrok
ngrok http 4000

# 4. You'll get a public URL like:
# https://abc123.ngrok.io

# 5. Test from anywhere
curl -X POST https://abc123.ngrok.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

**Expected Result:** You'll see your actual public IP address!

### Option 3: Deploy to Production

When deployed to a real server, you'll automatically get real IP addresses:

- **Heroku**: Automatically provides `X-Forwarded-For`
- **AWS (ALB/ELB)**: Provides `X-Forwarded-For`
- **Google Cloud**: Provides `X-Cluster-Client-IP`
- **Azure**: Provides `X-Forwarded-For`
- **Cloudflare**: Provides `CF-Connecting-IP`
- **DigitalOcean**: Provides `X-Forwarded-For`

### Option 4: Manual Header Simulation (Testing Only)

You can simulate a proxy by manually setting headers:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 203.0.113.45" \
  -d '{"email":"test@example.com","password":"password"}'
```

**Note:** This only works because we set `trust proxy: true`. This is for testing purposes only!

## Production Configuration

### For Nginx (Reverse Proxy)

Add to your nginx config:

```nginx
location / {
    proxy_pass http://localhost:4000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

### For Apache (Reverse Proxy)

Add to your apache config:

```apache
ProxyPass / http://localhost:4000/
ProxyPassReverse / http://localhost:4000/
ProxyPreserveHost On

RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
RequestHeader set X-Real-IP %{REMOTE_ADDR}s
```

### For Cloudflare

Cloudflare automatically adds `CF-Connecting-IP` header - no configuration needed! Our code already handles this.

### For AWS Application Load Balancer

ALB automatically adds `X-Forwarded-For` - already supported!

## IP Address Security Considerations

### ⚠️ Trust Proxy Setting

```javascript
// Current setting (suitable for most cases)
app.set('trust proxy', true);

// For specific proxy setups
app.set('trust proxy', 1); // Trust first proxy
app.set('trust proxy', 2); // Trust first 2 proxies

// For specific IP addresses
app.set('trust proxy', ['127.0.0.1', '::1']);
```

**Why this matters:**
- With `trust proxy: true`, we trust all proxies
- This is fine behind trusted infrastructure (AWS, Azure, etc.)
- For public-facing apps, you might want to be more specific

### 🔒 IP Spoofing Prevention

When `trust proxy` is enabled:
- Express uses `X-Forwarded-For` header
- Only enable if behind a trusted proxy
- Attackers could fake headers if accessing directly

**Best Practice:**
- Only expose your app through a reverse proxy
- Use firewall rules to prevent direct access
- Validate IP addresses if used for security decisions

## Verifying IP Capture

### Check Current Setup

```bash
# 1. Login via API
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# 2. Get access token from response

# 3. Check audit logs
curl -X GET "http://localhost:4000/api/audit/logs?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Look at the "ipAddress" field in response
```

### Expected Results by Environment

| Environment | Expected IP |
|-------------|-------------|
| Local (same machine) | `127.0.0.1` |
| Local network device | `192.168.x.x` or `10.x.x.x` |
| ngrok tunnel | Your public IP |
| Production | Client's public IP |
| Behind Cloudflare | Real client IP (not Cloudflare IP) |

## Sample Audit Log with Real IP

From production environment:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "user-123",
  "action": "LOGIN_SUCCESS",
  "resource": "auth",
  "ipAddress": "203.0.113.45",  // Real public IP
  "userAgent": "Mozilla/5.0...",
  "requestData": {
    "email": "user@example.com",
    "password": "[REDACTED]"
  },
  "createdAt": "2025-10-28T22:07:38.980Z"
}
```

## Troubleshooting

### Problem: Still seeing `::1` in production

**Solution:**
1. Verify `trust proxy` is set to `true`
2. Check if your load balancer/proxy is sending headers
3. Verify proxy configuration (Nginx, Apache, etc.)
4. Check firewall isn't blocking header information

### Problem: IP shows as proxy/CDN IP

**Solution:**
1. Ensure proxy is configured to forward real IP
2. Check header configuration (X-Forwarded-For, X-Real-IP)
3. For Cloudflare, ensure `CF-Connecting-IP` is available

### Problem: Multiple IPs in logs

**Solution:**
```
X-Forwarded-For: client-ip, proxy1-ip, proxy2-ip

Our code automatically extracts the FIRST IP (the client)
```

## Summary

✅ **Local Development** (Current)
- IP: `127.0.0.1` (This is CORRECT for localhost testing)
- To see real IPs: Use ngrok or test from another device

✅ **Production** (Automatic)
- Real client IPs will be captured automatically
- Supports all major cloud providers and CDNs
- Proxy headers are properly extracted

✅ **Updates Applied**
- Enhanced IP extraction with multiple proxy header support
- Added IPv6 normalization
- Enabled proxy trust in Express
- Ready for production deployment

## Next Steps

1. **For Local Testing:** 
   - Use ngrok to see real public IP capture
   - Or test from another device on your network

2. **For Production:**
   - Deploy your app
   - Configure reverse proxy if needed
   - Verify IP capture in audit logs

3. **For Security:**
   - Review `trust proxy` settings for your setup
   - Ensure app isn't directly accessible (only through proxy)
   - Consider IP-based rate limiting or blocking

The audit system is now optimized for capturing client IPs in all environments! 🎉


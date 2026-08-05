# 🔧 Setting Up .env File on EC2

## Problem: .env File Not Found

---

## Step 1: Check if .env Exists

```bash
# Check current directory
pwd

# List all files (including hidden)
ls -la

# Look for .env file
ls -la | grep .env
```

---

## Step 2: Find .env File Location

```bash
# Search for .env file in current directory
find . -name ".env" -type f

# Search in parent directories
find .. -name ".env" -type f 2>/dev/null

# Check common locations
ls -la ~/.env
ls -la /home/ubuntu/.env
ls -la /var/www/.env
```

---

## Step 3: Create .env File (If It Doesn't Exist)

### Option A: Create in Current Directory
```bash
# Make sure you're in the right directory
cd ~/ai-onboarding-platform

# Create .env file
touch .env

# Edit it
sudo nano .env
```

### Option B: Copy from Example (If You Have .env.example)
```bash
# Check if .env.example exists
ls -la .env.example

# Copy it
cp .env.example .env

# Edit it
sudo nano .env
```

---

## Step 4: Add ENCRYPTION_KEY

### First, Generate the Key (On Your Local Machine or EC2)

**On EC2:**
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copy the output** (long string of letters/numbers)

### Then Add to .env
```bash
# Edit .env file
sudo nano .env
```

**Add this line:**
```env
ENCRYPTION_KEY=<paste-generated-key-here>
```

**Save:** Ctrl+X, then Y, then Enter

---

## Step 5: Verify .env File

```bash
# Check if ENCRYPTION_KEY is set
grep ENCRYPTION_KEY .env

# Or view entire file (be careful - may contain secrets)
cat .env | grep ENCRYPTION_KEY
```

---

## Step 6: Set Permissions (Important for Security)

```bash
# Make sure .env is not publicly readable
chmod 600 .env

# Verify permissions
ls -la .env
# Should show: -rw------- (only owner can read/write)
```

---

## Common Issues and Solutions

### Issue 1: File Not Found
**Solution:** Create it
```bash
touch .env
sudo nano .env
```

### Issue 2: Permission Denied
**Solution:** Use sudo or fix permissions
```bash
# Option 1: Use sudo
sudo nano .env

# Option 2: Fix ownership
sudo chown ubuntu:ubuntu .env
nano .env
```

### Issue 3: File in Different Location
**Solution:** Find it first
```bash
find ~ -name ".env" -type f 2>/dev/null
```

### Issue 4: Application Not Reading .env
**Solution:** Check application location
```bash
# Find where your app is running
pm2 list
pm2 info <app-name>

# Check working directory
# Make sure .env is in the same directory as your app
```

---

## Step-by-Step: Complete Setup

### 1. Navigate to App Directory
```bash
cd ~/ai-onboarding-platform
pwd  # Should show: /home/ubuntu/ai-onboarding-platform
```

### 2. Check if .env Exists
```bash
ls -la .env
```

### 3. If Not Found, Create It
```bash
touch .env
```

### 4. Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Copy the Generated Key

### 6. Edit .env File
```bash
sudo nano .env
```

### 7. Add ENCRYPTION_KEY
```env
ENCRYPTION_KEY=<paste-your-generated-key-here>
```

### 8. Add Other Required Variables (If Needed)
```env
ENCRYPTION_KEY=<your-key>
DATABASE_URL=<your-database-url>
JWT_SECRET=<your-jwt-secret>
# ... other variables
```

### 9. Save and Exit
- Ctrl+X
- Y (to confirm)
- Enter

### 10. Set Permissions
```bash
chmod 600 .env
```

### 11. Restart Application
```bash
pm2 restart all
# or
sudo systemctl restart your-app-name
```

### 12. Verify It's Working
```bash
# Check logs
pm2 logs --lines 20

# Should NOT see encryption key warnings
```

---

## Alternative: Use Environment Variables Directly

If you can't find/create .env file, you can set it as environment variable:

### For PM2:
```bash
# Edit PM2 ecosystem file or set in process
pm2 restart all --update-env

# Or set in ecosystem.config.js
env: {
  ENCRYPTION_KEY: 'your-key-here'
}
```

### For systemd:
```bash
# Edit service file
sudo nano /etc/systemd/system/your-app.service

# Add to [Service] section:
Environment="ENCRYPTION_KEY=your-key-here"

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart your-app
```

---

## Quick Commands Summary

```bash
# 1. Go to app directory
cd ~/ai-onboarding-platform

# 2. Create .env if it doesn't exist
touch .env

# 3. Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Edit .env
sudo nano .env

# 5. Add: ENCRYPTION_KEY=<generated-key>

# 6. Set permissions
chmod 600 .env

# 7. Restart app
pm2 restart all
```

---

## Verify Everything Works

```bash
# Check .env exists
ls -la .env

# Check key is set
grep ENCRYPTION_KEY .env

# Check app logs (should not show encryption warnings)
pm2 logs --lines 20
```

---

## 🆘 Still Having Issues?

If you still can't find/create .env:

1. **Check where your app actually runs:**
   ```bash
   pm2 list
   pm2 info <app-name>  # Shows working directory
   ```

2. **Create .env in that directory**

3. **Or use environment variables directly** (see alternative above)

---

**You've got this!** The .env file might just need to be created. 🚀







# 🚀 How to Run AWS Security Script in CloudShell

## ✅ Easiest Method - No Installation Needed!

Since you don't have AWS CLI installed locally, use **AWS CloudShell** (it's built into AWS Console).

---

## Step-by-Step Instructions

### Step 1: Open AWS CloudShell
1. Go to: https://console.aws.amazon.com/
2. Log in to your AWS account
3. Click the **CloudShell icon** (terminal icon) in the top navigation bar
   - It looks like: `>_` or a terminal window icon
4. Wait for CloudShell to open (takes 10-30 seconds)

### Step 2: Copy the Script
1. Open the file: `scripts/aws-security-setup-cloudshell.sh`
2. Copy **ALL** the content (Ctrl+A, Ctrl+C)

### Step 3: Paste and Run
1. In CloudShell, paste the script (right-click → Paste, or Ctrl+V)
2. Press **Enter** to run it
3. Wait for it to complete (takes 2-5 minutes)

### Step 4: Verify Results
The script will show:
- ✅ CloudTrail enabled
- ✅ S3 buckets encrypted
- ✅ RDS encryption status

---

## What the Script Does

1. **Enables CloudTrail** - Creates audit trail of all AWS API calls
2. **Encrypts S3 Buckets** - Encrypts all your S3 buckets with AES-256
3. **Checks RDS Encryption** - Tells you if your database is encrypted

**It's safe to run** - it only enables security features, doesn't delete anything.

---

## Alternative: Manual Steps in AWS Console

If you prefer to do it manually:

### Enable CloudTrail:
1. Go to: https://console.aws.amazon.com/cloudtrail/
2. Click "Create trail"
3. Name: `residentcare-hipaa-audit-trail`
4. Create new S3 bucket for logs
5. Enable "Multi-region trail"
6. Click "Create"

### Encrypt S3 Buckets:
1. Go to: https://console.aws.amazon.com/s3/
2. Click on each bucket
3. Go to "Properties" tab
4. Scroll to "Default encryption"
5. Click "Edit"
6. Select "AES-256"
7. Click "Save changes"

### Check RDS Encryption:
1. Go to: https://console.aws.amazon.com/rds/
2. Click on your database instance
3. Check "Encryption" field
4. If "Not encrypted", you need to encrypt it (see guide)

---

## After Running the Script

1. **Enable MFA** (15 minutes):
   - AWS Console → IAM → Users → Your User
   - Security credentials → Assign MFA device

2. **Add Encryption Key** to your `.env`:
   ```bash
   # Generate key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Add to .env
   ENCRYPTION_KEY=<generated-key>
   ```

3. **Test your application** - everything should still work!

---

## ❓ FAQ

**Q: Do I need to push code first?**
A: No! The script only configures AWS services. It doesn't need your code.

**Q: Can I run it multiple times?**
A: Yes, it's safe. It checks if things already exist and skips them.

**Q: Will it break anything?**
A: No, it only enables security features. Your application will continue working.

**Q: How long does it take?**
A: 2-5 minutes in CloudShell.

---

## ✅ That's It!

After running the script, you'll have:
- ✅ CloudTrail enabled (HIPAA audit requirement)
- ✅ S3 buckets encrypted (HIPAA encryption requirement)
- ✅ RDS encryption status checked

**You're making great progress!** 🚀







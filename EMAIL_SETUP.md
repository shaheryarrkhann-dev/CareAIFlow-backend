# 📧 Email Configuration Guide

Complete guide to setting up email functionality in your AI Onboarding application.

## 🎯 Overview

The application uses **Nodemailer** to send emails for:
- 📩 User invitations with temporary passwords
- 🔑 Password reset requests
- ✅ Password change confirmations

## 🚀 Quick Start

### Development Mode (No Configuration Required)

By default, the app uses **Ethereal Email** (test email service) when no SMTP credentials are configured.

**No setup needed!** Emails will be logged to console with preview links.

```
📧 User Invitation Email Sent (Test Mode)
To: user@example.com
Temporary Password: xyz123
Preview URL: https://ethereal.email/message/xyz...
```

Click the preview URL to see the email in your browser!

---

## 📮 Production Setup

### Option 1: Gmail (Easiest for Testing)

#### Step 1: Enable 2-Factor Authentication
1. Go to Google Account settings
2. Security → 2-Step Verification
3. Enable it

#### Step 2: Generate App Password
1. Google Account → Security
2. 2-Step Verification → App passwords
3. Select "Mail" and "Other (Custom name)"
4. Name it "AI Onboarding"
5. Copy the 16-character password

#### Step 3: Configure .env
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=AI Onboarding
```

---

### Option 2: Outlook/Hotmail

```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
EMAIL_FROM=your-email@outlook.com
EMAIL_FROM_NAME=AI Onboarding
```

---

### Option 3: SendGrid (Recommended for Production)

#### Step 1: Create SendGrid Account
1. Sign up at [SendGrid.com](https://sendgrid.com)
2. Verify your email
3. Complete sender verification

#### Step 2: Create API Key
1. Dashboard → Settings → API Keys
2. Create API Key
3. Select "Full Access" or "Mail Send"
4. Copy the API key

#### Step 3: Configure .env
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
EMAIL_FROM=verified-email@yourdomain.com
EMAIL_FROM_NAME=AI Onboarding
```

**Note:** SendGrid requires sender verification!

---

### Option 4: AWS SES (Scalable Production)

#### Step 1: Setup AWS SES
1. AWS Console → Simple Email Service
2. Verify domain or email
3. Request production access (if needed)
4. Create SMTP credentials

#### Step 2: Configure .env
```env
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-aws-smtp-username
EMAIL_PASS=your-aws-smtp-password
EMAIL_FROM=verified@yourdomain.com
EMAIL_FROM_NAME=AI Onboarding
```

Replace `us-east-1` with your AWS region.

---

### Option 5: Custom SMTP Server

```env
EMAIL_HOST=mail.yourdomain.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=your-password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=AI Onboarding
```

---

## 🔧 Environment Variables Explained

| Variable | Description | Example |
|----------|-------------|---------|
| `EMAIL_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP port (usually 587 or 465) | `587` |
| `EMAIL_SECURE` | Use TLS/SSL (true for port 465) | `false` |
| `EMAIL_USER` | SMTP username/email | `your-email@gmail.com` |
| `EMAIL_PASS` | SMTP password or API key | `your-password` |
| `EMAIL_FROM` | From email address | `noreply@domain.com` |
| `EMAIL_FROM_NAME` | From display name | `AI Onboarding` |

---

## 🧪 Testing Email Setup

### Test in Development Mode

1. **Don't configure SMTP** (leave EMAIL_HOST empty)
2. Run the app:
   ```bash
   npm run dev
   ```
3. Invite a user via API or Swagger
4. Check console for preview URL:
   ```
   Preview URL: https://ethereal.email/message/xyz...
   ```
5. Click URL to see the email

### Test with Real SMTP

1. Configure SMTP credentials in `.env`
2. Restart the server:
   ```bash
   npm run dev
   ```
3. Invite a user
4. Check the recipient's inbox

---

## 📝 Email Templates

The application sends beautiful HTML emails with:

### 1. User Invitation Email
- 🎉 Welcome message
- 🔐 Login credentials (email + temporary password)
- 🔗 Direct login link
- ⚠️ Security reminders
- 📋 Step-by-step instructions

### 2. Password Reset Email
- 🔑 Reset password link
- ⏰ Expiration time
- ⚠️ Security warnings
- 📧 Support information

### 3. Password Changed Email
- ✅ Confirmation message
- 🔗 Login link
- ⚠️ Unauthorized change warning

All emails include:
- Responsive HTML design
- Plain text fallback
- Mobile-friendly layout
- Professional styling

---

## 🛠️ Troubleshooting

### Issue: "Invalid login" error with Gmail

**Solution:** Use App Password, not regular password
1. Enable 2FA on Google Account
2. Generate App Password
3. Use that 16-character password

### Issue: "Connection timeout"

**Solution:** Check firewall/port
- Port 587 must be open
- Try port 465 with `EMAIL_SECURE=true`
- Check if ISP blocks SMTP ports

### Issue: "Authentication failed"

**Solution:** Verify credentials
- Double-check username and password
- Ensure no extra spaces in .env
- Try logging in to email provider directly

### Issue: Emails go to spam

**Solution:** Improve email reputation
- Verify sender domain (SPF, DKIM, DMARC)
- Use professional email service (SendGrid, AWS SES)
- Add "unsubscribe" link (for production)
- Avoid spam trigger words

### Issue: "Self-signed certificate" error

**Solution:** 
```env
# Add to your .env if using self-signed cert
NODE_TLS_REJECT_UNAUTHORIZED=0
```
⚠️ **Only use in development!**

---

## 🔒 Security Best Practices

### 1. Never Commit Credentials
- ✅ Use `.env` file
- ✅ Add `.env` to `.gitignore`
- ❌ Never commit real passwords

### 2. Use App-Specific Passwords
- For Gmail, use App Passwords
- Don't use your main account password

### 3. Rotate Credentials Regularly
- Change SMTP passwords periodically
- Revoke unused API keys

### 4. Limit Email Sending Rate
- Respect provider limits
- Implement queues for bulk emails
- Monitor sending metrics

### 5. Sender Verification
- Verify domain ownership
- Set up SPF/DKIM/DMARC
- Use dedicated sending domain

---

## 📊 Email Provider Comparison

| Provider | Free Tier | Cost | Setup | Production Ready |
|----------|-----------|------|-------|------------------|
| **Ethereal** | ∞ (test only) | Free | None | ❌ Testing only |
| **Gmail** | 500/day | Free | Easy | ⚠️ Dev/small projects |
| **SendGrid** | 100/day | $$ | Medium | ✅ Yes |
| **AWS SES** | 62k/month | $ | Hard | ✅ Yes |
| **Mailgun** | 5k/month | $$ | Easy | ✅ Yes |
| **Postmark** | 100/month | $$$ | Easy | ✅ Yes |

---

## 🚀 Advanced Configuration

### Rate Limiting
```javascript
// In your email utility (future enhancement)
const rateLimit = require('bottleneck');
const limiter = new rateLimit({
  minTime: 100, // 100ms between emails
  maxConcurrent: 5
});
```

### Email Queue (Future Enhancement)
```javascript
// Using Bull queue (future)
const Queue = require('bull');
const emailQueue = new Queue('email-sending');

emailQueue.process(async (job) => {
  await sendEmail(job.data);
});
```

### Email Analytics
- Track open rates (SendGrid/Mailgun)
- Monitor bounce rates
- Log email delivery status

---

## 📞 Need Help?

### Quick Checks:
1. ✅ Are credentials correct?
2. ✅ Is `.env` loaded? (check console on startup)
3. ✅ Is port 587/465 accessible?
4. ✅ Did you restart the server after config?

### Still Having Issues?
- Check provider documentation
- Test SMTP credentials with a tool like [SMTP Tester](https://www.smtpbucket.com/)
- Review server logs for detailed errors
- Contact your SMTP provider support

---

## 📚 Resources

- [Nodemailer Documentation](https://nodemailer.com)
- [Gmail SMTP Setup](https://support.google.com/mail/answer/7126229)
- [SendGrid Documentation](https://docs.sendgrid.com)
- [AWS SES Documentation](https://docs.aws.amazon.com/ses)
- [Email Testing with Ethereal](https://ethereal.email)

---

**Last Updated:** October 7, 2024  
**Version:** 1.0.1


# ✅ WAC/RCW Compliance - Deployment Checklist

## Pre-Deployment

### 1. Install Dependencies
```bash
cd AI_powered
npm install node-cron axios
```
- [ ] `node-cron` installed (for monthly regulation updates)
- [ ] `axios` installed (for WAC/RCW API calls)

### 2. Database Migration
```bash
npx prisma migrate dev --name add-wac-rcw-compliance
npx prisma generate
```
- [ ] Migration applied successfully
- [ ] New fields added to `FormSchema` model
- [ ] Database indexes created

### 3. Environment Variables (Optional)
Add to `.env` if you want to customize:
```env
WAC_RCW_ENABLED=true
REGULATION_UPDATE_CRON=0 2 1 * *
REGULATION_TIMEZONE=America/Los_Angeles
```
- [ ] Environment variables reviewed
- [ ] Pinecone API key configured (existing)
- [ ] OpenAI API key configured (existing)

---

## Deployment

### 4. Restart Server
```bash
npm run dev
```

**Verify startup logs**:
- [ ] `[SERVER] 🏛️ Starting WAC/RCW compliance monitoring...`
- [ ] `[WAC-RCW] 🚀 Initializing WAC/RCW regulations database...`
- [ ] `[WAC-RCW] Fetching WAC 388-76-10010...` (23 regulations total)
- [ ] `[WAC-RCW] ✅ Stored WAC/RCW in vector DB` (for each regulation)
- [ ] `[REG-MONITOR] ✅ Regulations initialized`
- [ ] `[REG-MONITOR] 📅 Scheduling monthly regulation updates...`
- [ ] `[SERVER] ✅ Compliance monitoring active`

**Initial loading**: First startup takes **5-10 minutes** to fetch and vectorize all 23 regulations.

---

## Post-Deployment Testing

### 5. Verify Regulation Initialization

**Test Pinecone Vector Store**:
```bash
node -e "
  require('dotenv').config();
  const { getPineconeIndex } = require('./src/config/pinecone.config');
  (async () => {
    const index = await getPineconeIndex();
    const stats = await index.describeIndexStats();
    console.log('Regulations:', stats.namespaces['wac-rcw-regulations']);
  })();
"
```

**Expected output**:
```
Regulations: { recordCount: 23 }
```

- [ ] 23 regulations stored in Pinecone
- [ ] `wac-rcw-regulations` namespace exists

### 6. Test Schema Generation with Compliance

**API Call**:
```bash
curl -X POST http://localhost:4000/api/forms/generate-schema \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "formName": "Emergency Contact Form",
    "description": "Emergency contact information"
  }'
```

**Verify logs**:
- [ ] `[SCHEMA-GEN] 🏛️ Starting WAC/RCW compliant schema generation...`
- [ ] `[SCHEMA-GEN] 🔍 Finding relevant WAC/RCW regulations...`
- [ ] `[SCHEMA-GEN] ✅ Found X relevant regulations`
- [ ] `[COMPLIANCE] 🏛️ WAC/RCW Compliance Summary:`
- [ ] `Fields with citations: X (XX.X%)`

**Verify response**:
- [ ] `schemaJson.fields` contains `wacCitation` or `rcwCitation`
- [ ] `schemaJson.compliance` object present
- [ ] `isWacRcwCompliant` = `true` in database

### 7. Test HITL Admin Review

**Get Pending Review**:
```bash
curl -X GET http://localhost:4000/api/compliance/pending-review \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

- [ ] Response includes pending schemas
- [ ] Compliance percentages displayed
- [ ] WAC/RCW citations listed

**Approve Schema**:
```bash
curl -X POST http://localhost:4000/api/compliance/schema/<SCHEMA_ID>/approve \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Test approval"}'
```

- [ ] Schema approved successfully
- [ ] `adminApproved` = `true` in database
- [ ] `adminApprovedAt` timestamp set

### 8. Test PII/PHI Masking

**Test Code**:
```javascript
const { maskFormData } = require('./src/services/piiPhiMasking.service');

const formData = {
  name: "Dr. John Smith",
  ssn: "123-45-6789",
  phone: "(555) 123-4567"
};

const { maskedData, detectedPiiTypes } = maskFormData(formData);
console.log('Masked:', maskedData);
console.log('Detected:', detectedPiiTypes);
```

- [ ] SSN masked: `[SSN_X]`
- [ ] Phone masked: `[PHONE_X]`
- [ ] Name with title masked: `[NAMEWITHTITLE_X]`
- [ ] `detectedPiiTypes` array populated

### 9. Test Cron Job (Manual Trigger)

```bash
curl -X POST http://localhost:4000/api/compliance/regulations/update \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>"
```

- [ ] Regulations fetched successfully
- [ ] Pinecone vector DB updated
- [ ] Schemas marked for revalidation
- [ ] Update summary returned

---

## Production Deployment

### 10. Environment-Specific Configuration

**Production `.env`**:
```env
NODE_ENV=production
DATABASE_URL=<production-db-url>
PINECONE_API_KEY=<production-key>
OPENAI_API_KEY=<production-key>
```

- [ ] Production environment variables set
- [ ] Database connection verified
- [ ] Pinecone namespace isolated per environment

### 11. Database Backup

```bash
pg_dump -U postgres -d ai_onboarding > backup_before_wac_rcw.sql
```

- [ ] Database backed up before migration
- [ ] Backup tested and verified

### 12. Load Testing

**Test with multiple concurrent schema generations**:
```bash
# Use Apache Bench or similar
ab -n 10 -c 2 -T 'application/json' \
   -H 'Authorization: Bearer <TOKEN>' \
   -p schema_request.json \
   http://localhost:4000/api/forms/generate-schema
```

- [ ] Server handles concurrent requests
- [ ] Regulation search remains fast (<2s)
- [ ] No memory leaks detected

---

## Monitoring

### 13. Set Up Alerts

**Key Metrics to Monitor**:

1. **Regulation Update Success Rate**
   - Alert if update fails 2 months in a row
   - Check logs: `[REG-MONITOR]`

2. **Compliance Rate**
   - Alert if <70% of schemas have citations
   - Check: `GET /api/compliance/stats`

3. **PII Detection**
   - Log all PII access
   - Check logs: `[PII-AUDIT]`

4. **Pinecone Vector Store**
   - Monitor record count
   - Alert if count drops unexpectedly

- [ ] Monitoring dashboard configured
- [ ] Alerts set up for key metrics
- [ ] Log aggregation configured

### 14. Documentation for Team

**Share with team**:
- [ ] `WAC_RCW_QUICK_START.md` - Quick setup guide
- [ ] `WAC_RCW_COMPLIANCE_IMPLEMENTATION.md` - Full documentation
- [ ] `WAC_RCW_DEPLOYMENT_CHECKLIST.md` - This checklist

**Training**:
- [ ] Admins trained on HITL review workflow
- [ ] Developers briefed on PII masking requirements
- [ ] Stakeholders informed of compliance features

---

## Post-Deployment Validation

### 15. End-to-End Test

**Complete workflow**:
1. Upload PDF with form fields
2. Generate schema (verify citations added)
3. Admin reviews schema (approve)
4. Fill form with PII (verify masking)
5. Check compliance stats (verify metrics)

- [ ] End-to-end workflow successful
- [ ] All systems operational

### 16. Performance Benchmarks

**Target Metrics**:
| Metric | Target | Actual |
|--------|--------|--------|
| Schema generation time | <30s | ___ |
| Regulation search time | <2s | ___ |
| Compliance review load time | <1s | ___ |
| PII masking time | <100ms | ___ |
| Monthly update duration | <30min | ___ |

- [ ] All performance targets met
- [ ] No degradation from baseline

---

## Rollback Plan (If Needed)

### 17. Emergency Rollback

**If critical issues occur**:

```bash
# 1. Revert database migration
npx prisma migrate rollback

# 2. Restore from backup
psql -U postgres -d ai_onboarding < backup_before_wac_rcw.sql

# 3. Revert code changes
git revert <commit-hash>

# 4. Restart server
npm run dev
```

**Rollback triggers**:
- [ ] Schema generation fails >50% of requests
- [ ] Database performance degrades significantly
- [ ] Regulation fetching causes system instability

---

## Go-Live Checklist

### Final Pre-Launch

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Team trained
- [ ] Documentation complete
- [ ] Monitoring active
- [ ] Rollback plan ready
- [ ] Stakeholders notified

### Launch

- [ ] Deploy to production
- [ ] Verify regulations initialized
- [ ] Run smoke tests
- [ ] Monitor for first 24 hours
- [ ] Announce to users

### First Week

- [ ] Daily monitoring of compliance stats
- [ ] Review admin approval workflow usage
- [ ] Check for PII masking issues
- [ ] Gather user feedback
- [ ] Fine-tune performance if needed

---

## Success Criteria

✅ **System is live and operational when**:

1. ✅ 23 regulations loaded in Pinecone
2. ✅ Schema generation includes WAC/RCW citations
3. ✅ Compliance rate >70%
4. ✅ Admin approval workflow functional
5. ✅ PII masking working correctly
6. ✅ Monthly cron job scheduled
7. ✅ No performance degradation
8. ✅ Team trained and documentation complete

---

## Support Contacts

**Technical Issues**:
- Check logs: `[WAC-RCW]`, `[COMPLIANCE]`, `[REG-MONITOR]`, `[PII-AUDIT]`
- Review documentation: `WAC_RCW_COMPLIANCE_IMPLEMENTATION.md`
- Contact: System Administrator

**Compliance Questions**:
- Review: Washington State Legislature (https://leg.wa.gov)
- Legal counsel for compliance verification
- DSHS regulations: https://www.dshs.wa.gov/altsa/residential-care-services

---

## Version

- **Implementation Date**: _____________
- **Deployed By**: _____________
- **Production Status**: [ ] Deployed  [ ] Pending  [ ] Rolled Back
- **Compliance Version**: 2025-01

---

## Notes

_Add any deployment-specific notes here:_

---

## Sign-Off

- [ ] Development Lead: _____________ Date: _______
- [ ] System Administrator: _____________ Date: _______
- [ ] Compliance Officer: _____________ Date: _______
- [ ] Product Owner: _____________ Date: _______

---

**🎉 Deployment Complete!**

Your system is now **WAC/RCW compliant** and ready to generate legally-backed form schemas!


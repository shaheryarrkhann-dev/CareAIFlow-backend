# HIPAA Incident Response Plan

**Organization:** [Your Company Name]  
**Date Created:** [Current Date]  
**Last Reviewed:** [Current Date]  
**Next Review Date:** [Date + 1 year]

---

## 1. PURPOSE

This document outlines the procedures for responding to security incidents involving Protected Health Information (PHI) in accordance with HIPAA Security Rule §164.308(a)(6).

---

## 2. DEFINITIONS

### Security Incident
Any attempted or successful unauthorized access, use, disclosure, modification, or destruction of PHI or interference with system operations.

### Breach
An impermissible use or disclosure of PHI that compromises the security or privacy of the PHI.

### PHI (Protected Health Information)
Individually identifiable health information transmitted or maintained in any form or medium.

---

## 3. INCIDENT RESPONSE TEAM

### Primary Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Security Lead | [Your Name] | [Phone] | [Email] |
| Technical Lead | [Name] | [Phone] | [Email] |
| Legal Counsel | [Name/Law Firm] | [Phone] | [Email] |
| AWS Support | - | 1-888-280-3321 | - |

### Escalation Path
1. Security Lead (immediate)
2. Technical Lead (if technical issue)
3. Legal Counsel (if breach confirmed)
4. AWS Support (if infrastructure issue)

---

## 4. INCIDENT RESPONSE TIMELINE

### Phase 1: Detection & Containment (0-1 hour)

**Immediate Actions:**
1. **Identify the incident**
   - What happened?
   - When did it occur?
   - Who discovered it?
   - What systems/data are affected?

2. **Contain the breach**
   - Disable compromised accounts immediately
   - Isolate affected systems if possible
   - Preserve evidence (logs, screenshots)
   - Change passwords/keys if compromised

3. **Document everything**
   - Create incident log
   - Take screenshots
   - Save audit logs
   - Note timestamps

**Checklist:**
- [ ] Incident identified and documented
- [ ] Compromised accounts disabled
- [ ] Evidence preserved
- [ ] Security Lead notified

---

### Phase 2: Assessment (1-24 hours)

**Actions:**
1. **Assess the scope**
   - How many individuals affected?
   - What type of PHI was accessed?
   - Was PHI actually viewed/disclosed?
   - Is this a reportable breach?

2. **Review audit logs**
   - Check CloudTrail logs
   - Check application audit logs
   - Identify unauthorized access
   - Document access patterns

3. **Determine breach status**
   - **Not a breach:** No PHI accessed/disclosed → Document and close
   - **Potential breach:** PHI may have been accessed → Continue investigation
   - **Confirmed breach:** PHI was accessed/disclosed → Proceed to notification

**Checklist:**
- [ ] Scope of incident assessed
- [ ] Audit logs reviewed
- [ ] Breach status determined
- [ ] Legal counsel consulted (if breach)

---

### Phase 3: Investigation (1-7 days)

**Actions:**
1. **Root cause analysis**
   - How did the breach occur?
   - What vulnerabilities were exploited?
   - What controls failed?

2. **Remediation**
   - Fix vulnerabilities
   - Implement additional controls
   - Update security policies
   - Test fixes

3. **Documentation**
   - Complete incident report
   - Document lessons learned
   - Update risk assessment

**Checklist:**
- [ ] Root cause identified
- [ ] Vulnerabilities fixed
- [ ] Additional controls implemented
- [ ] Incident report completed

---

### Phase 4: Notification (If Breach Confirmed)

**HIPAA Requirements:**
- **Affected Individuals:** Notify within 60 days
- **HHS:** Notify within 60 days (if >500 individuals) or within 60 days of end of calendar year (if <500)
- **Media:** Notify within 60 days (if >500 individuals in one state)

**Notification Content:**
1. Description of what happened
2. Types of PHI involved
3. What you're doing to investigate
4. What you're doing to prevent future breaches
5. Steps individuals should take to protect themselves
6. Contact information for questions

**Checklist:**
- [ ] Affected individuals notified (within 60 days)
- [ ] HHS notified (if required, within 60 days)
- [ ] Media notified (if >500 individuals in one state)
- [ ] Notification letters sent via first-class mail (or email if individual agreed)

---

## 5. COMMON INCIDENT SCENARIOS

### Scenario 1: Unauthorized Access

**Example:** Employee accessed resident data they shouldn't have access to.

**Response:**
1. Immediately revoke access
2. Review audit logs to see what was accessed
3. Determine if PHI was viewed
4. If yes → Assess if breach occurred
5. Document and remediate

---

### Scenario 2: Lost/Stolen Device

**Example:** Laptop with database credentials is stolen.

**Response:**
1. Immediately change all credentials
2. Revoke database access
3. Check if device had PHI stored locally
4. If yes → Assess breach
5. Enable remote wipe if possible
6. File police report if theft

---

### Scenario 3: Phishing Attack

**Example:** Employee clicked malicious link, credentials compromised.

**Response:**
1. Immediately reset user password
2. Revoke all sessions
3. Check if attacker accessed PHI
4. Review audit logs for suspicious activity
5. If PHI accessed → Assess breach
6. Provide security training

---

### Scenario 4: Database Breach

**Example:** Unauthorized access to RDS database.

**Response:**
1. Immediately revoke all database access
2. Change database credentials
3. Review CloudTrail and database logs
4. Determine what data was accessed
5. If PHI accessed → Assess breach
6. Implement additional security controls

---

### Scenario 5: Accidental Disclosure

**Example:** PHI sent to wrong email address.

**Response:**
1. Immediately contact recipient to delete
2. Verify deletion
3. Document the incident
4. Assess if breach occurred (if recipient not authorized)
5. If breach → Notify affected individuals

---

## 6. BREACH RISK ASSESSMENT

Use this to determine if a breach occurred:

### Low Risk (Likely NOT a breach):
- [ ] PHI was encrypted and encryption key not compromised
- [ ] Unauthorized person would not be able to understand PHI
- [ ] PHI was returned/destroyed before access
- [ ] Good faith access by employee within scope of duties

### High Risk (Likely IS a breach):
- [ ] PHI was unencrypted
- [ ] PHI was actually viewed/disclosed
- [ ] PHI was copied/downloaded
- [ ] PHI was used for identity theft
- [ ] Multiple individuals affected

**Decision:** If high risk → Proceed with breach notification procedures.

---

## 7. POST-INCIDENT ACTIONS

### Immediate (Within 24 hours)
- [ ] Incident documented
- [ ] Containment completed
- [ ] Initial assessment done

### Short-term (Within 7 days)
- [ ] Root cause identified
- [ ] Remediation completed
- [ ] Additional controls implemented
- [ ] Incident report finalized

### Long-term (Within 30 days)
- [ ] Lessons learned documented
- [ ] Security policies updated
- [ ] Staff training completed
- [ ] Risk assessment updated

---

## 8. PREVENTION MEASURES

### Current Controls (Already Implemented)
- ✅ RDS encryption at rest
- ✅ S3 encryption
- ✅ TLS/SSL in transit
- ✅ Private database (no public access)
- ✅ RBAC (role-based access control)
- ✅ Audit logging (all PHI access logged)
- ✅ Session timeout (15 minutes)
- ✅ MFA enabled
- ✅ CloudTrail logging

### Ongoing Monitoring
- Review audit logs weekly
- Review CloudTrail logs monthly
- Conduct access reviews quarterly
- Update risk assessment annually

---

## 9. TRAINING

All staff must be trained on:
- How to recognize security incidents
- How to report incidents
- What constitutes a breach
- Their role in incident response

**Training Schedule:**
- New employees: Within 30 days of hire
- All employees: Annually
- After incident: Immediately

---

## 10. DOCUMENTATION REQUIREMENTS

All incidents must be documented with:
- Date and time of discovery
- Who discovered it
- Description of incident
- Systems/data affected
- Actions taken
- Outcome/status
- Lessons learned

**Retention:** 6 years minimum

---

## 11. CONTACT INFORMATION

### Internal Contacts
- **Security Lead:** [Your Name] - [Phone] - [Email]
- **Technical Lead:** [Name] - [Phone] - [Email]

### External Contacts
- **Legal Counsel:** [Name/Law Firm] - [Phone] - [Email]
- **AWS Support:** 1-888-280-3321
- **HHS Breach Portal:** https://ocrportal.hhs.gov/ocr/breach/wizard

---

## 12. REVIEW SCHEDULE

This plan must be reviewed and updated:
- **Annually:** Full review
- **After incident:** Immediate review and update
- **When systems change:** Update as needed

**Last Review Date:** [Current Date]  
**Next Review Date:** [Date + 1 year]

---

## APPENDIX: INCIDENT LOG TEMPLATE

**Incident #:** [Number]  
**Date Discovered:** [Date/Time]  
**Discovered By:** [Name]  
**Incident Type:** [Unauthorized Access / Lost Device / Phishing / etc.]  
**Description:** [Detailed description]  
**Systems Affected:** [List systems]  
**PHI Affected:** [Yes/No]  
**Number of Individuals:** [If applicable]  
**Breach Status:** [Not a Breach / Potential Breach / Confirmed Breach]  
**Actions Taken:** [List actions]  
**Resolution:** [Outcome]  
**Lessons Learned:** [What was learned]

---

**END OF DOCUMENT**



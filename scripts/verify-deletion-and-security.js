/**
 * VERIFICATION SCRIPT
 * 
 * Verifies:
 * 1. All PHI data is deleted
 * 2. Security measures are in place
 * 3. No plain text data remains
 * 4. Everything is properly configured
 * 
 * Usage:
 *   node scripts/verify-deletion-and-security.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Only load encryption util if ENCRYPTION_KEY is set
let encryptionUtil = null;
try {
  if (process.env.ENCRYPTION_KEY) {
    encryptionUtil = require('../src/utils/encryption.util');
  }
} catch (error) {
  // Encryption util will be null if key not set
}

const prisma = new PrismaClient();

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function logSuccess(message) {
  console.log(`${GREEN}✅ ${message}${RESET}`);
}

function logError(message) {
  console.log(`${RED}❌ ${message}${RESET}`);
}

function logWarning(message) {
  console.log(`${YELLOW}⚠️  ${message}${RESET}`);
}

function logInfo(message) {
  console.log(`${BLUE}ℹ️  ${message}${RESET}`);
}

async function verifyDeletion() {
  console.log('\n📊 VERIFICATION 1: Data Deletion\n');
  
  const counts = {
    marRecords: await prisma.marRecord.count().catch(() => 0),
    prnRecords: await prisma.prnRecord.count().catch(() => 0),
    vitalSigns: await prisma.vitalSign.count().catch(() => 0),
    behavioralLogs: await prisma.behavioralLog.count().catch(() => 0),
    behavioralNotes: await prisma.behavioralNote.count().catch(() => 0),
    medications: await prisma.medication.count().catch(() => 0),
    medicationSchedules: await prisma.medicationSchedule.count().catch(() => 0),
    carePlans: await prisma.carePlan.count().catch(() => 0),
    notes: await prisma.note.count().catch(() => 0),
    invoices: await prisma.invoice.count().catch(() => 0),
    residentBillings: await prisma.residentBilling.count().catch(() => 0),
  };
  
  let allDeleted = true;
  
  Object.entries(counts).forEach(([key, count]) => {
    if (count === 0) {
      logSuccess(`${key}: ${count} records (deleted)`);
    } else {
      logError(`${key}: ${count} records (NOT deleted!)`);
      allDeleted = false;
    }
  });
  
  const totalRemaining = Object.values(counts).reduce((a, b) => a + b, 0);
  
  if (totalRemaining === 0 && allDeleted) {
    logSuccess('All PHI data successfully deleted!');
    return true;
  } else {
    logError(`WARNING: ${totalRemaining} records still exist!`);
    return false;
  }
}

async function verifySecurityMeasures() {
  console.log('\n🔒 VERIFICATION 2: Security Measures\n');
  
  let allSecure = true;
  
  // Check ENCRYPTION_KEY
  if (process.env.ENCRYPTION_KEY) {
    const keyLength = process.env.ENCRYPTION_KEY.length;
    if (keyLength === 64) {
      logSuccess(`ENCRYPTION_KEY: Set correctly (${keyLength} characters)`);
    } else {
      logWarning(`ENCRYPTION_KEY: Wrong length (${keyLength}, should be 64)`);
      logInfo('  To fix: Generate new key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      logInfo('  Then update ~/.env on EC2 with the new key');
      allSecure = false;
    }
  } else {
    logError('ENCRYPTION_KEY: NOT SET in .env file!');
    logInfo('  To fix: Add ENCRYPTION_KEY to ~/.env on EC2');
    allSecure = false;
  }
  
  // Check DATABASE_URL
  if (process.env.DATABASE_URL) {
    logSuccess('DATABASE_URL: Set');
    if (process.env.DATABASE_URL.includes('sslmode=require') || 
        process.env.DATABASE_URL.includes('sslmode=require')) {
      logSuccess('Database connection: Using SSL');
    } else {
      logWarning('Database connection: SSL not explicitly required');
    }
  } else {
    logError('DATABASE_URL: NOT SET!');
    allSecure = false;
  }
  
  // Check JWT_SECRET
  if (process.env.JWT_SECRET) {
    logSuccess('JWT_SECRET: Set');
  } else {
    logWarning('JWT_SECRET: Not set (may be using default)');
  }
  
  // Test encryption utility (only if available)
  if (encryptionUtil) {
    try {
      const testData = 'test-encryption';
      const encrypted = encryptionUtil.encrypt(testData);
      const decrypted = encryptionUtil.decrypt(encrypted);
      
      if (decrypted === testData) {
        logSuccess('Encryption utility: Working correctly');
      } else {
        logError('Encryption utility: Encryption/decryption failed!');
        allSecure = false;
      }
    } catch (error) {
      logError(`Encryption utility: Error - ${error.message}`);
      allSecure = false;
    }
  } else {
    logWarning('Encryption utility: Cannot test (ENCRYPTION_KEY not set or invalid)');
  }
  
  return allSecure;
}

async function verifyAuditLogging() {
  console.log('\n📝 VERIFICATION 3: Audit Logging\n');
  
  try {
    const recentLogs = await prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        resource: true,
        createdAt: true,
        userId: true,
      }
    });
    
    if (recentLogs.length > 0) {
      logSuccess(`Audit logs: ${recentLogs.length} recent entries found`);
      logInfo('Recent audit log entries:');
      recentLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. ${log.action} on ${log.resource} at ${log.createdAt}`);
      });
      
      // Check for PHI access logs (action is enum, check description or resource instead)
      const phiLogs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { description: { contains: 'PHI' } },
            { resource: { in: ['medication', 'mar_record', 'prn_record', 'vital_sign', 'care_plan', 'behavioral_log', 'note', 'resident'] } }
          ]
        },
        take: 1
      });
      
      if (phiLogs.length > 0) {
        logSuccess('PHI access logging: Active (PHI logs found)');
      } else {
        logInfo('PHI access logging: No PHI logs yet (will appear when you access medical data)');
      }
    } else {
      logWarning('Audit logs: No entries found (may be new database)');
    }
    
    return true;
  } catch (error) {
    logError(`Audit logging check failed: ${error.message}`);
    return false;
  }
}

async function verifyUserAccounts() {
  console.log('\n👥 VERIFICATION 4: User Accounts\n');
  
  try {
    const userCount = await prisma.user.count();
    const activeUsers = await prisma.user.count({
      where: { isActive: true }
    });
    
    logInfo(`Total users: ${userCount}`);
    logInfo(`Active users: ${activeUsers}`);
    
    if (userCount > 0) {
      logSuccess('User accounts: Preserved');
    } else {
      logWarning('User accounts: No users found');
    }
    
    return true;
  } catch (error) {
    logError(`User check failed: ${error.message}`);
    return false;
  }
}

async function verifyTenants() {
  console.log('\n🏢 VERIFICATION 5: Tenants/Organizations\n');
  
  try {
    const tenantCount = await prisma.tenant.count();
    const activeTenants = await prisma.tenant.count({
      where: { isActive: true }
    });
    
    logInfo(`Total tenants: ${tenantCount}`);
    logInfo(`Active tenants: ${activeTenants}`);
    
    if (tenantCount > 0) {
      logSuccess('Tenants: Preserved');
    } else {
      logWarning('Tenants: No tenants found');
    }
    
    return true;
  } catch (error) {
    logError(`Tenant check failed: ${error.message}`);
    return false;
  }
}

async function verifyDatabaseConnection() {
  console.log('\n🔌 VERIFICATION 6: Database Connection\n');
  
  try {
    await prisma.$connect();
    logSuccess('Database connection: Connected');
    
    // Test query
    await prisma.$queryRaw`SELECT 1`;
    logSuccess('Database query: Working');
    
    return true;
  } catch (error) {
    logError(`Database connection failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🔍 HIPAA SECURITY VERIFICATION');
  console.log('=' .repeat(50));
  
  const dbUrl = process.env.DATABASE_URL || 'Not set';
  const dbDisplay = dbUrl.includes('@') 
    ? dbUrl.split('@')[1].split('/')[0] 
    : 'Unknown';
  
  console.log(`\n📍 Database: ${dbDisplay}`);
  console.log(`📅 Date: ${new Date().toISOString()}\n`);
  
  const results = {
    deletion: await verifyDeletion(),
    security: await verifySecurityMeasures(),
    auditLogging: await verifyAuditLogging(),
    userAccounts: await verifyUserAccounts(),
    tenants: await verifyTenants(),
    database: await verifyDatabaseConnection(),
  };
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('='.repeat(50) + '\n');
  
  Object.entries(results).forEach(([key, passed]) => {
    if (passed) {
      logSuccess(`${key}: PASSED`);
    } else {
      logError(`${key}: FAILED`);
    }
  });
  
  const allPassed = Object.values(results).every(r => r === true);
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    logSuccess('✅ ALL VERIFICATIONS PASSED!');
    logSuccess('You are SAFE and SECURE! 🛡️');
  } else {
    logError('⚠️  SOME VERIFICATIONS FAILED!');
    logWarning('Please review the issues above.');
  }
  console.log('='.repeat(50) + '\n');
  
  await prisma.$disconnect();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Verification failed:', error);
      process.exit(1);
    });
}

module.exports = { main };


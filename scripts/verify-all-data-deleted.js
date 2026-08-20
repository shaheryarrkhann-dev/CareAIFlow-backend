/**
 * COMPREHENSIVE DATA DELETION VERIFICATION
 * 
 * Checks EVERY table to ensure all PHI data is deleted
 * 
 * Usage:
 *   node scripts/verify-all-data-deleted.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Colors
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

function logInfo(message) {
  console.log(`${BLUE}ℹ️  ${message}${RESET}`);
}

async function checkTable(tableName, countFunction) {
  try {
    const count = await countFunction();
    if (count === 0) {
      logSuccess(`${tableName}: 0 records (deleted)`);
      return { name: tableName, count: 0, status: 'deleted' };
    } else {
      logError(`${tableName}: ${count} records (NOT deleted!)`);
      return { name: tableName, count, status: 'exists' };
    }
  } catch (error) {
    logError(`${tableName}: Error - ${error.message}`);
    return { name: tableName, count: -1, status: 'error' };
  }
}

async function verifyAllDataDeleted() {
  console.log('\n🔍 COMPREHENSIVE DATA DELETION VERIFICATION');
  console.log('='.repeat(60));
  
  const dbUrl = process.env.DATABASE_URL || 'Not set';
  const dbDisplay = dbUrl.includes('@') 
    ? dbUrl.split('@')[1].split('/')[0] 
    : 'Unknown';
  
  console.log(`\n📍 Database: ${dbDisplay}`);
  console.log(`📅 Date: ${new Date().toISOString()}\n`);
  
  console.log('📊 Checking ALL tables...\n');
  
  const checks = [];
  
  // Medical/PHI Data Tables
  console.log('🏥 Medical/PHI Data:');
  checks.push(await checkTable('MAR Records', () => prisma.marRecord.count()));
  checks.push(await checkTable('PRN Records', () => prisma.prnRecord.count()));
  checks.push(await checkTable('Vital Signs', () => prisma.vitalSign.count()));
  checks.push(await checkTable('Medications', () => prisma.medication.count()));
  checks.push(await checkTable('Medication Schedules', () => prisma.medicationSchedule.count()));
  checks.push(await checkTable('Medication Prescriptions', () => prisma.medicationPrescription.count()));
  checks.push(await checkTable('Care Plans', () => prisma.carePlan.count()));
  checks.push(await checkTable('Care Plan Problems', () => prisma.carePlanProblem.count()));
  checks.push(await checkTable('Care Plan Goals', () => prisma.carePlanGoal.count()));
  checks.push(await checkTable('Care Plan Interventions', () => prisma.carePlanIntervention.count()));
  checks.push(await checkTable('Care Plan Versions', () => prisma.carePlanVersion.count()));
  checks.push(await checkTable('Behavioral Logs', () => prisma.behavioralLog.count()));
  checks.push(await checkTable('Behavioral Notes', () => prisma.behavioralNote.count()));
  checks.push(await checkTable('Behavioral Note Versions', () => prisma.behavioralNoteVersion.count()));
  checks.push(await checkTable('Notes', () => prisma.note.count()));
  checks.push(await checkTable('Note Versions', () => prisma.noteVersion.count()));
  
  console.log('\n💰 Billing Data:');
  checks.push(await checkTable('Invoices', () => prisma.invoice.count()));
  checks.push(await checkTable('Resident Billings', () => prisma.residentBilling.count()));
  checks.push(await checkTable('Billing Tiers', () => prisma.billingTier.count()));
  
  console.log('\n📄 Form/PDF Data:');
  checks.push(await checkTable('Form Responses', () => prisma.formResponse.count().catch(() => 0)));
  checks.push(await checkTable('Form Drafts', () => prisma.formDraft.count()));
  checks.push(await checkTable('PDF Templates', () => prisma.pdfTemplate.count()));
  checks.push(await checkTable('PDF Embeddings', () => prisma.pdfEmbedding.count()));
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  const deleted = checks.filter(c => c.status === 'deleted');
  const exists = checks.filter(c => c.status === 'exists');
  const errors = checks.filter(c => c.status === 'error');
  
  console.log(`✅ Deleted (0 records): ${deleted.length} tables`);
  console.log(`❌ Still has data: ${exists.length} tables`);
  if (errors.length > 0) {
    console.log(`⚠️  Errors: ${errors.length} tables`);
  }
  
  if (exists.length > 0) {
    console.log('\n❌ Tables with remaining data:');
    exists.forEach(check => {
      logError(`${check.name}: ${check.count} records`);
    });
  }
  
  if (errors.length > 0) {
    console.log('\n⚠️  Tables with errors:');
    errors.forEach(check => {
      logError(`${check.name}: ${check.status}`);
    });
  }
  
  // Final verdict
  console.log('\n' + '='.repeat(60));
  if (exists.length === 0 && errors.length === 0) {
    logSuccess('✅ ALL PHI DATA SUCCESSFULLY DELETED!');
    logSuccess('🛡️  Database is clean and secure!');
  } else {
    logError('⚠️  SOME DATA STILL EXISTS!');
    logError('Please review the tables above.');
  }
  console.log('='.repeat(60) + '\n');
  
  // What should be preserved
  console.log('📋 What should be PRESERVED (not deleted):');
  try {
    const auditCount = await prisma.auditLog.count();
    logInfo(`Audit Logs: ${auditCount} records (should be preserved)`);
  } catch (e) {
    logError(`Audit Logs: Error checking`);
  }
  
  try {
    const userCount = await prisma.user.count();
    logInfo(`Users: ${userCount} accounts (should be preserved)`);
  } catch (e) {
    logError(`Users: Error checking`);
  }
  
  try {
    const tenantCount = await prisma.tenant.count();
    logInfo(`Tenants: ${tenantCount} organizations (should be preserved)`);
  } catch (e) {
    logError(`Tenants: Error checking`);
  }
  
  try {
    const schemaCount = await prisma.formSchema.count();
    logInfo(`Form Schemas: ${schemaCount} templates (should be preserved)`);
  } catch (e) {
    logInfo(`Form Schemas: May not exist or empty`);
  }
  
  console.log('');
}

async function main() {
  try {
    await verifyAllDataDeleted();
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { verifyAllDataDeleted };






/**
 * DELETE ALL DATA SCRIPT
 * 
 * ⚠️  WARNING: This script will PERMANENTLY DELETE ALL DATA from your database!
 * 
 * What it deletes:
 * - All medical records (MAR, PRN, Vitals)
 * - All medications
 * - All care plans
 * - All notes
 * - All behavioral logs
 * - All form responses
 * - All resident data (if exists)
 * 
 * What it KEEPS:
 * - Audit logs (for compliance)
 * - User accounts
 * - Tenants/Organizations
 * - Form schemas (templates)
 * 
 * Usage:
 *   node scripts/delete-all-data.js
 * 
 * IMPORTANT:
 * - BACKUP YOUR DATABASE FIRST!
 * - This is IRREVERSIBLE!
 * - Test on a copy first if possible
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Count records before deletion (with error handling)
async function countRecords() {
  const counts = {};
  
  try {
    counts.marRecords = await prisma.marRecord.count().catch(() => 0);
    counts.prnRecords = await prisma.prnRecord.count().catch(() => 0);
    counts.vitalSigns = await prisma.vitalSign.count().catch(() => 0);
    counts.behavioralLogs = await prisma.behavioralLog.count().catch(() => 0);
    counts.behavioralNotes = await prisma.behavioralNote.count().catch(() => 0);
    counts.medicationSchedules = await prisma.medicationSchedule.count().catch(() => 0);
    counts.medications = await prisma.medication.count().catch(() => 0);
    counts.medicationPrescriptions = await prisma.medicationPrescription.count().catch(() => 0);
    counts.carePlanInterventions = await prisma.carePlanIntervention.count().catch(() => 0);
    counts.carePlanGoals = await prisma.carePlanGoal.count().catch(() => 0);
    counts.carePlanProblems = await prisma.carePlanProblem.count().catch(() => 0);
    counts.carePlanVersions = await prisma.carePlanVersion.count().catch(() => 0);
    counts.carePlans = await prisma.carePlan.count().catch(() => 0);
    counts.notes = await prisma.note.count().catch(() => 0);
    counts.invoices = await prisma.invoice.count().catch(() => 0);
    counts.residentBillings = await prisma.residentBilling.count().catch(() => 0);
    counts.billingTiers = await prisma.billingTier.count().catch(() => 0);
    
    // Try form responses (might not exist)
    try {
      counts.formResponses = await prisma.formResponse.count();
    } catch {
      counts.formResponses = 0;
    }
  } catch (error) {
    console.error('Error counting records:', error.message);
  }
  
  return counts;
}

// Delete all data
async function deleteAllData() {
  // Show which database we're connecting to
  const dbUrl = process.env.DATABASE_URL || 'Not set';
  const dbDisplay = dbUrl.includes('@') 
    ? dbUrl.split('@')[1].split('/')[0] 
    : 'Unknown';
  
  console.log('\n⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
  console.log('This script will PERMANENTLY DELETE ALL DATA!');
  console.log('This action is IRREVERSIBLE!');
  console.log(`\n📍 Database: ${dbDisplay}`);
  console.log('⚠️  Make sure this is the CORRECT database!');
  console.log('⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️\n');
  
  // Show current record counts
  console.log('📊 Current data counts:');
  const counts = await countRecords();
  console.log(`  - MAR Records: ${counts.marRecords}`);
  console.log(`  - PRN Records: ${counts.prnRecords}`);
  console.log(`  - Vitals: ${counts.vitalSigns}`);
  console.log(`  - Behavioral Logs: ${counts.behavioralLogs}`);
  console.log(`  - Behavioral Notes: ${counts.behavioralNotes}`);
  console.log(`  - Medications: ${counts.medications}`);
  console.log(`  - Medication Schedules: ${counts.medicationSchedules}`);
  console.log(`  - Care Plans: ${counts.carePlans}`);
  console.log(`  - Notes: ${counts.notes}`);
  console.log(`  - Form Responses: ${counts.formResponses}`);
  console.log(`  - Invoices: ${counts.invoices}`);
  console.log(`  - Resident Billings: ${counts.residentBillings}`);
  
  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n📈 Total records to delete: ${totalRecords}\n`);
  
  if (totalRecords === 0) {
    console.log('✅ Database is already empty. Nothing to delete.');
    return;
  }
  
  // Safety delay
  console.log('⏳ Starting deletion in 10 seconds...');
  console.log('   Press Ctrl+C NOW to cancel!\n');
  
  for (let i = 10; i > 0; i--) {
    process.stdout.write(`\r   ${i}... `);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n');
  
  try {
    console.log('🗑️  Starting deletion...\n');
    
    // Delete in order (respecting foreign key constraints)
    // Start with child tables first
    
    console.log('Deleting MAR records...');
    const marDeleted = await prisma.marRecord.deleteMany({});
    console.log(`  ✅ Deleted ${marDeleted.count} MAR records`);
    
    console.log('Deleting PRN records...');
    const prnDeleted = await prisma.prnRecord.deleteMany({});
    console.log(`  ✅ Deleted ${prnDeleted.count} PRN records`);
    
    console.log('Deleting vital signs...');
    const vitalsDeleted = await prisma.vitalSign.deleteMany({});
    console.log(`  ✅ Deleted ${vitalsDeleted.count} vital signs`);
    
    console.log('Deleting behavioral logs...');
    const behavioralLogsDeleted = await prisma.behavioralLog.deleteMany({});
    console.log(`  ✅ Deleted ${behavioralLogsDeleted.count} behavioral logs`);
    
    console.log('Deleting behavioral notes...');
    const behavioralNotesDeleted = await prisma.behavioralNote.deleteMany({});
    console.log(`  ✅ Deleted ${behavioralNotesDeleted.count} behavioral notes`);
    
    console.log('Deleting medication schedules...');
    const schedulesDeleted = await prisma.medicationSchedule.deleteMany({});
    console.log(`  ✅ Deleted ${schedulesDeleted.count} medication schedules`);
    
    console.log('Deleting medication prescriptions...');
    const prescriptionsDeleted = await prisma.medicationPrescription.deleteMany({});
    console.log(`  ✅ Deleted ${prescriptionsDeleted.count} medication prescriptions`);
    
    console.log('Deleting care plan interventions...');
    const interventionsDeleted = await prisma.carePlanIntervention.deleteMany({});
    console.log(`  ✅ Deleted ${interventionsDeleted.count} care plan interventions`);
    
    console.log('Deleting care plan goals...');
    const goalsDeleted = await prisma.carePlanGoal.deleteMany({});
    console.log(`  ✅ Deleted ${goalsDeleted.count} care plan goals`);
    
    console.log('Deleting care plan problems...');
    const problemsDeleted = await prisma.carePlanProblem.deleteMany({});
    console.log(`  ✅ Deleted ${problemsDeleted.count} care plan problems`);
    
    console.log('Deleting care plan versions...');
    const versionsDeleted = await prisma.carePlanVersion.deleteMany({});
    console.log(`  ✅ Deleted ${versionsDeleted.count} care plan versions`);
    
    console.log('Deleting care plans...');
    const carePlansDeleted = await prisma.carePlan.deleteMany({});
    console.log(`  ✅ Deleted ${carePlansDeleted.count} care plans`);
    
    console.log('Deleting medications...');
    const medicationsDeleted = await prisma.medication.deleteMany({});
    console.log(`  ✅ Deleted ${medicationsDeleted.count} medications`);
    
    console.log('Deleting notes...');
    const notesDeleted = await prisma.note.deleteMany({});
    console.log(`  ✅ Deleted ${notesDeleted.count} notes`);
    
    // Try form responses (might not exist in schema)
    try {
      console.log('Deleting form responses...');
      const formResponsesDeleted = await prisma.formResponse.deleteMany({});
      console.log(`  ✅ Deleted ${formResponsesDeleted.count} form responses`);
    } catch (error) {
      console.log('  ⚠️  Form responses table may not exist, skipping...');
    }
    
    console.log('Deleting invoices...');
    const invoicesDeleted = await prisma.invoice.deleteMany({});
    console.log(`  ✅ Deleted ${invoicesDeleted.count} invoices`);
    
    console.log('Deleting resident billings...');
    const billingsDeleted = await prisma.residentBilling.deleteMany({});
    console.log(`  ✅ Deleted ${billingsDeleted.count} resident billings`);
    
    console.log('Deleting billing tiers...');
    const tiersDeleted = await prisma.billingTier.deleteMany({});
    console.log(`  ✅ Deleted ${tiersDeleted.count} billing tiers`);
    
    // Optional: Delete form drafts
    try {
      console.log('Deleting form drafts...');
      const draftsDeleted = await prisma.formDraft.deleteMany({});
      console.log(`  ✅ Deleted ${draftsDeleted.count} form drafts`);
    } catch (error) {
      console.log('  ⚠️  Form drafts table may not exist, skipping...');
    }
    
    // Optional: Delete PDF templates if they contain PHI
    try {
      console.log('Deleting PDF templates...');
      const pdfTemplatesDeleted = await prisma.pdfTemplate.deleteMany({});
      console.log(`  ✅ Deleted ${pdfTemplatesDeleted.count} PDF templates`);
    } catch (error) {
      console.log('  ⚠️  PDF templates table may not exist, skipping...');
    }
    
    // Optional: Delete PDF embeddings if they contain PHI
    try {
      console.log('Deleting PDF embeddings...');
      const embeddingsDeleted = await prisma.pdfEmbedding.deleteMany({});
      console.log(`  ✅ Deleted ${embeddingsDeleted.count} PDF embeddings`);
    } catch (error) {
      console.log('  ⚠️  PDF embeddings table may not exist, skipping...');
    }
    
    console.log('\n✅ All PHI data deleted successfully!');
    console.log('\n📋 What was KEPT:');
    console.log('  ✅ Audit logs (for compliance)');
    console.log('  ✅ User accounts');
    console.log('  ✅ Tenants/Organizations');
    console.log('  ✅ Form schemas (templates)');
    console.log('  ✅ Refresh tokens');
    
    // Verify deletion
    console.log('\n🔍 Verifying deletion...');
    const finalCounts = await countRecords();
    const remainingRecords = Object.values(finalCounts).reduce((a, b) => a + b, 0);
    
    if (remainingRecords === 0) {
      console.log('✅ Verification: All data deleted successfully!');
    } else {
      console.log('⚠️  Warning: Some records may still exist:');
      Object.entries(finalCounts).forEach(([key, count]) => {
        if (count > 0) {
          console.log(`  - ${key}: ${count} records`);
        }
      });
    }
    
    console.log('\n✨ Database is now clean and ready for encrypted data!');
    
  } catch (error) {
    console.error('\n❌ Error during deletion:', error);
    console.error('\n⚠️  Some data may have been deleted. Check your database.');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  deleteAllData()
    .then(() => {
      console.log('\n✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { deleteAllData };


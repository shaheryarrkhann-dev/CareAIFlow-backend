/**
 * DELETE RESIDENT/FORM SUBMISSION DATA
 * 
 * ⚠️  WARNING: This will delete ALL resident data (form submissions)!
 * 
 * Form submissions contain PHI:
 * - Patient names
 * - Addresses
 * - Signatures
 * - Medical information
 * - Personal details
 * 
 * This script will:
 * - Find all dynamic form submission tables
 * - Delete all form submission data
 * - Clean up resident-related references
 * 
 * Usage:
 *   node scripts/delete-resident-form-data.js
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

function logWarning(message) {
  console.log(`${YELLOW}⚠️  ${message}${RESET}`);
}

function logInfo(message) {
  console.log(`${BLUE}ℹ️  ${message}${RESET}`);
}

async function findFormSubmissionTables() {
  // Form submission tables follow pattern: tenant_{tenantId}_form_{formId}
  // We need to query the database directly to find these tables
  
  const tables = [];
  
  try {
    // Get all tables that match the pattern
    const result = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'tenant_%_form_%'
      ORDER BY table_name;
    `;
    
    if (Array.isArray(result)) {
      result.forEach(row => {
        tables.push(row.table_name);
      });
    }
  } catch (error) {
    logError(`Error finding form tables: ${error.message}`);
  }
  
  return tables;
}

async function countFormSubmissions(tableName) {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    return result[0]?.count || 0;
  } catch (error) {
    return 0;
  }
}

async function deleteFormSubmissions(tableName) {
  try {
    const result = await prisma.$queryRawUnsafe(
      `DELETE FROM "${tableName}"`
    );
    return { success: true, count: result.count || 0 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteResidentData() {
  console.log('\n🔍 CHECKING FOR RESIDENT/FORM SUBMISSION DATA');
  console.log('='.repeat(60));
  
  const dbUrl = process.env.DATABASE_URL || 'Not set';
  const dbDisplay = dbUrl.includes('@') 
    ? dbUrl.split('@')[1].split('/')[0] 
    : 'Unknown';
  
  console.log(`\n📍 Database: ${dbDisplay}`);
  console.log(`📅 Date: ${new Date().toISOString()}\n`);
  
  // Find all form submission tables
  console.log('📊 Searching for form submission tables...\n');
  const formTables = await findFormSubmissionTables();
  
  if (formTables.length === 0) {
    logSuccess('No form submission tables found. Resident data already deleted!');
    return;
  }
  
  console.log(`Found ${formTables.length} form submission table(s):\n`);
  
  // Count records in each table
  const tableStats = [];
  let totalRecords = 0;
  
  for (const table of formTables) {
    const count = await countFormSubmissions(table);
    tableStats.push({ table, count });
    totalRecords += parseInt(count) || 0;
    console.log(`  ${table}: ${count} records`);
  }
  
  console.log(`\n📊 Total form submissions: ${totalRecords}`);
  
  if (totalRecords === 0) {
    logSuccess('All form submission tables are empty. No resident data to delete!');
    return;
  }
  
  // Safety warning
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
  console.log('This will PERMANENTLY DELETE all resident data!');
  console.log('This includes:');
  console.log('  - Patient names');
  console.log('  - Addresses');
  console.log('  - Signatures');
  console.log('  - Medical information');
  console.log('  - All personal details');
  console.log('This action is IRREVERSIBLE!');
  console.log('='.repeat(60) + '\n');
  
  // Safety delay
  console.log('⏳ Starting deletion in 10 seconds...');
  console.log('   Press Ctrl+C NOW to cancel!\n');
  
  for (let i = 10; i > 0; i--) {
    process.stdout.write(`\r   ${i}... `);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n');
  
  // Delete from each table
  console.log('🗑️  Deleting resident data...\n');
  
  let totalDeleted = 0;
  let errors = 0;
  
  for (const { table, count } of tableStats) {
    if (count > 0) {
      console.log(`Deleting from ${table}...`);
      const result = await deleteFormSubmissions(table);
      
      if (result.success) {
        logSuccess(`  ✅ Deleted ${count} records from ${table}`);
        totalDeleted += parseInt(count) || 0;
      } else {
        logError(`  ❌ Failed to delete from ${table}: ${result.error}`);
        errors++;
      }
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ DELETION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total records deleted: ${totalDeleted}`);
  console.log(`Tables processed: ${formTables.length}`);
  if (errors > 0) {
    logWarning(`Errors: ${errors}`);
  }
  console.log('='.repeat(60) + '\n');
  
  logSuccess('All resident/form submission data deleted!');
  
  // Verify
  console.log('\n🔍 Verifying deletion...\n');
  let remainingRecords = 0;
  for (const table of formTables) {
    const count = await countFormSubmissions(table);
    if (count > 0) {
      logError(`${table}: Still has ${count} records`);
      remainingRecords += parseInt(count) || 0;
    } else {
      logSuccess(`${table}: Empty`);
    }
  }
  
  if (remainingRecords === 0) {
    logSuccess('\n✅ All resident data successfully deleted!');
  } else {
    logError(`\n⚠️  ${remainingRecords} records still remain. Please check manually.`);
  }
}

async function main() {
  try {
    await deleteResidentData();
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Script completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { deleteResidentData };






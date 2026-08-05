/**
 * DELETE ALL REMAINING PHI DATA
 * 
 * This script checks for and deletes any remaining PHI data:
 * 
 * 1. Form Drafts - May contain partial patient information
 * 2. PDF Embeddings - May contain extracted text from PHI documents
 * 3. Form Submissions - Resident data (dynamic tables)
 * 
 * ⚠️  WARNING: This will delete ALL potentially PHI-containing data!
 * 
 * Usage:
 *   node scripts/delete-all-remaining-phi.js
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
  const tables = [];
  try {
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
    await prisma.$queryRawUnsafe(`DELETE FROM "${tableName}"`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteAllRemainingPHI() {
  console.log('\n🔍 COMPREHENSIVE PHI DATA CHECK & DELETION');
  console.log('='.repeat(60));
  
  const dbUrl = process.env.DATABASE_URL || 'Not set';
  const dbDisplay = dbUrl.includes('@') 
    ? dbUrl.split('@')[1].split('/')[0] 
    : 'Unknown';
  
  console.log(`\n📍 Database: ${dbDisplay}`);
  console.log(`📅 Date: ${new Date().toISOString()}\n`);
  
  const summary = {
    formDrafts: 0,
    pdfEmbeddings: 0,
    formSubmissions: 0,
    formTables: []
  };
  
  // 1. Check Form Drafts
  console.log('📋 1. Checking Form Drafts...');
  try {
    summary.formDrafts = await prisma.formDraft.count();
    console.log(`   Found: ${summary.formDrafts} form drafts`);
    if (summary.formDrafts > 0) {
      logWarning('   ⚠️  Form drafts may contain partial patient information');
    } else {
      logSuccess('   ✅ No form drafts found');
    }
  } catch (error) {
    logError(`   ❌ Error checking form drafts: ${error.message}`);
  }
  
  // 2. Check PDF Embeddings
  console.log('\n📄 2. Checking PDF Embeddings...');
  try {
    summary.pdfEmbeddings = await prisma.pdfEmbedding.count();
    console.log(`   Found: ${summary.pdfEmbeddings} PDF embeddings`);
    if (summary.pdfEmbeddings > 0) {
      logWarning('   ⚠️  PDF embeddings may contain extracted text from PHI documents');
    } else {
      logSuccess('   ✅ No PDF embeddings found');
    }
  } catch (error) {
    logError(`   ❌ Error checking PDF embeddings: ${error.message}`);
  }
  
  // 3. Check Form Submissions (Dynamic Tables)
  console.log('\n👥 3. Checking Form Submissions (Resident Data)...');
  const formTables = await findFormSubmissionTables();
  console.log(`   Found: ${formTables.length} form submission table(s)`);
  
  if (formTables.length > 0) {
    for (const table of formTables) {
      const count = await countFormSubmissions(table);
      summary.formSubmissions += parseInt(count) || 0;
      if (count > 0) {
        console.log(`   ${table}: ${count} records`);
        summary.formTables.push({ table, count });
      }
    }
    
    if (summary.formSubmissions > 0) {
      logWarning(`   ⚠️  Found ${summary.formSubmissions} form submissions (resident data)`);
    } else {
      logSuccess('   ✅ All form submission tables are empty');
    }
  } else {
    logSuccess('   ✅ No form submission tables found');
  }
  
  // Summary
  const totalPHI = summary.formDrafts + summary.pdfEmbeddings + summary.formSubmissions;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Form Drafts: ${summary.formDrafts}`);
  console.log(`PDF Embeddings: ${summary.pdfEmbeddings}`);
  console.log(`Form Submissions: ${summary.formSubmissions}`);
  console.log(`Total PHI Records: ${totalPHI}`);
  console.log('='.repeat(60) + '\n');
  
  if (totalPHI === 0) {
    logSuccess('✅ No PHI data found! Database is clean.');
    return;
  }
  
  // Safety warning
  console.log('⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
  console.log('This will PERMANENTLY DELETE all remaining PHI data!');
  console.log('This includes:');
  if (summary.formDrafts > 0) {
    console.log(`  - ${summary.formDrafts} form drafts (partial patient data)`);
  }
  if (summary.pdfEmbeddings > 0) {
    console.log(`  - ${summary.pdfEmbeddings} PDF embeddings (extracted text from documents)`);
  }
  if (summary.formSubmissions > 0) {
    console.log(`  - ${summary.formSubmissions} form submissions (resident/patient data)`);
  }
  console.log('This action is IRREVERSIBLE!');
  console.log('⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️\n');
  
  // Safety delay
  console.log('⏳ Starting deletion in 10 seconds...');
  console.log('   Press Ctrl+C NOW to cancel!\n');
  
  for (let i = 10; i > 0; i--) {
    process.stdout.write(`\r   ${i}... `);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n');
  
  // Delete
  console.log('🗑️  Deleting all remaining PHI data...\n');
  
  let deleted = 0;
  let errors = 0;
  
  // Delete Form Drafts
  if (summary.formDrafts > 0) {
    try {
      console.log('Deleting form drafts...');
      const result = await prisma.formDraft.deleteMany({});
      logSuccess(`  ✅ Deleted ${result.count} form drafts`);
      deleted += result.count;
    } catch (error) {
      logError(`  ❌ Failed to delete form drafts: ${error.message}`);
      errors++;
    }
  }
  
  // Delete PDF Embeddings
  if (summary.pdfEmbeddings > 0) {
    try {
      console.log('Deleting PDF embeddings...');
      const result = await prisma.pdfEmbedding.deleteMany({});
      logSuccess(`  ✅ Deleted ${result.count} PDF embeddings`);
      deleted += result.count;
    } catch (error) {
      logError(`  ❌ Failed to delete PDF embeddings: ${error.message}`);
      errors++;
    }
  }
  
  // Delete Form Submissions
  if (summary.formSubmissions > 0) {
    console.log('Deleting form submissions...');
    for (const { table, count } of summary.formTables) {
      if (count > 0) {
        const result = await deleteFormSubmissions(table);
        if (result.success) {
          logSuccess(`  ✅ Deleted ${count} records from ${table}`);
          deleted += parseInt(count) || 0;
        } else {
          logError(`  ❌ Failed to delete from ${table}: ${result.error}`);
          errors++;
        }
      }
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ DELETION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total records deleted: ${deleted}`);
  if (errors > 0) {
    logWarning(`Errors: ${errors}`);
  }
  console.log('='.repeat(60) + '\n');
  
  // Verify
  console.log('🔍 Verifying deletion...\n');
  
  let remaining = 0;
  
  const formDraftsRemaining = await prisma.formDraft.count().catch(() => 0);
  if (formDraftsRemaining > 0) {
    logError(`Form Drafts: Still has ${formDraftsRemaining} records`);
    remaining += formDraftsRemaining;
  } else {
    logSuccess('Form Drafts: Empty');
  }
  
  const pdfEmbeddingsRemaining = await prisma.pdfEmbedding.count().catch(() => 0);
  if (pdfEmbeddingsRemaining > 0) {
    logError(`PDF Embeddings: Still has ${pdfEmbeddingsRemaining} records`);
    remaining += pdfEmbeddingsRemaining;
  } else {
    logSuccess('PDF Embeddings: Empty');
  }
  
  for (const table of formTables) {
    const count = await countFormSubmissions(table);
    if (count > 0) {
      logError(`${table}: Still has ${count} records`);
      remaining += parseInt(count) || 0;
    } else {
      logSuccess(`${table}: Empty`);
    }
  }
  
  if (remaining === 0) {
    logSuccess('\n✅ All PHI data successfully deleted!');
    logSuccess('🛡️  Database is clean and secure!');
  } else {
    logError(`\n⚠️  ${remaining} records still remain. Please check manually.`);
  }
}

async function main() {
  try {
    await deleteAllRemainingPHI();
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

module.exports = { deleteAllRemainingPHI };






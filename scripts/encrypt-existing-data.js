/**
 * HIPAA Data Encryption Migration Script
 * 
 * This script encrypts existing sensitive data in your database.
 * Run this ONCE after setting up encryption.
 * 
 * Usage:
 *   node scripts/encrypt-existing-data.js
 * 
 * IMPORTANT:
 * - Backup your database BEFORE running this script
 * - Test on a development database first
 * - This script modifies data in place
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const encryptionUtil = require('../src/utils/encryption.util');

const prisma = new PrismaClient();

// Fields that contain PHI and should be encrypted
const PHI_FIELDS = {
  // Form submissions may contain PHI
  // Note: We'll need to check your actual schema for sensitive fields
  // This is a template - adjust based on your actual data model
};

/**
 * Encrypt sensitive fields in form submissions
 */
async function encryptFormData() {
  console.log('🔐 Starting form data encryption...');
  
  try {
    // Get all form submissions
    const forms = await prisma.form.findMany({
      where: {
        // Only process forms that might contain PHI
        // Adjust based on your schema
      },
      select: {
        id: true,
        // Add fields that contain PHI
      }
    });

    console.log(`Found ${forms.length} forms to process`);

    let encrypted = 0;
    let skipped = 0;
    let errors = 0;

    for (const form of forms) {
      try {
        const updates = {};
        let needsUpdate = false;

        // Example: Encrypt specific fields
        // Adjust based on your actual schema
        // if (form.someSensitiveField && !encryptionUtil.isEncrypted(form.someSensitiveField)) {
        //   updates.someSensitiveField = encryptionUtil.encrypt(form.someSensitiveField);
        //   needsUpdate = true;
        // }

        if (needsUpdate) {
          await prisma.form.update({
            where: { id: form.id },
            data: updates
          });
          encrypted++;
          if (encrypted % 100 === 0) {
            console.log(`  Encrypted ${encrypted} forms...`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error encrypting form ${form.id}:`, error.message);
        errors++;
      }
    }

    console.log(`✅ Form encryption complete:`);
    console.log(`   - Encrypted: ${encrypted}`);
    console.log(`   - Skipped (already encrypted): ${skipped}`);
    console.log(`   - Errors: ${errors}`);
  } catch (error) {
    console.error('❌ Error in form encryption:', error);
    throw error;
  }
}

/**
 * Encrypt notes that may contain PHI
 */
async function encryptNotes() {
  console.log('🔐 Starting notes encryption...');
  
  try {
    const notes = await prisma.note.findMany({
      select: {
        id: true,
        content: true,
        // Add other sensitive fields
      }
    });

    console.log(`Found ${notes.length} notes to process`);

    let encrypted = 0;
    let skipped = 0;
    let errors = 0;

    for (const note of notes) {
      try {
        const updates = {};
        let needsUpdate = false;

        // Encrypt note content if it contains PHI
        // Note: You may want to encrypt only certain types of notes
        // For now, we'll skip this unless you have specific fields to encrypt
        // if (note.content && !encryptionUtil.isEncrypted(note.content)) {
        //   updates.content = encryptionUtil.encrypt(note.content);
        //   needsUpdate = true;
        // }

        if (needsUpdate) {
          await prisma.note.update({
            where: { id: note.id },
            data: updates
          });
          encrypted++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error encrypting note ${note.id}:`, error.message);
        errors++;
      }
    }

    console.log(`✅ Notes encryption complete:`);
    console.log(`   - Encrypted: ${encrypted}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Errors: ${errors}`);
  } catch (error) {
    console.error('❌ Error in notes encryption:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting HIPAA Data Encryption Migration');
  console.log('⚠️  WARNING: This will modify your database!');
  console.log('⚠️  Make sure you have a backup!\n');

  // Check if encryption key is set
  if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ERROR: ENCRYPTION_KEY not set in .env file');
    console.error('   Generate a key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Run encryption for each data type
    // Uncomment the ones you need:
    // await encryptFormData();
    // await encryptNotes();
    
    // Add more encryption functions as needed

    console.log('\n✅ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Verify encrypted data in your database');
    console.log('   2. Test that your application can decrypt and display data');
    console.log('   3. Update your application code to use encryption for new data');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };







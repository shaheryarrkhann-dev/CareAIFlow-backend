/**
 * Script to upload Excel template file to S3
 * Run this once to upload Claims Billing Template.xlsx to S3
 *
 * Usage: node scripts/upload-excel-template.js
 */

require("dotenv").config();
const {
  uploadExcelTemplateToS3,
} = require("../src/services/claims-billing/claims-excel.service");

async function uploadExcelTemplate() {
  try {
    console.log("Starting Excel template upload to S3...\n");

    // Upload Claims Billing Template.xlsx
    console.log("Uploading Claims Billing Template.xlsx...");
    const result = await uploadExcelTemplateToS3(
      "Claims Billing Template.xlsx"
    );
    console.log("✅ Claims Billing Template.xlsx uploaded successfully");
    console.log(`   S3 Key: ${result.s3Key}`);
    console.log(`   S3 URL: ${result.s3Url}\n`);

    console.log("🎉 Excel template uploaded successfully!");
    console.log(
      "\nThe Template Instructions and Data Dictionary sheets will now be"
    );
    console.log("copied from this template with all styling preserved.");
  } catch (error) {
    console.error("❌ Error uploading Excel template:", error);
    process.exit(1);
  }
}

// Run the upload
uploadExcelTemplate();

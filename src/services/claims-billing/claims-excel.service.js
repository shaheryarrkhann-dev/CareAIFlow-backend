const ExcelJS = require("exceljs");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const prisma = require("../../lib/prisma");
const fs = require("node:fs");
const path = require("node:path");

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Get S3 key for resident Excel file
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @returns {string} S3 key
 */
function getS3Key(tenantId, residentId) {
  return `claims-billing/${tenantId}/${residentId}/billing.xlsx`;
}

/**
 * Get S3 key for Excel template file
 * @returns {string} S3 key
 */
function getExcelTemplateS3Key() {
  return `claims-billing/templates/Claims Billing Template.xlsx`;
}

/**
 * Download Excel template from S3
 * @returns {Promise<ExcelJS.Workbook>} Template workbook
 */
async function downloadExcelTemplateFromS3() {
  try {
    const s3Key = getExcelTemplateS3Key();
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    };

    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);

    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.load(buffer);
    return templateWorkbook;
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      console.error(
        `Excel template not found in S3. Please upload Claims Billing Template.xlsx first.`
      );
      throw new Error(`Excel template not found in S3`);
    }
    console.error(`Error downloading Excel template from S3:`, error);
    throw error;
  }
}

/**
 * Deep clone an object (helper function)
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (typeof structuredClone !== "undefined") {
    return structuredClone(obj);
  }
  // Fallback for older Node.js versions
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Copy worksheet from source workbook to target workbook with all styling
 * @param {ExcelJS.Workbook} sourceWorkbook - Source workbook
 * @param {ExcelJS.Workbook} targetWorkbook - Target workbook
 * @param {string} sheetName - Name of the sheet to copy
 * @returns {Promise<void>}
 */
async function copyWorksheetWithStyling(
  sourceWorkbook,
  targetWorkbook,
  sheetName
) {
  const sourceSheet = sourceWorkbook.getWorksheet(sheetName);
  if (!sourceSheet) {
    console.warn(`Sheet "${sheetName}" not found in template, skipping...`);
    return;
  }

  // Remove existing sheet if it exists (we want to replace it with styled version)
  const existingSheet = targetWorkbook.getWorksheet(sheetName);
  if (existingSheet) {
    targetWorkbook.removeWorksheet(existingSheet.id);
  }

  // Create new worksheet in target workbook
  const targetSheet = targetWorkbook.addWorksheet(sheetName);

  // Copy all rows with styling
  sourceSheet.eachRow((sourceRow, rowNumber) => {
    const targetRow = targetSheet.getRow(rowNumber);

    // Copy cell values and styling
    sourceRow.eachCell((sourceCell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);

      // Copy value
      targetCell.value = sourceCell.value;

      // Copy styling properties
      if (sourceCell.style) {
        targetCell.style = deepClone(sourceCell.style);
      }

      // Copy font
      if (sourceCell.font) {
        targetCell.font = deepClone(sourceCell.font);
      }

      // Copy fill
      if (sourceCell.fill) {
        targetCell.fill = deepClone(sourceCell.fill);
      }

      // Copy alignment
      if (sourceCell.alignment) {
        targetCell.alignment = deepClone(sourceCell.alignment);
      }

      // Copy border
      if (sourceCell.border) {
        targetCell.border = deepClone(sourceCell.border);
      }
    });

    // Copy row height
    if (sourceRow.height) {
      targetRow.height = sourceRow.height;
    }
  });

  // Copy column widths
  sourceSheet.columns.forEach((sourceColumn, index) => {
    if (sourceColumn?.width) {
      targetSheet.getColumn(index + 1).width = sourceColumn.width;
    }
  });

  // Copy merged cells
  if (sourceSheet.model?.merges) {
    sourceSheet.model.merges.forEach((merge) => {
      targetSheet.mergeCells(merge);
    });
  }
}

/**
 * Copy entire worksheet with all data and styling
 * @param {ExcelJS.Worksheet} sourceSheet - Source worksheet
 * @param {ExcelJS.Worksheet} targetSheet - Target worksheet
 * @returns {void}
 */
function copyEntireWorksheet(sourceSheet, targetSheet) {
  // Copy all rows
  sourceSheet.eachRow((row, rowNumber) => {
    const newRow = targetSheet.getRow(rowNumber);
    row.eachCell((cell, colNumber) => {
      const newCell = newRow.getCell(colNumber);
      newCell.value = cell.value;
      if (cell.style) newCell.style = deepClone(cell.style);
      if (cell.font) newCell.font = deepClone(cell.font);
      if (cell.fill) newCell.fill = deepClone(cell.fill);
      if (cell.alignment) newCell.alignment = deepClone(cell.alignment);
      if (cell.border) newCell.border = deepClone(cell.border);
    });
    if (row.height) newRow.height = row.height;
  });

  // Copy column widths
  sourceSheet.columns.forEach((column, index) => {
    if (column?.width) {
      targetSheet.getColumn(index + 1).width = column.width;
    }
  });

  // Copy merged cells
  if (sourceSheet.model?.merges) {
    sourceSheet.model.merges.forEach((merge) => {
      targetSheet.mergeCells(merge);
    });
  }
}

/**
 * Reorder sheets in workbook to ensure correct order:
 * 1. Template Instructions
 * 2. Data Dictionary
 * 3. Tier sheets in creation order
 * @param {ExcelJS.Workbook} workbook - Excel workbook
 * @param {string} residentId - Resident ID (to get tier creation order)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
async function reorderSheets(workbook, residentId, tenantId) {
  try {
    // Get tier creation order from database (first record createdAt for each tier)
    const tierCreationOrder = await prisma.claimsBillingRecord.findMany({
      where: {
        tenantId,
        residentId,
      },
      select: {
        excelSheetName: true,
        tier: {
          select: {
            name: true,
          },
        },
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Get unique tier sheets in creation order
    const tierSheetsOrder = [];
    const seenTiers = new Set();
    tierCreationOrder.forEach((record) => {
      const sheetName = record.excelSheetName || record.tier?.name || "No Tier";
      if (
        !seenTiers.has(sheetName) &&
        sheetName !== "Template Instructions" &&
        sheetName !== "Data Dictionary"
      ) {
        tierSheetsOrder.push(sheetName);
        seenTiers.add(sheetName);
      }
    });

    // Create ordered list: Template Instructions, Data Dictionary, then tier sheets
    const orderedSheetNames = [
      "Template Instructions",
      "Data Dictionary",
      ...tierSheetsOrder,
    ];

    // Create a new workbook with sheets in correct order
    const newWorkbook = new ExcelJS.Workbook();

    // Copy sheets in the correct order
    for (const sheetName of orderedSheetNames) {
      const worksheet = workbook.getWorksheet(sheetName);
      if (worksheet) {
        const newSheet = newWorkbook.addWorksheet(sheetName);
        copyEntireWorksheet(worksheet, newSheet);
      }
    }

    // Replace workbook's worksheets with ordered ones
    // Clear existing worksheets
    const worksheetIds = workbook.worksheets.map((ws) => ws.id);
    worksheetIds.forEach((id) => {
      workbook.removeWorksheet(id);
    });

    // Add worksheets from new workbook in order
    newWorkbook.worksheets.forEach((ws) => {
      const newWs = workbook.addWorksheet(ws.name);
      copyEntireWorksheet(ws, newWs);
    });
  } catch (error) {
    console.error("Error reordering sheets:", error);
    // If reordering fails, continue without reordering
  }
}

/**
 * Add default sheets (Template Instructions and Data Dictionary) to workbook
 * Always replaces/updates sheets from Excel template to ensure latest styling
 * @param {ExcelJS.Workbook} workbook - Excel workbook
 * @returns {Promise<void>}
 */
async function addDefaultSheets(workbook) {
  try {
    // Download template Excel from S3
    const templateWorkbook = await downloadExcelTemplateFromS3();

    // Remove existing sheets if they exist (to replace with styled versions)
    const existingTemplateSheet = workbook.getWorksheet(
      "Template Instructions"
    );
    if (existingTemplateSheet) {
      workbook.removeWorksheet(existingTemplateSheet.id);
    }

    const existingDictionarySheet = workbook.getWorksheet("Data Dictionary");
    if (existingDictionarySheet) {
      workbook.removeWorksheet(existingDictionarySheet.id);
    }

    // Always copy fresh sheets from template with styling
    await copyWorksheetWithStyling(
      templateWorkbook,
      workbook,
      "Template Instructions"
    );

    await copyWorksheetWithStyling(
      templateWorkbook,
      workbook,
      "Data Dictionary"
    );
  } catch (error) {
    console.error("Error adding default sheets from template:", error);
    // Fallback: Create basic sheets without styling if template not available
    const hasTemplateInstructions = workbook.getWorksheet(
      "Template Instructions"
    );
    const hasDataDictionary = workbook.getWorksheet("Data Dictionary");

    if (!hasTemplateInstructions) {
      const templateSheet = workbook.addWorksheet("Template Instructions");
      templateSheet.addRow(["Template Instructions sheet not available"]);
    }
    if (!hasDataDictionary) {
      const dictionarySheet = workbook.addWorksheet("Data Dictionary");
      dictionarySheet.addRow(["Data Dictionary sheet not available"]);
    }
  }
}

/**
 * Get Excel column headers (A-AD as per CSV dictionary)
 * @returns {Array} Array of column headers
 */
function getColumnHeaders() {
  return [
    "Provider Name", // A
    "Provider ID", // B
    "TIN/SSN/EIN", // C
    "Billing Provider NPI/API", // D
    "Billing Provider Taxonomy", // E
    "Billing Provider Street Address", // F
    "Billing Provider City", // G
    "Billing Provider State", // H
    "Billing Provider Zip Code", // I
    "Tier Unit Cost", // J
    "Service Code", // K
    "Modifier 1", // L
    "Modifier 2", // M
    "Units", // N
    "Claim Billed Amount", // O
    "Client Street Address", // P
    "Client City", // Q
    "Client State", // R
    "Client Zip Code", // S
    "Place of Service", // T
    "Client ID", // U
    "Client Last Name", // V
    "Client First Name", // W
    "Client Gender", // X
    "Client DOB", // Y
    "Diagnosis Code", // Z
    "Service From Date", // AA
    "Service To Date", // AB
    "Original Claim ID", // AC
    "Frequency Code", // AD
  ];
}

/**
 * Convert record to row data array
 * @param {Object} record - Billing record
 * @returns {Array} Row data array
 */
function recordToRowData(record) {
  return [
    record.providerName || "",
    record.providerId || "",
    record.tinSsnEin || "",
    record.billingProviderNpi || "",
    record.billingProviderTaxonomy || "",
    record.billingProviderStreet || "",
    record.billingProviderCity || "",
    record.billingProviderState || "",
    record.billingProviderZip || "",
    record.tierUnitCost ? Number(record.tierUnitCost).toFixed(2) : "",
    record.serviceCode || "",
    record.modifier1 || "",
    record.modifier2 || "",
    record.units || "",
    record.claimBilledAmount ? Number(record.claimBilledAmount).toFixed(2) : "",
    record.clientAddress || "",
    record.clientCity || "",
    record.clientState || "",
    record.clientZip || "",
    record.placeOfService || "",
    record.clientId || "",
    record.clientLastName || "",
    record.clientFirstName || "",
    record.clientGender || "",
    record.clientDob
      ? new Date(record.clientDob).toLocaleDateString("en-US")
      : "",
    record.diagnosisCode || "",
    record.serviceFromDate
      ? new Date(record.serviceFromDate).toLocaleDateString("en-US")
      : "",
    record.serviceToDate
      ? new Date(record.serviceToDate).toLocaleDateString("en-US")
      : "",
    record.originalClaimId || "",
    record.frequencyCode || "",
  ];
}

/**
 * Upload Excel buffer to S3
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {Buffer} buffer - Excel file buffer
 * @returns {Promise<Object>} Upload result
 */
async function uploadExcelToS3(tenantId, residentId, buffer) {
  const s3Key = getS3Key(tenantId, residentId);

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ServerSideEncryption: "AES256",
    Metadata: {
      tenantId,
      residentId,
      uploadedAt: new Date().toISOString(),
      type: "claims-billing-excel",
    },
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);

  const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

  return {
    success: true,
    s3Key,
    s3Url,
  };
}

/**
 * Download Excel from S3
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function downloadExcelFromS3(tenantId, residentId) {
  const s3Key = getS3Key(tenantId, residentId);

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
  };

  const command = new GetObjectCommand(params);
  const response = await s3Client.send(command);

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return buffer;
}

/**
 * Check if Excel file exists in S3
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @returns {Promise<boolean>} True if exists
 */
async function excelExistsInS3(tenantId, residentId) {
  try {
    const s3Key = getS3Key(tenantId, residentId);
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    };
    await s3Client.send(new GetObjectCommand(params));
    return true;
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Create or update resident Excel sheet
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} record - Billing record (includes tier info)
 * @returns {Promise<void>}
 */
async function createOrUpdateResidentSheet(residentId, tenantId, record) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = record.excelSheetName || record.tier?.name || "No Tier";

  // Check if Excel file exists in S3
  const exists = await excelExistsInS3(tenantId, residentId);

  if (exists) {
    // Download existing file
    const buffer = await downloadExcelFromS3(tenantId, residentId);
    await workbook.xlsx.load(buffer);
  } else {
    // Create new workbook with default sheets
    await addDefaultSheets(workbook);
  }

  // Ensure default sheets exist (in case they were removed)
  await addDefaultSheets(workbook);

  // Check if tier sheet exists, if not create it
  let worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    worksheet = workbook.addWorksheet(sheetName);

    // Add header row
    const headers = getColumnHeaders();
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Set column widths
    worksheet.columns.forEach((column, index) => {
      column.width = 20;
    });
  }

  // Reorder sheets before saving
  await reorderSheets(workbook, residentId, tenantId);

  // Save to S3
  const buffer = await workbook.xlsx.writeBuffer();
  await uploadExcelToS3(tenantId, residentId, buffer);
}

/**
 * Add a row to the resident Excel sheet
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} record - Billing record (includes tier info)
 * @returns {Promise<void>}
 */
async function addRowToSheet(residentId, tenantId, record) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = record.excelSheetName || record.tier?.name || "No Tier";

  // Download existing file or create new
  try {
    const buffer = await downloadExcelFromS3(tenantId, residentId);
    await workbook.xlsx.load(buffer);
  } catch (error) {
    // File doesn't exist, create new with default sheets
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      await addDefaultSheets(workbook);
    } else {
      throw error;
    }
  }

  // Ensure default sheets exist
  await addDefaultSheets(workbook);

  // Get or create tier worksheet
  let worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    worksheet = workbook.addWorksheet(sheetName);
    // Add header row if new sheet
    const headers = getColumnHeaders();
    worksheet.addRow(headers);
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.columns.forEach((column) => {
      column.width = 20;
    });
  }

  // Add row data
  const rowData = recordToRowData(record);
  worksheet.addRow(rowData);

  // Reorder sheets before saving
  await reorderSheets(workbook, residentId, tenantId);

  // Save to S3
  const buffer = await workbook.xlsx.writeBuffer();
  await uploadExcelToS3(tenantId, residentId, buffer);
}

/**
 * Update a row in the resident Excel sheet
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} record - Updated billing record (includes tier info)
 * @param {number} rowIndex - Row index (1-based, excluding header)
 * @returns {Promise<void>}
 */
async function updateRowInSheet(residentId, tenantId, record, rowIndex) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = record.excelSheetName || record.tier?.name || "No Tier";

  // Download existing file
  const buffer = await downloadExcelFromS3(tenantId, residentId);
  await workbook.xlsx.load(buffer);

  // Get worksheet
  let worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    throw new Error(`Worksheet "${sheetName}" not found in Excel file`);
  }

  // Update row (rowIndex is 1-based, but we need to account for header row)
  // So actual Excel row = rowIndex + 1 (header is row 1)
  const excelRowNumber = rowIndex + 1;
  const row = worksheet.getRow(excelRowNumber);

  if (!row) {
    throw new Error(`Row ${excelRowNumber} not found in worksheet`);
  }

  // Update row data
  const rowData = recordToRowData(record);
  row.values = [null, ...rowData]; // null for row number column

  // Reorder sheets before saving
  await reorderSheets(workbook, residentId, tenantId);

  // Save to S3
  const updatedBuffer = await workbook.xlsx.writeBuffer();
  await uploadExcelToS3(tenantId, residentId, updatedBuffer);
}

/**
 * Download resident Excel sheet
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function downloadResidentSheet(residentId, tenantId) {
  return await downloadExcelFromS3(tenantId, residentId);
}

/**
 * Delete a row from the resident Excel sheet
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {number} rowIndex - Row index (1-based, excluding header)
 * @returns {Promise<void>}
 */
async function deleteRowFromSheet(residentId, tenantId, rowIndex) {
  const workbook = new ExcelJS.Workbook();

  // Download existing file
  try {
    const buffer = await downloadExcelFromS3(tenantId, residentId);
    await workbook.xlsx.load(buffer);
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      throw new Error(`Excel file not found for resident ${residentId}`);
    }
    throw error;
  }

  // Get the record to find the sheet name (need to get the specific record being deleted)
  // We need to find the record by rowIndex and residentId to get the correct tier
  const records = await prisma.claimsBillingRecord.findMany({
    where: { tenantId, residentId },
    include: {
      tier: {
        select: {
          name: true,
        },
      },
    },
  });

  // Find the record with matching rowIndex
  const recordToDelete = records.find((r) => r.rowIndex === rowIndex);

  if (!recordToDelete) {
    throw new Error(
      `No billing record found for resident ${residentId} with rowIndex ${rowIndex}`
    );
  }

  const sheetName =
    recordToDelete.excelSheetName || recordToDelete.tier?.name || "No Tier";
  const worksheet = workbook.getWorksheet(sheetName);

  if (!worksheet) {
    throw new Error(`Worksheet "${sheetName}" not found in Excel file`);
  }

  // Convert rowIndex (1-based, excluding header) to Excel row number (header is row 1)
  const excelRowNumber = rowIndex + 1;

  // Check if row exists
  const row = worksheet.getRow(excelRowNumber);
  if (!row || row.number > worksheet.rowCount) {
    throw new Error(`Row ${excelRowNumber} not found in worksheet`);
  }

  // Delete the row
  worksheet.spliceRows(excelRowNumber, 1);

  // Update row indices in database for all rows after the deleted one
  // Shift all row indices down by 1 for rows after the deleted row
  const recordsToUpdate = await prisma.claimsBillingRecord.findMany({
    where: {
      tenantId,
      residentId,
      rowIndex: {
        gt: rowIndex,
      },
    },
  });

  // Update each record's rowIndex
  for (const record of recordsToUpdate) {
    await prisma.claimsBillingRecord.update({
      where: { id: record.id },
      data: { rowIndex: record.rowIndex - 1 },
    });
  }

  // Reorder sheets before saving
  await reorderSheets(workbook, residentId, tenantId);

  // Save to S3
  const buffer = await workbook.xlsx.writeBuffer();
  await uploadExcelToS3(tenantId, residentId, buffer);
}

/**
 * Delete Excel file from S3
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
async function deleteExcelFileFromS3(residentId, tenantId) {
  try {
    const s3Key = getS3Key(tenantId, residentId);
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    };

    const command = new DeleteObjectCommand(params);
    await s3Client.send(command);

    console.log(
      `[S3] Successfully deleted Excel file for resident ${residentId}`
    );
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      // File doesn't exist, that's okay
      console.log(
        `[S3] Excel file not found for resident ${residentId}, skipping deletion`
      );
      return;
    }
    console.error(
      `[S3] Error deleting Excel file for resident ${residentId}:`,
      error
    );
    throw error;
  }
}

/**
 * Get signed URL for Excel download (for secure access)
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} Signed URL
 */
async function getSignedDownloadUrl(tenantId, residentId, expiresIn = 3600) {
  const s3Key = getS3Key(tenantId, residentId);

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

/**
 * Regenerate Excel sheet from all billing records
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
async function regenerateResidentSheet(residentId, tenantId) {
  // Get all billing records for this resident, ordered by billing month
  const records = await prisma.claimsBillingRecord.findMany({
    where: {
      tenantId,
      residentId,
    },
    include: {
      tier: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      billingMonth: "asc",
    },
  });

  if (records.length === 0) {
    throw new Error("No billing records found for this resident");
  }

  // Create new workbook with default sheets
  const workbook = new ExcelJS.Workbook();
  await addDefaultSheets(workbook);

  // Group records by tier/sheet name
  const recordsBySheet = {};
  records.forEach((record) => {
    const sheetName = record.excelSheetName || record.tier?.name || "No Tier";
    if (!recordsBySheet[sheetName]) {
      recordsBySheet[sheetName] = [];
    }
    recordsBySheet[sheetName].push(record);
  });

  // Create a worksheet for each tier and add rows
  for (const [sheetName, sheetRecords] of Object.entries(recordsBySheet)) {
    let worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      worksheet = workbook.addWorksheet(sheetName);

      // Add header row
      const headers = getColumnHeaders();
      worksheet.addRow(headers);

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
    }

    // Add all rows for this tier
    sheetRecords.forEach((record) => {
      const rowData = recordToRowData(record);
      worksheet.addRow(rowData);
    });

    // Set column widths
    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    // Update row indices in database for this tier
    // After regeneration, row indices should be sequential starting from 1 per tier
    for (let i = 0; i < sheetRecords.length; i++) {
      await prisma.claimsBillingRecord.update({
        where: { id: sheetRecords[i].id },
        data: { rowIndex: i + 1 },
      });
    }
  }

  // Reorder sheets before saving
  await reorderSheets(workbook, residentId, tenantId);

  // Save to S3
  const buffer = await workbook.xlsx.writeBuffer();
  await uploadExcelToS3(tenantId, residentId, buffer);
}

/**
 * Upload Excel template file to S3
 * @param {string} filePath - Path to Excel template file (e.g., "Claims Billing Template.xlsx")
 * @returns {Promise<Object>} Upload result
 */
async function uploadExcelTemplateToS3(filePath) {
  try {
    const s3Key = getExcelTemplateS3Key();
    const fullPath = path.join(process.cwd(), filePath);
    const fileBuffer = fs.readFileSync(fullPath);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ServerSideEncryption: "AES256",
      Metadata: {
        uploadedAt: new Date().toISOString(),
        type: "claims-billing-excel-template",
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`[S3] Successfully uploaded Excel template to: ${s3Key}`);

    return {
      success: true,
      s3Key,
      s3Url,
    };
  } catch (error) {
    console.error(`[S3] Error uploading Excel template:`, error);
    throw error;
  }
}

module.exports = {
  createOrUpdateResidentSheet,
  addRowToSheet,
  updateRowInSheet,
  deleteRowFromSheet,
  deleteExcelFileFromS3,
  downloadResidentSheet,
  getSignedDownloadUrl,
  regenerateResidentSheet,
  uploadExcelTemplateToS3,
  getExcelTemplateS3Key,
};

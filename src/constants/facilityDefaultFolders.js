const { FACILITY_PDF_REQUIRED_FOLDER_NAMES } = require("./compliance/pdfRequiredFolders");

/**
 * Standard root folders for each facility.
 * Required folders match PDF §3.3; others are optional.
 */
const DEFAULT_FACILITY_ROOT_FOLDERS = [
  { name: "Licenses & permits", sortOrder: 1 },
  { name: "Inspections & reports", sortOrder: 2 },
  { name: "Insurance", sortOrder: 3 },
  { name: "Policies & compliance", sortOrder: 4 },
  { name: "Emergency & safety", sortOrder: 5 },
  { name: "Contracts & vendors", sortOrder: 6 },
].map((folder) => ({
  ...folder,
  isOptional: !FACILITY_PDF_REQUIRED_FOLDER_NAMES.has(folder.name),
}));

module.exports = { DEFAULT_FACILITY_ROOT_FOLDERS };

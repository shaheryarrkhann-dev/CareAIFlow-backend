const { RESIDENT_PDF_REQUIRED_FOLDER_NAMES } = require("./compliance/pdfRequiredFolders");

/**
 * Standard root folders for each resident (admission & compliance file structure).
 * Required folders match PDF §3.1; others are optional.
 */
const DEFAULT_RESIDENT_ROOT_FOLDERS = [
  { name: "Identification", sortOrder: 1 },
  { name: "Consents & legal", sortOrder: 2 },
  { name: "Admission documentation", sortOrder: 3 },
  { name: "Medical & medications", sortOrder: 4 },
  { name: "Care planning", sortOrder: 5 },
  { name: "External reports", sortOrder: 6 },
  { name: "Billing & insurance", sortOrder: 7 },
  { name: "Archive", sortOrder: 8 },
].map((folder) => ({
  ...folder,
  isOptional: !RESIDENT_PDF_REQUIRED_FOLDER_NAMES.has(folder.name),
}));

module.exports = { DEFAULT_RESIDENT_ROOT_FOLDERS };

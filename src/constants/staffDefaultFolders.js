const { STAFF_PDF_REQUIRED_FOLDER_NAMES } = require("./compliance/pdfRequiredFolders");

/**
 * Standard root folders for each staff member (document management).
 * Required folders match PDF §3.2; others are optional.
 */
const DEFAULT_STAFF_ROOT_FOLDERS = [
  { name: "Credentials & Certifications", sortOrder: 1 },
  { name: "Training Records", sortOrder: 2 },
  { name: "Background Checks", sortOrder: 3 },
  { name: "Health & Screening", sortOrder: 4 },
  { name: "Employment Documents", sortOrder: 5 },
  { name: "Performance & Supervision", sortOrder: 6 },
  { name: "Scheduling & Assignment", sortOrder: 7 },
  { name: "Separation / Archive", sortOrder: 8 },
].map((folder) => ({
  ...folder,
  isOptional: !STAFF_PDF_REQUIRED_FOLDER_NAMES.has(folder.name),
}));

module.exports = { DEFAULT_STAFF_ROOT_FOLDERS };

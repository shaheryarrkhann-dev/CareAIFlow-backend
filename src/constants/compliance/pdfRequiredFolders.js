/**
 * PDF §3.1–3.3 required compliance categories mapped to system default folder names.
 * All other default root folders are optional (do not block Ready / COMPLETE).
 */

const RESIDENT_PDF_REQUIRED_FOLDER_NAMES = new Set([
  "Admission documentation", // §3.1 admission documentation
  "Medical & medications", // §3.1 medical records
  "Consents & legal", // §3.1 consent and legal documents
  "Care planning", // §3.1 care-related documentation
]);

const STAFF_PDF_REQUIRED_FOLDER_NAMES = new Set([
  "Credentials & Certifications", // §3.2 certifications and licenses
  "Background Checks", // §3.2 compliance documents
  "Training Records", // §3.2 training records
  "Employment Documents", // §3.2 employment documentation
]);

const FACILITY_PDF_REQUIRED_FOLDER_NAMES = new Set([
  "Licenses & permits", // §3.3 licensing and regulatory documents
  "Inspections & reports", // §3.3 operational logs
  "Policies & compliance", // §3.3 policy and compliance records
]);

function isPdfRequiredFolder(entityType, folderName) {
  const map = {
    resident: RESIDENT_PDF_REQUIRED_FOLDER_NAMES,
    staff: STAFF_PDF_REQUIRED_FOLDER_NAMES,
    facility: FACILITY_PDF_REQUIRED_FOLDER_NAMES,
  };
  return map[entityType]?.has(folderName) ?? false;
}

module.exports = {
  RESIDENT_PDF_REQUIRED_FOLDER_NAMES,
  STAFF_PDF_REQUIRED_FOLDER_NAMES,
  FACILITY_PDF_REQUIRED_FOLDER_NAMES,
  isPdfRequiredFolder,
};

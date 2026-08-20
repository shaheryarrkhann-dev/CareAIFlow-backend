const { DEFAULT_STAFF_ROOT_FOLDERS } = require("../staffDefaultFolders");
const { buildCatalogFromFolders } = require("./complianceCatalog.shared");

const STAFF_COMPLIANCE_CATALOG = buildCatalogFromFolders(DEFAULT_STAFF_ROOT_FOLDERS, {
  "Credentials & Certifications": { minDocuments: 1 },
  "Background Checks": { minDocuments: 1 },
  "Training Records": { minDocuments: 1 },
  "Employment Documents": { minDocuments: 1 },
  "Health & Screening": { minDocuments: 1, staleAfterDays: 365, isOptional: true },
});

module.exports = { STAFF_COMPLIANCE_CATALOG };

const { DEFAULT_RESIDENT_ROOT_FOLDERS } = require("../residentDefaultFolders");
const { buildCatalogFromFolders } = require("./complianceCatalog.shared");

const RESIDENT_COMPLIANCE_CATALOG = buildCatalogFromFolders(
  DEFAULT_RESIDENT_ROOT_FOLDERS,
  {
    "Admission documentation": { minDocuments: 1 },
    "Medical & medications": { minDocuments: 1, staleAfterDays: 365 },
    "Consents & legal": { minDocuments: 1 },
    "Care planning": { minDocuments: 1 },
  }
);

module.exports = { RESIDENT_COMPLIANCE_CATALOG };

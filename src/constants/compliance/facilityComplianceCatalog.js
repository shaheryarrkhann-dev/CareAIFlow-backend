const { DEFAULT_FACILITY_ROOT_FOLDERS } = require("../facilityDefaultFolders");
const { buildCatalogFromFolders } = require("./complianceCatalog.shared");

const FACILITY_COMPLIANCE_CATALOG = buildCatalogFromFolders(
  DEFAULT_FACILITY_ROOT_FOLDERS,
  {
    "Licenses & permits": { minDocuments: 1, staleAfterDays: 365, label: "Licensing & regulatory" },
    "Inspections & reports": { minDocuments: 1, label: "Operational logs" },
    "Policies & compliance": { minDocuments: 1, label: "Policy & compliance" },
  }
);

module.exports = { FACILITY_COMPLIANCE_CATALOG };

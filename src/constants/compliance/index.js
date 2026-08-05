const { RESIDENT_COMPLIANCE_CATALOG } = require("./residentComplianceCatalog");
const { STAFF_COMPLIANCE_CATALOG } = require("./staffComplianceCatalog");
const { FACILITY_COMPLIANCE_CATALOG } = require("./facilityComplianceCatalog");

const ENTITY_TYPES = ["resident", "staff", "facility"];

const CATALOG_BY_ENTITY = {
  resident: RESIDENT_COMPLIANCE_CATALOG,
  staff: STAFF_COMPLIANCE_CATALOG,
  facility: FACILITY_COMPLIANCE_CATALOG,
};

/**
 * @param {"resident"|"staff"|"facility"} entityType
 */
function getComplianceCatalog(entityType) {
  const key = String(entityType || "").toLowerCase();
  if (!CATALOG_BY_ENTITY[key]) {
    throw new Error(`Unknown compliance entity type: ${entityType}`);
  }
  return CATALOG_BY_ENTITY[key];
}

function getAllComplianceCatalogs() {
  return {
    resident: RESIDENT_COMPLIANCE_CATALOG,
    staff: STAFF_COMPLIANCE_CATALOG,
    facility: FACILITY_COMPLIANCE_CATALOG,
  };
}

module.exports = {
  ENTITY_TYPES,
  RESIDENT_COMPLIANCE_CATALOG,
  STAFF_COMPLIANCE_CATALOG,
  FACILITY_COMPLIANCE_CATALOG,
  getComplianceCatalog,
  getAllComplianceCatalogs,
};

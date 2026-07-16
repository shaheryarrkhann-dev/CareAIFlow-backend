/**
 * Standard root folders for each facility (licenses, inspections, insurance, etc.).
 */
const DEFAULT_FACILITY_ROOT_FOLDERS = [
  { name: "Licenses & permits", sortOrder: 1 },
  { name: "Inspections & reports", sortOrder: 2 },
  { name: "Insurance", sortOrder: 3 },
  { name: "Policies & compliance", sortOrder: 4 },
  { name: "Emergency & safety", sortOrder: 5 },
  { name: "Contracts & vendors", sortOrder: 6 },
];

module.exports = { DEFAULT_FACILITY_ROOT_FOLDERS };

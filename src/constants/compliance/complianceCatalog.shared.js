/**
 * Shared compliance catalog shape (Phase 1 — used by Phase 2 evaluation engine).
 *
 * @typedef {Object} ComplianceCategoryRule
 * @property {string} id - Stable key for APIs and UI
 * @property {string} folderName - Must match a system default root folder name
 * @property {string} label - Display label
 * @property {number} minDocuments - Minimum files for "Complete" (Phase 2)
 * @property {boolean} isOptional - Excluded from overall readiness when true
 * @property {number|null} staleAfterDays - Flag "outdated" when newest doc older than N days (Phase 2)
 */

/**
 * @param {Array<{ name: string, sortOrder: number, isOptional?: boolean }>} folderDefs
 * @param {Record<string, Partial<ComplianceCategoryRule>>} overrides - Per-folder minDocuments, staleAfterDays
 * @returns {ComplianceCategoryRule[]}
 */
function buildCatalogFromFolders(folderDefs, overrides = {}) {
  return folderDefs.map((folder) => {
    const id = folder.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const extra = overrides[folder.name] || {};
    return {
      id,
      folderName: folder.name,
      label: extra.label || folder.name,
      minDocuments: extra.minDocuments ?? 1,
      isOptional: folder.isOptional === true || extra.isOptional === true,
      staleAfterDays: extra.staleAfterDays ?? null,
    };
  });
}

module.exports = { buildCatalogFromFolders };

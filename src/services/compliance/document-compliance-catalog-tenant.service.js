const { getComplianceCatalog } = require("../../constants/compliance");
const prisma = require("../../lib/prisma");

/**
 * Merge tenant catalogOverrides onto default rules.
 * @param {string} tenantId
 * @param {"resident"|"staff"|"facility"} entityType
 */
async function getCatalogForTenant(tenantId, entityType) {
  const base = getComplianceCatalog(entityType);
  if (!tenantId) return base;

  const settings = await prisma.tenantDocumentComplianceSettings.findUnique({
    where: { tenantId },
    select: { catalogOverrides: true },
  });
  const overrides =
    settings?.catalogOverrides?.[entityType] ||
    settings?.catalogOverrides?.[String(entityType).toLowerCase()] ||
    null;

  if (!overrides || typeof overrides !== "object") {
    return base;
  }

  return base.map((rule) => {
    const patch = overrides[rule.id] || overrides[rule.folderName];
    if (!patch || typeof patch !== "object") return rule;
    return {
      ...rule,
      ...(patch.label != null ? { label: String(patch.label) } : {}),
      ...(patch.minDocuments != null
        ? { minDocuments: Math.max(0, Number(patch.minDocuments) || 0) }
        : {}),
      ...(patch.isOptional != null ? { isOptional: Boolean(patch.isOptional) } : {}),
      ...(patch.staleAfterDays !== undefined
        ? {
            staleAfterDays:
              patch.staleAfterDays === null || patch.staleAfterDays === ""
                ? null
                : Number(patch.staleAfterDays) || null,
          }
        : {}),
      ...(patch.disabled === true ? { isOptional: true, _disabled: true } : {}),
    };
  }).filter((rule) => !rule._disabled);
}

module.exports = { getCatalogForTenant };

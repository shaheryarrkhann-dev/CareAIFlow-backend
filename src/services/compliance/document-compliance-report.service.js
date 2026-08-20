const { evaluateDashboard } = require("./document-compliance-evaluation.service");

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildDashboardCsv(dashboard) {
  const lines = [];
  lines.push("Document Compliance Report");
  lines.push(`Generated,${csvEscape(dashboard.evaluatedAt)}`);
  lines.push(`Tenant,${csvEscape(dashboard.tenantId)}`);
  if (dashboard.facilityId) {
    lines.push(`Facility filter,${csvEscape(dashboard.facilityId)}`);
  }
  lines.push("");
  lines.push("Summary");
  lines.push("Metric,Count");
  lines.push(`Total profiles,${dashboard.summary.totalProfiles}`);
  lines.push(`Complete,${dashboard.summary.complete}`);
  lines.push(`Partial,${dashboard.summary.partial}`);
  lines.push(`Missing,${dashboard.summary.missing}`);
  lines.push(`Incomplete profiles,${dashboard.summary.incompleteProfiles ?? ""}`);
  lines.push(
    `Overall compliance %,${dashboard.summary.overallCompliancePercent ?? ""}`
  );
  lines.push(`Residents,${dashboard.summary.residents}`);
  lines.push(`Staff,${dashboard.summary.staff}`);
  lines.push(`Facilities,${dashboard.summary.facilities}`);
  lines.push("");
  lines.push("Profiles needing attention");
  lines.push(
    "Entity Type,Entity Name,Entity ID,Overall Status,Readiness,Missing Categories,Partial Categories,Top Recommendation"
  );

  for (const row of dashboard.incompleteProfiles) {
    const topRec = row.topRecommendations?.[0]?.message || "";
    lines.push(
      [
        csvEscape(row.entityType),
        csvEscape(row.entityName),
        csvEscape(row.entityId),
        csvEscape(row.overallStatus),
        csvEscape(row.readiness),
        row.missingCount,
        row.partialCount,
        csvEscape(topRec),
      ].join(",")
    );
  }

  if (dashboard.criticalMissingItems?.length) {
    lines.push("");
    lines.push("Critical missing items");
    lines.push(
      "Entity Type,Entity Name,Category,Folder,Status,Entity ID,Folder ID"
    );
    for (const item of dashboard.criticalMissingItems) {
      lines.push(
        [
          csvEscape(item.entityType),
          csvEscape(item.entityName),
          csvEscape(item.categoryLabel),
          csvEscape(item.folderName),
          csvEscape(item.status),
          csvEscape(item.entityId),
          csvEscape(item.folderId),
        ].join(",")
      );
    }
  }

  lines.push("");
  lines.push("Category breakdown (required folders)");
  for (const entityKey of ["resident", "staff", "facility"]) {
    const breakdown = dashboard.categoryBreakdown[entityKey];
    if (!breakdown || Object.keys(breakdown).length === 0) continue;
    lines.push("");
    lines.push(csvEscape(entityKey));
    lines.push("Category,Complete,Partial,Missing,Gap");
    for (const [id, cat] of Object.entries(breakdown)) {
      lines.push(
        [
          csvEscape(cat.label || id),
          cat.COMPLETE ?? 0,
          cat.PARTIAL ?? 0,
          cat.MISSING ?? 0,
          cat.GAP ?? 0,
        ].join(",")
      );
    }
  }

  return lines.join("\r\n");
}

async function exportDashboardCsv(tenantId, options = {}) {
  const dashboard = await evaluateDashboard(tenantId, {
    facilityId: options.facilityId,
  });
  const csv = buildDashboardCsv(dashboard);
  const filename = `document-compliance-${tenantId.slice(0, 8)}-${Date.now()}.csv`;
  return { csv, filename, dashboard };
}

module.exports = {
  buildDashboardCsv,
  exportDashboardCsv,
};

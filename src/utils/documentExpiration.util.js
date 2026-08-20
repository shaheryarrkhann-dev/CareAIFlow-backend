/**
 * Parse optional document expiration date (YYYY-MM-DD or ISO).
 * @param {string|null|undefined} value
 * @returns {Date|null|undefined} undefined = omit from update; null = clear
 */
function parseOptionalDocumentExpirationDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const raw = String(value).trim();
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = new Date(`${ymd}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid expiration date");
  }
  return d;
}

module.exports = { parseOptionalDocumentExpirationDate };

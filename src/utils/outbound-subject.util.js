/** Use ASCII hyphen in outbound email/fax subjects instead of en/em dashes. */
function normalizeOutboundSubject(subject) {
  if (subject == null) return "";
  return String(subject).replace(/[\u2013\u2014]/g, "-");
}

module.exports = { normalizeOutboundSubject };

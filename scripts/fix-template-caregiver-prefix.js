/**
 * One-time script: removes hardcoded "Caregiver will " static text from the NCP DOCX template
 * that appears immediately before template placeholders like {field_name}.
 *
 * The DOCX format is a ZIP of XML files. This script:
 *   1. Reads the template as a zip
 *   2. Patches word/document.xml to remove "Caregiver will " before placeholders
 *   3. Writes back to the same file (backs up the original first)
 *
 * Run once:  node scripts/fix-template-caregiver-prefix.js
 */

const PizZip = require("pizzip");
const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "..", "AFH_NCP_Template_with_placeholders_FINAL.docx");
const BACKUP_PATH = TEMPLATE_PATH.replace(".docx", "_BACKUP_before_caregiver_fix.docx");

const raw = fs.readFileSync(TEMPLATE_PATH);
const zip = new PizZip(raw);

const XML_FILE = "word/document.xml";
let xml = zip.file(XML_FILE).asText();

const before = xml;

// ── Case 1: "Caregiver will {" in the SAME <w:t> run ──────────────────────────
// e.g.  <w:t>Caregiver will {mobility_caregiver_actions}</w:t>
xml = xml.replace(/Caregiver[s]?\s+will\s+(?={)/gi, "");

// ── Case 2: "Caregiver will " in one <w:t>, placeholder "{" starts next <w:t> ─
// The run containing ONLY "Caregiver will " (with optional trailing space) should
// be deleted entirely. We match a <w:r>…</w:r> block whose sole text content is
// "Caregiver will " and that is immediately followed (after possible whitespace /
// XML) by another run whose text starts with "{".
//
// Strategy: find a <w:r> element whose <w:t> content is exactly the prefix, then
// confirm the very next <w:t> in the paragraph starts with "{".
xml = xml.replace(
  /(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>Caregiver[s]?\s+will\s*<\/w:t><\/w:r>)([\s\S]*?)(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>\{)/gi,
  (match, prefixRun, between, nextRunStart) => {
    // Only strip if there is no other text between the two runs
    // (between should contain only XML structural tags, no <w:t> content)
    if (/<w:t[^>]*>[^<]/.test(between)) {
      return match; // other text between them — leave alone
    }
    return between + nextRunStart;
  }
);

const changed = xml !== before;

if (!changed) {
  console.log("No occurrences of 'Caregiver will' found before placeholders in the template.");
  console.log("The template may already be clean, or the text is split across runs differently.");
  console.log("Check word/document.xml manually if the issue persists.");
  process.exit(0);
}

// Count replacements
const removedCount = (before.match(/Caregiver[s]?\s+will\s+(?=\{|<\/w:t>)/gi) || []).length;
console.log(`Found and removed approximately ${removedCount} 'Caregiver will' prefix(es).`);

// Back up original
fs.copyFileSync(TEMPLATE_PATH, BACKUP_PATH);
console.log(`Original backed up to: ${path.basename(BACKUP_PATH)}`);

// Write patched template
zip.file(XML_FILE, xml);
const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(TEMPLATE_PATH, out);
console.log(`Template updated: ${path.basename(TEMPLATE_PATH)}`);

#!/usr/bin/env node
/**
 * Verify every resident form field survives a full round trip:
 *
 *   save : form key -> toPrismaFieldName() -> a real column on Resident
 *   load : column   -> toSnakeCase()       -> oldToNewFieldMap -> the same form key
 *
 * A break in either direction is silent and destructive. The field renders
 * blank in edit mode, and saving that blank writes it back over the stored
 * value. It has happened three times:
 *
 *   - 9 medical_providers_health_coverage_* fields (ProviderOne, pharmacy)
 *   - service_plan_ncp_most_recent_date, via a stale hard-coded date list
 *   - the §3 visit dates, caught by this check before release
 *
 * Read-only. Touches no database. Safe to run anywhere, including CI.
 *
 *   node scripts/check-resident-field-roundtrip.js
 *
 * Exits non-zero if any field fails, so it can gate a commit or a build.
 *
 * FRONTEND_REPO overrides the sibling-directory guess for the frontend repo.
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  toPrismaFieldName,
} = require("../src/services/resident/resident-creation.service");

const BACKEND = path.resolve(__dirname, "..");
const FRONTEND =
  process.env.FRONTEND_REPO ||
  path.resolve(BACKEND, "..", "ai-onboarding-careflowAI-frontend");

const QUESTIONNAIRE = path.join(
  FRONTEND,
  "src",
  "pages",
  "forms",
  "QuestionnairePage.tsx"
);

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(2);
}

if (!fs.existsSync(QUESTIONNAIRE)) {
  fail(
    `Cannot find the frontend repo at:\n    ${FRONTEND}\n` +
      `  Set FRONTEND_REPO to its path and re-run.`
  );
}

// --- inputs -----------------------------------------------------------------

const fields = JSON.parse(
  fs.readFileSync(path.join(BACKEND, "resident_fields.json"), "utf8")
);

const frontendFieldsPath = path.join(FRONTEND, "resident_fields.json");
const frontendFields = JSON.parse(fs.readFileSync(frontendFieldsPath, "utf8"));

const schema = fs.readFileSync(
  path.join(BACKEND, "prisma", "schema.prisma"),
  "utf8"
);

const source = fs.readFileSync(QUESTIONNAIRE, "utf8");

// --- the Resident model's column list ---------------------------------------

const modelStart = schema.indexOf("model Resident {");
if (modelStart === -1) fail("Could not locate `model Resident` in schema.prisma");
// Model bodies contain no nested braces, so the first closing brace at column 0
// ends the block.
const modelEnd = schema.indexOf("\n}", modelStart);
const residentModel = schema.slice(modelStart, modelEnd);

const columns = new Set(
  residentModel
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0])
);

// --- the frontend's reverse map ---------------------------------------------

const mapStart = source.indexOf("const oldToNewFieldMap");
if (mapStart === -1) fail("Could not locate `oldToNewFieldMap` in QuestionnairePage.tsx");
const oldToNewFieldMap = eval(
  `(${source.slice(source.indexOf("{", mapStart), source.indexOf("};", mapStart) + 1)})`
);

const toSnakeCase = (s) => s.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

// --- checks -----------------------------------------------------------------

const problems = [];

// 0. The two copies of resident_fields.json must agree.
const backendKeys = Object.keys(fields).sort();
const frontendKeys = Object.keys(frontendFields).sort();
if (backendKeys.join() !== frontendKeys.join()) {
  const onlyBackend = backendKeys.filter((k) => !frontendFields[k]);
  const onlyFrontend = frontendKeys.filter((k) => !fields[k]);
  problems.push(
    `resident_fields.json differs between repos\n` +
      (onlyBackend.length ? `      backend only : ${onlyBackend.join(", ")}\n` : "") +
      (onlyFrontend.length ? `      frontend only: ${onlyFrontend.join(", ")}` : "")
  );
}

for (const key of Object.keys(fields)) {
  // 1. Save direction: the form key must reach a real column.
  const column = toPrismaFieldName(key);
  if (!columns.has(column)) {
    problems.push(
      `${key}\n      save -> ${column}  (no such column on Resident)`
    );
    continue;
  }

  // 2. Load direction: that column, as the API returns it, must come back to
  //    the same form key - directly or through oldToNewFieldMap.
  const apiKey = toSnakeCase(column);
  const hydrated = oldToNewFieldMap[apiKey] || apiKey;
  if (hydrated !== key) {
    problems.push(
      `${key}\n      save -> ${column}\n` +
        `      load -> ${apiKey} -> ${hydrated}  (expected ${key})\n` +
        `      fix  : add "${apiKey}": "${key}" to oldToNewFieldMap`
    );
  }
}

// 3. Date fields must be typed so the frontend's derived list picks them up.
//    QuestionnairePage builds `dateFields` by filtering on this exact string.
const dateColumns = new Set(
  residentModel
    .split("\n")
    .filter((line) => /@db\.Date\b/.test(line))
    .map((line) => line.trim().split(/\s+/)[0])
);
for (const key of Object.keys(fields)) {
  const column = toPrismaFieldName(key);
  if (dateColumns.has(column) && fields[key] !== "YYYY-MM-DD") {
    problems.push(
      `${key}\n      column ${column} is @db.Date but the field type is ` +
        `${JSON.stringify(fields[key])}\n` +
        `      fix  : set it to "YYYY-MM-DD" or the value renders blank and ` +
        `saves back blank`
    );
  }
}

// --- report -----------------------------------------------------------------

const total = Object.keys(fields).length;

if (problems.length === 0) {
  console.log(`\n  OK - all ${total} resident fields round-trip cleanly.\n`);
  process.exit(0);
}

console.error(`\n  ${problems.length} problem(s) across ${total} fields:\n`);
for (const p of problems) console.error(`    ${p}\n`);
console.error(
  `  Each of these loads blank in edit mode and saves the blank back,\n` +
    `  destroying the stored value. See PROGRESS-AND-HANDOFF.md section 4.3.\n`
);
process.exit(1);

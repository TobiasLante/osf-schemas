#!/usr/bin/env node
// ci/test-class-schemas.mjs — acceptance test for the meta-schemas of the
// classes that had none (UNS-AS-CODE §15.4, KONZEPT Invariante 3).
//
// Written BEFORE the schemas exist, by the orchestrator, and PROTECTED: a
// worker that edits this file has its packet rejected (the checksum lives in
// osf-model-manager/briefs/local/). It is the oracle, not a suggestion.
//
// For every class it asserts BOTH directions — a schema that accepts
// everything is as green as a correct one, so the negatives carry the weight:
//   1. the meta-schema exists, is draft-07, and carries the $id convention
//   2. every REAL file of the class validates
//   3. every NEGATIVE (a real file, mutated one way) is REJECTED
//   4. .github/scripts/validate-all.mjs routes the class: it reports
//      `<route> ok=<n> fail=0` with n = number of real files, exits 0 — and
//      exits non-zero on a temp copy of the repo with one broken file in it
//   5. class-specific extras (linters, single-source vocabularies)
//
// Run:  node ci/test-class-schemas.mjs [class ...]     (no args = all classes)
// Exit: 0 = every selected class passes, 1 = at least one assertion failed

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ID_PREFIX = "https://osf-schemas/validation/";

const clone = (x) => JSON.parse(JSON.stringify(x));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listJson = (dir) =>
  readdirSync(join(REPO, dir), { recursive: true })
    .filter((f) => f.endsWith(".json") && !f.split("/").pop().startsWith("_"))
    .map((f) => join(dir, f))
    .sort();

// ---- the classes ------------------------------------------------------------
// `negatives`: [name, relFile, mutate(doc) -> doc]. Each must be REJECTED by the
// meta-schema. Every mutation starts from a real file, so the only difference
// between a passing and a failing document is the one thing named.

const CLASSES = {
  "unit-conversions": {
    schema: "validation/unit-conversions-schema.json",
    route: "unit-conversions",
    dir: "unit-conversions",
    negatives: [
      ["conversions missing", "unit-conversions/conversions.json", (d) => { delete d.conversions; return d; }],
      ["conversions empty", "unit-conversions/conversions.json", (d) => { d.conversions = []; return d; }],
      ["entry without scale", "unit-conversions/conversions.json", (d) => { delete d.conversions[0].scale; return d; }],
      ["entry without from", "unit-conversions/conversions.json", (d) => { delete d.conversions[0].from; return d; }],
      ["scale as string", "unit-conversions/conversions.json", (d) => { d.conversions[0].scale = "1.8"; return d; }],
      ["typo key in entry", "unit-conversions/conversions.json", (d) => { d.conversions[0].scal = 1; return d; }],
      ["typo key top-level", "unit-conversions/conversions.json", (d) => { d.conversion = []; return d; }],
      ["version not semver", "unit-conversions/conversions.json", (d) => { d.version = "1.0"; return d; }],
    ],
    extra: testUnitConversionsLinter,
  },

  flows: {
    schema: "validation/flow-schema.json",
    route: "flow",
    dir: "flows",
    negatives: [
      ["flowSchemaId missing", "flows/flow-opcua-uns-standard.json", (d) => { delete d.flowSchemaId; return d; }],
      ["processors missing", "flows/flow-opcua-uns-standard.json", (d) => { delete d.processors; return d; }],
      ["processors empty", "flows/flow-opcua-uns-standard.json", (d) => { d.processors = []; return d; }],
      ["processor without type", "flows/flow-opcua-uns-standard.json", (d) => { delete d.processors[0].type; return d; }],
      ["processor without id", "flows/flow-opcua-uns-standard.json", (d) => { delete d.processors[1].id; return d; }],
      ["wiring edge without to", "flows/flow-opcua-uns-standard.json", (d) => { delete d.wiring[0].to; return d; }],
      ["typo key top-level", "flows/flow-opcua-uns-standard.json", (d) => { d.processor = []; return d; }],
      ["version not semver", "flows/flow-opcua-uns-standard.json", (d) => { d.version = "v1"; return d; }],
    ],
  },

  "companion-specs": {
    schema: "validation/companion-spec-index-schema.json",
    route: "companion-spec-index",
    dir: "companion-specs",
    negatives: [
      ["specs missing", "companion-specs/index.json", (d) => { delete d.specs; return d; }],
      ["specs as array", "companion-specs/index.json", (d) => { d.specs = Object.values(d.specs); return d; }],
      ["url not a uri", "companion-specs/index.json", (d) => { Object.values(d.specs)[0].url = "not a url"; return d; }],
      ["spec without category", "companion-specs/index.json", (d) => { delete Object.values(d.specs)[0].category; return d; }],
      ["category outside vocabulary", "companion-specs/index.json", (d) => { Object.values(d.specs)[0].category = "robots"; return d; }],
      ["typo key in spec", "companion-specs/index.json", (d) => { Object.values(d.specs)[0].descripton = "x"; return d; }],
      ["typo key top-level", "companion-specs/index.json", (d) => { d.spec = {}; return d; }],
    ],
  },

  kpis: {
    schema: "validation/kpi-schema.json",
    route: "kpi",
    dir: "kpis",
    negatives: [
      ["unit missing", "kpis/oee.json", (d) => { delete d.unit; return d; }],
      ["calculation missing", "kpis/oee.json", (d) => { delete d.calculation; return d; }],
      ["threshold as string", "kpis/oee.json", (d) => { d.thresholds.warning = "80"; return d; }],
      ["threshold critical missing", "kpis/oee.json", (d) => { delete d.thresholds.critical; return d; }],
      ["inputs as string", "kpis/oee.json", (d) => { d.calculation.inputs = "part_good"; return d; }],
      ["appliesTo empty", "kpis/oee.json", (d) => { d.appliesTo = []; return d; }],
      ["appliesTo without SMProfile- prefix", "kpis/oee.json", (d) => { d.appliesTo = ["CNC-Machine"]; return d; }],
      ["kpiId without KPI- prefix", "kpis/oee.json", (d) => { d.kpiId = "OEE"; return d; }],
      ["parked without parkedReason", "kpis/performance.json", (d) => { delete d.parkedReason; return d; }],
      ["parked without parkedAt", "kpis/performance.json", (d) => { delete d.parkedAt; return d; }],
      ["typo key top-level", "kpis/oee.json", (d) => { d.treshholds = {}; return d; }],
    ],
    // the existing KPI gate must stay green and keep biting
    extra: () => [runExpect("npm run test:kpis", ["npm", ["run", "-s", "test:kpis"]], 0), runExpect("npm run validate:kpis", ["npm", ["run", "-s", "validate:kpis"]], 0)],
  },

  "cross-constraints": {
    schema: "validation/cross-constraint-schema.json",
    route: "cross-constraint",
    dir: "cross-constraints",
    negatives: [
      ["severity missing", "cross-constraints/late_delivery.json", (d) => { delete d.severity; return d; }],
      ["severity outside vocabulary", "cross-constraints/late_delivery.json", (d) => { d.severity = "fatal"; return d; }],
      ["op outside vocabulary", "cross-constraints/late_delivery.json", (d) => { d.op = "between"; return d; }],
      ["left missing", "cross-constraints/late_delivery.json", (d) => { delete d.left; return d; }],
      ["crossConstraintId as number", "cross-constraints/late_delivery.json", (d) => { d.crossConstraintId = 7; return d; }],
      ["retired without retiredReason", "cross-constraints/qty_shortfall.json", (d) => { delete d.retiredReason; return d; }],
      ["retired without successor", "cross-constraints/qty_shortfall.json", (d) => { delete d.successor; return d; }],
      ["parked without parkedBy", "cross-constraints/parts_counted_vs_booked.json", (d) => { delete d.parkedBy; return d; }],
      ["typo key top-level", "cross-constraints/late_delivery.json", (d) => { d.sevrity = "warning"; return d; }],
    ],
    extra: testCrossConstraintOpsSingleSource,
  },

  // ---- historians (Welle 1b) — three classes, decided on the FIELDS, not the
  // folders (audit CAPT-KLASSEN B2): instances, central-ts table layouts, and
  // the syncId/syncType/version descriptors in every other subfolder.

  "historian-instances": {
    schema: "validation/historian-instance-schema.json",
    route: "historian-instance",
    dir: "historians/instances",
    negatives: [
      ["instanceId missing", "historians/instances/edge-cnc-001.json", (d) => { delete d.instanceId; return d; }],
      ["tables empty", "historians/instances/edge-cnc-001.json", (d) => { d.tables = []; return d; }],
      ["table without name", "historians/instances/edge-cnc-001.json", (d) => { delete d.tables[0].name; return d; }],
      ["column without type", "historians/instances/edge-cnc-001.json", (d) => { delete d.tables[0].columns[0].type; return d; }],
      ["servedMachines empty", "historians/instances/edge-cnc-001.json", (d) => { d.servedMachines = []; return d; }],
      ["retention without default", "historians/instances/edge-cnc-001.json", (d) => { d.retention = {}; return d; }],
      ["internalPort as string", "historians/instances/edge-cnc-001.json", (d) => { d.internalPort = "5432"; return d; }],
      ["typo key top-level", "historians/instances/edge-cnc-001.json", (d) => { d.instanceID = "x"; return d; }],
    ],
  },

  "ts-table-layouts": {
    schema: "validation/ts-table-layout-schema.json",
    route: "ts-table-layout",
    dir: "historians/central-ts-tables",
    negatives: [
      ["profileRef missing", "historians/central-ts-tables/cnc.json", (d) => { delete d.profileRef; return d; }],
      ["profileRef without SMProfile- prefix", "historians/central-ts-tables/cnc.json", (d) => { d.profileRef = "CNC-Machine"; return d; }],
      ["tables empty", "historians/central-ts-tables/cnc.json", (d) => { d.tables = []; return d; }],
      // the keys below are the ones historians/central-ts-tables/render-ddl.py dereferences hard
      ["table without primaryKey", "historians/central-ts-tables/cnc.json", (d) => { delete d.tables[0].primaryKey; return d; }],
      ["table without columns", "historians/central-ts-tables/sgm.json", (d) => { delete d.tables[1].columns; return d; }],
      ["column without type", "historians/central-ts-tables/cnc.json", (d) => { delete d.tables[0].columns[0].type; return d; }],
      ["index without columns", "historians/central-ts-tables/cnc.json", (d) => { delete d.tables[0].indexes[0].columns; return d; }],
      ["typo key top-level", "historians/central-ts-tables/cnc.json", (d) => { d.table = []; return d; }],
    ],
  },

  "historian-descriptors": {
    schema: "validation/historian-descriptor-schema.json",
    route: "historian-descriptor",
    dir: "historians",
    exclude: ["historians/instances/", "historians/central-ts-tables/"],
    negatives: [
      ["syncId missing", "historians/grafana-dashboards/plant-cockpit.json", (d) => { delete d.syncId; return d; }],
      ["syncType outside vocabulary", "historians/grafana-dashboards/plant-cockpit.json", (d) => { d.syncType = "grafana"; return d; }],
      ["version not semver", "historians/influxdb/historian-template.json", (d) => { d.version = "1.0"; return d; }],
      ["dashboard without uid", "historians/grafana-dashboards/plant-cockpit.json", (d) => { delete d.uid; return d; }],
      ["dashboard without datasource", "historians/grafana-dashboards/process-sgm.json", (d) => { delete d.datasource; return d; }],
      ["sink template without connection", "historians/influxdb/historian-template.json", (d) => { delete d.connection; return d; }],
      ["sink template without subscribeFilters", "historians/nats-jetstream/historian-template.json", (d) => { delete d.subscribeFilters; return d; }],
      ["cagg without sourceTable", "historians/postgresql-cagg/oee-hourly.json", (d) => { delete d.sourceTable; return d; }],
      ["view without definition", "historians/views/machine_index.json", (d) => { delete d.definition; return d; }],
      ["pivot without rules", "historians/postgresql-pivot/routing.json", (d) => { delete d.rules; return d; }],
      ["typo key top-level", "historians/mssql/historian-template.json", (d) => { d.syncTyp = "mssql"; return d; }],
    ],
  },
};

// ---- helpers ----------------------------------------------------------------

function runExpect(label, [cmd, args], wantZero, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd || REPO, env: { ...process.env, ...(opts.env || {}) }, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const zero = r.status === 0;
  const okExit = wantZero === 0 ? zero : !zero;
  const okText = !opts.mustMention || opts.mustMention.every((s) => out.includes(s));
  return { name: label, ok: okExit && okText, detail: `exit=${r.status}${okText ? "" : ` — output does not mention ${JSON.stringify(opts.mustMention)}`}` };
}

// A throwaway copy of the repo (node_modules symlinked), so a negative can be
// planted without touching the real tree.
function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "class-schemas-"));
  cpSync(REPO, dir, { recursive: true, filter: (src) => !/\/(node_modules|\.git)(\/|$)/.test(src) });
  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));
  return dir;
}

function testUnitConversionsLinter() {
  const results = [];
  const linter = "ci/lint-unit-conversions.mjs";
  if (!existsSync(join(REPO, linter))) return [{ name: `${linter} exists`, ok: false, detail: "missing" }];
  const real = readJson(join(REPO, "unit-conversions/conversions.json"));
  const dir = mkdtempSync(join(tmpdir(), "uc-lint-"));
  const plant = (name, doc) => { const p = join(dir, `${name}.json`); writeFileSync(p, JSON.stringify(doc)); return p; };
  const run = (label, file, want, mustMention) =>
    results.push(runExpect(`lint-unit-conversions: ${label}`, ["node", [linter]], want, { env: { UNIT_CONVERSIONS_FILE: file }, mustMention }));

  run("real file is green", plant("real", real), 0);
  const unknown = clone(real); unknown.conversions[0].from = "XYZ";
  run("unknown UNECE code is red and named", plant("unknown", unknown), 1, ["XYZ"]);
  const dup = clone(real); dup.conversions.push(clone(dup.conversions[0]));
  run("duplicate from/to pair is red and named", plant("dup", dup), 1, [real.conversions[0].from, real.conversions[0].to]);
  const zero = clone(real); zero.conversions[0].scale = 0;
  run("scale 0 is red", plant("zero", zero), 1);

  const pkg = readJson(join(REPO, "package.json"));
  const script = Object.entries(pkg.scripts).find(([, v]) => v.includes("lint-unit-conversions.mjs"));
  results.push({ name: "linter has an npm script", ok: !!script, detail: script ? script[0] : "none" });
  results.push({ name: "that script is part of `npm run validate`", ok: !!script && pkg.scripts.validate.includes(`npm run ${script[0]}`), detail: "" });
  rmSync(dir, { recursive: true, force: true });
  return results;
}

// The op vocabulary must have ONE home: the meta-schema. Today it is a literal
// Set in ci/lint-cross-constraints.mjs. Proof by behaviour, not by grep: remove
// "gte" from the schema's enum in a temp copy — the linter must then reject the
// real file that uses "gte". Untouched copy must stay green (the twin).
function testCrossConstraintOpsSingleSource() {
  const results = [];
  const schemaRel = CLASSES["cross-constraints"].schema;
  if (!existsSync(join(REPO, schemaRel))) return [{ name: "ops single source", ok: false, detail: "schema missing" }];
  const findOpEnum = (s) => s?.properties?.op?.enum;
  const twin = tempRepo();
  results.push(runExpect("lint-cross-constraints green on untouched copy", ["node", ["ci/lint-cross-constraints.mjs"]], 0, { cwd: twin }));
  rmSync(twin, { recursive: true, force: true });

  const dir = tempRepo();
  const schema = readJson(join(dir, schemaRel));
  const ops = findOpEnum(schema);
  if (!Array.isArray(ops) || !ops.includes("gte")) {
    results.push({ name: "schema declares properties.op.enum containing gte", ok: false, detail: JSON.stringify(ops) });
  } else {
    schema.properties.op.enum = ops.filter((o) => o !== "gte");
    writeFileSync(join(dir, schemaRel), JSON.stringify(schema, null, 2));
    results.push(runExpect("lint-cross-constraints reads op vocabulary from the schema", ["node", ["ci/lint-cross-constraints.mjs"]], 1, { cwd: dir, mustMention: ["gte"] }));
  }
  rmSync(dir, { recursive: true, force: true });
  return results;
}

// ---- the run ----------------------------------------------------------------

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLASSES);
const unknownSel = selected.filter((c) => !CLASSES[c]);
if (unknownSel.length) { console.error(`unknown class: ${unknownSel.join(", ")}`); process.exit(2); }

let failed = 0;
const report = (cls, r) => { if (!r.ok) failed++; console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`); };

for (const cls of selected) {
  const c = CLASSES[cls];
  console.log(`\n== ${cls}`);
  const schemaPath = join(REPO, c.schema);
  if (!existsSync(schemaPath)) { report(cls, { name: `${c.schema} exists`, ok: false, detail: "missing" }); continue; }

  let schema;
  try { schema = readJson(schemaPath); } catch (e) { report(cls, { name: "schema parses", ok: false, detail: e.message }); continue; }
  report(cls, { name: "draft-07", ok: schema.$schema === "http://json-schema.org/draft-07/schema#", detail: schema.$schema });
  report(cls, { name: "$id convention", ok: schema.$id === ID_PREFIX + c.schema.split("/").pop(), detail: schema.$id });

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  let validate;
  try { validate = ajv.compile(schema); } catch (e) { report(cls, { name: "schema compiles", ok: false, detail: e.message }); continue; }

  const files = listJson(c.dir).filter((f) => !(c.exclude || []).some((x) => f.startsWith(x)));
  for (const f of files) {
    const ok = validate(readJson(join(REPO, f)));
    report(cls, { name: `real file valid: ${f}`, ok, detail: ok ? "" : ajv.errorsText(validate.errors) });
  }
  for (const [name, file, mutate] of c.negatives) {
    const ok = !validate(mutate(clone(readJson(join(REPO, file)))));
    report(cls, { name: `negative rejected: ${name}`, ok, detail: ok ? "" : "schema ACCEPTED it" });
  }

  // validate-all routes the class
  const va = spawnSync("node", [".github/scripts/validate-all.mjs"], { cwd: REPO, encoding: "utf8" });
  const vaOut = (va.stdout || "") + (va.stderr || "");
  const m = vaOut.match(new RegExp(`^\\s*${c.route}\\s+ok=(\\d+)\\s+fail=(\\d+)`, "m"));
  report(cls, { name: `validate-all routes '${c.route}' with ok=${files.length} fail=0`, ok: !!m && +m[1] === files.length && +m[2] === 0, detail: m ? m[0].trim() : "route not in output" });
  report(cls, { name: "validate-all exits 0", ok: va.status === 0, detail: `exit=${va.status}` });

  const [nName, nFile, nMutate] = c.negatives[0];
  const tmp = tempRepo();
  writeFileSync(join(tmp, nFile), JSON.stringify(nMutate(clone(readJson(join(REPO, nFile)))), null, 2));
  report(cls, runExpect(`validate-all exits non-zero with planted negative (${nName})`, ["node", [".github/scripts/validate-all.mjs"]], 1, { cwd: tmp, mustMention: [nFile] }));
  rmSync(tmp, { recursive: true, force: true });

  if (c.extra) for (const r of c.extra()) report(cls, r);
}

console.log(`\n${failed === 0 ? "PASS" : `FAIL — ${failed} assertion(s)`}`);
process.exit(failed === 0 ? 0 : 1);

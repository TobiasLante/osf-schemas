#!/usr/bin/env node
// ci/mutate.mjs — a linter that cannot reproduce the defect it claims to catch is not evidence.
//
// For every gating linter this injects ONE real defect into a throw-away copy of the repo and
// asserts the linter goes red on it. The baseline copy must be green first, otherwise a red run
// would prove nothing. Linters with their own ci/test-lint-*.mjs are covered there; this covers
// the ones that had none, plus the drift checks.
//
// Run:  node ci/mutate.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const J = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
const W = (d, f, o) => fs.writeFileSync(path.join(d, f), JSON.stringify(o, null, 2) + "\n");
const edit = (d, f, fn) => { const o = J(d, f); fn(o); W(d, f, o); };
const IMM = "profiles/machines/injection-molding-machine.json";
const CNC = "profiles/machines/cnc-machine.json";

const M = [
  ["lint-category", "a machine profile filed as business", (d) => edit(d, CNC, (o) => { o.category = "business"; })],
  ["lint-constraints", "a constraint on an attribute that does not exist", (d) => edit(d, IMM, (o) => { o.constraints[0].require.attr = "ghostTempC"; })],
  // all four cross-constraints are retired or parked, so reference errors are warnings by design;
  // what this linter gates today is the tombstone itself
  ["lint-cross-constraints", "a retired rule that no longer says why", (d) => edit(d, "cross-constraints/qty_shortfall.json", (o) => { delete o.retiredReason; })],
  ["lint-refs", "a source pointing at a profile that does not exist", (d) => edit(d, "sources/opcua/opcua-cnc-001-telemetry.json", (o) => { o.profileRef = "SMProfile-Ghost"; })],
  ["lint-edges", "a source edge on a key no profile declares", (d) => edit(d, "sources/rest/sim-v5-qms-inspections.json", (o) => { o.edges[0].targetIdProp = "ghost_no"; })],
  ["lint-mtconnect-canon", "an MTConnect mapping onto a missing attribute", (d) => edit(d, "mappings/mtconnect-dataitem-map.json", (o) => { o.mappings[0].smAttribute = "Act_Ghost"; })],
  ["lint-machine-type-aliases", "an alias onto a profile that does not exist", (d) => edit(d, "mappings/machine-type-aliases.json", (o) => { o.aliases[0].profileRef = "SMProfile-Ghost"; })],
  ["lint-counters", "a counter whose semantics is not in the vocabulary", (d) => edit(d, IMM, (o) => { o.attributes.find((a) => a.counter).counter.semantics = "whatever"; })],
  ["lint-contract", "a profile changed without regenerating contract.json", (d) => edit(d, "profiles/equipment/tool.json", (o) => { o.kgNodeLabel = "GhostTool"; })],
  ["gen-i3x --check", "a profile changed without regenerating i3x/", (d) => edit(d, "profiles/equipment/tool.json", (o) => { o.displayName = "Ghost"; }), ["ci/gen-i3x.mjs", "--check"]],
  ["gen-docs --check", "a profile added without regenerating the README counts", (d) => fs.copyFileSync(path.join(d, "profiles/equipment/tool.json"), path.join(d, "profiles/equipment/tool-copy.json")), ["ci/gen-docs.mjs", "--check"]],
  ["lint-units", "a symbol instead of a UNECE code", (d) => edit(d, IMM, (o) => { o.attributes.find((a) => a.unit).unit = "degC"; })],
  ["lint-units", "the old invented code for milliampere", (d) => edit(d, "unit-conversions/conversions.json", (o) => { o.conversions.push({ from: "MAM", to: "AMP", scale: 0.001, offset: 0 }); })],
  ["lint-value-type", "a setpoint declared as measured", (d) => edit(d, CNC, (o) => { o.attributes.find((a) => a.name.startsWith("Set_")).valueType = "PV"; })],
  ["lint-prose", "a novel back in a description", (d) => edit(d, CNC, (o) => { o.description = "x".repeat(400); })],
  ["lint-edge-pairs", "a two-way relationship nobody registered", (d) => edit(d, "validation/relationship-types.json", (o) => { o.pairs.shift(); })],
];

function stage() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "osf-mut-"));
  for (const e of fs.readdirSync(ROOT)) {
    if (e === ".git" || e === "node_modules") continue;
    fs.cpSync(path.join(ROOT, e), path.join(d, e), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(d, "node_modules"));
  return d;
}
const run = (d, args) => { try { execFileSync(process.execPath, args, { cwd: d, stdio: "pipe" }); return 0; } catch (e) { return e.status ?? 1; } };
const argsOf = (m) => m[3] || [`ci/${m[0]}.mjs`];

let missed = 0, caught = 0;
const base = stage();
for (const m of M) {
  if (run(base, argsOf(m)) !== 0) { console.error(`  BASELINE RED  ${m[0]} — the unmutated repo already fails, a mutation would prove nothing`); missed++; }
}
fs.rmSync(base, { recursive: true, force: true });
for (const m of M) {
  const d = stage();
  m[2](d);
  const rc = run(d, argsOf(m));
  fs.rmSync(d, { recursive: true, force: true });
  if (rc !== 0) { caught++; console.log(`  CAUGHT  ${m[0].padEnd(26)} ${m[1]}`); }
  else { missed++; console.error(`  MISSED  ${m[0].padEnd(26)} ${m[1]}`); }
}
console.log(`mutate: ${M.length} defects injected, ${caught} caught, ${missed} missed`);
process.exit(missed ? 1 : 0);

#!/usr/bin/env node
// next/ci/test-json-to-shacl.mjs
//
// Tests for the JSON -> SHACL transpiler. Zero-dep (node:assert) with inline
// fixtures; if the `n3` Turtle parser is resolvable (CI installs it), every
// emitted document is additionally parse-checked as real Turtle.
//
// Run:  node next/ci/test-json-to-shacl.mjs

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transpileAll } from "./json-to-shacl.mjs";

let n3 = null;
try {
  n3 = await import("n3");
} catch {
  process.stdout.write("note: n3 not resolvable — skipping real Turtle parse checks\n");
}

function parseCheck(ttl, label) {
  if (!n3) return;
  const parser = new n3.Parser();
  const quads = parser.parse(ttl); // throws on syntax error
  assert.ok(quads.length > 0, `${label}: parsed to zero quads`);
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok   ${name}\n`);
  } catch (err) {
    process.stderr.write(`FAIL ${name}\n${err.stack ?? err.message}\n`);
    process.exitCode = 1;
  }
}

function fixtureDir(profiles) {
  const dir = mkdtempSync(join(tmpdir(), "shacl-fix-"));
  mkdirSync(join(dir, "p"), { recursive: true });
  profiles.forEach((p, i) => writeFileSync(join(dir, "p", `f${i}.json`), JSON.stringify(p)));
  return dir;
}

function run(profiles) {
  const dir = fixtureDir(profiles);
  const out = join(dir, "out");
  const emitted = transpileAll(join(dir, "p"), out);
  const byName = {};
  for (const f of emitted) byName[f.split("/").pop()] = readFileSync(f, "utf8");
  return { emitted, byName, out };
}

// ---- Fixtures ---------------------------------------------------------------

const PARENT = {
  profileId: "SMProfile-TestParent",
  version: "1.0.0",
  displayName: "Test Parent",
  parentType: null,
  abstract: true,
  kgNodeLabel: "TestParent",
  attributes: [
    { name: "Status", dataType: "Int32", category: "Core" },
    { name: "Power", dataType: "Float", category: "Core" },
  ],
  constraints: {
    parent_rule: {
      description: "power positive when running",
      when: { attr: "Status", op: "eq", value: 1 },
      require: { attr: "Power", op: "gt", value: 0 },
      severity: "warning",
    },
  },
};

const CHILD = {
  profileId: "SMProfile-TestChild",
  version: "1.0.0",
  displayName: "Test Child",
  parentType: "TestParent", // resolves via kgNodeLabel — same rule as the linter
  kgNodeLabel: "TestChild",
  attributes: [
    { name: "InCycle", dataType: "Boolean", category: "Core" },
    { name: "Wear", dataType: "Float", category: "Core" },
    { name: "Mode", dataType: "String", category: "Core", enum: ["auto", "manual"] },
    { name: "Count", dataType: "Int32", category: "Core" },
    { name: "Ts", dataType: "DateTime", category: "Core" },
  ],
  constraints: {
    wear_range: {
      require: { attr: "Wear", op: "between", value: [0, 100] },
      severity: "warning",
    },
    cond_bool: {
      when: { attr: "InCycle", op: "eq", value: true },
      require: { attr: "Power", op: "gt", value: 0 }, // inherited attr
      severity: "error",
    },
    mode_in: {
      require: { attr: "Mode", op: "in", value: ["auto", "manual"] },
      severity: "error",
    },
    mode_ne: {
      require: { attr: "Mode", op: "ne", value: "manual" },
      severity: "warning",
    },
    count_bounds: {
      when: { attr: "Count", op: "between", value: [10, 20] },
      require: { attr: "Power", op: "gte", value: 1.5 },
      severity: "error",
    },
    count_lt: {
      require: { attr: "Count", op: "lt", value: 1000 },
      severity: "warning",
    },
    count_lte: {
      require: { attr: "Count", op: "lte", value: 999 },
      severity: "warning",
    },
  },
};

// ---- Tests ------------------------------------------------------------------

test("abstract parent emits no file; child materializes inherited constraint", () => {
  const { byName } = run([PARENT, CHILD]);
  assert.deepEqual(Object.keys(byName).sort(), ["SMProfile-TestChild.ttl"]);
  const ttl = byName["SMProfile-TestChild.ttl"];
  assert.match(ttl, /# inherited from SMProfile-TestParent/);
  assert.match(ttl, /osf:SMProfile-TestChild__constraint__parent_rule/);
  assert.match(ttl, /sh:targetClass osf:TestChild/);
  assert.doesNotMatch(ttl, /sh:targetClass osf:TestParent/);
  parseCheck(ttl, "child ttl");
});

test("conditional-int-enum pattern: when eq Int32 -> sh:or with negated sh:hasValue", () => {
  const { byName } = run([PARENT, CHILD]);
  const ttl = byName["SMProfile-TestChild.ttl"];
  const block = ttl.split("\n\n").find((b) => b.includes("__constraint__parent_rule"));
  assert.match(block, /sh:or \(/);
  assert.match(block, /sh:not \[\n\s+sh:hasValue "1"\^\^xsd:integer ;/);
  assert.match(block, /sh:minExclusive "0\.0"\^\^xsd:double ;/); // Float attr -> double literal
  assert.match(block, /sh:severity sh:Warning ;/);
});

test("conditional-bool pattern: boolean literal + sh:Violation severity", () => {
  const { byName } = run([PARENT, CHILD]);
  const block = byName["SMProfile-TestChild.ttl"]
    .split("\n\n")
    .find((b) => b.includes("__constraint__cond_bool"));
  assert.match(block, /sh:hasValue "true"\^\^xsd:boolean/);
  assert.match(block, /sh:severity sh:Violation ;/);
});

test("between (unconditional) -> sh:minInclusive + sh:maxInclusive, no sh:or", () => {
  const { byName } = run([PARENT, CHILD]);
  const block = byName["SMProfile-TestChild.ttl"]
    .split("\n\n")
    .find((b) => b.includes("__constraint__wear_range"));
  assert.match(block, /sh:minInclusive "0\.0"\^\^xsd:double ;/);
  assert.match(block, /sh:maxInclusive "100\.0"\^\^xsd:double ;/);
  assert.doesNotMatch(block, /sh:or/);
});

test("between as WHEN (negated range) + gte require", () => {
  const { byName } = run([PARENT, CHILD]);
  const block = byName["SMProfile-TestChild.ttl"]
    .split("\n\n")
    .find((b) => b.includes("__constraint__count_bounds"));
  assert.match(block, /sh:not \[\n\s+sh:minInclusive "10"\^\^xsd:integer ;\n\s+sh:maxInclusive "20"\^\^xsd:integer ;/);
  assert.match(block, /sh:minInclusive "1.5"\^\^xsd:double ;/);
});

test("in / ne / lt / lte operators", () => {
  const { byName } = run([PARENT, CHILD]);
  const ttl = byName["SMProfile-TestChild.ttl"];
  assert.match(ttl, /sh:in \( "auto" "manual" \) ;/);
  assert.match(ttl, /sh:not \[ sh:hasValue "manual" \] ;/);
  assert.match(ttl, /sh:maxExclusive "1000"\^\^xsd:integer ;/);
  assert.match(ttl, /sh:maxInclusive "999"\^\^xsd:integer ;/);
});

test("deterministic output across runs", () => {
  const a = run([PARENT, CHILD]).byName["SMProfile-TestChild.ttl"];
  const b = run([PARENT, CHILD]).byName["SMProfile-TestChild.ttl"];
  // Strip the SSOT header line (contains the tmp fixture path) before comparing.
  const strip = (s) => s.split("\n").filter((l) => !l.startsWith("# SSOT:")).join("\n");
  assert.equal(strip(a), strip(b));
});

test("unresolvable attr throws", () => {
  const bad = { ...CHILD, constraints: { broken: { require: { attr: "Nope", op: "gt", value: 0 }, severity: "error" } } };
  assert.throws(() => run([PARENT, bad]), /does not resolve to an attribute/);
});

test("type mismatch throws (string for Int32)", () => {
  const bad = { ...CHILD, constraints: { broken: { require: { attr: "Count", op: "gt", value: "five" }, severity: "error" } } };
  assert.throws(() => run([PARENT, bad]), /is not an integer/);
});

test("unknown severity throws", () => {
  const bad = { ...CHILD, constraints: { broken: { require: { attr: "Count", op: "gt", value: 5 }, severity: "fatal" } } };
  assert.throws(() => run([PARENT, bad]), /unknown severity/);
});

test("string escaping in sh:message", () => {
  const quoted = {
    ...CHILD,
    constraints: {
      q: { description: 'say "hi"\nback', require: { attr: "Count", op: "gt", value: 0 }, severity: "warning" },
    },
  };
  const { byName } = run([PARENT, quoted]);
  const ttl = byName["SMProfile-TestChild.ttl"];
  assert.match(ttl, /sh:message "say \\"hi\\"\\nback" ;/);
  parseCheck(ttl, "escaped ttl");
});

test("pilot profiles (next/profiles/) transpile: cnc gets 4 shapes incl. inherited", () => {
  const out = mkdtempSync(join(tmpdir(), "shacl-pilot-"));
  const root = new URL("../profiles/", import.meta.url).pathname;
  const emitted = transpileAll(root, out);
  const names = emitted.map((f) => f.split("/").pop()).sort();
  assert.ok(names.includes("SMProfile-CNC-Machine.ttl"), `expected cnc ttl, got ${names}`);
  assert.ok(!names.includes("SMProfile-Machine.ttl"), "abstract Machine must not emit");
  const ttl = readFileSync(join(out, "SMProfile-CNC-Machine.ttl"), "utf8");
  for (const id of [
    "power_positive_when_running",
    "spindle_when_in_cycle",
    "coolant_pressure_when_in_cycle",
    "tool_wear_in_range",
  ]) {
    assert.match(ttl, new RegExp(`__constraint__${id}\\b`), `missing shape for ${id}`);
  }
  assert.match(ttl, /# inherited from SMProfile-Machine/);
  assert.match(ttl, /sh:targetClass osf:CNC_Machine/);
  parseCheck(ttl, "cnc ttl");
});

process.stdout.write(`\n${passed} tests passed${process.exitCode ? " (with FAILURES)" : ""}\n`);

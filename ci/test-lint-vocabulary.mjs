#!/usr/bin/env node
// ci/test-lint-vocabulary.mjs — the linter's own negative test.
//
// A linter nobody tested is a linter nobody can trust. This repo has shipped
// FAKE-GREEN checks twice: a `tee` that swallowed an ajv crash (exit code came
// from tee), and lint-recipes.mjs claiming "JSON Schema pins the structure"
// while never loading the schema. So this test:
//   - runs ci/lint-vocabulary.mjs as a SUBPROCESS and asserts on its EXIT CODE
//     (not on a return value, not on a green tick),
//   - drives it against fixture trees on disk (PROFILES_ROOT / CROSS_ROOT /
//     SOURCES_ROOTS),
//   - asserts BOTH directions: a healthy tree stays GREEN (no false alarms —
//     a linter that cries wolf gets switched off) and every single way to write
//     a dead literal turns it RED, with a message that names the value.
//
// Run: node ci/test-lint-vocabulary.mjs     (exit 0 = the gate really bites)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const LINTER = new URL("./lint-vocabulary.mjs", import.meta.url).pathname;

// ---- fixture tree ----------------------------------------------------------

// A healthy little world: an order profile whose status vocabulary is declared
// and whose source maps the column 1:1, plus a machine profile fed by a source
// that PINS the attribute to a constant.
const ORDER_PROFILE = (extra = {}) => ({
  profileId: "SMProfile-TestOrder",
  kgNodeLabel: "TestOrder",
  attributes: [
    {
      name: "status",
      dataType: "String",
      enum: ["OPEN", "CANCELLED", "FINAL_CONFIRMED"],
      delivery: "transactional",
      scope: "hub",
      promotion: "on_change",
      ...(extra.statusAttr ?? {}),
    },
    { name: "qty", dataType: "Int32", delivery: "transactional", scope: "hub", promotion: "on_change" },
    { name: "order_no", dataType: "String", delivery: "transactional", scope: "hub", promotion: "on_change" },
  ],
  constraints: extra.constraints ?? [
    {
      name: "open_order_has_qty",
      when: { attr: "status", op: "eq", value: "OPEN" },
      require: { attr: "qty", op: "gt", value: 0 },
      severity: "warning",
    },
  ],
});

const RESP_PROFILE = {
  profileId: "SMProfile-TestResponse",
  kgNodeLabel: "TestResponse",
  attributes: [
    {
      name: "status",
      dataType: "String",
      enum: ["fertig"],
      delivery: "transactional",
      scope: "hub",
      promotion: "on_change",
    },
    { name: "order_no", dataType: "String", delivery: "transactional", scope: "hub", promotion: "on_change" },
    { name: "produced", dataType: "Int32", delivery: "transactional", scope: "hub", promotion: "on_change" },
  ],
};

const ORDER_SOURCE = {
  sourceId: "test-orders",
  sourceType: "rest",
  profileRef: "SMProfile-TestOrder",
  connection: { baseUrl: "http://example.invalid", path: "/api/orders" },
  columnMappings: [
    { column: "order_no", smAttribute: "order_no", isId: true },
    { column: "status", smAttribute: "status" },
    { column: "qty", smAttribute: "qty" },
  ],
};

// The real-world killer: the source BINDS the attribute to a constant, so the
// vocabulary is knowable from the SSOT alone — no data, no DB, no guessing.
const RESP_SOURCE = {
  sourceId: "test-confirmations",
  sourceType: "rest",
  profileRef: "SMProfile-TestResponse",
  connection: { baseUrl: "http://example.invalid", path: "/api/confirmations" },
  columnMappings: [
    { column: "order_no", smAttribute: "order_no", isId: true },
    { column: "confirmed_qty", smAttribute: "produced" },
    { const: "fertig", smAttribute: "status" },
  ],
};

const CROSS_OK = (when) => ({
  crossConstraintId: "test_qty_shortfall",
  when,
  left: { profileRef: "SMProfile-TestResponse", joinKey: "order_no", attr: "produced" },
  right: { profileRef: "SMProfile-TestOrder", joinKey: "order_no", attr: "qty" },
  op: "gte",
});

// A machine source (declares the machine-id namespace) + a recipe bound to it.
const MACHINE_SOURCE = {
  sourceId: "opcua-sgm-004-processdata",
  sourceType: "opcua",
  profileRef: "SMProfile-TestOrder",
  machineId: "sgm-004",
  nodeMappings: [{ opcuaNodeId: "ns=1;s=Machine/status", smAttribute: "order_no" }],
};

const RECIPE = (equipment) => ({
  recipeId: `RECIPE-${equipment}-default`,
  profileRef: "SMProfile-InjectionMoldingMachine",
  match: { equipment },
  values: {},
});

function buildTree({ profiles, cross, sources, recipes }) {
  const root = mkdtempSync(join(tmpdir(), "vocab-fixture-"));
  const pDir = join(root, "profiles");
  const cDir = join(root, "cross-constraints");
  const sDir = join(root, "sources");
  const rDir = join(root, "recipes");
  for (const d of [pDir, cDir, sDir, rDir]) mkdirSync(d, { recursive: true });
  profiles.forEach((p, i) => writeFileSync(join(pDir, `p${i}.json`), JSON.stringify(p, null, 2)));
  (cross ?? []).forEach((c, i) => writeFileSync(join(cDir, `c${i}.json`), JSON.stringify(c, null, 2)));
  (sources ?? []).forEach((s, i) => writeFileSync(join(sDir, `s${i}.json`), JSON.stringify(s, null, 2)));
  (recipes ?? []).forEach((r, i) => writeFileSync(join(rDir, `r${i}.json`), JSON.stringify(r, null, 2)));
  return { root, env: { PROFILES_ROOT: pDir, CROSS_ROOT: cDir, SOURCES_ROOTS: sDir, RECIPES_ROOT: rDir } };
}

function runLinter(tree) {
  const r = spawnSync(process.execPath, [LINTER], {
    env: { ...process.env, ...tree.env },
    encoding: "utf8",
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

// ---- the cases -------------------------------------------------------------

const cases = [
  {
    name: "GREEN baseline — healthy literals must NOT alarm (false alarms kill linters)",
    tree: {
      profiles: [ORDER_PROFILE(), RESP_PROFILE],
      sources: [ORDER_SOURCE, RESP_SOURCE],
      cross: [CROSS_OK({ leftAttr: "status", eq: "fertig" })],
    },
    expectExit: 0,
  },
  {
    name: "RED — the 1,7-Mio-EUR bug: guard literal is not in the declared vocabulary",
    tree: {
      profiles: [
        ORDER_PROFILE({
          constraints: [
            {
              name: "open_order_has_qty",
              when: { attr: "status", op: "eq", value: "offen" }, // <- the corpse
              require: { attr: "qty", op: "gt", value: 0 },
              severity: "warning",
            },
          ],
        }),
        RESP_PROFILE,
      ],
      sources: [ORDER_SOURCE, RESP_SOURCE],
    },
    expectExit: 1,
    expectOut: ['"offen" does not occur', 'You probably meant "OPEN"', "filters NOTHING"],
  },
  {
    name: "RED — cross-constraint literal against a CONST-pinned source (proved offline, no DB)",
    tree: {
      profiles: [ORDER_PROFILE(), RESP_PROFILE],
      sources: [ORDER_SOURCE, RESP_SOURCE],
      cross: [CROSS_OK({ leftAttr: "status", ne: "offen" })], // <- qty_shortfall, exactly
    },
    expectExit: 1,
    expectOut: ["can NEVER occur", 'pins it to the constant "fertig"'],
  },
  {
    name: "RED — fail-closed: String guard on an attribute with NO declared vocabulary",
    tree: {
      profiles: [
        ORDER_PROFILE({ statusAttr: { enum: undefined } }), // enum key dropped below
        RESP_PROFILE,
      ],
      sources: [ORDER_SOURCE, RESP_SOURCE],
    },
    mutate: (t) => {
      delete t.profiles[0].attributes[0].enum;
      return t;
    },
    expectExit: 1,
    expectOut: ['declares no "enum"', "Fail-closed"],
  },
  {
    name: "RED — the declaration lies: a source can deliver a value the enum omits",
    tree: {
      profiles: [ORDER_PROFILE(), RESP_PROFILE],
      sources: [
        {
          ...ORDER_SOURCE,
          columnMappings: [
            { column: "order_no", smAttribute: "order_no", isId: true },
            // a total valueMap whose image contains INVOICED — not in the enum
            { column: "status", smAttribute: "status", valueMap: { OPEN: "OPEN", "*": "INVOICED" } },
          ],
        },
        RESP_SOURCE,
      ],
    },
    expectExit: 1,
    expectOut: ['can deliver "INVOICED"', "declaration is incomplete"],
  },
  {
    name: "RED — enum declares a value no source can ever deliver (fiction)",
    tree: {
      profiles: [
        {
          ...RESP_PROFILE,
          attributes: [
            { ...RESP_PROFILE.attributes[0], enum: ["fertig", "storniert"] }, // storniert: unreachable
            ...RESP_PROFILE.attributes.slice(1),
          ],
        },
        ORDER_PROFILE(),
      ],
      sources: [ORDER_SOURCE, RESP_SOURCE],
      cross: [CROSS_OK({ leftAttr: "status", eq: "fertig" })],
    },
    expectExit: 1,
    expectOut: ["no source can ever deliver it", "fiction"],
  },
  {
    name: "RED — type mismatch: a number compared against a String attribute",
    tree: {
      profiles: [
        ORDER_PROFILE({
          constraints: [
            {
              name: "bad_type",
              when: { attr: "status", op: "eq", value: 1 },
              require: { attr: "qty", op: "gt", value: 0 },
              severity: "warning",
            },
          ],
        }),
        RESP_PROFILE,
      ],
      sources: [ORDER_SOURCE, RESP_SOURCE],
    },
    expectExit: 1,
    expectOut: ["can never compare equal"],
  },
  {
    name: "GREEN — a recipe bound to a machine id that IS declared must not alarm",
    tree: {
      profiles: [ORDER_PROFILE(), RESP_PROFILE],
      sources: [ORDER_SOURCE, RESP_SOURCE, MACHINE_SOURCE],
      recipes: [RECIPE("sgm-004")],
    },
    expectExit: 0,
  },
  {
    name: "RED — the zero-pad trap: recipe matches machine 'sgm-04', the fleet knows 'sgm-004'",
    tree: {
      profiles: [ORDER_PROFILE(), RESP_PROFILE],
      sources: [ORDER_SOURCE, RESP_SOURCE, MACHINE_SOURCE],
      recipes: [RECIPE("sgm-04")], // <- band never resolves, silently
    },
    expectExit: 1,
    expectOut: ["is not a machine id declared in sources/", 'Did you mean "sgm-004"?', "never bind"],
  },
  {
    name: "RED — guard on an attribute that does not exist at all",
    tree: {
      profiles: [
        ORDER_PROFILE({
          constraints: [
            {
              name: "ghost_attr",
              when: { attr: "phaseName", op: "eq", value: "HOLD" },
              require: { attr: "qty", op: "gt", value: 0 },
              severity: "warning",
            },
          ],
        }),
        RESP_PROFILE,
      ],
      sources: [ORDER_SOURCE, RESP_SOURCE],
    },
    expectExit: 1,
    expectOut: ["does not exist"],
  },
];

// ---- run -------------------------------------------------------------------

let failed = 0;
for (const c of cases) {
  const spec = c.mutate ? c.mutate(structuredClone(c.tree)) : c.tree;
  const tree = buildTree(spec);
  const { code, out } = runLinter(tree);
  const problems = [];
  if (code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${code}`);
  for (const needle of c.expectOut ?? []) {
    if (!out.includes(needle)) problems.push(`expected the message to contain ${JSON.stringify(needle)}`);
  }
  rmSync(tree.root, { recursive: true, force: true });

  if (problems.length) {
    failed++;
    console.error(`✗ ${c.name}`);
    for (const p of problems) console.error(`    ${p}`);
    console.error(out.split("\n").map((l) => "    | " + l).join("\n"));
  } else {
    console.log(`✓ [exit ${code}] ${c.name}`);
  }
}

console.log(`\ntest-lint-vocabulary: ${cases.length - failed}/${cases.length} passed`);
if (failed) {
  console.error("FAIL — the gate does not bite. Do not trust it.");
  process.exit(1);
}
console.log("OK — a broken literal turns the build RED, a healthy one does not.");

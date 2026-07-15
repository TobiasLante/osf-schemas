#!/usr/bin/env node
// ci/test-lint-kpis.mjs — the KPI gate's own negative test.
//
// Same law as ci/test-lint-vocabulary.mjs: a linter nobody tested is a linter
// nobody can trust (this repo shipped FAKE-GREEN checks twice). So this test
//   - runs ci/lint-kpis.mjs as a SUBPROCESS and asserts on its EXIT CODE,
//   - drives it against fixture trees on disk (KPIS_ROOT / PROFILES_ROOT /
//     SOURCES_ROOTS),
//   - asserts BOTH directions: a healthy tree stays GREEN, and every way to
//     write a phantom input / dead literal / broken ref turns it RED with a
//     message that names the culprit.
//
// Run: node ci/test-lint-kpis.mjs     (exit 0 = the gate really bites)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const LINTER = new URL("./lint-kpis.mjs", import.meta.url).pathname;

// ---- fixture world ----------------------------------------------------------
// An abstract machine parent carrying the kpiRefs, two concrete children with
// DIFFERENT wire vocabularies (the real design tension), and sources that feed
// their counters — mirroring machine.json / IMM / CNC in miniature.

const PARENT = (kpiRefs = ["KPI-Test-Quality"]) => ({
  profileId: "SMProfile-TestMachine",
  displayName: "Test Machine (abstract)",
  parentType: null,
  abstract: true,
  attributes: [],
  kpiRefs,
});

const IMM = {
  profileId: "SMProfile-TestImm",
  displayName: "Test IMM",
  parentType: "TestMachine",
  abstract: false,
  attributes: [
    { name: "good", dataType: "Int32" },
    { name: "scrap", dataType: "Int32" },
    { name: "status", dataType: "String" }, // vocabulary NOT measured — no enum
  ],
  kpiRefs: [],
};

const CNC = {
  profileId: "SMProfile-TestCnc",
  displayName: "Test CNC",
  parentType: "TestMachine",
  abstract: false,
  attributes: [
    { name: "Act_Amount_PartGood", dataType: "Int32" },
    { name: "Act_Amount_PartScrap", dataType: "Int32" },
    { name: "Act_Amount_PartRework", dataType: "Int32" }, // declared, NOT fed
    { name: "Act_Status_Machine", dataType: "String", enum: ["RUNNING", "IDLE"] },
  ],
  kpiRefs: [],
};

const SRC_IMM = {
  sourceId: "test-imm-src",
  sourceType: "opcua",
  profileRef: "SMProfile-TestImm",
  nodeMappings: [
    { opcuaNodeId: "ns=1;s=M/good", smAttribute: "good" },
    { opcuaNodeId: "ns=1;s=M/scrap", smAttribute: "scrap" },
    { opcuaNodeId: "ns=1;s=M/status", smAttribute: "status" },
  ],
};

const SRC_CNC = {
  sourceId: "test-cnc-src",
  sourceType: "opcua",
  profileRef: "SMProfile-TestCnc",
  nodeMappings: [
    { opcuaNodeId: "ns=1;s=M/pg", smAttribute: "Act_Amount_PartGood" },
    { opcuaNodeId: "ns=1;s=M/ps", smAttribute: "Act_Amount_PartScrap" },
    { opcuaNodeId: "ns=1;s=M/st", smAttribute: "Act_Status_Machine" },
  ],
};

const QUALITY = (over = {}) => ({
  kpiId: "KPI-Test-Quality",
  version: "1.0.0",
  displayName: "Test Quality",
  unit: "%",
  calculation: {
    inputs: ["part_good", "part_scrap"],
    inputMappings: {
      "SMProfile-TestImm": { good: "part_good", scrap: "part_scrap" },
      "SMProfile-TestCnc": { Act_Amount_PartGood: "part_good", Act_Amount_PartScrap: "part_scrap" },
    },
    cypher:
      "CASE WHEN (m.part_good + m.part_scrap) = 0 THEN null ELSE round(toFloat(m.part_good) / (m.part_good + m.part_scrap) * 1000) / 10 END",
  },
  thresholds: { target: 99 },
  appliesTo: ["SMProfile-TestMachine"],
  ...over,
});

// CNC-only status KPI (availability in miniature)
const STATUS_KPI = (cypher, over = {}) => ({
  kpiId: "KPI-Test-Status",
  version: "1.0.0",
  displayName: "Test Status",
  unit: "%",
  calculation: {
    inputs: ["Act_Status_Machine"],
    inputMappings: { "SMProfile-TestCnc": { Act_Status_Machine: "Act_Status_Machine" } },
    cypher,
  },
  thresholds: {},
  appliesTo: ["SMProfile-TestCnc"],
  ...over,
});

function buildTree({ kpis, profiles, sources }) {
  const root = mkdtempSync(join(tmpdir(), "kpi-fixture-"));
  const kDir = join(root, "kpis");
  const pDir = join(root, "profiles");
  const sDir = join(root, "sources");
  for (const d of [kDir, pDir, sDir]) mkdirSync(d, { recursive: true });
  kpis.forEach((k, i) => writeFileSync(join(kDir, `k${i}.json`), JSON.stringify(k, null, 2)));
  profiles.forEach((p, i) => writeFileSync(join(pDir, `p${i}.json`), JSON.stringify(p, null, 2)));
  (sources ?? []).forEach((s, i) => writeFileSync(join(sDir, `s${i}.json`), JSON.stringify(s, null, 2)));
  return { root, env: { KPIS_ROOT: kDir, PROFILES_ROOT: pDir, SOURCES_ROOTS: sDir } };
}

function runLinter(tree) {
  const r = spawnSync(process.execPath, [LINTER], {
    env: { ...process.env, ...tree.env },
    encoding: "utf8",
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const BASE_PROFILES = [PARENT(), IMM, CNC];
const BASE_SOURCES = [SRC_IMM, SRC_CNC];

// ---- the cases ---------------------------------------------------------------

const cases = [
  {
    name: "GREEN baseline — canonical inputs, per-profile mappings, fed attributes",
    tree: {
      kpis: [
        QUALITY(),
        STATUS_KPI("CASE WHEN m.Act_Status_Machine = 'RUNNING' THEN 100.0 ELSE 0.0 END", {
          kpiId: "KPI-Test-Status",
        }),
      ],
      profiles: [PARENT(["KPI-Test-Quality", "KPI-Test-Status"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 0,
  },
  {
    name: "RED — the audit disease: mapping key is an attribute of NO profile (Good_Parts)",
    tree: {
      kpis: [
        QUALITY({
          calculation: {
            ...QUALITY().calculation,
            inputMappings: {
              "SMProfile-TestImm": { Good_Parts: "part_good", scrap: "part_scrap" },
              "SMProfile-TestCnc": QUALITY().calculation.inputMappings["SMProfile-TestCnc"],
            },
          },
        }),
      ],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['"Good_Parts" is NOT an attribute of SMProfile-TestImm', "audit disease", "never fires, silently"],
  },
  {
    name: "RED — an applicable profile has NO mapping at all",
    tree: {
      kpis: [
        QUALITY({
          calculation: {
            ...QUALITY().calculation,
            inputMappings: { "SMProfile-TestCnc": QUALITY().calculation.inputMappings["SMProfile-TestCnc"] },
          },
        }),
      ],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["no inputMappings entry for SMProfile-TestImm", "fail-closed"],
  },
  {
    name: "RED — dead status literal: 'PRODUCING' is not in the measured enum",
    tree: {
      kpis: [
        STATUS_KPI("CASE WHEN m.Act_Status_Machine IN ['RUNNING','PRODUCING'] THEN 100.0 ELSE 0.0 END"),
      ],
      profiles: [PARENT(["KPI-Test-Status"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['"PRODUCING" does not occur in SMProfile-TestCnc.Act_Status_Machine', "it is dead"],
  },
  {
    name: "RED — fail-closed: guard on a String attribute whose vocabulary is unmeasured (no enum)",
    tree: {
      kpis: [
        STATUS_KPI("CASE WHEN m.machine_status = 'RUNNING' THEN 100.0 ELSE 0.0 END", {
          calculation: {
            inputs: ["machine_status"],
            inputMappings: { "SMProfile-TestImm": { status: "machine_status" } },
            cypher: "CASE WHEN m.machine_status = 'RUNNING' THEN 100.0 ELSE 0.0 END",
          },
          appliesTo: ["SMProfile-TestImm"],
        }),
      ],
      profiles: [PARENT(["KPI-Test-Status"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['declares no "enum"', "no vocabulary, no guard"],
  },
  {
    name: "RED — the v1 availability trap: numeric literal against a String attribute",
    tree: {
      kpis: [STATUS_KPI("CASE WHEN m.Act_Status_Machine = 1 THEN 100.0 ELSE 0.0 END")],
      profiles: [PARENT(["KPI-Test-Status"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["can never compare equal"],
  },
  {
    name: "RED — kpiRef points at a KPI that does not exist",
    tree: {
      kpis: [QUALITY()],
      profiles: [PARENT(["KPI-Test-Quality", "KPI-Ghost"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['"KPI-Ghost" does not resolve'],
  },
  {
    name: "RED — vice versa: KPI applies to a profile whose chain never references it",
    tree: {
      kpis: [QUALITY()],
      profiles: [PARENT([]), IMM, CNC], // parent carries NO refs
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["kpiRefs", "never advertise"],
  },
  {
    name: "RED — mapping key is a real attribute but NO source feeds it (declared-but-never-delivered)",
    tree: {
      kpis: [
        QUALITY({
          calculation: {
            inputs: ["part_good", "part_scrap", "part_rework"],
            inputMappings: {
              "SMProfile-TestImm": { good: "part_good", scrap: "part_scrap", status: "part_rework" },
              "SMProfile-TestCnc": {
                Act_Amount_PartGood: "part_good",
                Act_Amount_PartScrap: "part_scrap",
                Act_Amount_PartRework: "part_rework", // attribute exists; feed does not
              },
            },
            cypher:
              "CASE WHEN (m.part_good + m.part_scrap + m.part_rework) = 0 THEN null ELSE round(toFloat(m.part_good) / (m.part_good + m.part_scrap + m.part_rework) * 1000) / 10 END",
          },
        }),
      ],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['"Act_Amount_PartRework" is an attribute of SMProfile-TestCnc, but it is fed by NO source'],
  },
  {
    name: "GREEN — parked KPI with an unfed input is legitimate (declared inertness)",
    tree: {
      kpis: [
        QUALITY(),
        STATUS_KPI("CASE WHEN coalesce(m.part_rework, 0) = 0 THEN null ELSE m.part_rework END", {
          kpiId: "KPI-Test-Rework",
          parked: true,
          parkedReason: "Act_Amount_PartRework is declared but fed by NO source (fixture).",
          calculation: {
            inputs: ["part_rework"],
            inputMappings: { "SMProfile-TestCnc": { Act_Amount_PartRework: "part_rework" } },
            cypher: "CASE WHEN coalesce(m.part_rework, 0) = 0 THEN null ELSE m.part_rework END",
          },
        }),
      ],
      profiles: [PARENT(["KPI-Test-Quality", "KPI-Test-Rework"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 0,
  },
  {
    name: "RED — the parking lie: parked, but every mapped input IS fed",
    tree: {
      kpis: [
        QUALITY({
          parked: true,
          parkedReason: "waiting for a feed that (fixture) actually exists",
        }),
      ],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["parked, but EVERY mapped input", "is a lie"],
  },
  {
    name: "RED — parked without parkedReason",
    tree: {
      kpis: [QUALITY({ parked: true })],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["parked without a parkedReason"],
  },
  {
    name: "RED — cypher reads m.<x> that is not a declared input (silent undefined at runtime)",
    tree: {
      kpis: [
        QUALITY({
          calculation: {
            ...QUALITY().calculation,
            cypher:
              "CASE WHEN (m.part_good + m.part_scrap + m.part_rework) = 0 THEN null ELSE m.part_good END",
          },
        }),
      ],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["cypher reads m.part_rework", "not a declared calculation.input"],
  },
  {
    name: "RED — declared input the cypher never reads (blocks the gate for nothing)",
    tree: {
      kpis: [
        QUALITY({
          calculation: {
            ...QUALITY().calculation,
            cypher: "CASE WHEN m.part_good = 0 THEN null ELSE m.part_good END",
          },
        }),
      ],
      profiles: BASE_PROFILES,
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['"part_scrap" is declared but never read'],
  },
  {
    name: "RED — string literal outside any comparison with m.<input> is unverifiable",
    tree: {
      kpis: [
        STATUS_KPI("CASE WHEN m.Act_Status_Machine = 'RUNNING' THEN 'HEALTHY' ELSE 0.0 END"),
      ],
      profiles: [PARENT(["KPI-Test-Status"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ['"HEALTHY"', "unverifiable literal"],
  },
  {
    name: "RED — inputMappings for a profile the KPI does not apply to (dead config)",
    tree: {
      kpis: [
        STATUS_KPI("CASE WHEN m.Act_Status_Machine = 'RUNNING' THEN 100.0 ELSE 0.0 END", {
          calculation: {
            inputs: ["Act_Status_Machine"],
            inputMappings: {
              "SMProfile-TestCnc": { Act_Status_Machine: "Act_Status_Machine" },
              "SMProfile-TestImm": { status: "Act_Status_Machine" },
            },
            cypher: "CASE WHEN m.Act_Status_Machine = 'RUNNING' THEN 100.0 ELSE 0.0 END",
          },
        }),
      ],
      profiles: [PARENT(["KPI-Test-Status"]), IMM, CNC],
      sources: BASE_SOURCES,
    },
    expectExit: 1,
    expectOut: ["does not apply to it", "dead config"],
  },
];

// ---- run ----------------------------------------------------------------------

let failed = 0;
for (const c of cases) {
  const tree = buildTree(c.tree);
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

console.log(`\ntest-lint-kpis: ${cases.length - failed}/${cases.length} passed`);
if (failed) {
  console.error("FAIL — the gate does not bite. Do not trust it.");
  process.exit(1);
}
console.log("OK — a phantom input turns the build RED, a healthy KPI does not.");

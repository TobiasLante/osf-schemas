#!/usr/bin/env node
// ci/test-lint-machine-identity.mjs
//
// Tests ci/lint-machine-identity.mjs against a fixture repo per failure mode. A
// linter nobody has watched fail is not a check — every ERROR code below is proven
// to fire, and the good case is proven to pass.
//
// Run:  node ci/test-lint-machine-identity.mjs   (or: npm run test:machine-identity)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const LINTER = join(ROOT, "ci", "lint-machine-identity.mjs");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** A minimal fixture repo: one source, one sync mapping, one registry. */
function fixture(machines, { sources, syncs } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mid-"));
  mkdirSync(join(dir, "mappings"), { recursive: true });
  mkdirSync(join(dir, "validation"), { recursive: true });
  mkdirSync(join(dir, "sources", "opcua"), { recursive: true });
  mkdirSync(join(dir, "sync", "nats"), { recursive: true });
  // the real schema — the fixture must be validated by the shipped one, not a copy
  cpSync(
    join(ROOT, "validation", "machine-identity-schema.json"),
    join(dir, "validation", "machine-identity-schema.json"),
  );
  for (const s of sources ?? [{ sourceId: "opcua-m1", machineId: "m1" }]) {
    writeFileSync(join(dir, "sources", "opcua", `${s.sourceId}.json`), JSON.stringify(s));
  }
  for (const s of syncs ?? []) {
    writeFileSync(join(dir, "sync", "nats", `${s.syncId}.json`), JSON.stringify(s));
  }
  writeFileSync(
    join(dir, "mappings", "machine-identity.json"),
    JSON.stringify({
      mapId: "machine-identity",
      version: "1.0.0",
      description: "fixture",
      machines,
    }),
  );
  return dir;
}

function run(dir) {
  try {
    const out = execFileSync("node", [LINTER], {
      env: { ...process.env, SCHEMAS_ROOT: dir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const ev = (extra = {}) => ({
  measured:
    "fixture evidence long enough to satisfy the schema's minLength, which exists so an identity " +
    "cannot be asserted without saying how it was measured",
  on: "2026-07-31",
  ...extra,
});

const good = [{ busMachineId: "m1", erpMachineRef: "M-1", mirrorOf: null, evidence: ev() }];

// ── the good case ───────────────────────────────────────────────────────────
{
  const d = fixture(good);
  const r = run(d);
  check("a clean registry passes", r.code === 0, r.out.trim());
  check("it reports the machine count", /1 machine\(s\)/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I1 schema ───────────────────────────────────────────────────────────────
{
  const d = fixture([{ busMachineId: "m1", erpMachineRef: "M-1", mirrorOf: null }]); // no evidence
  const r = run(d);
  check("I1 rejects an entry with no evidence", r.code === 1 && /I1/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}
{
  const d = fixture([
    { busMachineId: "m1", erpMachineRef: "M-1", mirrorOf: null, evidence: { measured: "too short", on: "2026-07-31" } },
  ]);
  const r = run(d);
  check("I1 rejects a thin evidence string", r.code === 1 && /I1/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I2 unknown bus id ───────────────────────────────────────────────────────
{
  const d = fixture([{ busMachineId: "ghost", erpMachineRef: "M-1", mirrorOf: null, evidence: ev() }]);
  const r = run(d);
  check("I2 rejects a busMachineId no source or sync declares", r.code === 1 && /I2/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I3 duplicate ────────────────────────────────────────────────────────────
{
  const d = fixture([...good, { ...good[0] }]);
  const r = run(d);
  check("I3 rejects a duplicated busMachineId", r.code === 1 && /I3/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I4 mirror target undeclared ─────────────────────────────────────────────
{
  const d = fixture([{ busMachineId: "m1", erpMachineRef: "M-1", mirrorOf: "m9", evidence: ev() }]);
  const r = run(d);
  check("I4 rejects a mirrorOf that is not itself an entry", r.code === 1 && /I4/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I5 self mirror ──────────────────────────────────────────────────────────
{
  const d = fixture([{ busMachineId: "m1", erpMachineRef: "M-1", mirrorOf: "m1", evidence: ev() }]);
  const r = run(d);
  check("I5 rejects a self-mirror", r.code === 1 && /I5/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I6 mirror chain ─────────────────────────────────────────────────────────
{
  const sources = [
    { sourceId: "opcua-m1", machineId: "m1" },
    { sourceId: "opcua-m2", machineId: "m2" },
    { sourceId: "opcua-m3", machineId: "m3" },
  ];
  const d = fixture(
    [
      { busMachineId: "m1", erpMachineRef: "M-3", mirrorOf: "m2", evidence: ev() },
      { busMachineId: "m2", erpMachineRef: "M-3", mirrorOf: "m3", evidence: ev() },
      { busMachineId: "m3", erpMachineRef: "M-3", mirrorOf: null, evidence: ev() },
    ],
    { sources },
  );
  const r = run(d);
  check("I6 rejects a mirror chain", r.code === 1 && /I6/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── I7 mirror disagrees about the ERP ref ───────────────────────────────────
{
  const sources = [
    { sourceId: "opcua-m1", machineId: "m1" },
    { sourceId: "opcua-m2", machineId: "m2" },
  ];
  const d = fixture(
    [
      { busMachineId: "m1", erpMachineRef: "M-1", mirrorOf: "m2", evidence: ev() },
      { busMachineId: "m2", erpMachineRef: "M-2", mirrorOf: null, evidence: ev() },
    ],
    { sources },
  );
  const r = run(d);
  check("I7 rejects a mirror booking under a different ERP ref", r.code === 1 && /I7/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── a null ERP ref is legal, and says so ────────────────────────────────────
{
  const d = fixture([{ busMachineId: "m1", erpMachineRef: null, mirrorOf: null, evidence: ev() }]);
  const r = run(d);
  check(
    "a machine with no proven ERP ref is accepted and counted",
    r.code === 0 && /1 without a proven ERP ref/.test(r.out),
    r.out.trim(),
  );
  rmSync(d, { recursive: true, force: true });
}

// ── W1: a declared bus machine the registry omits ───────────────────────────
{
  const sources = [
    { sourceId: "opcua-m1", machineId: "m1" },
    { sourceId: "opcua-m2", machineId: "m2" },
  ];
  const d = fixture(good, { sources });
  const r = run(d);
  check("W1 warns about an unmentioned bus machine without failing", r.code === 0 && /W1/.test(r.out), r.out.trim());
  rmSync(d, { recursive: true, force: true });
}

// ── the SOURCE→BUS join is honoured, not re-stated ───────────────────────────
{
  // A descriptor declaring source id 's1' that a sync mapping republishes as bus
  // 'b1' must make 'b1' the known id — and 's1' must NOT be demanded of the registry.
  const sources = [{ sourceId: "opcua-s1", machineId: "s1" }];
  const syncs = [
    { syncId: "opcua-to-nats-b1", machineId: "b1", source: { sourceRef: "opcua-s1" } },
  ];
  const d = fixture(
    [{ busMachineId: "b1", erpMachineRef: "B-1", mirrorOf: null, evidence: ev() }],
    { sources, syncs },
  );
  const r = run(d);
  check(
    "a sync mapping's bus id is accepted and the source id is not demanded",
    r.code === 0 && !/I2/.test(r.out) && !/W1\s+BUS machine 's1'/.test(r.out),
    r.out.trim(),
  );
  rmSync(d, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`test-lint-machine-identity: ${failures} failure(s)`);
  process.exit(1);
}
console.log("test-lint-machine-identity: all checks passed");

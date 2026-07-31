#!/usr/bin/env node
// ci/lint-machine-identity.mjs
//
// Guards mappings/machine-identity.json — the per-BUS-machine identity registry:
// which ERP `machine_ref` a machine's production orders are booked under, and
// whether an id is a second protocol view (a MIRROR) of a machine already present
// under another id.
//
// WHY THIS FILE EXISTS: both facts were hard-declared in consumer code
// (i3x-v4 services/golden-shift/src/machine-identity.ts) because this repo had no
// place for them. A machine's identity is a property of the machine, not of
// whichever service needs it, and a declaration living in one consumer is
// invisible to every other one.
//
// The checks below are the ones that would have caught a wrong entry. The registry
// is NOT self-validating: `sgm-006` books as `sgm-06` and `cnc-mtc-02` as `cnc-03`,
// so no naming rule can confirm an ERP ref from this repo alone. What CAN be
// checked is that every id is real, that mirrors are consistent, and that no entry
// asserts an identity without saying how it was measured.
//
// ERRORS (exit 1):
//   I1  registry missing / unparseable / fails validation/machine-identity-schema.json
//   I2  busMachineId is not a BUS id this repo declares (no source descriptor and no
//       sync mapping resolves to it)
//   I3  busMachineId appears twice
//   I4  mirrorOf names an id that is not itself a declared entry
//   I5  mirrorOf points at itself
//   I6  a mirror chain (a mirrors b, b mirrors c) — a mirror must name the CANONICAL
//       machine directly, or consumers deduplicate to different survivors
//   I7  a mirror and its target disagree about the ERP ref (or its alias set) — the
//       same physical machine cannot book its orders under two different refs
//   I8  an alias repeats the entry's own current erpMachineRef — a rename trail that
//       includes the destination says nothing and hides whether anyone looked
//   I9  two different machines claim the same ERP ref (as current ref or alias) —
//       the join is an equality over the union, so both machines would bind the same
//       orders and the output would be counted twice. Mirrors are exempt: a mirror
//       SHARING its target's ref is the whole point of a mirror.
//  I10  an entry declares aliases but its evidence never mentions one of them — an
//       identity claim without the measurement that established it, which is the one
//       thing this registry exists to prevent
//
// WARNINGS (reported, exit 0):
//   W1  a BUS machine this repo declares that the registry does not mention — its
//       consumers cannot bind orders for it (and will grey, which is honest, but the
//       gap should be visible)
//   W2  an entry carrying `note` — an unresolved discrepancy someone still owes a
//       decision on
//
// Run:  node ci/lint-machine-identity.mjs   (or: npm run validate:machine-identity)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

const ROOT = process.env.SCHEMAS_ROOT ?? process.cwd();
const REGISTRY = join(ROOT, "mappings", "machine-identity.json");
const SCHEMA = join(ROOT, "validation", "machine-identity-schema.json");
const SOURCE_DIRS = ["sources/opcua", "sources/mtconnect", "sources/modbus", "sources/rest"];
const SYNC_DIR = "sync/nats";

const errors = [];
const warnings = [];
const err = (code, msg) => errors.push(`${code}  ${msg}`);
const warn = (code, msg) => warnings.push(`${code}  ${msg}`);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { __error: e.message };
  }
}

/** The historical ERP refs of an entry, normalised to a sorted array of strings. */
function aliasesOf(m) {
  if (!Array.isArray(m.erpMachineRefAliases)) return [];
  return m.erpMachineRefAliases
    .filter((a) => typeof a === "string" && a.trim())
    .map((a) => a.trim())
    .sort();
}

function readJsonDir(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: `${dir}/${f}`, json: readJson(join(abs, f)) }))
    .filter((x) => !x.json.__error);
}

// ── the BUS ids this repo declares ──────────────────────────────────────────
// A source descriptor's `machineId` is a SOURCE id; a sync mapping's `machineId`
// is the BUS id it is published under, and its `source.sourceRef` names the
// descriptor it came from. Joining the two is how a source id becomes a bus id —
// the same join the consumers do, and the reason SOURCE→BUS is deliberately NOT
// restated in the registry.
const sources = readJsonDir(SOURCE_DIRS[0]).concat(
  ...SOURCE_DIRS.slice(1).map((d) => readJsonDir(d)),
);
const syncs = readJsonDir(SYNC_DIR);

const busIds = new Set();
const sourceIdToBus = new Map();
for (const { json } of syncs) {
  const bus = typeof json.machineId === "string" ? json.machineId.trim() : "";
  const ref = json.source && typeof json.source.sourceRef === "string" ? json.source.sourceRef.trim() : "";
  if (bus) {
    busIds.add(bus);
    if (ref) sourceIdToBus.set(ref, bus);
  }
}
for (const { json } of sources) {
  const declared = typeof json.machineId === "string" ? json.machineId.trim() : "";
  const sourceId = typeof json.sourceId === "string" ? json.sourceId.trim() : "";
  if (!declared) continue;
  // A descriptor whose sourceId a sync mapping re-publishes under another bus id
  // contributes THAT id; otherwise the source id IS the bus id.
  busIds.add(sourceIdToBus.get(sourceId) ?? declared);
}

// ── I1: the registry itself ─────────────────────────────────────────────────
const reg = readJson(REGISTRY);
if (reg.__error) {
  err("I1", `${REGISTRY} unreadable: ${reg.__error}`);
} else {
  const schema = readJson(SCHEMA);
  if (schema.__error) {
    err("I1", `${SCHEMA} unreadable: ${schema.__error}`);
  } else {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    if (!validate(reg)) {
      for (const e of validate.errors ?? []) {
        err("I1", `schema: ${e.instancePath || "/"} ${e.message}`);
      }
    }
  }
}

const machines = Array.isArray(reg.machines) ? reg.machines : [];
const byId = new Map();

for (const m of machines) {
  const id = typeof m.busMachineId === "string" ? m.busMachineId.trim() : "";
  if (!id) continue;

  if (byId.has(id)) err("I3", `busMachineId '${id}' is declared twice`);
  byId.set(id, m);

  if (busIds.size > 0 && !busIds.has(id)) {
    err(
      "I2",
      `busMachineId '${id}' is not a BUS id this repo declares — no source descriptor ` +
        `and no sync mapping resolves to it. Either the id is wrong or the machine's ` +
        `source is not committed.`,
    );
  }
}

for (const [id, m] of byId) {
  const target = typeof m.mirrorOf === "string" ? m.mirrorOf.trim() : null;
  if (!target) continue;

  if (target === id) {
    err("I5", `'${id}' declares itself as its own mirrorOf`);
    continue;
  }
  const t = byId.get(target);
  if (!t) {
    err(
      "I4",
      `'${id}'.mirrorOf = '${target}', which is not a declared entry — a mirror must ` +
        `name a machine this registry also describes`,
    );
    continue;
  }
  if (typeof t.mirrorOf === "string" && t.mirrorOf.trim()) {
    err(
      "I6",
      `mirror chain: '${id}' → '${target}' → '${t.mirrorOf}'. A mirror must name the ` +
        `CANONICAL machine directly; a chain lets two consumers deduplicate to ` +
        `different survivors.`,
    );
  }
  const a = m.erpMachineRef ?? null;
  const b = t.erpMachineRef ?? null;
  if (a !== b) {
    err(
      "I7",
      `'${id}' mirrors '${target}' but books orders under ${JSON.stringify(a)} while ` +
        `'${target}' books under ${JSON.stringify(b)} — one physical machine cannot have ` +
        `two ERP refs. One of the two measurements is wrong.`,
    );
  }
  // The alias set is part of the ref: a mirror that remembers a rename its target
  // forgot resolves to a different order set for the pre-flip half of a window.
  const aa = JSON.stringify(aliasesOf(m));
  const ba = JSON.stringify(aliasesOf(t));
  if (aa !== ba) {
    err(
      "I7",
      `'${id}' mirrors '${target}' but their historical ERP refs differ: ${aa} vs ${ba}. ` +
        `A rename applies to the physical machine, so both views must carry the same trail — ` +
        `otherwise the two ids bind different orders for the part of the window before the flip.`,
    );
  }
}

// ── I8/I9/I10: the rename trail ─────────────────────────────────────────────
// An alias widens an equality join, so a wrong one does not grey a bucket (which is
// visible) — it binds the WRONG order (which is not). Hence all three are errors.
const refClaims = new Map(); // ref (lowercased) → [{ id, kind }]
for (const [id, m] of byId) {
  const current = typeof m.erpMachineRef === "string" ? m.erpMachineRef.trim() : null;
  const aliases = aliasesOf(m);

  for (const alias of aliases) {
    if (current && alias.toLowerCase() === current.toLowerCase()) {
      err(
        "I8",
        `'${id}' lists '${alias}' as a historical ERP ref but that IS its current ` +
          `erpMachineRef — a rename trail that includes its own destination states nothing.`,
      );
    }
  }

  const measured = ((m.evidence && m.evidence.measured) || "").toLowerCase();
  for (const alias of aliases) {
    if (!measured.includes(alias.toLowerCase())) {
      err(
        "I10",
        `'${id}' declares the historical ERP ref '${alias}' but evidence.measured never ` +
          `mentions it — every identity claim in this registry must carry the measurement ` +
          `that established it, aliases included.`,
      );
    }
  }

  // A mirror legitimately shares its target's refs; it is the same machine.
  if (typeof m.mirrorOf === "string" && m.mirrorOf.trim()) continue;
  for (const ref of [...(current ? [current] : []), ...aliases]) {
    const key = ref.toLowerCase();
    if (!refClaims.has(key)) refClaims.set(key, []);
    refClaims.get(key).push({ id, kind: ref === current ? "current" : "historical" });
  }
}
for (const [ref, claims] of refClaims) {
  if (claims.length < 2) continue;
  err(
    "I9",
    `ERP ref '${ref}' is claimed by ${claims.length} machines that are not mirrors of one ` +
      `another: ${claims.map((c) => `${c.id} (${c.kind})`).join(", ")}. The order join is an ` +
      `equality over the union of current ref + aliases, so every one of them would bind the ` +
      `same orders and that output would be counted once per machine.`,
  );
}

// ── warnings ────────────────────────────────────────────────────────────────
for (const id of [...busIds].sort()) {
  if (!byId.has(id)) {
    warn(
      "W1",
      `BUS machine '${id}' is declared in sources/sync but not in the identity ` +
        `registry — no consumer can bind its production orders (it will grey, which is ` +
        `honest, but the gap is worth seeing)`,
    );
  }
}
for (const [id, m] of byId) {
  if (typeof m.note === "string" && m.note.trim()) {
    warn("W2", `'${id}' carries an unresolved note: ${m.note.slice(0, 160)}…`);
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const nullRefs = [...byId.values()].filter((m) => m.erpMachineRef === null).length;
const mirrors = [...byId.values()].filter((m) => m.mirrorOf).length;
const renamed = [...byId.values()].filter((m) => aliasesOf(m).length > 0).length;
console.log(
  `machine-identity: ${byId.size} machine(s), ${mirrors} mirror(s), ` +
    `${nullRefs} without a proven ERP ref, ${renamed} carrying a rename trail, ` +
    `${busIds.size} BUS id(s) declared in sources/sync`,
);
for (const w of warnings) console.log(`  WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`  ERROR ${e}`);
  console.error(`machine-identity: FAILED with ${errors.length} error(s)`);
  process.exit(1);
}
console.log("machine-identity: OK");

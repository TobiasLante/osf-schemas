#!/usr/bin/env node
// ci/lint-refs.mjs
//
// Cross-file referential-integrity linter for the source -> profile -> sync
// chain. The per-file JSON Schemas in validation/ only check each file's
// SHAPE — nothing verified that a profileRef/sourceRef actually resolves, or
// that a mapped smAttribute exists in the referenced profile. That gap is how
// the pre-next2.0 sync layer kept pointing at deleted profiles/sources for
// weeks without any linter going red (audit 2026-07-08).
//
// ERRORS (exit 1):
//   E1  source.profileRef does not resolve to a profile
//   E2  sync profileRef (top-level, kafka topic, webhook) does not resolve
//   E3  sync sourceRef (polling sources[], nats/bridge source/sink) does not resolve
//   E4  source mapping smAttribute not an attribute of the referenced profile
//   E5  sync attribute/payload mapping smAttribute not in the referenced profile
//   E6  hard dataType conflict source vs profile (after canonicalisation:
//       OPC NodeIds ns=0;i=NN, Float64/Double/Float, Int32/Int64 are unified)
//   E7  duplicate profileId / sourceId
//   E8  profile parentType does not resolve
//
// WARNINGS (reported, exit 0):
//   W1  file name != sourceId/syncId
//   W2  profile attribute delivered by NO source (coverage; only for profiles
//       that at least one source references)
//   W3  soft type normalisation (source Float -> profile Int, String -> DateTime)
//
// staticProperties are intentionally NOT checked: they are KG node properties
// set at provision time, not live profile attributes.
//
// Scans profiles/, sources/, sync/ — backup/ and node_modules/ are ignored.
// Run:  node ci/lint-refs.mjs      (or: npm run validate:refs)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.env.SCHEMAS_ROOT
  ? process.env.SCHEMAS_ROOT.replace(/\/$/, "")
  : new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const errors = [];
const warnings = [];

function walkJson(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const e of entries) {
    const rel = join(dir, e);
    const full = join(ROOT, rel);
    if (statSync(full).isDirectory()) out.push(...walkJson(rel));
    else if (e.endsWith(".json")) out.push(rel);
  }
  return out;
}
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

// ── profiles ────────────────────────────────────────────────────────────────
const profiles = new Map(); // profileId -> { file, attrs: Map<name,dataType>, parent }
const alias = new Map();

for (const rel of walkJson("profiles")) {
  if (basename(rel).startsWith("_")) continue; // skeleton fixture
  const d = readJson(rel);
  const pid = d.profileId ?? d.modelId;
  if (!pid) continue; // equipment-model etc. — no SM profile
  if (profiles.has(pid)) errors.push(`E7 duplicate profileId "${pid}": ${rel} and ${profiles.get(pid).file}`);
  const attrs = new Map();
  for (const a of d.attributes ?? []) attrs.set(a.name, a.dataType);
  profiles.set(pid, { file: rel, attrs, parent: d.parentType ?? null });
  for (const k of [d.displayName, d.kgNodeLabel]) if (k && !alias.has(k)) alias.set(k, pid);
  if (pid.startsWith("SMProfile-")) alias.set(pid.slice("SMProfile-".length), pid);
}

const resolveProfile = (ref) =>
  profiles.has(ref) ? ref
  : alias.has(ref) ? alias.get(ref)
  : profiles.has(`SMProfile-${ref}`) ? `SMProfile-${ref}`
  : null;

function effectiveAttrs(pid, seen = new Set()) {
  if (!pid || seen.has(pid)) return new Map();
  seen.add(pid);
  const p = profiles.get(pid);
  if (!p) return new Map();
  const out = new Map();
  if (p.parent) {
    const par = resolveProfile(p.parent);
    if (!par) errors.push(`E8 ${p.file}: parentType "${p.parent}" does not resolve`);
    else for (const [k, v] of effectiveAttrs(par, seen)) out.set(k, v);
  }
  for (const [k, v] of p.attrs) out.set(k, v);
  return out;
}

// ── type canonicalisation (three vocabularies in the tree) ─────────────────
const NODEID = { "ns=0;i=1": "BOOL", "ns=0;i=6": "INT", "ns=0;i=7": "INT", "ns=0;i=8": "INT",
  "ns=0;i=10": "FLOAT", "ns=0;i=11": "FLOAT", "ns=0;i=12": "STR", "ns=0;i=13": "DATETIME" };
const NAMED = { Boolean: "BOOL", Int32: "INT", Int64: "INT", UInt32: "INT",
  Float: "FLOAT", Float64: "FLOAT", Double: "FLOAT", String: "STR", DateTime: "DATETIME" };
const canon = (dt) => (dt == null ? null : NODEID[dt] ?? NAMED[dt] ?? dt);
const SOFT_OK = new Set(["FLOAT->INT", "STR->DATETIME"]);

// ── sources ─────────────────────────────────────────────────────────────────
const sources = new Map(); // sourceId -> { file, profileId, attrs: Map }
const delivered = new Map(); // profileId -> Set<attr>

for (const rel of walkJson("sources")) {
  const d = readJson(rel);
  const sid = d.sourceId;
  if (!sid) { errors.push(`E7 ${rel}: missing sourceId`); continue; }
  if (sources.has(sid)) errors.push(`E7 duplicate sourceId "${sid}": ${rel} and ${sources.get(sid).file}`);
  if (basename(rel, ".json") !== sid) warnings.push(`W1 ${rel}: file name != sourceId "${sid}"`);

  const attrs = new Map();
  for (const key of ["nodeMappings", "columnMappings", "dataItemMappings"])
    for (const m of d[key] ?? []) if (m.smAttribute) attrs.set(m.smAttribute, m.dataType ?? null);

  const pid = d.profileRef ? resolveProfile(d.profileRef) : null;
  if (d.profileRef && !pid) errors.push(`E1 ${rel}: profileRef "${d.profileRef}" does not resolve`);
  if (!d.profileRef) errors.push(`E1 ${rel}: missing profileRef`);
  sources.set(sid, { file: rel, profileId: pid, attrs });

  if (pid) {
    const ea = effectiveAttrs(pid);
    if (!delivered.has(pid)) delivered.set(pid, new Set());
    for (const [a, dt] of attrs) {
      delivered.get(pid).add(a);
      if (!ea.has(a)) { errors.push(`E4 ${rel} -> ${pid}: smAttribute "${a}" is not a profile attribute`); continue; }
      const cs = canon(dt), cp = canon(ea.get(a));
      if (cs && cp && cs !== cp) {
        if (SOFT_OK.has(`${cs}->${cp}`)) warnings.push(`W3 ${rel}: "${a}" ${dt} -> profile ${ea.get(a)} (soft normalisation)`);
        else errors.push(`E6 ${rel}: "${a}" source=${dt}(${cs}) vs profile=${ea.get(a)}(${cp})`);
      }
    }
  }
}

// ── sync ────────────────────────────────────────────────────────────────────
function* walkRefs(obj, path = "") {
  if (Array.isArray(obj)) { let i = 0; for (const v of obj) yield* walkRefs(v, `${path}[${i++}]`); }
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) { yield [path, k, v]; yield* walkRefs(v, `${path}.${k}`); }
}

function checkMappedAttrs(file, where, pid, attrNames) {
  const ea = effectiveAttrs(pid);
  for (const a of attrNames) if (!ea.has(a)) errors.push(`E5 ${file} ${where} -> ${pid}: mapped smAttribute "${a}" is not a profile attribute`);
}

const syncFiles = walkJson("sync");
for (const rel of syncFiles) {
  const d = readJson(rel);
  const sid = d.syncId ?? d.mappingId;
  if (sid && basename(rel, ".json").toLowerCase() !== String(sid).toLowerCase())
    warnings.push(`W1 ${rel}: file name != syncId "${sid}"`);

  for (const [path, k, v] of walkRefs(d)) {
    if (k === "sourceRef" && typeof v === "string" && !sources.has(v))
      errors.push(`E3 ${rel}${path}: sourceRef "${v}" does not resolve`);
    if (k === "profileRef" && typeof v === "string" && !resolveProfile(v))
      errors.push(`E2 ${rel}${path}: profileRef "${v}" does not resolve`);
  }

  const topPid = d.profileRef ? resolveProfile(d.profileRef) : null;
  if (topPid && d.attributeMapping?.mappings)
    checkMappedAttrs(rel, "attributeMapping", topPid, d.attributeMapping.mappings.map((m) => m.smAttribute).filter(Boolean));
  for (const t of d.kafka?.topics ?? []) {
    const pid = t.profileRef ? resolveProfile(t.profileRef) : topPid;
    if (pid && t.payloadMapping) checkMappedAttrs(rel, `topic ${t.topic}`, pid, Object.values(t.payloadMapping));
  }
  if (d.webhook?.payloadMapping) {
    const pid = d.webhook.profileRef ? resolveProfile(d.webhook.profileRef) : topPid;
    if (pid) checkMappedAttrs(rel, "webhook", pid, Object.values(d.webhook.payloadMapping));
  }
}

// ── coverage (W2) ───────────────────────────────────────────────────────────
for (const [pid, got] of delivered) {
  const missing = [...effectiveAttrs(pid).keys()].filter((a) => !got.has(a));
  if (missing.length)
    warnings.push(`W2 ${pid}: ${missing.length} attribute(s) delivered by no source: ${missing.join(", ")}`);
}

// ── report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.error(`  ✖ ${e}`);
console.log(`lint-refs: ${profiles.size} profiles, ${sources.size} sources, ${syncFiles.length} sync files — ${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length) { console.error("FAIL"); process.exit(1); }
console.log("OK");

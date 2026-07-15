#!/usr/bin/env node
// ci/lint-edges.mjs
//
// Source-edge vs. profile-relationship linter — FAIL-CLOSED.
//
// Why this exists: until 2026-07-15 NO linter compared the edges a source
// builds against the relationships its profile declares. That hole let
// erp-segment-requirements/-responses ship USES_EQUIPMENT/USED_EQUIPMENT
// edges with targetIdProp "unit_id" — a key that NO profile in the repo
// declares as kgIdProperty — so the KG builder's polymorphic target
// resolution matched nothing and the edges were a silent fleet-wide no-op.
// A guard against values that never arrive never fires and stays quiet
// (audit 2026-07-15, see contract.json identity.openConflict).
//
// For EVERY edge in sources/** (fail-closed — anything unprovable is an error):
//   E1  the source's profile (after parentType inheritance) must declare a
//       relationship of the same `type`
//   E2  where the profile relationship declares a `targetIdProp`, the source
//       edge's must be identical (any one declared value, if polymorphic)
//   E3  the edge's targetIdProp must resolve to at least one profile's
//       kgIdProperty — otherwise the edge can NEVER resolve in the graph
//   E0  structural fail-closed: edge without type/targetIdProp, source with
//       edges but no resolvable profileRef, unparseable JSON
//
// Scans profiles/ and sources/ — backup/ and node_modules/ are ignored.
// Run:  node ci/lint-edges.mjs      (or: npm run validate:edges)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.env.SCHEMAS_ROOT
  ? process.env.SCHEMAS_ROOT.replace(/\/$/, "")
  : new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const errors = [];

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

// ── profiles: relationships (with inheritance) + the set of real node keys ──
const profiles = new Map(); // profileId -> { file, rels: [], parent }
const alias = new Map();
const nodeKeys = new Set(); // every kgIdProperty declared by any profile

for (const rel of walkJson("profiles")) {
  if (basename(rel).startsWith("_")) continue; // skeleton fixture
  const d = readJson(rel);
  const pid = d.profileId;
  if (!pid) continue; // compact equipment model etc. — no SM profile
  profiles.set(pid, { file: rel, rels: d.relationships ?? [], parent: d.parentType ?? null });
  if (d.kgIdProperty) nodeKeys.add(d.kgIdProperty);
  for (const k of [d.displayName, d.kgNodeLabel]) if (k && !alias.has(k)) alias.set(k, pid);
  if (pid.startsWith("SMProfile-")) alias.set(pid.slice("SMProfile-".length), pid);
}

const resolveProfile = (ref) =>
  profiles.has(ref) ? ref
  : alias.has(ref) ? alias.get(ref)
  : profiles.has(`SMProfile-${ref}`) ? `SMProfile-${ref}`
  : null;

function effectiveRels(pid, seen = new Set()) {
  if (!pid || seen.has(pid)) return [];
  seen.add(pid);
  const p = profiles.get(pid);
  if (!p) return [];
  const out = [];
  if (p.parent) out.push(...effectiveRels(resolveProfile(p.parent), seen));
  out.push(...p.rels);
  return out;
}

// ── sources: every edge must be provable against its profile ───────────────
let sourceCount = 0;
let edgeCount = 0;

for (const rel of walkJson("sources")) {
  let d;
  try { d = readJson(rel); } catch (e) { errors.push(`E0 ${rel}: unparseable JSON (${e.message})`); continue; }
  sourceCount++;
  const edges = d.edges ?? [];
  if (!edges.length) continue;

  const pid = d.profileRef ? resolveProfile(d.profileRef) : null;
  if (!pid) {
    errors.push(`E0 ${rel}: has ${edges.length} edge(s) but profileRef "${d.profileRef ?? "(missing)"}" does not resolve — edges unverifiable`);
    continue;
  }
  const rels = effectiveRels(pid);

  for (const e of edges) {
    edgeCount++;
    if (!e.type) { errors.push(`E0 ${rel}: edge without "type": ${JSON.stringify(e)}`); continue; }

    // (1) the profile must declare a relationship of the same type
    const declared = rels.filter((r) => r.type === e.type);
    if (!declared.length) {
      errors.push(`E1 ${rel} -> ${pid}: edge type "${e.type}" is not a declared profile relationship (after inheritance)`);
      continue;
    }

    // (2) where the profile relationship declares a targetIdProp, it must match
    const declaredProps = [...new Set(declared.map((r) => r.targetIdProp).filter(Boolean))];
    if (declaredProps.length) {
      if (!e.targetIdProp) {
        errors.push(`E2 ${rel} -> ${pid}: edge "${e.type}" has no targetIdProp but the profile declares ${JSON.stringify(declaredProps)}`);
      } else if (!declaredProps.includes(e.targetIdProp)) {
        errors.push(`E2 ${rel} -> ${pid}: edge "${e.type}" targetIdProp "${e.targetIdProp}" != profile-declared ${JSON.stringify(declaredProps)}`);
      }
    }

    // (3) the targetIdProp must be a key some profile actually declares
    if (!e.targetIdProp) {
      errors.push(`E3 ${rel}: edge "${e.type}" has no targetIdProp — it can never resolve to a node`);
    } else if (!nodeKeys.has(e.targetIdProp)) {
      errors.push(`E3 ${rel}: edge "${e.type}" targetIdProp "${e.targetIdProp}" is NO profile's kgIdProperty — this edge can NEVER resolve (silent no-op)`);
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
for (const e of errors) console.error(`  ✖ ${e}`);
console.log(`lint-edges: ${profiles.size} profiles, ${sourceCount} sources, ${edgeCount} edge(s) checked — ${errors.length} error(s)`);
if (errors.length) { console.error("FAIL"); process.exit(1); }
console.log("OK");

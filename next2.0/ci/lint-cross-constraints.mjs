#!/usr/bin/env node
// next/ci/lint-cross-constraints.mjs
//
// Cross-reference linter for the CROSS-SOURCE 'cross-constraints' facet
// (CAPT-B Phase 2 Baustein 3 — next/cross-constraints/*.json). These rules
// compare TWO entities across a join key, so JSON Schema can't express:
//   - left/right.profileRef must reference an existing profile
//   - left/right.joinKey must be an attribute of the referenced profile
//   - left/right.attr (when set) must be an attribute of the referenced profile
//   - aggregate.attr / aggregate.filter.attr must exist on the RIGHT profile
//   - op ∈ {lt,lte,gt,gte,eq,ne}; aggregate rules need a threshold
// This script enforces all of the above against the next/-first profile set.
//
// Run:  node next/ci/lint-cross-constraints.mjs
// Exits non-zero on any error. Parked facets are linted too (so the contract
// stays valid), but a missing right-profile for a parked rule is a WARNING.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const OPS = new Set(["lt", "lte", "gt", "gte", "eq", "ne"]);
const AGG_FNS = new Set(["sum", "min", "max", "count"]);

// Roots: next/ overrides base. Profiles come from both tiers (next first).
const HERE = new URL(".", import.meta.url).pathname; // …/next/ci/
const NEXT = join(HERE, ".."); // …/next
const BASE = join(NEXT, ".."); // …/(repo root)
const FACET_DIR = process.env.CROSS_ROOT
  ? process.env.CROSS_ROOT.replace(/\/$/, "")
  : join(NEXT, "cross-constraints");

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

// Load all profiles, next/ first (first-seen per profileId wins).
function loadProfiles() {
  const byId = new Map();
  for (const root of [join(NEXT, "profiles"), join(BASE, "profiles")]) {
    for (const f of jsonFiles(root)) {
      let j;
      try {
        j = JSON.parse(readFileSync(f, "utf8"));
      } catch {
        continue;
      }
      if (!j.profileId || byId.has(j.profileId)) continue;
      byId.set(j.profileId, j);
    }
  }
  return byId;
}

// Merged attribute name set (own + parentType chain).
function attrNames(profileId, profiles) {
  const out = new Set();
  let p = profiles.get(profileId);
  const seen = new Set();
  while (p && !seen.has(p.profileId)) {
    seen.add(p.profileId);
    for (const a of p.attributes ?? []) out.add(a.name);
    if (!p.parentType) break;
    p =
      profiles.get(p.parentType) ||
      profiles.get(`SMProfile-${p.parentType}`) ||
      [...profiles.values()].find((x) => x.kgNodeLabel === p.parentType);
  }
  return out;
}

function lint() {
  const profiles = loadProfiles();
  const files = jsonFiles(FACET_DIR);
  const errors = [];
  const warnings = [];
  let checked = 0;

  for (const f of files) {
    let c;
    try {
      c = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      errors.push(`${f}: invalid JSON (${e.message})`);
      continue;
    }
    const id = c.crossConstraintId;
    if (!id) {
      errors.push(`${f}: missing crossConstraintId`);
      continue;
    }
    checked++;
    const label = `cross-constraint ${id}`;
    const parked = c.parked === true;
    const soft = parked ? warnings : errors;

    if (!OPS.has(c.op)) errors.push(`${label}: op "${c.op}" not in ${[...OPS].join(",")}`);

    for (const side of ["left", "right"]) {
      const s = c[side];
      if (!s || !s.profileRef) {
        errors.push(`${label}: ${side}.profileRef required`);
        continue;
      }
      const attrs = profiles.has(s.profileRef) ? attrNames(s.profileRef, profiles) : null;
      if (attrs === null) {
        soft.push(`${label}: ${side}.profileRef "${s.profileRef}" — profile not found`);
        continue;
      }
      if (!s.joinKey) errors.push(`${label}: ${side}.joinKey required`);
      else if (!attrs.has(s.joinKey)) {
        soft.push(`${label}: ${side}.joinKey "${s.joinKey}" not an attribute of ${s.profileRef}`);
      }
      if (s.attr !== undefined && !attrs.has(s.attr)) {
        soft.push(`${label}: ${side}.attr "${s.attr}" not an attribute of ${s.profileRef}`);
      }
    }

    if (c.when) {
      const w = c.when;
      if (!w.leftAttr) errors.push(`${label}: when.leftAttr required`);
      const hasEq = w.eq !== undefined;
      const hasNe = w.ne !== undefined;
      if (hasEq === hasNe) errors.push(`${label}: when needs exactly one of "eq" or "ne"`);
      const leftAttrs =
        c.left?.profileRef && profiles.has(c.left.profileRef)
          ? attrNames(c.left.profileRef, profiles)
          : null;
      if (leftAttrs && w.leftAttr && !leftAttrs.has(w.leftAttr)) {
        soft.push(`${label}: when.leftAttr "${w.leftAttr}" not an attribute of ${c.left.profileRef}`);
      }
    }

    if (c.aggregate) {
      const agg = c.aggregate;
      if (!AGG_FNS.has(agg.fn)) errors.push(`${label}: aggregate.fn "${agg.fn}" not in ${[...AGG_FNS].join(",")}`);
      const rightAttrs = c.right?.profileRef && profiles.has(c.right.profileRef)
        ? attrNames(c.right.profileRef, profiles)
        : null;
      if (rightAttrs) {
        if (agg.attr && !rightAttrs.has(agg.attr)) {
          soft.push(`${label}: aggregate.attr "${agg.attr}" not on right profile ${c.right.profileRef}`);
        }
        if (agg.filter?.attr && !rightAttrs.has(agg.filter.attr)) {
          soft.push(`${label}: aggregate.filter.attr "${agg.filter.attr}" not on right profile ${c.right.profileRef}`);
        }
      }
      if (c.threshold === undefined) errors.push(`${label}: aggregate rule requires a numeric threshold`);
    } else {
      // 1:1 rules compare left.attr <op> right.attr — both must be present.
      if (c.left && c.left.attr === undefined) errors.push(`${label}: 1:1 rule needs left.attr`);
      if (c.right && c.right.attr === undefined) errors.push(`${label}: 1:1 rule needs right.attr`);
    }
  }

  console.log(`lint-cross-constraints: scanned ${files.length} facets, checked ${checked}`);
  for (const w of warnings) console.warn("  ! " + w);
  if (errors.length) {
    console.error(`FAIL (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("OK");
}

lint();

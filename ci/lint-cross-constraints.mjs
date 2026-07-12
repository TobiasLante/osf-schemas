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
// ── GUARD SOUNDNESS (CAPT-QTY, 2026-07-12) — FAIL-CLOSED ────────────────────
// A `when` guard (and an `aggregate.filter`) exists to EXCLUDE rows. A guard
// that can never exclude anything — or that excludes everything — is not a
// guard: it is a lie that manufactures confidence. The rule enforced here:
//
//   A guard whose truth value is CONSTANT across every value the attribute can
//   actually take is not a guard → the build fails.
//
// This is not hypothetical. qty_shortfall guarded on `status ne "offen"` while
// its own source binds `status` to the CONSTANT 'fertig' ({const:'fertig'} —
// /api/confirmations has no status column). 'fertig' !== 'offen' is true for
// every row that has ever existed, so the guard never filtered once, and the
// rule produced 11.196 of 18.875 open findings (59 %) and €1.737.072 of phantom
// impact. The literal 'offen' occurs in NO layer of the source — it was copied
// from a profile description that had been invented rather than measured.
//
// The realizable value set V of (profile, attr) is derived, in order:
//   1. the profile attribute's `enum`, when declared (authoritative, measured);
//   2. else, if EVERY source bound to that profile maps the attribute with a
//      `const`, then V = { those consts } (closed);
//   3. else V is OPEN (a real column with an unmeasured vocabulary) → we cannot
//      decide, and we say so instead of guessing.
// Over a CLOSED V, `eq X` / `ne X` are checked for constancy and for X ∉ V.
//
// Severity: an ACTIVE rule with an unsound guard is an ERROR (the build fails).
// A `parked` or `retired` rule is inert, so its (documented) defect is a
// WARNING — but the moment anyone un-parks it, the guard check turns into an
// error and the build stops them. Fail-closed exactly where it matters.
//
// Run:  node ci/lint-cross-constraints.mjs
//       CROSS_ROOT=<dir> node ci/lint-cross-constraints.mjs   (lint a fixture)
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

// Load all SOURCES (next/ first), so we can see how an attribute is actually
// BOUND — a `const` binding pins the attribute to a literal for every row that
// source ever produces. That is what makes a guard over it a tautology.
function loadSources() {
  const byProfile = new Map(); // profileRef -> [source]
  for (const root of [join(NEXT, "sources"), join(BASE, "sources")]) {
    for (const f of jsonFiles(root)) {
      let j;
      try {
        j = JSON.parse(readFileSync(f, "utf8"));
      } catch {
        continue;
      }
      if (!j.profileRef) continue;
      const list = byProfile.get(j.profileRef) ?? [];
      list.push({ ...j, __file: f });
      byProfile.set(j.profileRef, list);
    }
  }
  return byProfile;
}

// Merged attribute descriptor (own + parentType chain) — we need `enum`, not
// just the name.
function attrDescriptor(profileId, attrName, profiles) {
  let p = profiles.get(profileId);
  const seen = new Set();
  while (p && !seen.has(p.profileId)) {
    seen.add(p.profileId);
    for (const a of p.attributes ?? []) if (a.name === attrName) return a;
    if (!p.parentType) break;
    p =
      profiles.get(p.parentType) ||
      profiles.get(`SMProfile-${p.parentType}`) ||
      [...profiles.values()].find((x) => x.kgNodeLabel === p.parentType);
  }
  return null;
}

/**
 * The set of values (profileId, attrName) can actually take.
 *   -> { closed: true,  values: Set, why: string }  when fully known
 *   -> { closed: false, values: null, why: string } when a real column with an
 *      unmeasured vocabulary feeds it (we refuse to guess).
 */
function realizableValues(profileId, attrName, profiles, sourcesByProfile) {
  const desc = attrDescriptor(profileId, attrName, profiles);
  if (desc && Array.isArray(desc.enum) && desc.enum.length) {
    return {
      closed: true,
      values: new Set(desc.enum),
      why: `profile ${profileId}.${attrName} declares enum [${desc.enum.join(", ")}]`,
    };
  }
  const sources = sourcesByProfile.get(profileId) ?? [];
  const consts = new Set();
  let sawColumn = false;
  let sawAnyBinding = false;
  for (const s of sources) {
    for (const m of s.columnMappings ?? []) {
      if (m.smAttribute !== attrName) continue;
      sawAnyBinding = true;
      if (m.const !== undefined) consts.add(m.const);
      else sawColumn = true;
    }
  }
  if (sawAnyBinding && !sawColumn && consts.size) {
    return {
      closed: true,
      values: consts,
      why: `every source bound to ${profileId} maps ${attrName} to a CONSTANT (${[...consts]
        .map((v) => JSON.stringify(v))
        .join(", ")}) — the attribute is a constant, not a discriminator`,
    };
  }
  return {
    closed: false,
    values: null,
    why: sawColumn
      ? `${profileId}.${attrName} is column-bound with no declared enum — vocabulary unmeasured (declare an "enum" on the profile attribute to make it checkable)`
      : `${profileId}.${attrName} has no source binding at all`,
  };
}

/**
 * Fail-closed guard check. `guard` is {eq} or {ne} against `literal`.
 * Returns a list of message strings (empty = sound).
 */
function checkGuard(label, what, profileId, attrName, guard, profiles, sourcesByProfile) {
  const msgs = [];
  const V = realizableValues(profileId, attrName, profiles, sourcesByProfile);
  if (!V.closed) {
    // Not an error: we simply cannot decide. Say so, don't guess.
    return { msgs, note: `${label}: ${what} not verifiable — ${V.why}` };
  }
  const hasEq = guard.eq !== undefined;
  const literal = hasEq ? guard.eq : guard.ne;
  const op = hasEq ? "eq" : "ne";
  const vals = [...V.values].map((v) => JSON.stringify(v)).join(", ");
  const inV = V.values.has(literal);
  const onlyV = V.values.size === 1 && inV;

  if (!inV) {
    // The filter value does not occur in the real vocabulary AT ALL.
    const effect = hasEq
      ? "the guard can NEVER match → the rule can never fire (silent false-negative)"
      : "the guard ALWAYS matches → it has never filtered a single row (phantom findings)";
    msgs.push(
      `${label}: ${what} ${op} ${JSON.stringify(literal)} — that value does NOT occur in the real vocabulary {${vals}}. ${effect}. [${V.why}]`,
    );
  } else if (onlyV) {
    // The literal is the ONLY value the attribute can take → still constant.
    const effect = hasEq
      ? "the guard ALWAYS matches → it never filters anything"
      : "the guard NEVER matches → the rule can never fire";
    msgs.push(
      `${label}: ${what} ${op} ${JSON.stringify(literal)} — but ${JSON.stringify(literal)} is the ONLY value this attribute can take {${vals}}. ${effect}. [${V.why}]`,
    );
  }
  return { msgs, note: null };
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
  const sourcesByProfile = loadSources();
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
    const retired = c.retired === true;
    // Inert = not evaluated by the it-evaluator. Its (documented) defects are
    // warnings; the moment it goes active they become build errors.
    const inert = parked || retired;
    const soft = inert ? warnings : errors;
    // A retired facet is a TOMBSTONE: it deliberately preserves the broken rule
    // as evidence, so it must carry its own postmortem.
    if (retired) {
      if (!c.retiredReason) errors.push(`${label}: retired facet needs a retiredReason (the tombstone must say why)`);
      if (!c.retiredAt) errors.push(`${label}: retired facet needs a retiredAt date`);
      if (!c.retirementId) {
        errors.push(`${label}: retired facet needs a retirementId (the superseded_by anchor the engine stamps on every closed episode)`);
      }
    }
    if (parked && retired) errors.push(`${label}: a facet is either parked or retired, not both`);

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
      } else if (c.left?.profileRef && w.leftAttr && hasEq !== hasNe) {
        // ── FAIL-CLOSED: is this guard capable of ever guarding anything? ──
        const { msgs, note } = checkGuard(
          label,
          `when.leftAttr "${w.leftAttr}" (on ${c.left.profileRef})`,
          c.left.profileRef,
          w.leftAttr,
          w,
          profiles,
          sourcesByProfile,
        );
        for (const m of msgs) soft.push(m);
        if (note) warnings.push(note);
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
        } else if (agg.filter?.attr && agg.filter.eq !== undefined) {
          // Same fail-closed test: an aggregate filter that can never exclude
          // (or never admit) a quant is not a filter.
          const { msgs, note } = checkGuard(
            label,
            `aggregate.filter.attr "${agg.filter.attr}" (on ${c.right.profileRef})`,
            c.right.profileRef,
            agg.filter.attr,
            agg.filter,
            profiles,
            sourcesByProfile,
          );
          for (const m of msgs) soft.push(m);
          if (note) warnings.push(note);
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

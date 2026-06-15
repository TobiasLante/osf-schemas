#!/usr/bin/env node
// next/ci/lint-constraints.mjs
//
// Cross-reference linter for the SDC-inspired 'constraints' attribute facet.
// JSON Schema cannot express:
//   - predicate.attr must reference an existing attribute (in the profile or
//     any ancestor via parentType)
//   - predicate.value type must match the referenced attribute.dataType
//   - if the referenced attribute has an 'enum', predicate.value (for op
//     eq/ne/in) must be drawn from it
// This script enforces all of the above.
//
// Run:  node next/ci/lint-constraints.mjs
// Exits non-zero on any error.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ROOT defaults to next/profiles/ relative to this script; override via
// PROFILES_ROOT env var (used by tests to point at fixture directories).
const ROOT = process.env.PROFILES_ROOT
  ? process.env.PROFILES_ROOT.replace(/\/$/, "") + "/"
  : new URL("../profiles/", import.meta.url).pathname;

// ---- Type checks -----------------------------------------------------------

const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string";
const isBool = (v) => typeof v === "boolean";
const isDateTime = (v) => isStr(v) && !Number.isNaN(Date.parse(v));

const TYPE_CHECK = {
  Int32: isInt,
  Int64: isInt,
  Float: isNum,
  Double: isNum,
  String: isStr,
  Boolean: isBool,
  DateTime: isDateTime,
  Json: () => true,
};

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// ---- Profile loading + inheritance resolution ------------------------------

function loadAllProfiles(rootDir) {
  const profiles = new Map(); // profileId -> profile
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (entry.endsWith(".json")) files.push(p);
    }
  }
  walk(rootDir);
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    if (!j.profileId) continue;
    if (profiles.has(j.profileId)) {
      throw new Error(`duplicate profileId ${j.profileId} (${f})`);
    }
    j.__file = f;
    profiles.set(j.profileId, j);
  }
  return profiles;
}

// Walk parentType chain — return merged attributes map (own overrides inherited)
function effectiveAttrs(profile, profiles) {
  const out = new Map();
  function add(p) {
    if (p.parentType) {
      // parentType is a kgNodeLabel-ish short name (e.g. "Machine") OR a profileId.
      // Try profileId direct first, then look up by kgNodeLabel.
      const parent =
        profiles.get(p.parentType) ||
        profiles.get(`SMProfile-${p.parentType}`) ||
        [...profiles.values()].find(
          (x) => x.kgNodeLabel === p.parentType || x.displayName === p.parentType
        );
      if (parent) add(parent);
      // missing parent is not fatal here — flagged separately if a constraint
      // references an attr that resolution would have supplied
    }
    for (const a of p.attributes ?? []) out.set(a.name, a);
  }
  add(profile);
  return out;
}

// ---- Predicate type-check --------------------------------------------------

function checkPredicateValue(pred, attr, attrs, label, errors) {
  // valueAttr: compare `attr` against ANOTHER attribute's live value (attr-vs-attr),
  // or the reserved token '$now' (current time). Mutually exclusive with `value`.
  if (pred.valueAttr !== undefined) {
    if (pred.value !== undefined) {
      errors.push(`${label}: predicate has both 'value' and 'valueAttr' (mutually exclusive)`);
    }
    if (pred.valueAttr === "$now") {
      if (attr.dataType !== "DateTime") {
        errors.push(
          `${label}: valueAttr "$now" requires attr "${attr.name}" dataType=DateTime (got ${attr.dataType})`
        );
      }
      return;
    }
    const other = attrs.get(pred.valueAttr);
    if (!other) {
      errors.push(`${label}: valueAttr "${pred.valueAttr}" not found (parentType chain searched)`);
      return;
    }
    if (other.dataType !== attr.dataType) {
      errors.push(
        `${label}: valueAttr "${pred.valueAttr}" dataType=${other.dataType} != attr "${attr.name}" dataType=${attr.dataType}`
      );
    }
    return;
  }

  const checker = TYPE_CHECK[attr.dataType];
  if (!checker) {
    errors.push(`${label}: unknown attribute.dataType "${attr.dataType}"`);
    return;
  }

  // Range ops expect arrays of the underlying type
  if (pred.op === "between") {
    if (!Array.isArray(pred.value) || pred.value.length !== 2) {
      errors.push(`${label}: op=between requires value=[lo,hi]`);
      return;
    }
    for (const v of pred.value) {
      if (!checker(v)) {
        errors.push(
          `${label}: between value ${JSON.stringify(v)} does not match attribute "${attr.name}" dataType=${attr.dataType}`
        );
      }
    }
    return;
  }

  if (pred.op === "in") {
    if (!Array.isArray(pred.value)) {
      errors.push(`${label}: op=in requires array value`);
      return;
    }
    for (const v of pred.value) {
      if (!checker(v)) {
        errors.push(
          `${label}: in value ${JSON.stringify(v)} does not match attribute "${attr.name}" dataType=${attr.dataType}`
        );
      }
    }
    // enum check
    if (Array.isArray(attr.enum)) {
      for (const v of pred.value) {
        if (!attr.enum.includes(v)) {
          errors.push(
            `${label}: in value ${JSON.stringify(v)} not in attribute "${attr.name}".enum=${JSON.stringify(attr.enum)}`
          );
        }
      }
    }
    return;
  }

  // Scalar ops
  if (!checker(pred.value)) {
    errors.push(
      `${label}: value ${JSON.stringify(pred.value)} (${typeOf(pred.value)}) does not match attribute "${attr.name}" dataType=${attr.dataType}`
    );
    return;
  }
  // enum check on eq/ne
  if ((pred.op === "eq" || pred.op === "ne") && Array.isArray(attr.enum)) {
    if (!attr.enum.includes(pred.value)) {
      errors.push(
        `${label}: value ${JSON.stringify(pred.value)} not in attribute "${attr.name}".enum=${JSON.stringify(attr.enum)}`
      );
    }
  }
}

// ---- Main ------------------------------------------------------------------

function lint() {
  const profiles = loadAllProfiles(ROOT);
  const errors = [];
  let checked = 0;

  for (const [pid, profile] of profiles) {
    if (!profile.constraints) continue;
    const attrs = effectiveAttrs(profile, profiles);

    for (const [cid, c] of Object.entries(profile.constraints)) {
      const baseLabel = `${pid} :: ${cid}`;
      checked++;

      for (const role of ["when", "require"]) {
        const pred = c[role];
        if (!pred) {
          if (role === "require") {
            errors.push(`${baseLabel}: missing 'require' predicate`);
          }
          continue;
        }
        const label = `${baseLabel} :: ${role}`;

        const attr = attrs.get(pred.attr);
        if (!attr) {
          const known = [...attrs.keys()].slice(0, 5).join(", ");
          errors.push(
            `${label}: attr "${pred.attr}" not found (parentType chain searched; known e.g. ${known}...)`
          );
          continue;
        }
        checkPredicateValue(pred, attr, attrs, label, errors);
      }
    }
  }

  console.log(`lint-constraints: scanned ${profiles.size} profiles, checked ${checked} constraints`);
  if (errors.length) {
    console.error(`FAIL (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("OK");
}

lint();

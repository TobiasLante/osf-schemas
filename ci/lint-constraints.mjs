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
  // valueFrom: reference an EXTERNAL spec value (active recipe / ISA-95
  // ProductDefinition) bound at runtime — resolved centrally by the it-evaluator,
  // not against a profile attribute. We only validate the reserved namespace and
  // mutual exclusivity here; the value's type is checked at bind time, not lint.
  if (pred.valueFrom !== undefined) {
    if (pred.value !== undefined || pred.valueAttr !== undefined) {
      errors.push(`${label}: predicate 'valueFrom' is mutually exclusive with 'value'/'valueAttr'`);
    }
    if (!/^(recipe|definition):[A-Za-z0-9_.-]+$/.test(pred.valueFrom)) {
      errors.push(
        `${label}: valueFrom "${pred.valueFrom}" must be a reserved spec ref (recipe:<param> / definition:<param>)`
      );
    }
    return;
  }
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

  // within_limits: two-tier control band (Warngrenze + Eingriffsgrenze).
  // The recipe-sourced (valueFrom) form is already handled above (returns early);
  // here we validate the LITERAL 'limits' {warn:[lo,hi], action:[lo,hi]} form:
  //   - both bands are numeric [lo,hi] of the attr dataType, lo <= hi
  //   - the warn band lies INSIDE the action band (action.lo <= warn.lo <= warn.hi <= action.hi)
  if (pred.op === "within_limits") {
    const lim = pred.limits;
    if (!lim || typeof lim !== "object" || Array.isArray(lim)) {
      errors.push(`${label}: op=within_limits requires 'limits' {warn:[lo,hi],action:[lo,hi]} or 'valueFrom'`);
      return;
    }
    for (const tier of ["warn", "action"]) {
      const band = lim[tier];
      if (!Array.isArray(band) || band.length !== 2) {
        errors.push(`${label}: limits.${tier} must be [lo,hi]`);
        return;
      }
      for (const v of band) {
        if (!checker(v)) {
          errors.push(
            `${label}: limits.${tier} value ${JSON.stringify(v)} does not match attribute "${attr.name}" dataType=${attr.dataType}`
          );
        }
      }
      if (isNum(band[0]) && isNum(band[1]) && band[0] > band[1]) {
        errors.push(`${label}: limits.${tier} lo>hi (${band[0]} > ${band[1]})`);
      }
    }
    const w = lim.warn, a = lim.action;
    if (
      Array.isArray(w) && Array.isArray(a) && w.length === 2 && a.length === 2 &&
      [w[0], w[1], a[0], a[1]].every(isNum)
    ) {
      if (!(a[0] <= w[0] && w[1] <= a[1])) {
        errors.push(
          `${label}: warn band [${w[0]},${w[1]}] must lie inside action band [${a[0]},${a[1]}] (Warngrenze ⊆ Eingriffsgrenze)`
        );
      }
    }
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

/**
 * CAPT-STURM — validate the PERSISTENCE policy (anti-chatter), if the rule declares one.
 *
 * JSON Schema already pins the shapes and ranges; what it cannot express is the two
 * cross-field invariants that make the policy MEAN anything:
 *
 *   k <= of                      — "3 of 2 samples" is not a run rule, it is a typo that
 *                                  would silently NEVER raise (fail-open: a rule that can
 *                                  never fire is worse than no rule, because it looks like
 *                                  a healthy machine).
 *   deadband_pct < 0.5           — a margin of half the band width or more leaves NO
 *                                  interior to clear into, so the episode could never
 *                                  close (fail-closed: a permanently-stuck alarm).
 *
 * Both are the same defect class as the storm this policy exists to kill: a rule whose
 * output is decided by its own arithmetic rather than by the machine.
 */
function checkPersistence(c, label, errors) {
  const p = c.persistence;
  if (p === undefined) return;
  if (typeOf(p) !== "object") {
    errors.push(`${label}: 'persistence' must be an object`);
    return;
  }
  const { raise: r, clear: cl } = p;

  if (r !== undefined) {
    if (typeOf(r) !== "object" || !Number.isInteger(r.k) || !Number.isInteger(r.of)) {
      errors.push(`${label}: persistence.raise must be {k:int, of:int}`);
    } else if (r.k < 1 || r.of < 1) {
      errors.push(`${label}: persistence.raise k/of must be >= 1 (got k=${r.k}, of=${r.of})`);
    } else if (r.k > r.of) {
      errors.push(
        `${label}: persistence.raise k=${r.k} > of=${r.of} — a "${r.k} of ${r.of}" run rule can NEVER be satisfied, so this constraint would never raise. A rule that cannot fire is indistinguishable from a healthy machine, which is the most dangerous output this system has.`
      );
    }
  }

  if (cl !== undefined) {
    if (typeOf(cl) !== "object") {
      errors.push(`${label}: persistence.clear must be an object`);
      return;
    }
    const db = cl.deadband_pct;
    if (db !== undefined) {
      if (typeof db !== "number" || Number.isNaN(db)) {
        errors.push(`${label}: persistence.clear.deadband_pct must be a number`);
      } else if (db < 0 || db >= 0.5) {
        errors.push(
          `${label}: persistence.clear.deadband_pct=${db} must be in [0, 0.5) — at >= 0.5 the dead-band from both sides meets in the middle and leaves no interior to clear into, so an open episode could never close.`
        );
      }
      // A dead-band is a fraction of the band WIDTH — it only means something where a
      // numeric band exists. Declaring one on e.g. `gte`/`gt` silently does nothing.
      const op = c.require?.op;
      if (db > 0 && op !== "between" && op !== "within_limits") {
        errors.push(
          `${label}: persistence.clear.deadband_pct=${db} declared on op='${op}', which has no band width to scale the margin from. A dead-band applies only to 'between' and 'within_limits'. Use persistence.clear.consecutive instead, or remove it — a policy that silently does nothing is a lie in the SSOT.`
        );
      }
    }
    const n = cl.consecutive;
    if (n !== undefined && (!Number.isInteger(n) || n < 1)) {
      errors.push(`${label}: persistence.clear.consecutive must be an integer >= 1 (got ${n})`);
    }
  }
}

function lint() {
  const profiles = loadAllProfiles(ROOT);
  const errors = [];
  let checked = 0;

  for (const [pid, profile] of profiles) {
    if (!profile.constraints) continue;
    const attrs = effectiveAttrs(profile, profiles);

    for (const [cid, c] of Object.entries(profile.constraints)) {
      // A `retired`/`parked` constraint is INERT — never evaluated by the engine.
      // Its `when` is preserved verbatim as a tombstone: evidence of the defect,
      // not configuration. Linting it would demand we repair a dead guard and so
      // destroy the record. Fail-closed still applies to every LIVE constraint.
      if (c.retired === true || c.parked === true) continue;
      // next2.0 `constraints` is an ARRAY of rules each carrying its own `name`, so
      // Object.entries() yields the ARRAY INDEX as the key. Reporting "SMProfile-… :: 7"
      // makes a failure unactionable — the author has to count elements to find the rule
      // they broke. Prefer the rule's own name; fall back to the index for the legacy
      // object-map shape (where the key IS the name).
      const baseLabel = `${pid} :: ${c.name ?? cid}`;
      checked++;

      checkPersistence(c, baseLabel, errors);

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

#!/usr/bin/env node
// next/ci/lint-recipes.mjs
//
// Cross-reference linter for GitHub-managed recipe master data under
// next/recipes/. JSON Schema (recipe-schema.json) pins the structure; this
// script enforces what it cannot:
//   - version is semver
//   - every `values` key is a reserved recipe:<param> / definition:<param> ref
//   - a [lo,hi] band is a 2-number tuple with lo <= hi
//   - `match` axes are non-empty strings
//   - no two recipes share an identical match AND a ref (one would silently
//     shadow the other — first-match-wins makes the second dead data)
//
// Run:  node next/ci/lint-recipes.mjs
// Exits non-zero on any error.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.RECIPES_ROOT
  ? process.env.RECIPES_ROOT.replace(/\/$/, "") + "/"
  : new URL("../recipes/", import.meta.url).pathname;

const REF_RE = /^(recipe|definition):[A-Za-z0-9_.-]+$/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function matchKey(match) {
  const m = match ?? {};
  return `a=${m.article ?? "*"}|e=${m.equipment ?? "*"}|s=${m.setup ?? "*"}`;
}

function lint() {
  if (!existsSync(ROOT)) {
    console.log(`lint-recipes: no recipes dir at ${ROOT} — nothing to check`);
    return;
  }
  const files = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  const errors = [];
  const ids = new Map(); // recipeId -> file
  // (matchKey + ref) -> file, to catch silent shadowing.
  const seenBindings = new Map();
  let refs = 0;

  for (const f of files) {
    const label = `next/recipes/${f}`;
    let r;
    try {
      r = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
    } catch (e) {
      errors.push(`${label}: invalid JSON — ${e.message}`);
      continue;
    }

    if (!r.recipeId || typeof r.recipeId !== "string") {
      errors.push(`${label}: missing recipeId`);
    } else if (ids.has(r.recipeId)) {
      errors.push(`${label}: duplicate recipeId "${r.recipeId}" (also ${ids.get(r.recipeId)})`);
    } else {
      ids.set(r.recipeId, label);
    }

    if (!SEMVER_RE.test(r.version ?? "")) {
      errors.push(`${label}: version "${r.version}" is not semver (x.y.z)`);
    }

    const match = r.match ?? {};
    for (const axis of ["article", "equipment", "setup"]) {
      if (match[axis] !== undefined && (typeof match[axis] !== "string" || match[axis].length === 0)) {
        errors.push(`${label}: match.${axis} must be a non-empty string`);
      }
    }

    const values = r.values ?? {};
    if (typeof values !== "object" || Array.isArray(values) || Object.keys(values).length === 0) {
      errors.push(`${label}: 'values' must be a non-empty object of recipe:<param> -> SpecValue`);
      continue;
    }
    // CAPT-TRUTH-ZUG3 — every band must say WHERE IT COMES FROM.
    // A band without provenance makes its own violations undecidable: sgm-004's
    // recipe_part_mass_band = [10.20, 10.45] fired 58,796 times against a process
    // centred at 10.400 g (sigma 0.0839, Cp 0.50) — is the RULE wrong or is the
    // PROCESS incapable? The measurements cannot say; only the ORIGIN of the number
    // can. A customer drawing may not be widened; a process estimate may.
    // `unknown` is a legal, honest answer — it is not an escape hatch: it marks the
    // band as un-changeable-without-evidence, which is the truth.
    const TOLERANCE_SOURCES = ["drawing", "customer_spec", "norm", "process_estimate", "unknown"];
    const provenance = r.toleranceSource;
    if (typeof provenance !== "object" || provenance === null || Array.isArray(provenance)) {
      errors.push(
        `${label}: missing 'toleranceSource' — every band must declare where its numbers come from ` +
          `(one of ${TOLERANCE_SOURCES.join(" / ")}, keyed by the same recipe:<param> refs as 'values')`,
      );
    }

    const mk = matchKey(match);
    for (const [ref, val] of Object.entries(values)) {
      refs++;
      if (!REF_RE.test(ref)) {
        errors.push(`${label}: values key "${ref}" must be a reserved ref (recipe:<param> / definition:<param>)`);
      }
      if (provenance && typeof provenance === "object" && !Array.isArray(provenance)) {
        const src = provenance[ref];
        if (src === undefined) {
          errors.push(`${label}: band "${ref}" has no toleranceSource — where does this number come from?`);
        } else if (!TOLERANCE_SOURCES.includes(src)) {
          errors.push(
            `${label}: toleranceSource["${ref}"] = "${src}" is not one of ${TOLERANCE_SOURCES.join(" / ")}`,
          );
        }
      }

      // CAPT-TRUTH-ZUG3.7 — every band must declare the capability it DEMANDS.
      // Cp answers "is this band holdable at all" (the RECIPE's obligation); Ca answers
      // "does the machine hit the nominal" (the MACHINE's obligation). They are
      // Process-Engineering policy and belong in the SSOT — a threshold compiled into a
      // service is a threshold nobody can change without a release.
      const cap = r.capability?.[ref];
      if (!cap || typeof cap !== "object") {
        errors.push(
          `${label}: band "${ref}" has no capability — declare { cp_min, ca_max } (what must the band hold, and how well must the machine hit it?)`,
        );
      } else {
        if (typeof cap.cp_min !== "number" || !(cap.cp_min > 0)) {
          errors.push(`${label}: capability["${ref}"].cp_min must be a positive number`);
        }
        if (typeof cap.ca_max !== "number" || cap.ca_max < 0 || cap.ca_max > 1) {
          errors.push(`${label}: capability["${ref}"].ca_max must be between 0 and 1`);
        }
      }
      if (Array.isArray(val)) {
        if (val.length === 2 && val.every(isNum)) {
          if (val[0] > val[1]) errors.push(`${label}: band "${ref}" = [${val}] has lo > hi`);
        } else if (val.length === 0) {
          errors.push(`${label}: value "${ref}" is an empty array`);
        }
      }
      const bindKey = `${mk}::${ref}`;
      if (seenBindings.has(bindKey)) {
        errors.push(
          `${label}: match ${mk} + ref "${ref}" already bound by ${seenBindings.get(bindKey)} — second is dead data (first-match-wins)`,
        );
      } else {
        seenBindings.set(bindKey, label);
      }
    }

    // Provenance / capability for a band that does not exist is dead data — and worse,
    // it reads like the band IS covered. Catch the drift when a band is renamed or removed.
    for (const [block, name] of [
      [provenance, "toleranceSource"],
      [r.capability, "capability"],
    ]) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      for (const ref of Object.keys(block)) {
        if (!(ref in values)) {
          errors.push(`${label}: ${name}["${ref}"] has no matching band in 'values' — dead entry`);
        }
      }
    }
  }

  console.log(`lint-recipes: scanned ${files.length} recipe files, checked ${refs} refs`);
  if (errors.length) {
    console.error(`FAIL (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("OK");
}

lint();

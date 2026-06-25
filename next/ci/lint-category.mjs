#!/usr/bin/env node
// next/ci/lint-category.mjs
//
// Category <-> folder placement linter for the unified profile standard.
//
// With one meta-schema keyed on the required 'category' field, the FOLDER a
// profile lives in must agree with its declared category — otherwise a misfiled
// profile validates structurally but is routed wrong by every downstream
// consumer (KG-Builder labels, edge vs it-edge acquisition, the Ops/Data lanes).
// JSON Schema can't express "this file's path implies this category", so we lint
// it here.
//
// Folder -> required category:
//   profiles/machines/**        -> "machine"
//   profiles/equipment/**       -> "equipment"
//   profiles/operations/**      -> "business"
//   profiles/{erp,qms,wms}/**   -> "business"
//   profiles/intelligence/**    -> SKIPPED (own canonical schema, out of scope)
//
// Files directly under profiles/ (no category folder) — e.g. the skeleton
// template fixture — are SKIPPED (they declare a category but belong to no lane).
//
// Run:  node next/ci/lint-category.mjs
// Exits non-zero on any mismatch.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.env.PROFILES_ROOT
  ? process.env.PROFILES_ROOT.replace(/\/$/, "")
  : new URL("../profiles", import.meta.url).pathname.replace(/\/$/, "");

// First path segment under profiles/ -> required category. null = SKIP.
const FOLDER_CATEGORY = {
  machines: "machine",
  equipment: "equipment",
  operations: "business",
  erp: "business",
  qms: "business",
  wms: "business",
  intelligence: null, // own canonical schema — out of scope
};

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".json")) out.push(p);
  }
  return out;
}

function lint() {
  const files = walk(ROOT);
  const errors = [];
  let checked = 0;
  let skipped = 0;

  for (const f of files) {
    const rel = relative(ROOT, f);
    const segs = rel.split(sep);
    // Files directly under profiles/ (no category subfolder) — skeleton/fixtures.
    if (segs.length < 2) {
      skipped++;
      continue;
    }
    const folder = segs[0];
    if (!(folder in FOLDER_CATEGORY)) {
      errors.push(`${rel}: unknown profiles/ subfolder "${folder}/" — extend FOLDER_CATEGORY in lint-category.mjs`);
      continue;
    }
    const expected = FOLDER_CATEGORY[folder];
    if (expected === null) {
      skipped++; // intelligence/ — out of scope
      continue;
    }

    let j;
    try {
      j = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid JSON — ${e.message}`);
      continue;
    }
    if (!j.profileId) {
      // non-profile artifact under a category folder — ignore
      skipped++;
      continue;
    }
    checked++;
    if (j.category !== expected) {
      errors.push(
        `${rel}: category "${j.category ?? "<missing>"}" does not match folder "${folder}/" (expected "${expected}")`,
      );
    }
  }

  console.log(`lint-category: scanned ${files.length} files, checked ${checked} profiles (${skipped} skipped: fixtures + intelligence/)`);
  if (errors.length) {
    console.error(`FAIL (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("OK");
}

lint();

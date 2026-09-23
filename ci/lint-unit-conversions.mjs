#!/usr/bin/env node
// ci/lint-unit-conversions.mjs
//
// Guards the unit conversion table in unit-conversions/conversions.json.
//
// ERRORS (exit 1):
//   U1  from or to is not a key of codes in validation/unece-codes.json
//   U2  a from/to pair appears twice
//   U3  scale is 0
//
// Run:  node ci/lint-unit-conversions.mjs   (or: npm run validate:unit-conversions)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.SCHEMAS_ROOT
  ? process.env.SCHEMAS_ROOT.replace(/\/$/, "")
  : new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FILE = process.env.UNIT_CONVERSIONS_FILE ?? "unit-conversions/conversions.json";
const CODES_FILE = join(ROOT, "validation", "unece-codes.json");

const errors = [];

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    errors.push(`${code}  ${path}: ${e.message}`);
    return null;
  }
}

const codes = readJson(CODES_FILE, "U1");
if (!codes || !codes.codes) {
  console.error("FATAL: could not load validation/unece-codes.json");
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

// UNIT_CONVERSIONS_FILE may be an absolute path (the oracle plants temp files
// outside the repo); only resolve relative paths against ROOT.
const conversions = readJson(FILE.startsWith("/") ? FILE : join(ROOT, FILE), "U1");
if (!conversions || !Array.isArray(conversions.conversions)) {
  if (errors.length === 0) errors.push(`U1  ${FILE}: missing or invalid conversions array`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const seenPairs = new Map();

for (const [i, c] of conversions.conversions.entries()) {
  const from = c.from;
  const to = c.to;
  const scale = c.scale;

  if (!codes.codes[from]) {
    errors.push(`U1  conversion[${i}]: from "${from}" is not a valid UNECE code.`);
  }
  if (!codes.codes[to]) {
    errors.push(`U1  conversion[${i}]: to "${to}" is not a valid UNECE code.`);
  }

  const key = `${from}->${to}`;
  if (seenPairs.has(key)) {
    errors.push(`U2  duplicate from/to pair: ${from} -> ${to} (entries ${seenPairs.get(key)} and ${i}).`);
  } else {
    seenPairs.set(key, i);
  }

  if (scale === 0) {
    errors.push(`U3  conversion[${i}]: scale is 0 for ${from} -> ${to}.`);
  }
}

if (errors.length) {
  console.error("\nunit-conversions lint failed:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(`  ok  unit-conversions: ${conversions.conversions.length} conversions`);
console.log("unit-conversions lint passed.");

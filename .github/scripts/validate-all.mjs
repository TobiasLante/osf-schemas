#!/usr/bin/env node
// osf-schemas ajv validator — scans profiles/, sources/, sync/ and runs them
// against the matching schema in validation/.  Exits non-zero on any failure.
//
// Route table (path-prefix → validator schema in validation/):
//   profiles/machines/      → machine-profile-schema.json
//   profiles/business/      → business-profile-schema.json
//   profiles/intelligence/  → intelligence-profile-schema.json
//   sources/postgresql/it-* → it-edge-source-schema.json
//
// Files outside these prefixes are loaded + JSON-parsed only ("smoke" check)
// so a typo in any JSON still fails the run.  Counts are reported per bucket.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();

const VALIDATORS = [
  {
    name: 'machine-profile',
    schemaFile: 'validation/machine-profile-schema.json',
    match: (rel) => rel.startsWith('profiles/machines/') && rel.endsWith('.json'),
  },
  {
    name: 'business-profile',
    schemaFile: 'validation/business-profile-schema.json',
    match: (rel) => rel.startsWith('profiles/business/') && rel.endsWith('.json'),
  },
  {
    name: 'intelligence-profile',
    schemaFile: 'validation/intelligence-profile-schema.json',
    match: (rel) => rel.startsWith('profiles/intelligence/') && rel.endsWith('.json'),
  },
  {
    name: 'it-edge-source',
    schemaFile: 'validation/it-edge-source-schema.json',
    match: (rel) =>
      rel.startsWith('sources/postgresql/') &&
      basename(rel).startsWith('it-') &&
      rel.endsWith('.json'),
  },
];

// Bookkeeping
const counts = {};
const failures = [];

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Pre-compile validators (only those with an actual schema)
for (const v of VALIDATORS) {
  try {
    const schema = JSON.parse(readFileSync(join(ROOT, v.schemaFile), 'utf8'));
    v.validate = ajv.compile(schema);
    counts[v.name] = { ok: 0, fail: 0 };
  } catch (err) {
    console.error(`FATAL: could not load ${v.schemaFile}: ${err.message}`);
    process.exit(2);
  }
}
counts['json-only'] = { ok: 0, fail: 0 };

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (s.isFile()) out.push(p);
  }
  return out;
}

const targets = ['profiles', 'sources', 'sync'].flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

for (const abs of targets) {
  const rel = relative(ROOT, abs);
  if (!rel.endsWith('.json')) continue;

  // Parse JSON first
  let doc;
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    failures.push({ file: rel, validator: 'json-parse', errors: [err.message] });
    counts['json-only'].fail++;
    continue;
  }

  const v = VALIDATORS.find((x) => x.match(rel));
  if (!v) {
    counts['json-only'].ok++;
    continue;
  }

  const ok = v.validate(doc);
  if (ok) {
    counts[v.name].ok++;
  } else {
    counts[v.name].fail++;
    failures.push({
      file: rel,
      validator: v.name,
      errors: v.validate.errors.map(
        (e) => `${e.instancePath || '/'}: ${e.message}`
      ),
    });
  }
}

console.log('osf-schemas validation report');
console.log('=============================');
for (const [k, c] of Object.entries(counts)) {
  console.log(`  ${k.padEnd(20)} ok=${c.ok}  fail=${c.fail}`);
}
console.log();

if (failures.length === 0) {
  console.log(`PASS — ${targets.length} files scanned, 0 failures.`);
  process.exit(0);
}

console.log(`FAIL — ${failures.length} file(s) did not validate:`);
for (const f of failures) {
  console.log(`\n  ${f.file}  [${f.validator}]`);
  for (const e of f.errors.slice(0, 10)) console.log(`    - ${e}`);
  if (f.errors.length > 10) console.log(`    (+${f.errors.length - 10} more)`);
}
process.exit(1);

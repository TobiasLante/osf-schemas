#!/usr/bin/env node
// osf-schemas ajv validator — scans profiles/, sources/, sync/, recipes/,
// mappings/ and runs every file against the matching schema in validation/.
// Exits non-zero on any failure.
//
// Route table (path-prefix → validator schema in validation/):
//   profiles/machines/            → machine-profile-schema.json   (shim → unified)
//   profiles/{erp,qms,wms,operations}/ → business-profile-schema.json (shim → unified)
//   profiles/equipment/           → equipment-profile-schema.json (shim → unified)
//   profiles/intelligence/        → intelligence-profile-schema.json
//   sources/**/it-*               → it-edge-source-schema.json
//   sources/**                    → source-schema.json
//   sync/**                       → sync-schema.json
//   recipes/**                    → recipe-schema.json
//   mappings/mtconnect-dataitem-map.json  → mtconnect-dataitem-map-schema.json
//   mappings/machine-type-aliases.json   → machine-type-alias-schema.json
//   (any other mappings/*.json is an ERROR — add a route + meta-schema)
//
// All validation/*.json carrying an $id are pre-registered so the category
// shims can $ref profile-unified-schema.json + constraint-schema.json.
// Files outside the routes (and _-prefixed fixtures / equipment-model files
// without a profileId) are loaded + JSON-parsed only ("smoke" check) so a
// typo in any JSON still fails the run.  Counts are reported per bucket.
//
// NOTE: referential integrity (profileRef/sourceRef/attribute existence) is
// NOT this script's job — that is ci/lint-refs.mjs (npm run validate:refs).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();

const VALIDATORS = [
  {
    name: 'machine-profile',
    schemaFile: 'validation/machine-profile-schema.json',
    match: (rel, doc) => rel.startsWith('profiles/machines/') && doc.profileId,
  },
  {
    name: 'business-profile',
    schemaFile: 'validation/business-profile-schema.json',
    match: (rel, doc) =>
      /^profiles\/(erp|qms|wms|operations)\//.test(rel) && doc.profileId,
  },
  {
    name: 'equipment-profile',
    schemaFile: 'validation/equipment-profile-schema.json',
    match: (rel, doc) => rel.startsWith('profiles/equipment/') && doc.profileId,
  },
  {
    name: 'intelligence-profile',
    schemaFile: 'validation/intelligence-profile-schema.json',
    match: (rel) => rel.startsWith('profiles/intelligence/'),
  },
  {
    name: 'it-edge-source',
    schemaFile: 'validation/it-edge-source-schema.json',
    match: (rel) => rel.startsWith('sources/') && basename(rel).startsWith('it-'),
  },
  {
    name: 'source',
    schemaFile: 'validation/source-schema.json',
    match: (rel) => rel.startsWith('sources/'),
  },
  {
    name: 'sync',
    schemaFile: 'validation/sync-schema.json',
    match: (rel) => rel.startsWith('sync/'),
  },
  {
    name: 'recipe',
    schemaFile: 'validation/recipe-schema.json',
    match: (rel) => rel.startsWith('recipes/'),
  },
  // mappings/ routes by FILENAME, not by prefix. It used to be
  // `rel.startsWith('mappings/')`, which was fine while the directory held
  // exactly one file and wrong the moment it held two: the second mapping was
  // validated against the MTConnect canon's schema and failed on its own shape.
  {
    name: 'mtconnect-dataitem-map',
    schemaFile: 'validation/mtconnect-dataitem-map-schema.json',
    match: (rel) => rel === 'mappings/mtconnect-dataitem-map.json',
  },
  {
    name: 'machine-type-aliases',
    schemaFile: 'validation/machine-type-alias-schema.json',
    match: (rel) => rel === 'mappings/machine-type-aliases.json',
  },
];

// Bookkeeping
const counts = {};
const failures = [];

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Pre-register every validation schema that carries an $id, so cross-file
// $refs (category shim → profile-unified-schema.json → constraint-schema.json)
// resolve without network I/O.
for (const entry of readdirSync(join(ROOT, 'validation'))) {
  if (!entry.endsWith('.json')) continue;
  try {
    const schema = JSON.parse(readFileSync(join(ROOT, 'validation', entry), 'utf8'));
    if (schema.$id) ajv.addSchema(schema);
  } catch (err) {
    console.error(`FATAL: could not parse validation/${entry}: ${err.message}`);
    process.exit(2);
  }
}

// Compile validators (shims are already registered — getSchema returns the
// compiled validator; compile() would re-add and collide on the $id).
for (const v of VALIDATORS) {
  try {
    const schema = JSON.parse(readFileSync(join(ROOT, v.schemaFile), 'utf8'));
    v.validate = schema.$id ? ajv.getSchema(schema.$id) : ajv.compile(schema);
    if (!v.validate) throw new Error(`no compiled schema for ${schema.$id}`);
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

const targets = ['profiles', 'sources', 'sync', 'recipes', 'mappings'].flatMap((d) => {
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

  // _-prefixed fixtures (skeleton templates) are copy-templates, not instances.
  const v = basename(rel).startsWith('_')
    ? undefined
    : VALIDATORS.find((x) => x.match(rel, doc));
  if (!v) {
    // A mapping is a canon that services read as SSOT. Unrouted, it would
    // "smoke pass" on JSON.parse alone and ship unvalidated — so demand a route.
    if (rel.startsWith('mappings/') && !basename(rel).startsWith('_')) {
      failures.push({
        file: rel,
        validator: 'unrouted',
        errors: ['no schema route — add one to VALIDATORS and a meta-schema under validation/'],
      });
      counts['json-only'].fail++;
      continue;
    }
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

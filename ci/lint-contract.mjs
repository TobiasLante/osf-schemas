#!/usr/bin/env node
// lint-contract.mjs — CI drift check: contract.json must exactly match the
// output of ci/gen-contract.mjs over the current profiles/**. Fails red when a
// profile change was committed without regenerating the contract.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(ROOT, 'contract.json');
if (!fs.existsSync(file)) { console.error('contract.json missing — run: node ci/gen-contract.mjs'); process.exit(1); }
const before = fs.readFileSync(file, 'utf8');
try {
  execFileSync(process.execPath, [path.join(ROOT, 'ci', 'gen-contract.mjs')], { stdio: 'pipe' });
  const after = fs.readFileSync(file, 'utf8');
  if (before !== after) {
    fs.writeFileSync(file, before); // restore committed state so the diff is visible locally
    console.error('contract.json is stale — profiles changed without regenerating. Run: node ci/gen-contract.mjs');
    process.exit(1);
  }
  console.log('contract.json is in sync with profiles/**');
} catch (e) {
  fs.writeFileSync(file, before);
  console.error('gen-contract failed:', e.message);
  process.exit(1);
}

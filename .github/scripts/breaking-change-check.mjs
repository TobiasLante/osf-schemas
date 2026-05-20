#!/usr/bin/env node
// Detects breaking-change candidates between two git refs:
//   - profileId removed (file deleted or profileId field gone/renamed)
//   - required attribute removed from a profile
//   - enum value removed from an attribute
//
// Best-effort only — flags suspects, does not fail the build.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const BASE = args.base || 'origin/main';
const HEAD = args.head || 'HEAD';

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

function readAt(ref, path) {
  try { return git(`show ${ref}:${path}`); } catch { return null; }
}

let changed;
try {
  changed = git(`diff --name-only ${BASE}...${HEAD}`)
    .split('\n')
    .filter((p) => p.startsWith('profiles/') && p.endsWith('.json'));
} catch (err) {
  console.log(`(skip) cannot diff ${BASE}...${HEAD}: ${err.message}`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log('No profile files changed in this PR.');
  process.exit(0);
}

console.log(`Breaking-change scan: ${changed.length} profile file(s) changed`);
console.log('===============================================================');

const warnings = [];

for (const path of changed) {
  const oldRaw = readAt(BASE, path);
  const newRaw = existsSync(path) ? readFileSync(path, 'utf8') : null;

  if (oldRaw && !newRaw) {
    warnings.push(`[REMOVED FILE] ${path}`);
    continue;
  }
  if (!oldRaw || !newRaw) continue;

  let oldDoc, newDoc;
  try { oldDoc = JSON.parse(oldRaw); } catch { continue; }
  try { newDoc = JSON.parse(newRaw); } catch { continue; }

  if (oldDoc.profileId && oldDoc.profileId !== newDoc.profileId) {
    warnings.push(
      `[PROFILE-ID CHANGED] ${path}: ${oldDoc.profileId} → ${newDoc.profileId}`
    );
  }

  const oldReq = new Set(oldDoc.required || []);
  const newReq = new Set(newDoc.required || []);
  for (const k of oldReq) {
    if (!newReq.has(k)) warnings.push(`[REQUIRED REMOVED] ${path}: ${k}`);
  }

  const oldAttrs = oldDoc.attributes || {};
  const newAttrs = newDoc.attributes || {};
  for (const k of Object.keys(oldAttrs)) {
    if (!(k in newAttrs)) {
      warnings.push(`[ATTRIBUTE REMOVED] ${path}: ${k}`);
      continue;
    }
    const oa = oldAttrs[k] || {};
    const na = newAttrs[k] || {};
    if (Array.isArray(oa.enum) && Array.isArray(na.enum)) {
      const dropped = oa.enum.filter((v) => !na.enum.includes(v));
      if (dropped.length) {
        warnings.push(
          `[ENUM SHRUNK] ${path}/${k}: dropped ${JSON.stringify(dropped)}`
        );
      }
    }
  }
}

if (warnings.length === 0) {
  console.log('No breaking-change candidates detected.');
} else {
  console.log(`Found ${warnings.length} candidate(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
  console.log('\n(advisory only — not a build failure)');
}

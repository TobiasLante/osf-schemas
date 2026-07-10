#!/usr/bin/env node
// ci/lint-machine-type-aliases.mjs
//
// Guards the machine-type vocabulary in mappings/machine-type-aliases.json.
// That file is the SSOT: discovery resolves the operator's `machineType`
// ("SGM", "Spritzgussmaschine", "injection molding machine") onto a COMMITTED
// profile through it, instead of guessing from profile FILENAMES.
//
// Filename guessing is what it replaces, and why this file exists: the discover
// wizard matched `machineType` against `profiles/machines/*.json` basenames, so
// a machine described as "SGM" — the term this fleet uses everywhere, down to
// `MACHINE_TYPE=SMProfile-SGM-Machine` in every edge's env — never reached
// `injection-molding-machine.json`. The wizard silently invented a fresh
// `SMProfile-SGM`, which v4 cannot commit (schema writes are 501 by design), so
// map-tags-to-profile answered 404 and onboarding dead-ended five steps later.
//
// ERRORS (exit 1):
//   A1  alias file missing / unparseable / fails validation/machine-type-alias-schema.json
//   A2  profileRef does not resolve to a profile under profiles/
//   A3  profileRef names an ABSTRACT profile — a source cannot reference a parent
//   A4  a term is duplicated across entries once normalised (ambiguous resolution)
//   A5  a term normalises to the empty string
//
// WARNINGS (reported, exit 0):
//   W1  a concrete machine profile that no alias entry names (unreachable by type)
//
// Run:  node ci/lint-machine-type-aliases.mjs   (or: npm run validate:aliases)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

const ROOT = process.env.SCHEMAS_ROOT ?? process.cwd();
const ALIAS_FILE = join(ROOT, "mappings", "machine-type-aliases.json");
const SCHEMA_FILE = join(ROOT, "validation", "machine-type-alias-schema.json");
const PROFILE_DIRS = ["profiles/machines"];

const errors = [];
const warnings = [];

/** The ONE normalisation. Discovery must apply exactly this. */
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    errors.push(`${code}  ${path}: ${e.message}`);
    return null;
  }
}

if (!existsSync(ALIAS_FILE)) {
  errors.push(`A1  mappings/machine-type-aliases.json is missing — discovery cannot resolve machine types.`);
} else {
  const alias = readJson(ALIAS_FILE, "A1");
  const schema = readJson(SCHEMA_FILE, "A1");

  if (alias && schema) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    if (!validate(alias)) {
      for (const e of validate.errors ?? []) errors.push(`A1  ${e.instancePath || "/"} ${e.message}`);
    }

    // Load every committed profile once: profileId -> {abstract, file}
    const profiles = new Map();
    for (const dir of PROFILE_DIRS) {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs).filter((n) => n.endsWith(".json"))) {
        const p = readJson(join(abs, f), "A2");
        if (p?.profileId) profiles.set(p.profileId, { abstract: p.abstract === true, file: `${dir}/${f}` });
      }
    }

    const seenTerm = new Map(); // normalised term -> profileRef that claimed it
    const named = new Set();

    for (const entry of alias.aliases ?? []) {
      const ref = entry.profileRef;
      named.add(ref);
      const hit = profiles.get(ref);
      if (!hit) {
        errors.push(`A2  profileRef "${ref}" resolves to no profile under ${PROFILE_DIRS.join(", ")}.`);
      } else if (hit.abstract) {
        errors.push(`A3  profileRef "${ref}" (${hit.file}) is abstract — a source cannot reference an abstract parent.`);
      }
      for (const term of entry.terms ?? []) {
        const n = norm(term);
        if (!n) {
          errors.push(`A5  term "${term}" (${ref}) normalises to the empty string.`);
          continue;
        }
        const prior = seenTerm.get(n);
        if (prior && prior !== ref) {
          errors.push(`A4  term "${term}" (normalised "${n}") is claimed by both "${prior}" and "${ref}" — resolution would be ambiguous.`);
        } else if (prior === ref) {
          errors.push(`A4  term "${term}" (normalised "${n}") is listed twice under "${ref}".`);
        }
        seenTerm.set(n, ref);
      }
    }

    for (const [pid, meta] of profiles) {
      if (!meta.abstract && !named.has(pid)) {
        warnings.push(`W1  profile "${pid}" (${meta.file}) has no alias entry — discovery can only reach it by exact profileId.`);
      }
    }

    if (!errors.length) {
      console.log(`  ok  machine-type-aliases: ${alias.aliases.length} profile(s), ${seenTerm.size} unique terms`);
    }
  }
}

for (const w of warnings) console.warn(`  ! ${w}`);
if (errors.length) {
  console.error("\nmachine-type alias lint failed:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("machine-type alias lint passed.");

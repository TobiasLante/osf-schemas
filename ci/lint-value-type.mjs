#!/usr/bin/env node
// ci/lint-value-type.mjs — what KIND of value an attribute is, where the repo already says so.
//
// valueType   PV  measured / actual (IST)       SP  commanded / planned (SOLL)
//             ID  identifier or reference       LIM enforced bound   MD master data
//
// The repo already encodes the role in three places; this linter makes them agree:
//   - the CNC name prefixes   Act_ = PV, Act_Ref_ = ID, Set_ / Plan_ = SP
//   - the word "Setpoint" in a name = SP
//   - a recipe parameter's smAttribute is the live IST the recipe's soll is compared to = PV
//   - the profile's kgIdProperty, and *_ref / *_id = ID
// A declared valueType that contradicts one of these is an error. Where none applies the
// attribute stays undeclared: the role is not guessed.
//
// Run:  node ci/lint-value-type.mjs
import fs from "node:fs";
import path from "node:path";

export const VALUE_TYPES = ["PV", "SP", "ID", "LIM", "MD"];

/** The role the repo itself implies for an attribute, or null. */
export function impliedValueType(name, { kgIdProperty, recipeTargets }) {
  if (name.startsWith("Act_Ref_")) return "ID";
  if (name.startsWith("Act_")) return "PV";
  if (name.startsWith("Set_") || name.startsWith("Plan_")) return "SP";
  if (/setpoint/i.test(name)) return "SP";
  if (recipeTargets && recipeTargets.has(name)) return "PV";
  if (name === kgIdProperty || name.endsWith("_ref") || name.endsWith("_id")) return "ID";
  return null;
}

export function lintValueTypes(profiles, recipeTargetsByProfile) {
  const err = [];
  let declared = 0, total = 0;
  for (const p of profiles) {
    const ctx = { kgIdProperty: p.json.kgIdProperty, recipeTargets: recipeTargetsByProfile.get(p.json.profileId) };
    for (const a of p.json.attributes || []) {
      total++;
      const w = `${p.file}: ${a.name}`;
      if (a.valueType === undefined) {
        const imp = impliedValueType(a.name, ctx);
        if (imp) err.push(`V2  ${w}: the repo implies ${imp} but no valueType is declared`);
        continue;
      }
      declared++;
      if (!VALUE_TYPES.includes(a.valueType)) { err.push(`V1  ${w}: valueType ${JSON.stringify(a.valueType)} is not one of ${VALUE_TYPES.join(", ")}`); continue; }
      const imp = impliedValueType(a.name, ctx);
      if (imp && imp !== a.valueType) err.push(`V2  ${w}: declared ${a.valueType}, but the repo implies ${imp}`);
    }
  }
  return { err, declared, total };
}

const J = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
function walk(d) {
  const out = [];
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}
export function load(root = ".") {
  const profiles = walk(path.join(root, "profiles")).map((f) => ({ file: path.relative(root, f), json: J(f) })).filter((p) => p.json.profileId);
  const targets = new Map();
  for (const f of walk(path.join(root, "recipes"))) {
    const r = J(f);
    for (const x of r.parameters || []) if (x.smAttribute) {
      if (!targets.has(r.profileRef)) targets.set(r.profileRef, new Set());
      targets.get(r.profileRef).add(x.smAttribute);
    }
  }
  return { profiles, targets };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { profiles, targets } = load(".");
  const { err, declared, total } = lintValueTypes(profiles, targets);
  for (const e of err) console.error("  " + e);
  console.log(`lint-value-type: ${declared}/${total} attributes declare a valueType — ${err.length} error(s)`);
  process.exit(err.length ? 1 : 0);
}

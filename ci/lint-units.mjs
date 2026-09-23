#!/usr/bin/env node
// ci/lint-units.mjs — one unit vocabulary: UNECE Rec. 20 codes, as OPC UA EUInformation uses them.
//
// Before this linter the repo spoke three dialects at once: profiles said "degC" and "%",
// sources said "pct" and "rpm", and validation/unece-codes.json — the table the discovery
// conversion lookup is keyed on — carried eleven codes that do not exist (MAM, the code it
// used for milliampere, is megametre). A lookup keyed on codes cannot match a symbol, so
// every conversion silently fell through.
//
// Rules
//   U1  every unit in profiles, sources, recipes and mappings is a code in validation/unece-codes.json
//   U2  every code in unit-conversions/ and validation/physical-rules.json is in that table
//   U3  a numeric attribute declares a unit, or is listed in validation/open-units.json with a reason
//   U4  a non-numeric attribute declares no unit
//   U5  a source/mapping unit equals the profile attribute's unit, or a conversion from->to exists,
//       or the pair is listed as an open conflict
//   U6  a recipe parameter's unit equals the unit of the attribute it targets
//   U7  an entry in open-units.json that is no longer open is an error (the list may only shrink honestly)
//
// Run:  node ci/lint-units.mjs

import fs from "node:fs";
import path from "node:path";

const NUMERIC = new Set(["Float", "Double", "Int32", "Int64", "Integer", "Number", "Int16", "UInt32"]);

export function lintUnits(m) {
  const err = [];
  const codes = new Set(Object.keys(m.codes));
  const conv = new Set(m.conversions.map((c) => `${c.from}>${c.to}`));
  const openAttr = new Set(m.open.attributes.map((o) => `${o.profile}#${o.attribute}`));
  const openConf = new Set(m.open.conflicts.map((o) => `${o.profile}#${o.attribute}#${o.sourceUnit}`));
  const usedOpenAttr = new Set(), usedOpenConf = new Set();

  // effective attributes (parentType merged, child wins)
  const byId = new Map(m.profiles.map((p) => [p.json.profileId, p]));
  const eff = (pid, seen = new Set()) => {
    const p = byId.get(pid);
    if (!p || seen.has(pid)) return new Map();
    seen.add(pid);
    const base = p.json.parentType ? eff(p.json.parentType, seen) : new Map();
    for (const a of p.json.attributes || []) base.set(a.name, a);
    return base;
  };

  for (const p of m.profiles) {
    for (const a of p.json.attributes || []) {
      const w = `${p.file}: ${a.name}`;
      if (a.unit !== undefined && !codes.has(a.unit)) err.push(`U1  ${w}: unit ${JSON.stringify(a.unit)} is not a UNECE code in validation/unece-codes.json`);
      if (NUMERIC.has(a.dataType)) {
        if (a.unit === undefined) {
          if (openAttr.has(`${p.json.profileId}#${a.name}`)) usedOpenAttr.add(`${p.json.profileId}#${a.name}`);
          else err.push(`U3  ${w}: ${a.dataType} without a unit. Declare the UNECE code, or list it in validation/open-units.json with the reason it is not known`);
        }
      } else if (a.unit !== undefined) {
        err.push(`U4  ${w}: ${a.dataType} carries unit ${a.unit}; a non-numeric attribute takes none`);
      }
    }
  }
  for (const s of m.mappings) {
    const attrs = eff(s.profileRef);
    for (const x of s.entries) {
      if (!x.unit) continue;
      const w = `${s.file}: ${x.smAttribute}`;
      if (!codes.has(x.unit)) { err.push(`U1  ${w}: unit ${JSON.stringify(x.unit)} is not a UNECE code`); continue; }
      const a = attrs.get(x.smAttribute);
      if (!a || a.unit === undefined || a.unit === x.unit) continue;
      if (conv.has(`${x.unit}>${a.unit}`)) continue;
      const k = `${s.profileRef}#${x.smAttribute}#${x.unit}`;
      if (openConf.has(k)) { usedOpenConf.add(k); continue; }
      err.push(`U5  ${w}: the source delivers ${x.unit}, the profile says ${a.unit}, and unit-conversions has no ${x.unit}->${a.unit}`);
    }
  }
  for (const r of m.recipes) {
    const attrs = eff(r.json.profileRef);
    for (const p of r.json.parameters || []) {
      const w = `${r.file}: ${p.param}`;
      const numeric = typeof p.soll === "number";
      if (!numeric) { if (p.unit) err.push(`U4  ${w}: non-numeric soll carries unit ${p.unit}`); continue; }
      if (p.unit === undefined || p.unit === "") { err.push(`U3  ${w}: numeric soll without a unit`); continue; }
      if (!codes.has(p.unit)) { err.push(`U1  ${w}: unit ${JSON.stringify(p.unit)} is not a UNECE code`); continue; }
      const a = p.smAttribute && attrs.get(p.smAttribute);
      if (a && a.unit !== undefined && a.unit !== p.unit) err.push(`U6  ${w}: recipe unit ${p.unit} != ${p.smAttribute} unit ${a.unit}`);
    }
  }
  for (const c of m.conversions) for (const u of [c.from, c.to]) if (!codes.has(u)) err.push(`U2  unit-conversions: ${u} is not in unece-codes.json`);
  for (const u of m.physicalCodes) if (!codes.has(u)) err.push(`U2  validation/physical-rules.json: ${u} is not in unece-codes.json`);
  for (const k of openAttr) if (!usedOpenAttr.has(k)) err.push(`U7  validation/open-units.json lists ${k}, which is no longer open — remove it`);
  for (const k of openConf) if (!usedOpenConf.has(k)) err.push(`U7  validation/open-units.json lists conflict ${k}, which no longer exists — remove it`);
  return err;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}
const J = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

export function loadRepo(root = ".") {
  const r = (p) => path.join(root, p);
  const profiles = walk(r("profiles")).map((f) => ({ file: path.relative(root, f), json: J(f) })).filter((p) => p.json.profileId);
  const mappings = [];
  for (const f of [...walk(r("sources")), r("mappings/mtconnect-dataitem-map.json")]) {
    if (!fs.existsSync(f)) continue;
    const j = J(f);
    const entries = ["nodeMappings", "dataItemMappings", "columnMappings", "mappings"].flatMap((k) => (Array.isArray(j[k]) ? j[k] : []));
    mappings.push({ file: path.relative(root, f), profileRef: j.profileRef, entries });
  }
  const recipes = walk(r("recipes")).map((f) => ({ file: path.relative(root, f), json: J(f) })).filter((x) => Array.isArray(x.json.parameters));
  const phys = J(r("validation/physical-rules.json"));
  const physicalCodes = phys.rules.flatMap((x) => [...(x.validUnits || []), ...(x.typicalRange?.unit ? [x.typicalRange.unit] : [])]);
  const openF = r("validation/open-units.json");
  const open = fs.existsSync(openF) ? J(openF) : { attributes: [], conflicts: [] };
  return {
    codes: J(r("validation/unece-codes.json")).codes,
    conversions: J(r("unit-conversions/conversions.json")).conversions,
    physicalCodes, profiles, mappings, recipes, open,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = loadRepo(".");
  const err = lintUnits(m);
  for (const e of err) console.error("  " + e);
  const n = m.open.attributes.length + m.open.conflicts.length;
  console.log(`lint-units: ${m.profiles.length} profiles, ${m.mappings.length} mapping files, ${m.recipes.length} recipes — ${err.length} error(s), ${n} declared open`);
  process.exit(err.length ? 1 : 0);
}

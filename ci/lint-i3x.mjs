#!/usr/bin/env node
// ci/lint-i3x.mjs — i3x/ is valid i3X 1.0, and lossless against profiles/.
//
//   I1  every Object Type has elementId, displayName, namespaceUri, version (SemVer) and schema
//   I2  every schema is valid JSON Schema 2020-12, every $ref resolves to another type's schema
//   I3  elementIds are unique; every namespaceUri is registered in i3x/namespaces.json
//   I4  every relationship type has a reverseOf that is registered and points back
//   I5  round trip: every profile is rebuilt EXACTLY from its Object Type
//
// Run:  node ci/lint-i3x.mjs     (after node ci/gen-i3x.mjs; gen-i3x --check proves freshness)
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { schemaToAttribute } from "./gen-i3x.mjs";

const SEMVER = /^\d+\.\d+\.\d+$/;
const same = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && same(a[k], b[k]));
  }
  return a === b;
};

export function rebuildProfile(t) {
  const x = { ...t["x-osf"] };
  const reqOn = new Set(x.requiredDeclaredOn || []);
  delete x.source; delete x.requiredDeclaredOn;
  const own = t.schema.allOf ? t.schema.allOf.find((p) => p.properties) : t.schema;
  const req = new Set(own?.required || []);
  const attributes = Object.entries(own?.properties || {}).map(([n, s]) => schemaToAttribute(n, s, req.has(n), reqOn.has(n)));
  const p = { profileId: t.elementId, displayName: t.displayName, version: t.version, description: t.schema.description, attributes, ...x };
  if (!("parentType" in x)) delete p.parentType;
  return p;
}

export function lintI3x(root = ".") {
  const err = [];
  const I = path.join(root, "i3x");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = path.join(d, e.name); return e.isDirectory() ? walk(p) : [p]; });
  const ajv = new Ajv2020({ strict: false });
  const ns = new Set(JSON.parse(fs.readFileSync(path.join(I, "namespaces.json"), "utf8")).map((n) => n.uri));
  const types = new Map();
  for (const f of walk(path.join(I, "object-types"))) {
    const t = JSON.parse(fs.readFileSync(f, "utf8")); const w = path.relative(root, f);
    for (const k of ["elementId", "displayName", "namespaceUri", "version", "schema"]) if (t[k] === undefined) err.push(`I1  ${w}: missing ${k}`);
    if (t.version !== undefined && !SEMVER.test(t.version)) err.push(`I1  ${w}: version ${t.version} is not SemVer`);
    if (t.schema && !ajv.validateSchema(t.schema)) err.push(`I2  ${w}: not valid JSON Schema — ${ajv.errorsText(ajv.errors)}`);
    for (const part of t.schema?.allOf || []) if (part.$ref) {
      const [file, ptr] = part.$ref.split("#");
      if (ptr !== "/schema" || !fs.existsSync(path.join(path.dirname(f), file))) err.push(`I2  ${w}: $ref ${part.$ref} does not resolve`);
    }
    if (types.has(t.elementId)) err.push(`I3  ${t.elementId} defined twice`);
    if (!ns.has(t.namespaceUri)) err.push(`I3  ${w}: namespace ${t.namespaceUri} is not registered`);
    types.set(t.elementId, { t, w });
  }
  const rel = JSON.parse(fs.readFileSync(path.join(I, "relationship-types.json"), "utf8"));
  const byId = new Map(rel.map((r) => [r.elementId, r]));
  for (const r of rel) {
    const b = byId.get(r.reverseOf);
    if (!b) err.push(`I4  relationship ${r.elementId}: reverseOf ${r.reverseOf} is not registered`);
    else if (b.reverseOf !== r.elementId) err.push(`I4  relationship ${r.elementId}: ${r.reverseOf} does not point back`);
    if (!ns.has(r.namespaceUri)) err.push(`I3  relationship ${r.elementId}: namespace not registered`);
  }
  let rt = 0, n = 0;
  for (const { t, w } of types.values()) {
    const src = t["x-osf"]?.source; n++;
    if (!src || !fs.existsSync(path.join(root, src))) { err.push(`I5  ${w}: source profile ${src} not found`); continue; }
    const orig = JSON.parse(fs.readFileSync(path.join(root, src), "utf8"));
    if (same(rebuildProfile(t), orig)) rt++;
    else {
      const b = rebuildProfile(t);
      const diff = [...new Set([...Object.keys(b), ...Object.keys(orig)])].filter((k) => !same(b[k], orig[k]));
      err.push(`I5  ${w}: rebuilt profile differs from ${src} in ${diff.join(", ")}`);
    }
  }
  return { err, types: types.size, rel: rel.length, rt, n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { err, types, rel, rt, n } = lintI3x(".");
  for (const e of err) console.error("  " + e);
  console.log(`lint-i3x: ${types} object types, ${rel} relationship types, round trip ${rt}/${n} — ${err.length} error(s)`);
  process.exit(err.length ? 1 : 0);
}

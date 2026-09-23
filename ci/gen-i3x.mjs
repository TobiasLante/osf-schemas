#!/usr/bin/env node
// ci/gen-i3x.mjs — the profiles, as i3X 1.0 Object Types and Relationship Types.
//
// i3X defines an Object Type as { elementId, displayName, namespaceUri, version, schema } where
// schema is JSON Schema; inheritance is allOf + $ref; every Relationship Type names one reverseOf.
// This writes i3x/ from profiles/** so an i3X server serves the model without translating it.
// Everything i3X has no field for travels under x-osf, so the profile can be rebuilt exactly
// (ci/lint-i3x.mjs proves it).
//
//   node ci/gen-i3x.mjs           # (re)generate i3x/
//   node ci/gen-i3x.mjs --check   # CI: i3x/ must equal a fresh render
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "i3x");
export const NS = (cat) => `urn:osf:schemas:${cat}`;
export const NS_REL = "urn:osf:schemas:relationships";

const TYPE = { String: "string", Int32: "integer", Int64: "integer", Float: "number", Double: "number", Boolean: "boolean", DateTime: "string", Json: "object" };
const DEFAULT_DT = { string: "String", number: "Float", boolean: "Boolean", object: "Json" }; // integer has no default: width is always stated
const ATTR_MAPPED = new Set(["name", "dataType", "description", "enum", "required"]);
const PROFILE_MAPPED = new Set(["profileId", "displayName", "version", "description", "parentType", "attributes"]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
  });
}

export function attributeToSchema(a) {
  const t = TYPE[a.dataType];
  if (!t) throw new Error(`unknown dataType ${a.dataType} on ${a.name}`);
  const s = { type: t };
  if (a.dataType === "DateTime") s.format = "date-time";
  if (a.description !== undefined) s.description = a.description;
  if (a.enum !== undefined) s.enum = a.enum;
  if (DEFAULT_DT[t] !== a.dataType) s["x-dataType"] = a.dataType;
  for (const [k, v] of Object.entries(a)) if (!ATTR_MAPPED.has(k)) s[`x-${k}`] = v;
  return s;
}

export function schemaToAttribute(name, s, isRequired, hadRequiredKey) {
  const a = { name, dataType: s["x-dataType"] || DEFAULT_DT[s.type] };
  if (s.description !== undefined) a.description = s.description;
  if (s.enum !== undefined) a.enum = s.enum;
  if (hadRequiredKey) a.required = isRequired;
  for (const [k, v] of Object.entries(s)) if (k.startsWith("x-") && k !== "x-dataType") a[k.slice(2)] = v;
  return a;
}

export function render() {
  const files = walk(path.join(ROOT, "profiles")).filter((f) => !path.basename(f).startsWith("_skeleton"));
  const profiles = files.map((f) => ({ file: path.relative(ROOT, f).split(path.sep).join("/"), json: JSON.parse(fs.readFileSync(f, "utf8")) })).filter((p) => p.json.profileId);
  const byName = new Map();
  for (const p of profiles) for (const k of [p.json.profileId, p.json.kgNodeLabel, p.json.displayName]) if (k) byName.set(k, p);
  const out = new Map();
  const nss = new Set();
  for (const p of profiles) {
    const j = p.json;
    const cat = p.file.split("/")[1];
    const props = {}, req = [];
    const withReq = [];
    for (const a of j.attributes || []) {
      props[a.name] = attributeToSchema(a);
      if (a.required === true) req.push(a.name);
      if ("required" in a) withReq.push(a.name);
    }
    const own = { type: "object", properties: props };
    if (req.length) own.required = req;
    let schema;
    if (j.parentType) {
      const parent = byName.get(j.parentType);
      if (!parent) throw new Error(`${p.file}: parentType ${j.parentType} does not resolve`);
      const pcat = parent.file.split("/")[1];
      const ref = (pcat === cat ? "" : `../${pcat}/`) + `${parent.json.profileId}.type.json#/schema`;
      schema = { description: j.description, allOf: [{ $ref: ref }, own] };
    } else schema = { description: j.description, ...own };
    const x = { source: p.file };
    for (const [k, v] of Object.entries(j)) if (!PROFILE_MAPPED.has(k)) x[k] = v;
    if ("parentType" in j) x.parentType = j.parentType;
    x.requiredDeclaredOn = withReq;
    const t = { elementId: j.profileId, displayName: j.displayName, namespaceUri: NS(cat), version: j.version, schema, "x-osf": x };
    nss.add(cat);
    out.set(`object-types/${cat}/${j.profileId}.type.json`, t);
  }
  // relationship types: every edge type, one reverseOf each (i3X). Registered pairs first;
  // a type with no authored inverse gets a generated one, marked so nobody mistakes it for modelled.
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "contract.json"), "utf8"));
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "validation/relationship-types.json"), "utf8"));
  const rev = new Map();
  for (const [a, b] of reg.pairs) { rev.set(a, b); rev.set(b, a); }
  const types = [...new Set(contract.edges.map((e) => e.type))].sort();
  const rel = [];
  const openTypes = new Set((reg.open || []).flatMap((o) => [o.type, ...o.inverseOf]));
  for (const t of types) {
    if (rev.has(t)) { rel.push({ elementId: t, displayName: t, namespaceUri: NS_REL, reverseOf: rev.get(t) }); continue; }
    const r = `${t}_REVERSE`;
    const e = { elementId: t, displayName: t, namespaceUri: NS_REL, reverseOf: r };
    if (openTypes.has(t)) e["x-open"] = "see validation/relationship-types.json open";
    rel.push(e);
    rel.push({ elementId: r, displayName: r, namespaceUri: NS_REL, reverseOf: t, "x-generated": "no authored inverse; name generated so the type is i3X-complete" });
  }
  out.set("relationship-types.json", rel);
  out.set("namespaces.json", [...[...nss].sort().map((c) => ({ uri: NS(c), displayName: `OSF ${c}` })), { uri: NS_REL, displayName: "OSF relationships" }]);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = render();
  const CHECK = process.argv.includes("--check");
  const want = new Map([...out].map(([k, v]) => [k, JSON.stringify(v, null, 2) + "\n"]));
  if (CHECK) {
    const have = fs.existsSync(OUT) ? walk(OUT).map((f) => path.relative(OUT, f).split(path.sep).join("/")) : [];
    const bad = [...want].filter(([k, v]) => !fs.existsSync(path.join(OUT, k)) || fs.readFileSync(path.join(OUT, k), "utf8") !== v).map(([k]) => k);
    const extra = have.filter((k) => !want.has(k));
    for (const k of bad) console.error(`  ✖ i3x/${k} is stale — run: npm run gen:i3x`);
    for (const k of extra) console.error(`  ✖ i3x/${k} has no profile behind it`);
    console.log(bad.length + extra.length ? "FAIL — i3x/ disagrees with a fresh render" : `gen-i3x --check: i3x/ is current (${want.size} files)`);
    process.exit(bad.length + extra.length ? 1 : 0);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const [k, v] of want) { const p = path.join(OUT, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, v); }
  console.log(`gen-i3x: wrote ${want.size} files into i3x/`);
}

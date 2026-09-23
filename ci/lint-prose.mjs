#!/usr/bin/env node
// ci/lint-prose.mjs — the JSON says what a thing is; the reasoning lives in docs/history/.
//
// 41 % of every schema byte was prose: incident logs, dated measurements, arguments with
// earlier versions — up to 17 940 characters in one description. Every consumer (KG builder,
// codegen, agents) had to read past it to find the model. The history was moved verbatim to
// docs/history/<same path>.md; the field keeps its first sentence and a pointer.
//
//   P1  description / _note / note / $description / _comment <= 300 characters
//   P2  a pointer "Full text: docs/history/…" must name a file that exists
//
// Run:  node ci/lint-prose.mjs
import fs from "node:fs";
import path from "node:path";

export const LIMIT = 300;
const KEYS = new Set(["description", "_note", "note", "$description", "_comment"]);
const DIRS = ["profiles", "sources", "recipes", "mappings", "cross-constraints", "kpis", "sync", "historians", "flows", "companion-specs", "unit-conversions"];

export function lintProse(file, json, exists = fs.existsSync) {
  const err = [];
  const walk = (o, p) => {
    if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "string" && KEYS.has(k)) {
          if (v.length > LIMIT) err.push(`P1  ${file} ${p}/${k}: ${v.length} characters (limit ${LIMIT}). Keep the first sentence here, move the rest to docs/history/`);
          const m = v.match(/Full text: (docs\/history\/[^,\s]+\.md)/);
          if (m && !exists(m[1])) err.push(`P2  ${file} ${p}/${k}: points at ${m[1]}, which does not exist`);
        } else walk(v, `${p}/${k}`);
      }
  };
  walk(json, "");
  return err;
}

function files(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p)); else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let err = [], n = 0;
  for (const f of DIRS.flatMap(files)) { n++; err.push(...lintProse(f, JSON.parse(fs.readFileSync(f, "utf8")))); }
  for (const e of err) console.error("  " + e);
  console.log(`lint-prose: ${n} files — ${err.length} error(s)`);
  process.exit(err.length ? 1 : 0);
}

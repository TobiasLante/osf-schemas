#!/usr/bin/env node
// next/ci/json-to-shacl.mjs
//
// JSON -> SHACL transpiler for the SDC-inspired 'constraints' attribute facet
// (Option C: the JSON constraint block in the profile is the SSOT, SHACL falls
// out as a CI build artifact — consumed by KG-Builder Phase 1.5 validation and
// the later SDC4-boundary export. No SHACL engine runs at the edge.)
//
// Emits one Turtle file per NON-ABSTRACT profile that has effective
// constraints (own + inherited via the parentType chain, own ids override
// inherited ones): next/build/shacl/<profileId>.ttl
//
// Mapping (one sh:NodeShape per constraint, sh:targetClass = osf:<kgNodeLabel>):
//   severity error|warning      -> sh:severity sh:Violation | sh:Warning
//   description                 -> sh:message
//   require {attr, op, value}   -> sh:property [ sh:path osf:<attr> ; <op> ]
//   when (optional)             -> implication in core SHACL:
//                                  sh:or ( [ NOT when ] [ require ] )
//                                  where NOT when = sh:property [ sh:path ... ;
//                                  sh:not [ <op constraints> ] ]
//
// Operator table (applies to the value nodes of the path):
//   gt  -> sh:minExclusive        lt  -> sh:maxExclusive
//   gte -> sh:minInclusive        lte -> sh:maxInclusive
//   between [lo,hi] -> sh:minInclusive lo ; sh:maxInclusive hi
//   eq  -> sh:hasValue            ne  -> sh:not [ sh:hasValue ]
//   in [a,b,...] -> sh:in ( a b ... )
//
// Value-node semantics: shapes constrain EXISTING values only (no sh:minCount)
// — an absent attribute never violates, matching the edge detector, which only
// evaluates on OPC-UA DataChange when the value is present. An absent 'when'
// attribute makes the precondition false (vacuous sh:not) -> rule passes.
//
// Output is deterministic (profiles and constraint ids sorted, no timestamps)
// so artifacts diff cleanly between CI runs.
//
// Run:   node next/ci/json-to-shacl.mjs
// Env:   PROFILES_ROOT — override profile tree (tests point at fixtures)
//        SHACL_OUT     — override output dir (default next/build/shacl/)
// Exits non-zero on any error (unknown op/dataType, unresolvable attr).

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.PROFILES_ROOT
  ? process.env.PROFILES_ROOT.replace(/\/$/, "") + "/"
  : new URL("../profiles/", import.meta.url).pathname;

const OUT_DIR = process.env.SHACL_OUT
  ? process.env.SHACL_OUT.replace(/\/$/, "")
  : new URL("../build/shacl", import.meta.url).pathname;

const OSF_NS = "https://osf-schemas/ns#";

// ---- Profile loading + inheritance (same resolution rules as lint-constraints.mjs)

function loadAllProfiles(rootDir) {
  const profiles = new Map();
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (entry.endsWith(".json")) files.push(p);
    }
  }
  walk(rootDir);
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    if (!j.profileId) continue;
    if (profiles.has(j.profileId)) {
      throw new Error(`duplicate profileId ${j.profileId} (${f})`);
    }
    j.__file = f;
    profiles.set(j.profileId, j);
  }
  return profiles;
}

function resolveParent(p, profiles) {
  if (!p.parentType) return null;
  return (
    profiles.get(p.parentType) ||
    profiles.get(`SMProfile-${p.parentType}`) ||
    [...profiles.values()].find(
      (x) => x.kgNodeLabel === p.parentType || x.displayName === p.parentType
    ) ||
    null
  );
}

/** Merged attribute map (own overrides inherited). */
function effectiveAttrs(profile, profiles) {
  const out = new Map();
  function add(p) {
    const parent = resolveParent(p, profiles);
    if (parent) add(parent);
    for (const a of p.attributes ?? []) out.set(a.name, a);
  }
  add(profile);
  return out;
}

/**
 * Merged constraint map (own ids override inherited). Each entry carries
 * `definedIn` (profileId) for provenance comments in the artifact.
 */
function effectiveConstraints(profile, profiles) {
  const out = new Map();
  function add(p) {
    const parent = resolveParent(p, profiles);
    if (parent) add(parent);
    for (const [id, c] of Object.entries(p.constraints ?? {})) {
      out.set(id, { ...c, definedIn: p.profileId });
    }
  }
  add(profile);
  return out;
}

// ---- Turtle serialization ---------------------------------------------------

const XSD_BY_DATATYPE = {
  Int32: "xsd:integer",
  Int64: "xsd:integer",
  Float: "xsd:double",
  Double: "xsd:double",
  Boolean: "xsd:boolean",
  String: "xsd:string",
  DateTime: "xsd:dateTime",
  Json: "xsd:string",
};

function turtleEscape(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** Serialize a JS value as a Turtle literal typed by the OSF attribute dataType. */
function literal(value, dataType, label) {
  const xsd = XSD_BY_DATATYPE[dataType];
  if (!xsd) throw new Error(`${label}: unknown attribute.dataType "${dataType}"`);
  switch (xsd) {
    case "xsd:integer":
      if (!Number.isInteger(value))
        throw new Error(`${label}: ${JSON.stringify(value)} is not an integer`);
      return `"${value}"^^xsd:integer`;
    case "xsd:double": {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`${label}: ${JSON.stringify(value)} is not a number`);
      const lex = Number.isInteger(value) ? `${value}.0` : String(value);
      return `"${lex}"^^xsd:double`;
    }
    case "xsd:boolean":
      if (typeof value !== "boolean")
        throw new Error(`${label}: ${JSON.stringify(value)} is not a boolean`);
      return `"${value}"^^xsd:boolean`;
    case "xsd:dateTime":
      return `"${turtleEscape(value)}"^^xsd:dateTime`;
    default:
      return `"${turtleEscape(value)}"`;
  }
}

/**
 * Turtle lines (no leading indent) for a predicate {attr, op, value} as
 * constraint components on the value nodes of the path. `attrs` resolves the
 * dataType. Returns an array of `sh:x y ;` strings.
 */
function opComponents(pred, attrs, label) {
  const attr = attrs.get(pred.attr);
  if (!attr)
    throw new Error(
      `${label}: predicate.attr "${pred.attr}" does not resolve to an attribute (incl. inherited)`
    );
  const lit = (v) => literal(v, attr.dataType, label);
  switch (pred.op) {
    case "gt":
      return [`sh:minExclusive ${lit(pred.value)} ;`];
    case "gte":
      return [`sh:minInclusive ${lit(pred.value)} ;`];
    case "lt":
      return [`sh:maxExclusive ${lit(pred.value)} ;`];
    case "lte":
      return [`sh:maxInclusive ${lit(pred.value)} ;`];
    case "between": {
      if (!Array.isArray(pred.value) || pred.value.length !== 2)
        throw new Error(`${label}: op=between requires value=[lo,hi]`);
      return [
        `sh:minInclusive ${lit(pred.value[0])} ;`,
        `sh:maxInclusive ${lit(pred.value[1])} ;`,
      ];
    }
    case "eq":
      return [`sh:hasValue ${lit(pred.value)} ;`];
    case "ne":
      return [`sh:not [ sh:hasValue ${lit(pred.value)} ] ;`];
    case "in": {
      if (!Array.isArray(pred.value))
        throw new Error(`${label}: op=in requires array value`);
      return [`sh:in ( ${pred.value.map(lit).join(" ")} ) ;`];
    }
    default:
      throw new Error(`${label}: unknown op "${pred.op}"`);
  }
}

const SEVERITY = { error: "sh:Violation", warning: "sh:Warning" };

/** Render one constraint as a sh:NodeShape block. */
function renderConstraint(profile, id, c, attrs) {
  const label = `${profile.profileId}#constraints.${id}`;
  const severity = SEVERITY[c.severity];
  if (!severity) throw new Error(`${label}: unknown severity "${c.severity}"`);
  if (!c.require) throw new Error(`${label}: missing require`);

  const shapeIri = `osf:${profile.profileId}__constraint__${id}`;
  const requireLines = opComponents(c.require, attrs, label);
  const message =
    c.description ?? `${id}: ${c.require.attr} ${c.require.op} ${JSON.stringify(c.require.value)}`;

  const out = [];
  if (c.definedIn !== profile.profileId) {
    out.push(`# inherited from ${c.definedIn}`);
  }
  out.push(`${shapeIri}`);
  out.push(`    a sh:NodeShape ;`);
  out.push(`    sh:targetClass osf:${profile.kgNodeLabel} ;`);
  out.push(`    sh:severity ${severity} ;`);
  out.push(`    sh:message "${turtleEscape(message)}" ;`);

  if (!c.when) {
    // Unconditional: plain property shape on the require path.
    out.push(`    sh:property [`);
    out.push(`        sh:path osf:${c.require.attr} ;`);
    for (const l of requireLines) out.push(`        ${l}`);
    out.push(`    ] .`);
  } else {
    // Implication when -> require, in core SHACL: sh:or ( [ NOT when ] [ require ] ).
    // NOT when: every value of when.attr must NOT conform to the op shape
    // (vacuously true when the attribute is absent).
    const whenLines = opComponents(c.when, attrs, label);
    out.push(`    sh:or (`);
    out.push(`        [`);
    out.push(`            sh:property [`);
    out.push(`                sh:path osf:${c.when.attr} ;`);
    out.push(`                sh:not [`);
    for (const l of whenLines) out.push(`                    ${l.replace(/ ;$/, "")} ;`);
    out.push(`                ]`);
    out.push(`            ]`);
    out.push(`        ]`);
    out.push(`        [`);
    out.push(`            sh:property [`);
    out.push(`                sh:path osf:${c.require.attr} ;`);
    for (const l of requireLines) out.push(`                ${l}`);
    out.push(`            ]`);
    out.push(`        ]`);
    out.push(`    ) .`);
  }
  return out.join("\n");
}

/** Render the full Turtle document for one profile (or null if nothing to emit). */
export function renderProfile(profile, profiles) {
  if (profile.abstract === true) return null;
  const constraints = effectiveConstraints(profile, profiles);
  if (constraints.size === 0) return null;
  const attrs = effectiveAttrs(profile, profiles);

  const header = [
    `# GENERATED by next/ci/json-to-shacl.mjs — DO NOT EDIT.`,
    `# SSOT: ${profile.__file ?? profile.profileId} (version ${profile.version})`,
    `# Profile: ${profile.profileId} -> sh:targetClass osf:${profile.kgNodeLabel}`,
    ``,
    `@prefix sh:  <http://www.w3.org/ns/shacl#> .`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`,
    `@prefix osf: <${OSF_NS}> .`,
    ``,
  ];

  const blocks = [...constraints.keys()]
    .sort()
    .map((id) => renderConstraint(profile, id, constraints.get(id), attrs));

  return header.join("\n") + blocks.join("\n\n") + "\n";
}

// ---- Main -------------------------------------------------------------------

export function transpileAll(rootDir = ROOT, outDir = OUT_DIR) {
  const profiles = loadAllProfiles(rootDir);
  mkdirSync(outDir, { recursive: true });
  const emitted = [];
  for (const profileId of [...profiles.keys()].sort()) {
    const ttl = renderProfile(profiles.get(profileId), profiles);
    if (ttl === null) continue;
    const file = join(outDir, `${profileId}.ttl`);
    writeFileSync(file, ttl);
    emitted.push(file);
  }
  return emitted;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  try {
    const emitted = transpileAll();
    if (emitted.length === 0) {
      process.stdout.write("json-to-shacl: no non-abstract profiles with constraints — nothing emitted\n");
    } else {
      for (const f of emitted) process.stdout.write(`json-to-shacl: wrote ${f}\n`);
    }
  } catch (err) {
    process.stderr.write(`json-to-shacl failed: ${err.stack ?? err.message}\n`);
    process.exit(1);
  }
}

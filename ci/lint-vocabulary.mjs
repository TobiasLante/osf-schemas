#!/usr/bin/env node
// ci/lint-vocabulary.mjs — THE DEAD-LITERAL GATE (fail-closed, offline)
//
// WHY THIS EXISTS
// ---------------
// A guard whose literal never occurs in the data filters NOTHING — and says
// nothing. It throws no error, it looks right, and the comment next to it
// usually describes the perfect intention. It is dead anyway.
// On 2026-07-12, three such corpses were measured against live data:
//   - cross-constraints/qty_shortfall.json  `when: status ne "offen"` —
//     OperationsResponse.status is pinned to the CONSTANT "fertig" by its
//     source => the gate is always true => it filtered nothing =>
//     11.196 phantom findings / 1,7 Mio EUR phantom impact.
//   - cross-constraints/material_unavailable.json `when: status eq "offen"` —
//     same attribute => the gate is NEVER true => the rule is a permanently
//     dormant OFF switch (dead in the other direction).
//   - profiles/erp/customer-order.json  `order_overdue: when status eq "offen"`
//     — the arriving vocabulary is {in_arbeit, freigegeben, abgeschlossen}.
// The comment is not evidence. Read the WHERE, not the --.
//
// WHAT IT CHECKS (all STATIC — no DB, no network, deterministic on a runner)
//   R1  literal-vs-source:  if EVERY source that maps an attribute pins its
//       value (columnMappings[].const, or a valueMap with a "*" default), then
//       the set of deliverable values is KNOWN AT LINT TIME. A guard literal
//       outside it can never match => ERROR. This kills qty_shortfall offline,
//       with zero trust in any human declaration.
//   R2  enum-vs-source:  every value a source CAN deliver must appear in the
//       declared enum (declaration incomplete => ERROR), and if all mapping
//       sources pin, the enum may not declare unreachable values (fiction =>
//       ERROR).
//   R3  fail-closed:  a String attribute used in an equality-class guard
//       (eq/ne/in) MUST declare `enum` in the profile. No vocabulary => we
//       cannot verify the literal => we refuse. (Silence is what killed us.)
//   R4  enum members must match the attribute dataType.
//   R5  literal-vs-enum:  the guard literal must be a member — with a
//       did-you-mean hint (case-insensitive / edit distance) and the full list
//       of allowed values in the message, so the human is actually reached.
//
// WHAT IT DOES NOT CHECK
//   Whether the DECLARED enum matches the world. A linter that validates a
//   fantasy world against itself is the same bug again. That check needs the
//   real source and lives in ci/check-vocab-drift.mjs (nightly, on a runner
//   with a route to the plant network). This file must stay offline-green so
//   it can be a hard PR gate.
//
// Guard inventory covered:
//   - profiles/**/*.json  constraints[].when / .require   (op eq|ne|in)
//   - cross-constraints/*.json  when.eq / when.ne         (on left.profileRef)
//   - cross-constraints/*.json  aggregate.filter.eq/.ne   (on right.profileRef)
//   - recipes/*.json  match.equipment  — a recipe that matches no machine is
//     the same corpse in a different coat (and the machine-id namespace is a
//     CLOSED set declared in sources/**, so this is checkable offline; it is
//     the trap that turned 'sgm-04' into a band that never resolved).
//     match.article is an OPEN set (ERP master data) -> nightly drift check.
//
// Run:   node ci/lint-vocabulary.mjs
// Test:  node ci/test-lint-vocabulary.mjs   (negative test: a broken literal
//        MUST turn this red — proven, not asserted)
// Roots overridable for fixtures: PROFILES_ROOT, CROSS_ROOT, SOURCES_ROOTS
// Exits non-zero on any error.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname; // …/ci/
const REPO = join(HERE, "..");

const PROFILES_ROOT = process.env.PROFILES_ROOT || join(REPO, "profiles");
const CROSS_ROOT = process.env.CROSS_ROOT || join(REPO, "cross-constraints");
const RECIPES_ROOT = process.env.RECIPES_ROOT || join(REPO, "recipes");
const SOURCES_ROOTS = (process.env.SOURCES_ROOTS || [join(REPO, "sources"), join(REPO, "mappings")].join(":"))
  .split(":")
  .filter(Boolean);

// Ops that compare a value against the attribute's VOCABULARY.
const EQ_OPS = new Set(["eq", "ne", "in"]);

const TYPE_CHECK = {
  Int32: (v) => Number.isInteger(v),
  Int64: (v) => Number.isInteger(v),
  Float: (v) => typeof v === "number" && Number.isFinite(v),
  Double: (v) => typeof v === "number" && Number.isFinite(v),
  String: (v) => typeof v === "string",
  Boolean: (v) => typeof v === "boolean",
  DateTime: (v) => typeof v === "string" && !Number.isNaN(Date.parse(v)),
  Json: () => true,
};

// ---- io -------------------------------------------------------------------

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function readJson(f) {
  return JSON.parse(readFileSync(f, "utf8"));
}

// ---- profiles + inheritance ------------------------------------------------

export function loadProfiles(root) {
  const byId = new Map();
  for (const f of jsonFiles(root)) {
    let j;
    try {
      j = readJson(f);
    } catch (e) {
      throw new Error(`${f}: invalid JSON (${e.message})`);
    }
    if (!j.profileId) continue;
    j.__file = f;
    byId.set(j.profileId, j);
  }
  return byId;
}

export function resolveParent(p, profiles) {
  if (!p.parentType) return null;
  return (
    profiles.get(p.parentType) ||
    profiles.get(`SMProfile-${p.parentType}`) ||
    [...profiles.values()].find((x) => x.kgNodeLabel === p.parentType || x.displayName === p.parentType) ||
    null
  );
}

// name -> {attr, profileId}  (own overrides inherited)
// Exported: ci/lint-kpis.mjs resolves KPI input mappings against the same
// inheritance the guard checks use — shared, so the two gates cannot drift.
export function effectiveAttrs(profileId, profiles) {
  const out = new Map();
  const chain = [];
  let p = profiles.get(profileId);
  const seen = new Set();
  while (p && !seen.has(p.profileId)) {
    seen.add(p.profileId);
    chain.push(p);
    p = resolveParent(p, profiles);
  }
  for (const prof of chain.reverse()) {
    for (const a of prof.attributes ?? []) out.set(a.name, { attr: a, profileId: prof.profileId });
  }
  return out;
}

// Every profile that inherits from `profileId` (a source mapping onto the
// parent also fills the child's attribute).
// Exported for ci/lint-kpis.mjs (appliesTo expansion + fed-ness family).
export function selfAndDescendants(profileId, profiles) {
  const out = new Set([profileId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of profiles.values()) {
      if (out.has(p.profileId)) continue;
      const parent = resolveParent(p, profiles);
      if (parent && out.has(parent.profileId)) {
        out.add(p.profileId);
        grew = true;
      }
    }
  }
  return out;
}

// ---- sources: what can an attribute actually HOLD? -------------------------
//
// A mapping is PINNING when the set of values it can deliver is knowable from
// the SSOT alone:
//   { const: "fertig", smAttribute: "status" }              -> {"fertig"}
//   { valueMap: {"ACTIVE":"RUNNING","*":"IDLE"}, ... }      -> {"RUNNING","IDLE"}
//        (a "*" default makes the map TOTAL — nothing else can pass through)
// A valueMap WITHOUT a "*" default lets unmapped values through unchanged, so
// it only CONTRIBUTES values; it does not pin the attribute.
// A plain column / OPC-UA node / MTConnect dataItem is FREE: the vocabulary
// lives in the plant, not in the repo -> that is exactly what the nightly
// drift check measures.

const MAPPING_KEYS = ["columnMappings", "nodeMappings", "dataItemMappings", "mappings"];

// Exported: ci/lint-kpis.mjs asks the same question ("does any source FEED
// this attribute?") — one loader, one answer.
export function loadSourceMappings(roots) {
  const out = []; // { file, sourceId, profileRef, smAttribute, kind, pinned:Set|null, contributes:Set }
  for (const root of roots) {
    for (const f of jsonFiles(root)) {
      let j;
      try {
        j = readJson(f);
      } catch {
        continue; // shape errors are another linter's job
      }
      if (!j.profileRef) continue;
      for (const key of MAPPING_KEYS) {
        for (const m of j[key] ?? []) {
          if (!m || !m.smAttribute) continue;
          const rec = {
            file: f,
            sourceId: j.sourceId || j.mapId || f,
            profileRef: j.profileRef,
            smAttribute: m.smAttribute,
            kind: key,
            pinned: null,
            contributes: new Set(),
          };
          if (Object.prototype.hasOwnProperty.call(m, "const")) {
            rec.pinned = new Set([m.const]);
            rec.contributes = new Set([m.const]);
            rec.why = `pins it to the constant ${JSON.stringify(m.const)}`;
          } else if (m.valueMap && typeof m.valueMap === "object") {
            const image = new Set(Object.values(m.valueMap));
            rec.contributes = image;
            if (Object.prototype.hasOwnProperty.call(m.valueMap, "*")) {
              rec.pinned = image; // total map -> image is the whole vocabulary
              rec.why = `maps every incoming value into {${[...image].map((v) => JSON.stringify(v)).join(", ")}} (valueMap with "*" default)`;
            } else {
              rec.why = `maps some values into {${[...image].map((v) => JSON.stringify(v)).join(", ")}} (valueMap without "*" default — unmapped values pass through)`;
            }
          }
          out.push(rec);
        }
      }
    }
  }
  return out;
}

// The deliverable vocabulary of profileId.attrName, as far as the SSOT knows.
//   { pinned: Set|null, contributed: Set, sources: [...] }
// pinned !== null  <=>  every source that maps this attribute pins it
//                        => the vocabulary is COMPLETE and knowable offline.
function deliverable(profileId, attrName, profiles, mappings) {
  const family = selfAndDescendants(profileId, profiles);
  // also accept a mapping declared on an ANCESTOR profile
  const ancestors = new Set();
  let p = profiles.get(profileId);
  const seen = new Set();
  while (p && !seen.has(p.profileId)) {
    seen.add(p.profileId);
    ancestors.add(p.profileId);
    p = resolveParent(p, profiles);
  }
  const relevant = mappings.filter(
    (m) => m.smAttribute === attrName && (family.has(m.profileRef) || ancestors.has(m.profileRef))
  );
  if (relevant.length === 0) return { pinned: null, contributed: new Set(), sources: [] };
  const contributed = new Set();
  let allPin = true;
  for (const m of relevant) {
    for (const v of m.contributes) contributed.add(v);
    if (!m.pinned) allPin = false;
  }
  return { pinned: allPin ? contributed : null, contributed, sources: relevant };
}

// ---- did-you-mean ----------------------------------------------------------

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function didYouMean(literal, allowed) {
  if (typeof literal !== "string") return null;
  const ci = allowed.find((v) => typeof v === "string" && v.toLowerCase() === literal.toLowerCase());
  if (ci) return ci;
  const scored = allowed
    .filter((v) => typeof v === "string")
    .map((v) => ({ v, d: editDistance(literal.toLowerCase(), v.toLowerCase()) }))
    .sort((x, y) => x.d - y.d)[0];
  if (scored && scored.d <= Math.max(2, Math.floor(literal.length / 2))) return scored.v;
  return null;
}

const list = (vals) => vals.map((v) => JSON.stringify(v)).join(", ");

// ---- the checks ------------------------------------------------------------

function checkGuard(g, profiles, mappings, errors) {
  // g: { label, profileId, attrName, op, literals: [...], file }
  const attrs = effectiveAttrs(g.profileId, profiles);
  const hit = attrs.get(g.attrName);
  if (!hit) {
    errors.push(
      `${g.label}: attribute "${g.attrName}" does not exist on ${g.profileId} (parentType chain searched) — the guard can never match.`
    );
    return;
  }
  const attr = hit.attr;
  const dt = attr.dataType;
  const checker = TYPE_CHECK[dt];

  // R4 — a declared enum must be type-clean
  if (Array.isArray(attr.enum) && checker) {
    for (const v of attr.enum) {
      if (!checker(v)) {
        errors.push(
          `${g.profileId}.${g.attrName}: enum member ${JSON.stringify(v)} does not match dataType=${dt}.`
        );
      }
    }
  }

  const dv = deliverable(g.profileId, g.attrName, profiles, mappings);

  // R2 — declaration vs source (only meaningful once an enum exists)
  if (Array.isArray(attr.enum)) {
    for (const v of dv.contributed) {
      if (!attr.enum.includes(v)) {
        const src = dv.sources.find((s) => s.contributes.has(v));
        errors.push(
          `${g.profileId}.${g.attrName}: source "${src.sourceId}" can deliver ${JSON.stringify(v)}, ` +
            `but the declared enum does not contain it. Declared: ${list(attr.enum)}. ` +
            `The declaration is incomplete — a value that reaches the graph must be in the vocabulary.`
        );
      }
    }
    if (dv.pinned) {
      for (const v of attr.enum) {
        if (!dv.pinned.has(v)) {
          errors.push(
            `${g.profileId}.${g.attrName}: enum declares ${JSON.stringify(v)}, but no source can ever deliver it ` +
              `(${dv.sources.map((s) => `"${s.sourceId}" ${s.why}`).join("; ")}). ` +
              `Deliverable: ${list([...dv.pinned])}. A declared value that cannot occur is fiction.`
          );
        }
      }
    }
  }

  for (const lit of g.literals) {
    // type
    if (checker && !checker(lit)) {
      errors.push(
        `${g.label}: literal ${JSON.stringify(lit)} does not match attribute "${g.attrName}" dataType=${dt} — it can never compare equal.`
      );
      continue;
    }

    // R1 — literal vs the source-pinned vocabulary (no human declaration trusted)
    if (dv.pinned && !dv.pinned.has(lit)) {
      const hint = didYouMean(lit, [...dv.pinned]);
      errors.push(
        `${g.label}: ${JSON.stringify(lit)} can NEVER occur in ${g.profileId}.${g.attrName}. ` +
          `${dv.sources.map((s) => `Source "${s.sourceId}" ${s.why}`).join("; ")}. ` +
          `Deliverable values: ${list([...dv.pinned])}.` +
          (hint ? ` Did you mean ${JSON.stringify(hint)}?` : "") +
          ` => This guard filters NOTHING (op=${g.op}) — it is dead.`
      );
      continue;
    }

    // R3 — fail-closed: a String equality guard without a declared vocabulary
    if (dt === "String" && !Array.isArray(attr.enum)) {
      errors.push(
        `${g.label}: attribute ${g.profileId}.${g.attrName} (String) is compared to the literal ${JSON.stringify(lit)}, ` +
          `but it declares no "enum" — so the literal cannot be verified against any vocabulary. ` +
          `Declare the measured value range as attributes[].enum in the profile (SSOT), or the next dead literal ` +
          `will pass CI in silence. (Fail-closed: no vocabulary, no guard.)`
      );
      continue;
    }

    // R5 — literal vs declared enum
    if (Array.isArray(attr.enum) && !attr.enum.includes(lit)) {
      const hint = didYouMean(lit, attr.enum);
      errors.push(
        `${g.label}: ${JSON.stringify(lit)} does not occur in ${g.profileId}.${g.attrName}.` +
          (hint ? ` You probably meant ${JSON.stringify(hint)}.` : "") +
          ` Existing values: ${list(attr.enum)}. => This guard filters NOTHING (op=${g.op}) — it is dead.`
      );
    }
  }
}

// ---- guard inventory -------------------------------------------------------

// A rule that is `retired` or `parked` is INERT — the engine never evaluates it.
// Its `when` clause is deliberately preserved VERBATIM as a tombstone: it is the
// evidence of the defect, not a live configuration. Linting it would demand we
// "fix" a dead guard, which would destroy the record — and would keep CI red
// forever on exactly the rules we retired for having a dead guard.
//
// This is the same rule ci/lint-cross-constraints.mjs already applies (see its
// `inert` handling). The two guards were written on separate branches and only
// one of them had learned it; the integration merge is where that is reconciled.
//
// Fail-closed is preserved where it matters: a LIVE rule with a dead literal
// still fails the build. Inertness must be DECLARED (retired/parked + a reason),
// it is never inferred.
export function isInert(rule) {
  return rule?.retired === true || rule?.parked === true;
}

export function collectGuards(profiles, crossRoot) {
  const guards = [];

  // 1. profile constraints[].when / .require
  for (const p of profiles.values()) {
    for (const c of p.constraints ?? []) {
      if (isInert(c)) continue; // tombstone: evidence, not configuration
      for (const slot of ["when", "require"]) {
        const pred = c[slot];
        if (!pred || !EQ_OPS.has(pred.op)) continue;
        if (pred.value === undefined) continue; // valueAttr/valueFrom: no literal
        const literals = pred.op === "in" ? (Array.isArray(pred.value) ? pred.value : [pred.value]) : [pred.value];
        guards.push({
          label: `constraint ${p.profileId}#${c.name}.${slot}`,
          profileId: p.profileId,
          attrName: pred.attr,
          op: pred.op,
          literals,
          file: p.__file,
        });
      }
    }
  }

  // 2. cross-constraints
  for (const f of jsonFiles(crossRoot)) {
    let c;
    try {
      c = readJson(f);
    } catch {
      continue;
    }
    if (!c.crossConstraintId) continue;
    if (isInert(c)) continue; // tombstone: evidence, not configuration
    const id = c.crossConstraintId;

    if (c.when && c.left?.profileRef && c.when.leftAttr) {
      const op = c.when.eq !== undefined ? "eq" : c.when.ne !== undefined ? "ne" : null;
      if (op) {
        guards.push({
          label: `cross-constraint ${id}.when`,
          profileId: c.left.profileRef,
          attrName: c.when.leftAttr,
          op,
          literals: [op === "eq" ? c.when.eq : c.when.ne],
          file: f,
        });
      }
    }

    const filt = c.aggregate?.filter;
    if (filt && c.right?.profileRef && filt.attr) {
      const op = filt.eq !== undefined ? "eq" : filt.ne !== undefined ? "ne" : null;
      if (op) {
        guards.push({
          label: `cross-constraint ${id}.aggregate.filter`,
          profileId: c.right.profileRef,
          attrName: filt.attr,
          op,
          literals: [op === "eq" ? filt.eq : filt.ne],
          file: f,
        });
      }
    }
  }

  return guards;
}

// ---- recipes: a band that matches no machine never resolves ----------------

// The machine-id namespace is CLOSED: every machine we ingest declares its id
// in a source (sources/**/*.json -> machineId). A recipe whose match.equipment
// is not in that set can never bind to a machine — and, like every corpse in
// this file, it fails in silence (the band simply never resolves).
function checkRecipes(roots, errors) {
  const machineIds = new Set();
  for (const root of roots) {
    for (const f of jsonFiles(root)) {
      let j;
      try {
        j = readJson(f);
      } catch {
        continue;
      }
      if (j.machineId) machineIds.add(j.machineId);
    }
  }
  let n = 0;
  for (const f of jsonFiles(RECIPES_ROOT)) {
    let r;
    try {
      r = readJson(f);
    } catch {
      continue;
    }
    if (!r.recipeId || !r.match) continue;
    n++;
    const eq = r.match.equipment;
    if (eq === undefined) continue;
    if (machineIds.size === 0) continue; // no sources loaded (fixture) -> nothing to check against
    if (!machineIds.has(eq)) {
      const hint = didYouMean(eq, [...machineIds]);
      errors.push(
        `recipe ${r.recipeId}: match.equipment ${JSON.stringify(eq)} is not a machine id declared in sources/ ` +
          `(known: ${list([...machineIds].sort())}).` +
          (hint ? ` Did you mean ${JSON.stringify(hint)}?` : "") +
          ` => This recipe can never bind to a machine; its bands never resolve.`
      );
    }
  }
  return n;
}

// ---- main ------------------------------------------------------------------

function main() {
  const profiles = loadProfiles(PROFILES_ROOT);
  const mappings = loadSourceMappings(SOURCES_ROOTS);
  const guards = collectGuards(profiles, CROSS_ROOT);
  const errors = [];

  for (const g of guards) checkGuard(g, profiles, mappings, errors);
  const nRecipes = checkRecipes(SOURCES_ROOTS, errors);

  console.log(
    `lint-vocabulary: ${profiles.size} profiles, ${mappings.length} source mappings, ` +
      `${guards.length} value guards, ${nRecipes} recipe match(es) checked`
  );
  if (errors.length) {
    console.error(`\nFAIL — ${errors.length} dead or unverifiable literal(s):\n`);
    for (const e of errors) console.error("  ✗ " + e + "\n");
    console.error(
      "A guard whose literal never occurs filters NOTHING and stays silent.\n" +
        "Fix the literal, or declare the measured vocabulary as attributes[].enum in the profile.\n" +
        "The vocabulary is measured against the real source — see ci/check-vocab-drift.mjs.\n"
    );
    process.exit(1);
  }
  console.log("OK — every guard literal is drawn from a declared / source-pinned vocabulary");
}

// Only run when invoked as a script — ci/check-vocab-drift.mjs imports the
// guard inventory from here so the two layers can never drift apart.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();

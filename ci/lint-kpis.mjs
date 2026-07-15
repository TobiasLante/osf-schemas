#!/usr/bin/env node
// ci/lint-kpis.mjs — THE KPI VOCABULARY GATE (fail-closed, offline)
//
// WHY THIS EXISTS
// ---------------
// The 2026-07-15 full audit found all 6 kpis/*.json computing over attributes
// that existed in NO active profile and NO source: Good_Parts, Scrap_Parts,
// Rework_Parts, Machine_Status, Cycle_Time_Planned/Actual, Energy_kWh.
// The consumer (i3x-v4 services/kpi-export) transpiles calculation.cypher to a
// JS expression over `inputs[<name>]` and renders a Node-RED flow whose gate
// waits until EVERY declared input has arrived at least once. An input that no
// source ever feeds therefore does not error — the KPI simply NEVER FIRES, in
// silence. Its fuzzy attribute matcher rescued a few names by accident on the
// IMM and starved on the CNC. Where a linter exists = clean; where none = rot.
// This is that linter. NO KPI ships an input the wire cannot answer.
//
// THE INPUT-MAPPING CONTRACT (what this file enforces)
//   calculation.inputs        canonical input names read by the cypher (m.<x>)
//   calculation.inputMappings { <concreteProfileId>: { <wireAttribute>: <input> } }
//       — one entry PER non-abstract profile the KPI applies to; the inner
//       object is exactly the consumer's KpiFlowOptions.inputMap shape
//       (attr -> input), so the exporter can pass it through unchanged.
//   appliesTo                 profileIds; abstract ids expand to their
//                             non-abstract descendants.
//   parked: true              the KPI is declared inert (parkedReason required)
//       because a measured precondition is missing. Parking is POLICED: the
//       moment every mapped input IS fed by a source, this gate turns RED —
//       a parked rule whose precondition is met is a lie (late_delivery lesson).
//
// WHAT IT CHECKS (all STATIC — no DB, no network, deterministic on a runner)
//   K1  structure: kpiId unique, calculation.inputs/.cypher present,
//       appliesTo non-empty, parked => parkedReason.
//   K2  appliesTo resolves to existing profiles and expands to >=1
//       non-abstract profile.
//   K3  refs both ways: every profiles/** kpiRef resolves to an existing
//       kpiId; every applicable profile carries the kpiId in its effective
//       (inheritance-resolved) kpiRefs.
//   K4  mappings: every applicable profile has an inputMappings entry; every
//       mapping KEY is a real attribute of that profile (after inheritance);
//       every mapping VALUE is a declared input; every input is mapped exactly
//       once per profile; no mapping for a profile the KPI does not apply to.
//   K5  fed-ness: every mapping key is fed by >=1 source (sources/ + mappings/,
//       matching a profileRef in the profile's family) — the audit disease was
//       exactly an input no source feeds. Inverted for parked KPIs (see above).
//   K6  cypher refs: every m.<x> is a declared input (an undeclared one
//       resolves to undefined at runtime and poisons the result in silence);
//       every declared input is read by the cypher (an unread-but-required
//       input blocks the consumer's gate for nothing).
//   K7  literals: every literal compared against m.<x> must, for EVERY
//       applicable profile, match the mapped attribute's dataType, and a
//       String comparison requires a declared (measured) enum containing the
//       literal — no vocabulary, no guard (fail-closed; same law as
//       ci/lint-vocabulary.mjs R3/R5). A string literal OUTSIDE a comparison
//       with m.<x> is unverifiable => ERROR.
//
// WHAT IT DOES NOT CHECK
//   Whether declared enums match the world (nightly ci/check-vocab-drift.mjs),
//   and whether the consumer passes inputMappings through as inputMap (today
//   it relies on its built-in name matcher; the explicit pass-through is a
//   consumer-side follow-up documented in the KPI descriptions).
//
// Run:   node ci/lint-kpis.mjs
// Test:  node ci/test-lint-kpis.mjs   (negative test: every broken shape MUST
//        turn this red — proven, not asserted)
// Roots overridable for fixtures: KPIS_ROOT, PROFILES_ROOT, SOURCES_ROOTS
// Exits non-zero on any error.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

import {
  loadProfiles,
  loadSourceMappings,
  effectiveAttrs,
  selfAndDescendants,
  resolveParent,
} from "./lint-vocabulary.mjs";

const HERE = new URL(".", import.meta.url).pathname; // …/ci/
const REPO = join(HERE, "..");

const KPIS_ROOT = process.env.KPIS_ROOT || join(REPO, "kpis");
const PROFILES_ROOT = process.env.PROFILES_ROOT || join(REPO, "profiles");
const SOURCES_ROOTS = (process.env.SOURCES_ROOTS || [join(REPO, "sources"), join(REPO, "mappings")].join(":"))
  .split(":")
  .filter(Boolean);

const TYPE_CHECK = {
  Int32: (v) => Number.isInteger(v),
  Int64: (v) => Number.isInteger(v),
  Float: (v) => typeof v === "number" && Number.isFinite(v),
  Double: (v) => typeof v === "number" && Number.isFinite(v),
  String: (v) => typeof v === "string",
  Boolean: (v) => typeof v === "boolean",
};

// ---- io ---------------------------------------------------------------------

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

// ---- inheritance helpers ----------------------------------------------------

function ancestorIds(profileId, profiles) {
  const out = new Set();
  let p = profiles.get(profileId);
  const seen = new Set();
  while (p && !seen.has(p.profileId)) {
    seen.add(p.profileId);
    out.add(p.profileId);
    p = resolveParent(p, profiles);
  }
  return out;
}

// kpiRefs union along the parent chain — a ref on the abstract parent applies
// to every concrete child, mirroring how attributes inherit.
function effectiveKpiRefs(profileId, profiles) {
  const out = new Set();
  let p = profiles.get(profileId);
  const seen = new Set();
  while (p && !seen.has(p.profileId)) {
    seen.add(p.profileId);
    for (const r of p.kpiRefs ?? []) out.add(r);
    p = resolveParent(p, profiles);
  }
  return out;
}

// appliesTo entry -> the non-abstract profiles it means.
function expandAppliesTo(ids, profiles) {
  const concrete = new Set();
  const missing = [];
  for (const id of ids) {
    if (!profiles.has(id)) {
      missing.push(id);
      continue;
    }
    for (const pid of selfAndDescendants(id, profiles)) {
      const p = profiles.get(pid);
      if (p && p.abstract !== true) concrete.add(pid);
    }
  }
  return { concrete: [...concrete].sort(), missing };
}

// ---- fed-ness: does any source FEED this attribute for this profile? --------

function fedAttrsFor(profileId, profiles, mappings) {
  const family = new Set([...selfAndDescendants(profileId, profiles), ...ancestorIds(profileId, profiles)]);
  const fed = new Set();
  for (const m of mappings) {
    if (family.has(m.profileRef)) fed.add(m.smAttribute);
  }
  return fed;
}

// ---- cypher scan -------------------------------------------------------------
//
// The consumer's transpiler accepts a closed Cypher subset. We do not
// re-transpile here; we extract two facts, fail-closed:
//   - every m.<x> reference,
//   - every literal that is COMPARED against an m.<x> (m.x = lit, lit = m.x,
//     m.x <> lit, m.x IN [lit, ...]).
// Any string literal we cannot attribute to such a comparison is unverifiable
// and therefore an error.

function tokenizeCypher(src, label, errors) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if ("()[],.+-*/".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    if ("<>!=".includes(c)) {
      const two = src.slice(i, i + 2);
      if (["<=", ">=", "<>", "!="].includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
      toks.push({ t: "op", v: c }); i++; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j++;
      if (j >= src.length) {
        errors.push(`${label}: unterminated string literal in cypher.`);
        return toks;
      }
      toks.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j; continue;
    }
    errors.push(`${label}: unexpected character '${c}' in cypher.`);
    return toks;
  }
  return toks;
}

const CMP_OPS = new Set(["=", "<>", "!=", "<", ">", "<=", ">="]);

// -> { refs: Set<input>, guards: [{input, literals:[...]}], strayStrings: [...] }
function scanCypher(cypher, label, errors) {
  const toks = tokenizeCypher(String(cypher ?? ""), label, errors);
  const refs = new Set();
  const guards = [];
  const usedStr = new Set(); // token indices consumed by a comparison

  const mRefAt = (i) =>
    toks[i]?.t === "ident" && toks[i].v.toLowerCase() === "m" &&
    toks[i + 1]?.t === "op" && toks[i + 1].v === "." &&
    toks[i + 2]?.t === "ident"
      ? toks[i + 2].v
      : null;

  for (let i = 0; i < toks.length; i++) {
    const name = mRefAt(i);
    if (!name) continue;
    refs.add(name);
    const after = i + 3;

    // m.x <cmp> literal
    if (toks[after]?.t === "op" && CMP_OPS.has(toks[after].v)) {
      const lit = toks[after + 1];
      if (lit?.t === "str" || lit?.t === "num") {
        guards.push({ input: name, literals: [lit.v] });
        if (lit.t === "str") usedStr.add(after + 1);
      }
    }
    // literal <cmp> m.x
    if (toks[i - 1]?.t === "op" && CMP_OPS.has(toks[i - 1].v)) {
      const lit = toks[i - 2];
      if (lit?.t === "str" || lit?.t === "num") {
        guards.push({ input: name, literals: [lit.v] });
        if (lit.t === "str") usedStr.add(i - 2);
      }
    }
    // m.x IN [lit, ...]
    if (toks[after]?.t === "ident" && toks[after].v.toUpperCase() === "IN" &&
        toks[after + 1]?.t === "op" && toks[after + 1].v === "[") {
      const lits = [];
      let j = after + 2;
      while (j < toks.length && !(toks[j].t === "op" && toks[j].v === "]")) {
        if (toks[j].t === "str" || toks[j].t === "num") {
          lits.push(toks[j].v);
          if (toks[j].t === "str") usedStr.add(j);
        }
        j++;
      }
      if (lits.length) guards.push({ input: name, literals: lits });
    }
  }

  const strayStrings = [];
  toks.forEach((t, idx) => {
    if (t.t === "str" && !usedStr.has(idx)) strayStrings.push(t.v);
  });
  return { refs, guards, strayStrings };
}

// ---- the checks ---------------------------------------------------------------

const list = (vals) => vals.map((v) => JSON.stringify(v)).join(", ");

export function lintKpis({ kpisRoot, profilesRoot, sourcesRoots }) {
  const errors = [];
  const profiles = loadProfiles(profilesRoot);
  const mappings = loadSourceMappings(sourcesRoots);
  const anySources = mappings.length > 0; // fixture safety: no sources at all => skip fed-ness

  // load KPI files
  const kpis = [];
  const byId = new Map();
  for (const f of jsonFiles(kpisRoot)) {
    let k;
    try {
      k = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      errors.push(`${basename(f)}: invalid JSON (${e.message}).`);
      continue;
    }
    k.__file = basename(f);
    if (!k.kpiId || typeof k.kpiId !== "string") {
      errors.push(`${k.__file}: missing kpiId — the consumer skips such a file with a warn; the catalog silently shrinks.`);
      continue;
    }
    if (byId.has(k.kpiId)) {
      errors.push(`${k.__file}: duplicate kpiId ${JSON.stringify(k.kpiId)} (also in ${byId.get(k.kpiId).__file}).`);
      continue;
    }
    byId.set(k.kpiId, k);
    kpis.push(k);
  }

  // K3a — every kpiRef in profiles/ resolves
  for (const p of profiles.values()) {
    for (const r of p.kpiRefs ?? []) {
      if (!byId.has(r)) {
        errors.push(`profile ${p.profileId}: kpiRefs entry ${JSON.stringify(r)} does not resolve to any kpis/*.json kpiId.`);
      }
    }
  }

  let nGuards = 0;
  let nParked = 0;

  for (const k of kpis) {
    const label = `kpi ${k.kpiId} (${k.__file})`;
    const parked = k.parked === true;
    if (parked) nParked++;

    // K1 — structure
    if (parked && !(typeof k.parkedReason === "string" && k.parkedReason.trim().length > 0)) {
      errors.push(`${label}: parked without a parkedReason — inertness must be DECLARED with its reason, or it is a silent hole.`);
    }
    const inputs = k?.calculation?.inputs;
    const cypher = k?.calculation?.cypher;
    if (!Array.isArray(inputs) || inputs.length === 0) {
      errors.push(`${label}: calculation.inputs is missing/empty — the consumer refuses to render such a KPI.`);
      continue;
    }
    if (typeof cypher !== "string" || cypher.trim().length === 0) {
      errors.push(`${label}: calculation.cypher is missing/empty.`);
      continue;
    }
    if (!Array.isArray(k.appliesTo) || k.appliesTo.length === 0) {
      errors.push(`${label}: appliesTo is missing/empty — a KPI that applies to nothing is dead config.`);
      continue;
    }

    // K2 — appliesTo expansion
    const { concrete, missing } = expandAppliesTo(k.appliesTo, profiles);
    for (const id of missing) {
      errors.push(`${label}: appliesTo ${JSON.stringify(id)} does not resolve to any profile.`);
    }
    if (missing.length) continue;
    if (concrete.length === 0) {
      errors.push(`${label}: appliesTo ${list(k.appliesTo)} expands to NO non-abstract profile — the KPI can never bind to a machine.`);
      continue;
    }

    // K3b — every applicable profile must reference the KPI (own or inherited)
    for (const pid of concrete) {
      if (!effectiveKpiRefs(pid, profiles).has(k.kpiId)) {
        errors.push(
          `${label}: applies to ${pid}, but neither ${pid} nor any ancestor lists ${JSON.stringify(k.kpiId)} in kpiRefs — ` +
            `the profile would never advertise the KPI it is supposed to carry.`
        );
      }
    }

    // K4 — per-profile input mappings
    const im = k?.calculation?.inputMappings ?? {};
    const concreteSet = new Set(concrete);
    for (const pid of Object.keys(im)) {
      if (!concreteSet.has(pid)) {
        errors.push(
          `${label}: inputMappings declares ${JSON.stringify(pid)}, but the KPI does not apply to it ` +
            `(appliesTo ${list(k.appliesTo)} expands to ${list(concrete)}) — dead config, or appliesTo is wrong.`
        );
      }
    }

    const inputSet = new Set(inputs);
    // input -> per-profile attribute name (needed for K7)
    const attrForInput = new Map(); // pid -> Map(input -> attrName)

    for (const pid of concrete) {
      const mapping = im[pid];
      if (!mapping || typeof mapping !== "object") {
        errors.push(
          `${label}: no inputMappings entry for ${pid} — without it the wire attribute names of this machine type ` +
            `cannot be bound to the declared inputs (fail-closed: no mapping, no KPI).`
        );
        continue;
      }
      const attrs = effectiveAttrs(pid, profiles);
      const fed = anySources ? fedAttrsFor(pid, profiles, mappings) : null;
      const seenInputs = new Map(); // input -> attrName
      const missingFeeds = [];
      for (const [attrName, inputName] of Object.entries(mapping)) {
        if (!attrs.has(attrName)) {
          errors.push(
            `${label}: inputMappings[${pid}] key ${JSON.stringify(attrName)} is NOT an attribute of ${pid} ` +
              `(parentType chain searched) — this is the audit disease: an input drawn from a vocabulary that does not exist.`
          );
          continue;
        }
        if (!inputSet.has(inputName)) {
          errors.push(
            `${label}: inputMappings[${pid}] maps ${JSON.stringify(attrName)} -> ${JSON.stringify(inputName)}, ` +
              `which is not a declared calculation.input (${list(inputs)}).`
          );
          continue;
        }
        if (seenInputs.has(inputName)) {
          errors.push(
            `${label}: inputMappings[${pid}] binds input ${JSON.stringify(inputName)} twice ` +
              `(${JSON.stringify(seenInputs.get(inputName))} and ${JSON.stringify(attrName)}) — last-write-wins on the edge is nondeterminism.`
          );
          continue;
        }
        seenInputs.set(inputName, attrName);
        // K5 — fed-ness
        if (fed && !fed.has(attrName)) missingFeeds.push(attrName);
      }
      for (const input of inputs) {
        if (!seenInputs.has(input)) {
          errors.push(
            `${label}: input ${JSON.stringify(input)} has no mapping for ${pid} — the consumer's gate waits for ALL inputs; ` +
              `an unmapped one never arrives and the KPI never fires, silently.`
          );
        }
      }
      attrForInput.set(pid, seenInputs);

      if (fed) {
        if (!parked) {
          for (const attrName of missingFeeds) {
            errors.push(
              `${label}: inputMappings[${pid}] key ${JSON.stringify(attrName)} is an attribute of ${pid}, but it is fed by NO source ` +
                `(sources/ + mappings/ searched) — declared-but-never-delivered is exactly how a KPI dies in silence. ` +
                `Feed it from a source, or park the KPI with the reason.`
            );
          }
        } else if (missingFeeds.length === 0 && Object.keys(mapping).length > 0) {
          errors.push(
            `${label}: parked, but EVERY mapped input for ${pid} is now fed by a source — the parking reason no longer matches ` +
              `reality. Unpark it, or re-state the actual blocker in parkedReason (a parked rule whose precondition is met is a lie).`
          );
        }
      }
    }

    // K6 — cypher <-> inputs
    const { refs, guards, strayStrings } = scanCypher(cypher, label, errors);
    for (const r of refs) {
      if (!inputSet.has(r)) {
        errors.push(
          `${label}: cypher reads m.${r}, which is not a declared calculation.input (${list(inputs)}) — ` +
            `at runtime it resolves to undefined and poisons the result in silence.`
        );
      }
    }
    for (const input of inputs) {
      if (!refs.has(input)) {
        errors.push(
          `${label}: input ${JSON.stringify(input)} is declared but never read by the cypher — the consumer's gate would ` +
            `block the whole KPI waiting for a value the formula ignores.`
        );
      }
    }
    for (const s of strayStrings) {
      errors.push(
        `${label}: string literal ${JSON.stringify(s)} appears in the cypher outside a comparison with an m.<input> — ` +
          `it cannot be verified against any vocabulary (fail-closed: unverifiable literal, no pass).`
      );
    }

    // K7 — literals vs the mapped attribute's vocabulary, per applicable profile
    for (const g of guards) {
      nGuards++;
      if (!inputSet.has(g.input)) continue; // already reported by K6
      for (const pid of concrete) {
        const inputToAttr = attrForInput.get(pid);
        const attrName = inputToAttr?.get(g.input);
        if (!attrName) continue; // missing mapping already reported by K4
        const hit = effectiveAttrs(pid, profiles).get(attrName);
        if (!hit) continue; // phantom key already reported by K4
        const attr = hit.attr;
        const dt = attr.dataType;
        const checker = TYPE_CHECK[dt];
        for (const lit of g.literals) {
          if (checker && !checker(lit)) {
            errors.push(
              `${label}: literal ${JSON.stringify(lit)} is compared against m.${g.input} -> ${pid}.${attrName} ` +
                `(dataType=${dt}) — it can never compare equal.`
            );
            continue;
          }
          if (typeof lit === "string") {
            if (!Array.isArray(attr.enum)) {
              errors.push(
                `${label}: m.${g.input} -> ${pid}.${attrName} (String) is compared to ${JSON.stringify(lit)}, but the attribute ` +
                  `declares no "enum" — the vocabulary is unmeasured, so the literal cannot be verified. ` +
                  `Measure the population and declare attributes[].enum first (fail-closed: no vocabulary, no guard).`
              );
              continue;
            }
            if (!attr.enum.includes(lit)) {
              const ci = attr.enum.find((v) => typeof v === "string" && v.toLowerCase() === lit.toLowerCase());
              errors.push(
                `${label}: ${JSON.stringify(lit)} does not occur in ${pid}.${attrName}.` +
                  (ci ? ` You probably meant ${JSON.stringify(ci)}.` : "") +
                  ` Measured values: ${list(attr.enum)}. => This arm matches NOTHING — it is dead.`
              );
            }
          }
        }
      }
    }
  }

  return { errors, nKpis: kpis.length, nProfiles: profiles.size, nGuards, nParked };
}

// ---- main -----------------------------------------------------------------------

function main() {
  const { errors, nKpis, nProfiles, nGuards, nParked } = lintKpis({
    kpisRoot: KPIS_ROOT,
    profilesRoot: PROFILES_ROOT,
    sourcesRoots: SOURCES_ROOTS,
  });
  console.log(
    `lint-kpis: ${nKpis} KPIs (${nParked} parked), ${nProfiles} profiles, ${nGuards} cypher guard(s) checked`
  );
  if (errors.length) {
    console.error(`\nFAIL — ${errors.length} KPI vocabulary error(s):\n`);
    for (const e of errors) console.error("  ✗ " + e + "\n");
    console.error(
      "A KPI input no source feeds never arrives — the consumer's gate waits forever and the KPI\n" +
        "never fires, in silence. Draw every input from the per-profile inputMappings, feed every\n" +
        "mapped attribute from a source, and guard only on measured enums.\n"
    );
    process.exit(1);
  }
  console.log("OK — every KPI input is drawn from the real, source-fed vocabulary of every profile it applies to");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();

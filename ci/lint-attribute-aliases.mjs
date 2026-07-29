#!/usr/bin/env node
// ci/lint-attribute-aliases.mjs
//
// Guards the cross-profile attribute equivalences in mappings/attribute-aliases.json.
//
// WHY IT EXISTS. Before this file, osf-schemas declared "these two differently-named
// attributes mean the same thing" in exactly ONE place — `kpis/*.json
// calculation.inputMappings` — and only for two semantics (part_good, part_scrap). That
// construct is KPI-local: three of the six KPIs carry identity mappings
// (`Act_Status_Machine` -> `Act_Status_Machine`), so it is a per-cypher binding, not a
// synonym registry. Every other equivalence in the fleet was therefore INFERRED at the
// point of use, from prose and from contracts that happened to match. `Act_State_InCycle`
// == `inCycle` and `Act_Energy_Power` == `powerKw` are both real and both were undeclared.
//
// AN INFERENCE IS NOT A DECLARATION, and the difference is not academic in this repo:
// `parameters[].gate` in a recipe was believed to be the operative guard, was read by
// nobody, and drifted from the profile constraint that actually runs — 17 days, green in
// CI (CAPT-REGIME, same branch). A declared equivalence that nothing checks would be the
// same trap with a new name. So this linter is the consumer: it re-derives every claim
// from the profiles and fails the build when one moves.
//
// ERRORS (exit 1):
//   B1  alias file missing / unparseable / fails validation/attribute-alias-schema.json
//   B2  profileRef does not resolve to a profile under profiles/
//   B3  a member names an attribute the profile does not declare
//   B4  a member's wire kind disagrees with the semantic's declared wireKind
//   B5  a member's unit disagrees with the semantic's declared unit (or is missing while
//       the semantic declares one — a member that does not say what it measures cannot be
//       asserted to measure the same thing)
//   B6  a member's delivery / scope / promotion disagrees with the declared contract
//   B7  the same (profileRef, attribute) pair appears in two semantics — one attribute
//       cannot mean two things, and a consumer resolving it would get whichever it read first
//   B8  two members of one semantic sit on the SAME profile — that is a rename inside one
//       profile, not a cross-profile equivalence, and it belongs in the profile
//   B9  a member's `counter` facet disagrees with the semantic's declared reading semantics
//       (or is missing while the semantic declares one, or present while it declares none)
//   B10 a KPI's calculation.inputMappings maps the SAME (profile, attribute) pair onto a
//       DIFFERENT canonical token than the registry's semantic name
//
// ON B10 — WHY THIS FILE AND kpis/*.json CANNOT DRIFT APART. `inputMappings` stays what it
// is: the KPI-local binding from a profile's wire attribute to the token that KPI's cypher
// reads. This registry is the separate, general statement of MEANING. Both anchor on
// profiles/** so they cannot disagree about which attribute exists where — but nothing
// stopped them from disagreeing about the NAME of the shared meaning, and a resolver that
// reads one while a KPI reads the other would then silently resolve to two different
// tokens for one measurement. B10 closes that: where the two artefacts describe the same
// pair, they must use the same word. Neither file is authoritative over the other; they
// are held equal.
//
// Run:  node ci/lint-attribute-aliases.mjs   (or: npm run validate:attr-aliases)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

const ROOT = process.env.SCHEMAS_ROOT ?? process.cwd();
const ALIAS_FILE = process.env.ATTR_ALIAS_FILE ?? join(ROOT, "mappings", "attribute-aliases.json");
const SCHEMA_FILE = join(ROOT, "validation", "attribute-alias-schema.json");
const PROFILE_DIRS = ["profiles/machines", "profiles/equipment", "profiles/operations"];

/**
 * dataType -> the JSON kind the CONSUMER receives.
 *
 * Deliberately coarser than `dataType`. Float and Double are one thing on the wire, and
 * MEASURED on the live hub (.99 machine_events, 2026-07-29) they are: Act_Energy_Power
 * (Float) and powerKw (Double) both arrive with jsonb_typeof(payload->'value') = 'number';
 * Act_State_InCycle and inCycle (both Boolean) both arrive as 'boolean', with an exhausted
 * value vocabulary of exactly {true, false} on each. Comparing dataType tokens instead
 * would invent a difference no consumer can observe — and would push someone to edit a
 * wire contract to satisfy a linter, which is the tail wagging the dog.
 */
const WIRE_KIND = {
  String: "string",
  Int32: "number",
  Int64: "number",
  Float: "number",
  Double: "number",
  Boolean: "boolean",
  DateTime: "datetime",
  Json: "json",
};

const errors = [];
const warnings = [];

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    errors.push(`${code}  ${path}: ${e.message}`);
    return null;
  }
}

/** profileId -> { attributes: Map(name -> attr), file } over every profile tree we index. */
export function loadProfiles(root = ROOT) {
  const out = new Map();
  for (const dir of PROFILE_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((x) => x.endsWith(".json"))) {
      let p;
      try {
        p = JSON.parse(readFileSync(join(abs, f), "utf-8"));
      } catch {
        continue; // other linters own the parse error for these files
      }
      if (!p?.profileId || !Array.isArray(p.attributes)) continue;
      const attributes = new Map();
      for (const a of p.attributes) if (a?.name) attributes.set(a.name, a);
      out.set(p.profileId, { attributes, file: `${dir}/${f}` });
    }
  }
  return out;
}

/**
 * The whole check, over an already-parsed map. Exported so it can be unit-proven against
 * fixtures without a profiles/ tree on disk.
 */
export function aliasErrors(map, profiles) {
  const errs = [];
  const seen = new Map(); // "profileRef::attribute" -> semantic that already claimed it
  for (const s of map?.semantics ?? []) {
    const label = `semantic "${s.semantic}"`;
    const onProfile = new Set();
    for (const m of s.members ?? []) {
      const where = `${label} member ${m.profileRef}.${m.attribute}`;
      if (onProfile.has(m.profileRef)) {
        errs.push(
          `B8  ${where}: a second member on the SAME profile. Two names for one measurement ` +
            `INSIDE one profile is a rename, not a cross-profile equivalence — resolve it in ` +
            `${m.profileRef} and leave one member here.`,
        );
      }
      onProfile.add(m.profileRef);

      const key = `${m.profileRef}::${m.attribute}`;
      if (seen.has(key)) {
        errs.push(
          `B7  ${where}: already claimed by semantic "${seen.get(key)}". One attribute cannot ` +
            `carry two meanings — a consumer resolving it would silently get whichever it read first.`,
        );
      } else {
        seen.set(key, s.semantic);
      }

      const prof = profiles.get(m.profileRef);
      if (!prof) {
        errs.push(`B2  ${where}: profileRef resolves to no profile under profiles/**`);
        continue;
      }
      const a = prof.attributes.get(m.attribute);
      if (!a) {
        errs.push(
          `B3  ${where}: ${prof.file} declares no such attribute. An equivalence to a name the ` +
            `profile does not publish is dead on arrival — nothing will ever resolve through it.`,
        );
        continue;
      }

      const kind = WIRE_KIND[a.dataType];
      if (kind !== s.wireKind) {
        errs.push(
          `B4  ${where}: dataType ${JSON.stringify(a.dataType)} is wire kind ` +
            `${JSON.stringify(kind ?? "(unknown)")}, but the semantic declares ${JSON.stringify(s.wireKind)}. ` +
            `Two attributes a consumer must handle with different JSON types are not the same measurement.`,
        );
      }

      if (s.unit !== undefined) {
        if (a.unit === undefined) {
          errs.push(
            `B5  ${where}: the semantic declares unit ${JSON.stringify(s.unit)} and ${prof.file} ` +
              `declares NO unit on this attribute. Prose in a description is not a declaration: an ` +
              `attribute that does not say what it measures cannot be asserted to measure the same ` +
              `thing as one that does. Declare the unit on the profile, or drop the member.`,
          );
        } else if (a.unit !== s.unit) {
          errs.push(
            `B5  ${where}: unit ${JSON.stringify(a.unit)} != the semantic's ${JSON.stringify(s.unit)}. ` +
              `A unit mismatch is a magnitude bug waiting for its first consumer.`,
          );
        }
      }

      // B9 — the reading semantics. Same rule as the unit, and for a harder reason: `sum`
      // over a cumulative counter double-counts the whole history and `sum_of_positive_deltas`
      // over a delta stream discards every decrement, and BOTH return a confident number.
      const wantC = s.counter;
      const gotC = a.counter;
      if (wantC && !gotC) {
        errs.push(
          `B9  ${where}: the semantic declares counter ` +
            `{${wantC.semantics}, ${wantC.aggregation}} and ${prof.file} declares NO \`counter\` ` +
            `facet on this attribute. An attribute that does not say HOW it must be read cannot ` +
            `be asserted to read the same way as one that does — and an empty description is not ` +
            `a statement that it is a measurement, it is silence. Measure it, declare the facet, ` +
            `or drop the member.`,
        );
      } else if (!wantC && gotC) {
        errs.push(
          `B9  ${where}: ${prof.file} declares counter {${gotC.semantics}, ${gotC.aggregation}} ` +
            `but the semantic declares none, i.e. claims a plain measurement. A running total ` +
            `averaged as a measurement is arithmetic on a ramp.`,
        );
      } else if (wantC && gotC) {
        for (const k of ["semantics", "aggregation"]) {
          if (gotC[k] !== wantC[k]) {
            errs.push(
              `B9  ${where}: counter.${k} ${JSON.stringify(gotC[k])} != the semantic's ` +
                `${JSON.stringify(wantC[k])}. Two numbers that must be AGGREGATED differently are ` +
                `not the same measurement, however alike they are named.`,
            );
          }
        }
      }

      for (const [field, want] of [
        ["delivery", s.delivery],
        ["scope", s.scope],
        ["promotion", s.promotion],
      ]) {
        if (a[field] !== want) {
          errs.push(
            `B6  ${where}: ${field} ${JSON.stringify(a[field])} != the semantic's ${JSON.stringify(want)}. ` +
              `The delivery contract is part of the identity: two attributes that reach the hub on ` +
              `different cadences (or one of which never reaches it at all) are not interchangeable ` +
              `for anything that reads the hub, however alike they read on their profiles.`,
          );
        }
      }
    }
  }
  return errs;
}

/**
 * B10 — hold the registry and the KPI-local bindings to the SAME WORD.
 *
 * `kpis/*.json calculation.inputMappings` is deliberately untouched by this work: it is
 * the binding a KPI's cypher reads, and three of the six KPIs use it for pure identity
 * mappings, which is not synonymy at all. But where a KPI maps a (profile, attribute) pair
 * that this registry also carries, the canonical token and the semantic name describe the
 * same meaning — and if they ever spelled it differently, a consumer reading the registry
 * and a consumer reading the KPI would resolve one measurement to two tokens, each
 * internally consistent. That is the failure this whole branch keeps meeting: two sources
 * of truth that never meet, so neither is ever seen to be wrong.
 *
 * Exported for unit proof; takes the KPI list so it needs no disk in tests.
 */
export function kpiTokenErrors(map, kpis) {
  const errs = [];
  const warns = [];
  const bySemantic = new Map(); // "profileRef::attribute" -> semantic
  for (const s of map?.semantics ?? []) {
    for (const m of s.members ?? []) bySemantic.set(`${m.profileRef}::${m.attribute}`, s.semantic);
  }
  for (const { file, kpi } of kpis) {
    const mappings = kpi?.calculation?.inputMappings ?? {};
    for (const [profileRef, byAttr] of Object.entries(mappings)) {
      for (const [attribute, token] of Object.entries(byAttr ?? {})) {
        const semantic = bySemantic.get(`${profileRef}::${attribute}`);
        if (semantic === undefined || semantic === token) continue;
        // An IDENTITY mapping (`Act_Amount_PartGood` -> `Act_Amount_PartGood`) is not a
        // competing canonical name — it is a KPI saying "this cypher reads the wire name
        // as-is", i.e. declining to canonicalise at all. Three of the six KPIs do exactly
        // this, which is the evidence that inputMappings is a per-cypher binding and not a
        // synonym registry. So it does not contradict the registry and must not fail the
        // build (and kpis/*.json is not this captain's to edit). It IS worth seeing: the
        // pair has a canonical name that this KPI is not using.
        if (token === attribute) {
          warns.push(
            `W1  ${file}: inputMappings[${profileRef}][${attribute}] is an IDENTITY mapping while ` +
              `mappings/attribute-aliases.json canonicalises that pair as ${JSON.stringify(semantic)}. ` +
              `Not a contradiction — an identity mapping makes no claim about the canonical name — ` +
              `but this KPI's cypher reads the wire spelling where a canonical one now exists.`,
          );
          continue;
        }
        errs.push(
          `B10 ${file}: inputMappings[${profileRef}][${attribute}] = ${JSON.stringify(token)}, but ` +
            `mappings/attribute-aliases.json calls that same pair ${JSON.stringify(semantic)}. ` +
            `One measurement, two canonical names — a resolver reading the registry and a cypher ` +
            `reading the KPI would each be internally consistent and disagree with each other. ` +
            `Pick one word (neither file is authoritative; they are held equal).`,
        );
      }
    }
  }
  return { errs, warns };
}

/** The KPI files, parsed. Missing dir = no cross-check to do, not an error. */
function loadKpis(root = ROOT) {
  const dir = join(root, "kpis");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      out.push({ file: `kpis/${f}`, kpi: JSON.parse(readFileSync(join(dir, f), "utf-8")) });
    } catch {
      /* ci/lint-kpis.mjs owns the parse error for these */
    }
  }
  return out;
}

function main() {
  if (!existsSync(ALIAS_FILE)) {
    errors.push(`B1  ${ALIAS_FILE}: missing`);
  } else {
    const map = readJson(ALIAS_FILE, "B1");
    const schema = readJson(SCHEMA_FILE, "B1");
    if (map && schema) {
      const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
      if (!validate(map)) {
        for (const e of validate.errors ?? []) {
          errors.push(`B1  attribute-aliases${e.instancePath || "/"} ${e.message}`);
        }
      } else {
        errors.push(...aliasErrors(map, loadProfiles()));
        const kpiCheck = kpiTokenErrors(map, loadKpis());
        errors.push(...kpiCheck.errs);
        warnings.push(...kpiCheck.warns);
      }
    }
  }

  for (const w of warnings) console.warn(`  \u26a0 ${w}`);
  const n = errors.length;
  if (n) {
    console.error(`lint-attribute-aliases: ${n} error(s)`);
    for (const e of errors) console.error(`  ✖ ${e}`);
    process.exit(1);
  }
  const map = readJson(ALIAS_FILE, "B1");
  const sem = map?.semantics ?? [];
  const members = sem.reduce((acc, s) => acc + (s.members?.length ?? 0), 0);
  console.log(
    `lint-attribute-aliases: ${sem.length} semantic(s), ${members} member(s) checked against profiles/** — OK`,
  );
  console.log(
    "OK — every declared equivalence agrees with the profiles on wire kind, unit and delivery contract",
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[\\/]/, ""))) main();

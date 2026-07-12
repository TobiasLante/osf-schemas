#!/usr/bin/env node
// ci/check-vocab-drift.mjs — DOES THE DECLARED VOCABULARY STILL MATCH THE WORLD?
//
// ci/lint-vocabulary.mjs is a hard PR gate, but it is purely static: it checks
// guard literals against the `enum` DECLARED in the profile. If that
// declaration is fiction, the gate validates a fantasy world against itself —
// which is the original bug wearing a lab coat.
//
// This script is the other half: it holds every declared enum against the REAL
// source. It needs the plant network, so it must NOT be a PR gate (a PR gate
// that depends on a VPN route goes red for infra reasons, gets disabled, and
// then protects nothing). Run it nightly / on demand on a runner that can reach
// the sources.
//
// WHERE IS THE TRUTH? — at the source boundary the pipeline actually consumes.
// NOT the database. Measured on 2026-07-12: erp.orders.status holds
// IN_PRODUCTION / WAITING_PARTS / ON_HOLD / CANCELLED / INVOICED / SHIPPED, but
// the REST projection the it-edge polls translates those into the German
// canonical dialect in_arbeit / freigegeben / abgeschlossen. A DB-grounded
// linter would have demanded 'IN_PRODUCTION' and flagged the CORRECT value as
// dead. So we sample exactly the URL the edge polls — filters and all.
//
// SOUNDNESS — the two directions are NOT symmetric, and only ONE of them is a
// hard fact. This cost two false alarms to learn; both are preserved here:
//
//   observed value NOT declared  -> ERROR, always.
//        Seeing a value is a fact. Sampling can under-observe, never invent.
//        This is what keeps the declared enum honest, and it is what caught a
//        wrong enum in this very commit ('fertig' arrives; my first, snapshot-
//        derived declaration did not contain it).
//
//   declared value NOT observed  -> WARNING. Never an error. Two reasons,
//        both measured, not theorised:
//        (1) Page caps. :38260/api/customer-orders silently caps at 5000 rows
//            whatever `limit` you pass, and :38260/api/operations at 1000
//            (hiding CANCELLED entirely). The first version of this script
//            trusted "rows < limit => complete" and FALSELY called
//            'abgeschlossen' dead. We now page to exhaustion via limit+offset
//            and PROVE the offset is honored (a page of only-already-seen ids
//            means the server ignores it) — but even an exhausted population is
//            not enough, because:
//        (2) REACHABILITY IS A PROPERTY OF THE PROJECTION, NOT OF TODAY'S ROWS.
//            The ERP projection (api-erp _mappers.ts#orderStatusToCanonicalDe)
//            maps DRAFT|PROPOSED|PLANNED and every unknown raw status to
//            'offen'. 'offen' occurred 0 times in the exhausted population of
//            6009 orders on 2026-07-12 — yet it is perfectly reachable. Failing
//            on it would have been a false alarm on a legitimate rule.
//        So: a declared-but-unseen value is reported LOUDLY (and, if a guard
//        keys on it, as a ZOMBIE GUARD — the rule cannot currently fire) but it
//        does not turn the build red. A checker with false alarms gets switched
//        off, and then it protects nothing.
//
// The hard gate against IMPOSSIBLE literals is ci/lint-vocabulary.mjs, which
// proves impossibility from the SSOT itself (a const-pinned source, a total
// valueMap) — no snapshot, no inference.
//
// Attributes whose only sources are OPC-UA / MTConnect have no HTTP projection
// to sample: they are reported as UNVERIFIABLE — never as "ok". Silence is the
// disease; an honest gap is not.
//
// Run:  node ci/check-vocab-drift.mjs [--json]
// Exit: 0 = declarations hold, 1 = drift (see above), 2 = could not reach sources

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { collectGuards } from "./lint-vocabulary.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const REPO = join(HERE, "..");
const PROFILES_ROOT = process.env.PROFILES_ROOT || join(REPO, "profiles");
const SOURCES_ROOT = process.env.SOURCES_ROOT || join(REPO, "sources");
const CROSS_ROOT = process.env.CROSS_ROOT || join(REPO, "cross-constraints");
const TIMEOUT_MS = Number(process.env.VOCAB_TIMEOUT_MS || 120000);
const AS_JSON = process.argv.includes("--json");

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (n.endsWith(".json")) out.push(p);
  }
  return out;
}
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

// ---- inventory -------------------------------------------------------------

const profiles = new Map();
for (const f of jsonFiles(PROFILES_ROOT)) {
  const j = readJson(f);
  if (j.profileId) profiles.set(j.profileId, { ...j, __file: f });
}

// every attribute that declares a vocabulary
const declared = []; // { profileId, name, enum }
for (const p of profiles.values()) {
  for (const a of p.attributes ?? []) {
    if (Array.isArray(a.enum)) declared.push({ profileId: p.profileId, name: a.name, enum: a.enum });
  }
}

const sources = jsonFiles(SOURCES_ROOT).map(readJson).filter((s) => s.profileRef);

// Which guards key on profileId.attr == <value>? A declared value that reality
// never delivers is only a curiosity — UNLESS a rule hangs off it. Then it is a
// zombie: a guard that cannot fire, silently.
const guards = collectGuards(profiles, CROSS_ROOT);
function guardsKeyingOn(profileId, attrName, value) {
  return guards
    .filter((g) => g.profileId === profileId && g.attrName === attrName && g.literals.includes(value))
    .map((g) => `${g.label} (op=${g.op})`);
}

// which source feeds profileId.attr?
function feedersOf(profileId, attrName) {
  const out = [];
  for (const s of sources) {
    if (s.profileRef !== profileId) continue;
    for (const key of ["columnMappings", "nodeMappings", "dataItemMappings"]) {
      for (const m of s[key] ?? []) {
        if (m?.smAttribute === attrName) out.push({ source: s, mapping: m, kind: key });
      }
    }
  }
  return out;
}

// ---- probing ---------------------------------------------------------------

async function fetchPage(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (Array.isArray(body)) return body;
    for (const v of Object.values(body)) if (Array.isArray(v)) return v;
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Walk the source's OWN url (filters included — that is what the edge polls)
// page by page until it runs dry. Returns { rows, complete, pages }.
//   complete === true  <=>  the last page was short AND every page brought new
//                           ids (i.e. the server really honored `offset`).
// Anything else is a capped/uncertain sample and must not be used to call a
// value dead.
async function fetchAll(base, idProp, pageSize) {
  const rows = [];
  const ids = new Set();
  let offset = 0;
  let pages = 0;
  const MAX_PAGES = Number(process.env.VOCAB_MAX_PAGES || 500);
  for (;;) {
    const sep = base.includes("?") ? "&" : "?";
    const page = await fetchPage(`${base}${sep}limit=${pageSize}&offset=${offset}`);
    pages++;
    let fresh = 0;
    for (const r of page) {
      const id = idProp && r && typeof r === "object" && idProp in r ? String(r[idProp]) : JSON.stringify(r);
      if (ids.has(id)) continue;
      ids.add(id);
      rows.push(r);
      fresh++;
    }
    if (page.length < pageSize) return { rows, complete: true, pages }; // ran dry => whole population
    if (fresh === 0) return { rows, complete: false, pages, reason: "server ignores `offset` — cannot page past the cap" };
    if (pages >= MAX_PAGES) return { rows, complete: false, pages, reason: `stopped after ${MAX_PAGES} pages` };
    offset += pageSize;
  }
}

function applyValueMap(v, valueMap) {
  if (!valueMap) return v;
  if (Object.prototype.hasOwnProperty.call(valueMap, v)) return valueMap[v];
  if (Object.prototype.hasOwnProperty.call(valueMap, "*")) return valueMap["*"];
  return v;
}

// ---- run -------------------------------------------------------------------

const errors = [];
const warnings = [];
const zombieGuards = [];
const report = [];

for (const d of declared) {
  const feeders = feedersOf(d.profileId, d.name);
  const label = `${d.profileId}.${d.name}`;

  if (feeders.length === 0) {
    warnings.push(`${label}: declares an enum but NO source maps it — nothing feeds this attribute (dead declaration?).`);
    report.push({ attr: label, verdict: "no-source", declared: d.enum });
    continue;
  }

  // (a) const-pinned: verified statically by lint-vocabulary.mjs, no probe needed
  const consts = feeders.filter((f) => Object.prototype.hasOwnProperty.call(f.mapping, "const"));
  if (consts.length === feeders.length) {
    const pinned = [...new Set(consts.map((c) => c.mapping.const))];
    const ok = pinned.length === d.enum.length && pinned.every((v) => d.enum.includes(v));
    report.push({ attr: label, verdict: ok ? "ok (const-pinned)" : "MISMATCH (const)", declared: d.enum, observed: pinned });
    if (!ok) {
      errors.push(
        `${label}: sources pin the value to ${JSON.stringify(pinned)}, declared enum is ${JSON.stringify(d.enum)}.`
      );
    }
    continue;
  }

  // (b) HTTP-samplable source (rest)
  const rest = feeders.find((f) => f.source.sourceType === "rest" && f.source.connection?.baseUrl);
  if (!rest) {
    warnings.push(
      `${label}: UNVERIFIABLE — only ${[...new Set(feeders.map((f) => f.source.sourceType))].join("/")} source(s) (${feeders
        .map((f) => f.source.sourceId)
        .join(", ")}); no HTTP projection to sample. The declared vocabulary is NOT machine-checked against reality.`
    );
    report.push({ attr: label, verdict: "unverifiable", declared: d.enum });
    continue;
  }

  const url = rest.source.connection.baseUrl + rest.source.connection.path;
  const col = rest.mapping.column;
  const pageSize = Math.min(rest.source.polling?.batchSize || 1000, 1000);
  const idProp = rest.source.response?.idProperty;
  let rows, complete, pages, capReason;
  try {
    ({ rows, complete, pages, reason: capReason } = await fetchAll(url, idProp, pageSize));
  } catch (e) {
    errors.push(`${label}: could not reach the declared source ${url} (${e.message}) — vocabulary UNCHECKED.`);
    report.push({ attr: label, verdict: "unreachable", declared: d.enum });
    continue;
  }

  const seen = new Map();
  for (const r of rows) {
    if (!r || typeof r !== "object" || !(col in r)) continue;
    const v = applyValueMap(r[col], rest.mapping.valueMap);
    if (v === null || v === undefined) continue;
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  const observed = [...seen.keys()];

  // Direction 1 — a value the source DELIVERS but we never declared.
  // Sound regardless of completeness: seeing a value is a fact.
  for (const v of observed) {
    if (!d.enum.includes(v)) {
      errors.push(
        `${label}: the source delivers ${JSON.stringify(v)} (${seen.get(v)}x in ${rows.length} rows of ${url}), ` +
          `but the declared enum is ${JSON.stringify(d.enum)}. The declaration is INCOMPLETE — ` +
          `a guard written against this attribute cannot see ${JSON.stringify(v)}.`
      );
    }
  }

  // Direction 2 — a value we DECLARED but never saw. NEVER an error (see the
  // header): absence in today's rows is not impossibility. But if a GUARD hangs
  // off that value, the rule cannot currently fire — say so, loudly.
  const unseen = d.enum.filter((v) => !seen.has(v));
  for (const v of unseen) {
    const zombies = guardsKeyingOn(d.profileId, d.name, v);
    const scope = complete
      ? `the EXHAUSTED population (${rows.length} rows, ${pages} pages, offset honored)`
      : `a NON-exhaustive sample (${rows.length} rows, ${capReason ?? "capped"})`;
    const msg =
      `${label}: declared value ${JSON.stringify(v)} did not occur in ${scope} of ${url}. ` +
      `Observed: ${observed.map((x) => JSON.stringify(x)).join(", ") || "(none)"}.`;
    if (zombies.length) {
      zombieGuards.push(
        `${msg} => ZOMBIE GUARD: ${zombies.join(", ")} keys on ${JSON.stringify(v)} and therefore matches NOTHING right now. ` +
          `Either the rule is meant to be dormant, or its literal is wrong — a human must decide. ` +
          `(Not failing the build: the value IS in the projection's image, it just has no rows today.)`
      );
    } else {
      warnings.push(`${msg} No guard keys on it — informational.`);
    }
  }
  const drifted = errors.some((e) => e.startsWith(label));
  report.push({
    attr: label,
    verdict: drifted ? "DRIFT" : complete ? "ok (population exhausted)" : "ok (capped sample)",
    declared: d.enum,
    observed: Object.fromEntries(seen),
    rows: rows.length,
    pages,
    complete,
    url,
  });
}

// ---- recipes: does the article a band keys on actually exist? ---------------
//
// The static gate checks match.equipment (closed set). match.article points into
// the ERP article master — an OPEN set that only the live source knows. A recipe
// keyed on an article that does not exist never resolves a band, and says
// nothing about it. Reported loudly, but NOT build-breaking: a recipe may be
// legitimately pre-staged for an article that is not in the master yet.
const RECIPES_ROOT = process.env.RECIPES_ROOT || join(REPO, "recipes");
const deadRecipes = [];
{
  const artSource = sources.find((s) => s.profileRef === "SMProfile-Article" && s.sourceType === "rest");
  const recipes = jsonFiles(RECIPES_ROOT)
    .map(readJson)
    .filter((r) => r.recipeId && r.match?.article);
  if (artSource && recipes.length) {
    const idCol =
      artSource.columnMappings.find((m) => m.isId)?.column ??
      artSource.columnMappings.find((m) => m.smAttribute === "article_no")?.column;
    try {
      const { rows, complete } = await fetchAll(
        artSource.connection.baseUrl + artSource.connection.path,
        artSource.response?.idProperty,
        Math.min(artSource.polling?.batchSize || 1000, 1000)
      );
      const known = new Set(rows.map((r) => r?.[idCol]).filter(Boolean));
      for (const r of recipes) {
        if (!known.has(r.match.article)) {
          deadRecipes.push(
            `recipe ${r.recipeId}: match.article ${JSON.stringify(r.match.article)} does not exist in the article master ` +
              `(${known.size} articles${complete ? ", population exhausted" : ", sample capped"} from ${artSource.sourceId}). ` +
              `=> This recipe can NEVER match a production order — its bands never resolve, silently. ` +
              `The ERP keys articles like ${[...known].slice(0, 3).map((x) => JSON.stringify(x)).join(", ")}.`
          );
        }
      }
    } catch (e) {
      warnings.push(`recipes: could not reach the article master (${e.message}) — match.article UNCHECKED.`);
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ report, errors, zombieGuards, deadRecipes, warnings }, null, 2));
} else {
  console.log(`check-vocab-drift: ${declared.length} declared vocabular(ies) held against the real sources\n`);
  for (const r of report) {
    console.log(
      `  ${r.verdict.startsWith("ok") ? "✓" : r.verdict === "unverifiable" || r.verdict === "no-source" ? "?" : "✗"} ` +
        `${r.attr}  declared=${JSON.stringify(r.declared)}` +
        (r.observed ? `  observed=${JSON.stringify(r.observed)}` : "") +
        `  [${r.verdict}]`
    );
  }
  if (zombieGuards.length) {
    console.log(`\n🧟 ZOMBIE GUARDS (${zombieGuards.length}) — rules that currently match NOTHING:`);
    for (const z of zombieGuards) console.log("  ! " + z + "\n");
  }
  if (deadRecipes.length) {
    console.log(`\n🧟 DEAD RECIPES (${deadRecipes.length}) — bands that can never resolve:`);
    for (const d of deadRecipes) console.log("  ! " + d + "\n");
  }
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}) — not fatal, but not "ok" either:`);
    for (const w of warnings) console.log("  ! " + w);
  }
  if (errors.length) {
    console.error(`\nFAIL — ${errors.length} vocabulary drift(s):\n`);
    for (const e of errors) console.error("  ✗ " + e + "\n");
  }
}

if (errors.length) process.exit(1);
console.log("\nOK — every declared vocabulary still matches the world it claims to describe.");

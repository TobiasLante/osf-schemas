#!/usr/bin/env node
// ci/lint-source-keys.mjs
//
// Record-key linter for sources/** — FAIL-CLOSED.
//
// Why this exists: `sim-v5-wms-quants` shipped with
//     "response": { "idProperty": "quant_no" }
//     "columnMappings": [{ "column": "quant_id", "smAttribute": "quant_no", "isId": true }]
// `response.idProperty` is an UPSTREAM RESPONSE FIELD name; `quant_no` is the
// smAttribute that field maps TO. it-edge's pkOf() lets idProperty WIN over the
// isId column, so it looked up `row["quant_no"]` — a field the WMS API does not
// serve — got `undefined` for all 500 rows, and skipped every one of them
// (`pk == null -> continue`). Result: a poll every 60 s, HTTP 200, 500 rows in,
// ZERO business events out, ZERO error logs, container "healthy", for 9 days.
// A key that names a field nobody delivers is indistinguishable from an empty
// upstream — unless something checks the two declarations against each other.
//
// STATIC rules (always on — these are decidable from the file alone):
//   K1  response.idProperty must name a DECLARED columnMappings[].column.
//       (It is a raw upstream field name; an smAttribute there is the bug above.)
//   K2  when both response.idProperty and a columnMappings[].isId exist they must
//       name the SAME column — idProperty silently wins at runtime, so a
//       disagreement means the isId the author believed in is dead code.
//   K3  every pollable source (rest / postgres*) needs a resolvable record key:
//       response.idProperty, or primaryKeyColumns, or exactly one isId column.
//   K4  at most one columnMappings[].isId.
//   K5  primaryKeyColumns entries must be declared columns.
//   K6  no duplicate columnMappings[].smAttribute — two mappings writing the SAME
//       output attribute silently clobber each other in project() (last wins).
//       NOTE the deliberate asymmetry: a duplicate *column* is LEGAL and in use
//       (erp-operations-response fans ts_end out to actual_end_time AND
//       completed_at); a duplicate *smAttribute* is the destructive direction.
//
// LIVE rule (opt-in: LINT_SOURCE_KEYS_LIVE=1) — the static rules CANNOT catch a
// key that is internally consistent but simply absent upstream (both
// erp-segment-requirements and erp-segment-responses declare
// idProperty=isId="operation_id", and /api/operations serves no such field, so
// they are the same silent zero waiting to be deployed). Only asking the real
// endpoint decides that:
//   L1  GET the REST source, resolve response.rootPath, and require the record
//       key to be present AND non-null on every returned row.
//   L2  the key must be UNIQUE across the returned rows — a repeating key
//       collapses rows into one entity just as silently.
// Live mode needs network reach to the source hosts; keep it OUT of the offline
// CI gate and run it pre-deploy / nightly.
//
// Scans sources/ only; backup/ and node_modules/ are ignored.
// Run:  node ci/lint-source-keys.mjs            (static)
//       LINT_SOURCE_KEYS_LIVE=1 node ci/lint-source-keys.mjs   (static + live)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.SCHEMAS_ROOT
  ? process.env.SCHEMAS_ROOT.replace(/\/$/, "")
  : new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** Source types it-edge actually polls — only these need a record key (K3). */
const POLLABLE = new Set(["rest", "postgresql", "postgres"]);

function walkJson(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = join(dir, e);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walkJson(rel));
    else if (e.endsWith(".json")) out.push(rel);
  }
  return out;
}

/**
 * Pure, testable core: the static rules for ONE parsed source.
 * Returns a list of violation strings ([] = clean).
 */
export function lintSourceKeys(src) {
  const errs = [];
  const cms = Array.isArray(src.columnMappings) ? src.columnMappings : [];
  const cols = cms.map((m) => m?.column).filter((c) => typeof c === "string");
  const colSet = new Set(cols);
  const idCols = cms.filter((m) => m?.isId === true).map((m) => m?.column);
  const idProp = src.response?.idProperty;
  const pkCols = Array.isArray(src.primaryKeyColumns) ? src.primaryKeyColumns : null;

  if (typeof idProp === "string" && idProp !== "") {
    // K1 — the classic: an smAttribute name written where a response field goes.
    if (!colSet.has(idProp)) {
      const asAttr = cms.find((m) => m?.smAttribute === idProp);
      const hint = asAttr?.column
        ? ` — it is the smAttribute of column "${asAttr.column}"; response.idProperty takes the UPSTREAM COLUMN name, so this should almost certainly be "${asAttr.column}"`
        : "";
      errs.push(
        `K1 response.idProperty "${idProp}" is not a declared columnMappings[].column` +
          ` (declared: ${cols.join(", ") || "none"})${hint}`,
      );
    }
    // K2 — idProperty wins at runtime; a disagreeing isId is dead code.
    if (idCols.length > 0 && !idCols.includes(idProp)) {
      errs.push(
        `K2 response.idProperty "${idProp}" contradicts columnMappings isId column "${idCols[0]}"` +
          ` — idProperty WINS in it-edge pkOf(), so the isId column is never used`,
      );
    }
  }

  // K4 — ambiguous identity.
  if (idCols.length > 1) {
    errs.push(`K4 ${idCols.length} columnMappings entries set isId (${idCols.join(", ")}) — at most one allowed`);
  }

  // K5 — a composite key part that no mapping declares.
  if (pkCols) {
    for (const c of pkCols) {
      if (!colSet.has(c)) {
        errs.push(`K5 primaryKeyColumns entry "${c}" is not a declared columnMappings[].column`);
      }
    }
  }

  // K3 — no key at all: the poller cannot identify a row.
  if (POLLABLE.has(src.sourceType)) {
    const hasKey =
      (typeof idProp === "string" && idProp !== "") ||
      (pkCols && pkCols.length > 0) ||
      idCols.length === 1;
    if (!hasKey) {
      errs.push(
        `K3 pollable sourceType "${src.sourceType}" declares no record key` +
          ` — needs response.idProperty, primaryKeyColumns, or one columnMappings isId`,
      );
    }
  }

  // K6 — two mappings writing the same smAttribute: project() keeps only the
  // last, so one of the two declarations is silently dead. (A duplicate COLUMN
  // is fine — that is a legitimate fan-out of one field to several attributes.)
  const seenAttr = new Set();
  for (const m of cms) {
    const a = m?.smAttribute;
    if (typeof a !== "string" || a === "") continue;
    if (seenAttr.has(a)) {
      errs.push(`K6 columnMappings writes smAttribute "${a}" more than once — project() keeps only the last`);
    }
    seenAttr.add(a);
  }

  return errs;
}

/** The field names a poller would read to build the record key. */
export function keyFields(src) {
  const idProp = src.response?.idProperty;
  if (typeof idProp === "string" && idProp !== "") return [idProp];
  if (Array.isArray(src.primaryKeyColumns) && src.primaryKeyColumns.length > 0) {
    return src.primaryKeyColumns;
  }
  const cms = Array.isArray(src.columnMappings) ? src.columnMappings : [];
  const idCol = cms.find((m) => m?.isId === true)?.column;
  return idCol ? [idCol] : [];
}

/** Resolve `${VAR}` / `${VAR:-default}` against the environment, like it-edge does. */
function resolveEnv(v) {
  if (typeof v !== "string") return v;
  return v.replace(/\$\{([^}]*)\}/g, (_m, inner) => {
    const i = inner.indexOf(":-");
    if (i >= 0) return process.env[inner.slice(0, i)] ?? inner.slice(i + 2);
    return process.env[inner] ?? "";
  });
}

/** Walk a `$.a.b` rootPath. */
function dig(body, rootPath) {
  if (!rootPath || rootPath === "$" || rootPath === "$.") return body;
  let cur = body;
  for (const part of rootPath.replace(/^\$\.?/, "").split(".")) {
    if (!part) continue;
    if (cur && typeof cur === "object" && !Array.isArray(cur)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

/** L1/L2 — ask the real endpoint whether the declared key actually arrives. */
async function lintLive(src) {
  const errs = [];
  if (src.sourceType !== "rest") return errs;
  const key = keyFields(src);
  if (key.length === 0) return errs; // K3 already reported it
  const base = resolveEnv(src.connection?.baseUrl ?? "");
  const path = resolveEnv(src.connection?.path ?? "/");
  if (!base) return errs;
  const url = base.replace(/\/$/, "") + path;
  let body;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(src.connection?.timeoutMs ?? 20000) });
    if (!r.ok) return [`L0 GET ${url} -> HTTP ${r.status} (key not verifiable)`];
    body = await r.json();
  } catch (e) {
    return [`L0 GET ${url} failed: ${e.message} (key not verifiable)`];
  }
  const rows = dig(body, src.response?.rootPath);
  if (!Array.isArray(rows)) {
    return [`L0 response.rootPath "${src.response?.rootPath ?? "$"}" did not resolve to an array at ${url}`];
  }
  if (rows.length === 0) return errs; // nothing to prove against
  const vals = rows.map((r) => key.map((k) => r?.[k]));
  const keyless = vals.filter((v) => v.some((p) => p === undefined || p === null)).length;
  if (keyless === vals.length) {
    errs.push(
      `L1 record key [${key.join(", ")}] is absent/null on ALL ${vals.length} rows of ${url}` +
        ` — this source would emit ZERO events. Response fields: ${Object.keys(rows[0] ?? {}).join(", ")}`,
    );
  } else if (keyless > 0) {
    errs.push(`L1 record key [${key.join(", ")}] is absent/null on ${keyless}/${vals.length} rows of ${url}`);
  } else {
    const distinct = new Set(vals.map((v) => JSON.stringify(v))).size;
    if (distinct < vals.length) {
      errs.push(
        `L2 record key [${key.join(", ")}] is NOT UNIQUE at ${url}:` +
          ` ${vals.length} rows collapse into ${distinct} entities`,
      );
    }
  }
  return errs;
}

async function main() {
  const live = process.env.LINT_SOURCE_KEYS_LIVE === "1";
  const files = walkJson("sources");
  const errors = [];
  let checked = 0;
  for (const rel of files) {
    let src;
    try {
      src = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
    } catch (e) {
      errors.push(`${rel}: unparseable JSON — ${e.message}`);
      continue;
    }
    checked++;
    for (const e of lintSourceKeys(src)) errors.push(`${rel}: ${e}`);
    if (live) for (const e of await lintLive(src)) errors.push(`${rel}: ${e}`);
  }
  if (errors.length) {
    console.error(`lint-source-keys: ${errors.length} violation(s) in ${checked} source(s)${live ? " (static+live)" : ""}`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`lint-source-keys: ${checked} source(s) OK${live ? " (static+live)" : " (static)"}`);
}

// Only run when invoked directly, so the self-test can import the pure core.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

#!/usr/bin/env node
// ci/lint-opcua-namespace.mjs
//
// OPC-UA namespace linter for sources/opcua/** — FAIL-CLOSED.
//
// WHY THIS EXISTS (measured 2026-08-20T05:44:41Z on opc.tcp://192.168.178.154:36600)
// ---------------------------------------------------------------------------------
// `opcua-ftlinx-01-{event,telemetry}.json` pinned `ns=117` on the FactoryTalk Linx
// AGGREGATION gateway. An OPC-UA namespace INDEX is not an identifier — it is a
// POSITION in the server's NamespaceArray (`ns=0;i=2255`), built in arrival order,
// and on that gateway there are 118 of them:
//
//   NamespaceArray[117] = urn:i3x:sim-v5:linx:HB760       good 962   scrap 16   IDLE
//   NamespaceArray[89]  = urn:i3x:sim-v5:linx:rockwell-01 good 23826 scrap 1614 RUNNING
//
// BOTH reads return `Good`. There is no error, no exception, no log line: the pinned
// index simply points at a DIFFERENT CUSTOMER MACHINE. central-ts carried machine
// `ftlinx-01` with HB760's counters (955 / 16) for weeks — a wrong number, not a
// missing one, which is far harder to notice.
//
// A drift detector for exactly this case has existed since 2026-08-14
// (i3x-v4 `services/discovery/src/logic/namespace-resolve.ts`). It COULD NOT FIRE,
// because its trigger is a `namespaceUri` and not one of the 19 nodeMappings had one.
// A guard whose input nobody declares is a guard that cannot fail — so it is silent.
// This linter is the missing half: it makes the declaration that the guard needs
// MANDATORY wherever an index is not decidable from the spec.
//
// RULES (all decidable from the file alone — no network)
//   N1  A nodeMapping pinning `ns=N` with N >= 2 requires a namespaceUri
//       (source-level, `connection.namespaceUri`, or on the mapping itself).
//       WHY the threshold is 2, and not "any index":
//         ns=0 is the OPC-UA standard namespace, fixed by the spec on every server.
//         ns=1 is the first vendor namespace; on a single-machine server (14 of our
//              15 opcua sources: one machine per port, NamespaceArray length 2) it is
//              the only one there is, so its position cannot drift.
//         ns>=2 means the server publishes MORE than one vendor namespace, i.e. it is
//              an aggregator, and the index is a queue position. That is precisely the
//              class that broke. Measured: rockwell-01's own server at :36500 has
//              exactly 2 entries; the gateway at :36600 has 118.
//   N2  A source that declares a namespaceUri must not pin two DIFFERENT indices
//       across its mappings — one URI cannot agree with two positions, so at least
//       one mapping is guaranteed to be refused at connect time.
//   N3  A declared namespaceUri must look like a URI (`urn:…` or `scheme://…`) and
//       be non-empty. A blank string would satisfy N1 while resolving to nothing.
//
// EXEMPTION, named rather than a waiver list: a source whose endpoint still carries an
// unresolved template placeholder (`MTBRIDGE_HOST`, `${…}`, `{{…}}`) has no live server
// to read a NamespaceArray from, so demanding a URI would only invite an invented one.
// Today that is exactly `opcua-mtbridge-cnc-01.json` (`opc.tcp://MTBRIDGE_HOST:4840`,
// ns=2). It is reported as EXEMPT with its reason, never skipped silently.
//
// Scans sources/opcua/ only; backup/ and node_modules/ are ignored.
// Run:  node ci/lint-opcua-namespace.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.SCHEMAS_ROOT
  ? process.env.SCHEMAS_ROOT.replace(/\/$/, "")
  : new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** Lowest namespace index that is a QUEUE POSITION rather than a spec/only-one slot. */
export const DRIFTABLE_FROM_INDEX = 2;

const PLACEHOLDER = /\$\{[^}]*\}|\{\{[^}]*\}\}|[A-Z][A-Z0-9]*_HOST/;

/** `ns=<N>;<rest>` → N, or null when the nodeId carries no explicit `ns=`. */
export function pinnedIndex(nodeId) {
  const m = /^ns=(\d+);/.exec(typeof nodeId === "string" ? nodeId : "");
  return m ? Number(m[1]) : null;
}

function looksLikeUri(u) {
  return typeof u === "string" && (/^urn:[^\s]+$/.test(u) || /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(u));
}

function endpointOf(src) {
  return src.endpoint ?? src.connection?.endpoint ?? "";
}

/** True when the endpoint is a template, not a reachable server. */
export function isTemplateEndpoint(src) {
  return PLACEHOLDER.test(endpointOf(src));
}

/**
 * Pure, testable core: the namespace rules for ONE parsed opcua source.
 * Returns `{ errs, exempt }` — `errs` [] means clean.
 */
export function lintOpcuaNamespace(src) {
  const errs = [];
  if (src?.sourceType !== "opcua") return { errs, exempt: null };
  const mappings = Array.isArray(src.nodeMappings) ? src.nodeMappings : [];
  const sourceUri = src.namespaceUri ?? src.connection?.namespaceUri;

  // N3 first — a malformed URI must not be able to satisfy N1.
  const uris = [sourceUri, ...mappings.map((m) => m?.namespaceUri)].filter((u) => u !== undefined);
  for (const u of uris) {
    if (!looksLikeUri(u)) {
      errs.push(`N3 namespaceUri ${JSON.stringify(u)} is not a URI (expected "urn:…" or "scheme://…")`);
    }
  }

  // N1 — an index that can drift needs the stable reference.
  const driftable = mappings
    .map((m, i) => ({ i, ns: pinnedIndex(m?.opcuaNodeId), nodeId: m?.opcuaNodeId, uri: m?.namespaceUri ?? sourceUri }))
    .filter((r) => r.ns !== null && r.ns >= DRIFTABLE_FROM_INDEX);

  if (driftable.length > 0 && isTemplateEndpoint(src)) {
    return {
      errs,
      exempt: `endpoint "${endpointOf(src)}" is an unresolved template placeholder — no live NamespaceArray to resolve against, so ${driftable.length} mapping(s) pinning ns>=${DRIFTABLE_FROM_INDEX} are not required to declare a namespaceUri`,
    };
  }

  // A URI that N3 rejected does NOT count as declared: otherwise `namespaceUri: ""`
  // would satisfy N1 while resolving to nothing — the hole this linter exists to close,
  // one level up. (Found by ci/test-lint-opcua-namespace.mjs, not by reading the code.)
  const naked = driftable.filter((r) => !looksLikeUri(r.uri));
  if (naked.length > 0) {
    const idx = [...new Set(naked.map((r) => r.ns))].sort((a, b) => a - b);
    errs.push(
      `N1 ${naked.length}/${mappings.length} nodeMapping(s) pin ns=${idx.join(",")} (>=${DRIFTABLE_FROM_INDEX}) with no namespaceUri` +
        ` — an index >=${DRIFTABLE_FROM_INDEX} means the server publishes several vendor namespaces, so it is an ARRIVAL-ORDER position, not an identifier.` +
        ` Reading the wrong position returns Good and yields another machine's data.` +
        ` Declare "namespaceUri" (source-level is enough for all mappings). First offender: ${naked[0].nodeId}`,
    );
  }

  // N2 — one URI cannot agree with two positions.
  if (uris.length > 0) {
    const pins = [...new Set(mappings.map((m) => pinnedIndex(m?.opcuaNodeId)).filter((n) => n !== null))];
    if (pins.length > 1 && sourceUri !== undefined && mappings.every((m) => m?.namespaceUri === undefined)) {
      errs.push(
        `N2 source declares one namespaceUri "${sourceUri}" but its mappings pin ${pins.length} different indices (ns=${pins.sort((a, b) => a - b).join(",")})` +
          ` — at most one of them can agree with the URI, so the rest are refused at connect time`,
      );
    }
  }

  return { errs, exempt: null };
}

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

async function main() {
  const files = walkJson("sources/opcua");
  const errors = [];
  const exempt = [];
  let checked = 0;
  for (const rel of files) {
    let src;
    try {
      src = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
    } catch (e) {
      errors.push(`${rel}: unparseable JSON — ${e.message}`);
      continue;
    }
    if (src?.sourceType !== "opcua") continue;
    checked++;
    const { errs, exempt: ex } = lintOpcuaNamespace(src);
    for (const e of errs) errors.push(`${rel}: ${e}`);
    if (ex) exempt.push(`${rel}: ${ex}`);
  }
  for (const e of exempt) console.log(`  · EXEMPT ${e}`);
  if (errors.length) {
    console.error(`lint-opcua-namespace: ${errors.length} violation(s) in ${checked} opcua source(s)`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`lint-opcua-namespace: ${checked} opcua source(s) OK (${exempt.length} exempt)`);
}

// Only run when invoked directly, so the self-test can import the pure core.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

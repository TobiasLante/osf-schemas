#!/usr/bin/env node
// next/ci/migrate-opcua-sources.mjs
//
// Migrate canonical OPC-UA source descriptors (sources/opcua/*.json, the v3
// envelope) into next/-conformant exemplars under next/sources/opcua/. This is
// the SOURCE-side companion to the discovery generator's next/ update
// (services/discovery): it shows OT sources on the new JSON standard.
//
// Canonical files are NEVER touched — only copies are written under next/. Each
// migrated file is validated against next/validation/source-schema.json (ajv).
//
// What it changes (additive — keeps everything the edge already reads):
//   + syncType        polling.mode: subscribe -> streaming, scan/poll -> polling
//   + transport       ['nats'] (if absent)
//   + connection      { endpoint, securityMode, securityPolicy, auth }
//   - drops nothing   endpoint / security / polling / nodeMappings / dataCategory stay
//
// Usage:
//   node next/ci/migrate-opcua-sources.mjs            # curated exemplar set
//   node next/ci/migrate-opcua-sources.mjs --all      # every sources/opcua/*.json
//   node next/ci/migrate-opcua-sources.mjs cnc-001 sgm-004   # by id/filename substring
//
// Exits non-zero if any migrated exemplar fails source-schema validation.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const CANON = join(REPO, "sources/opcua");
const OUT = join(REPO, "next/sources/opcua");
const SCHEMA = join(REPO, "next/validation/source-schema.json");

// Curated representative set — the live sim machines (CNC + injection molding),
// both legacy *-process/bde and newer *-telemetry/event shapes.
const EXEMPLARS = [
  "opcua-sgm-004-processdata.json",
  "opcua-sgm-003-process.json",
  "opcua-sgm-003-bde.json",
  "opcua-cnc-001-telemetry.json",
  "opcua-cnc-001-event.json",
  "opcua-cnc-002-telemetry.json",
  "opcua-cnc-002-event.json",
  "opcua-sgm-001-telemetry.json",
  "opcua-sgm-001-event.json",
];

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function syncTypeFor(mode) {
  return mode === "subscribe" ? "streaming" : "polling";
}

/** Transform one canonical OPC-UA source into the next/ envelope. */
function toNext(src) {
  const polling = src.polling ?? { mode: "subscribe", intervalMs: 1000 };
  const security = src.security ?? { mode: "None", policy: "None", auth: "Anonymous" };
  const version = SEMVER.test(String(src.version ?? "")) ? src.version : "1.0.0";
  const out = {
    sourceId: src.sourceId,
    version,
    sourceType: src.sourceType ?? "opcua",
    // next/ envelope additions:
    syncType: syncTypeFor(polling.mode),
    transport: Array.isArray(src.transport) && src.transport.length ? src.transport : ["nats"],
    connection: {
      endpoint: src.endpoint,
      securityMode: security.mode,
      securityPolicy: security.policy,
      auth: security.auth,
    },
    // carried straight through (edge-compatible):
    ...(src.dataCategory !== undefined ? { dataCategory: src.dataCategory } : {}),
    profileRef: src.profileRef,
    endpoint: src.endpoint,
    machineId: src.machineId,
    ...(src.machineName !== undefined ? { machineName: src.machineName } : {}),
    ...(src.location !== undefined ? { location: src.location } : {}),
    nodeMappings: src.nodeMappings ?? [],
    ...(src.staticProperties !== undefined ? { staticProperties: src.staticProperties } : {}),
    polling,
    security,
  };
  return out;
}

function resolveTargets(argv) {
  const all = readdirSync(CANON).filter((f) => f.endsWith(".json"));
  if (argv.includes("--all")) return all;
  const filters = argv.filter((a) => !a.startsWith("--"));
  if (filters.length === 0) {
    const missing = EXEMPLARS.filter((f) => !all.includes(f));
    if (missing.length) console.warn(`  ! exemplars not found (skipped): ${missing.join(", ")}`);
    return EXEMPLARS.filter((f) => all.includes(f));
  }
  return all.filter((f) => filters.some((q) => f.includes(q)));
}

function main() {
  const validate = (() => {
    const Ajv = require("ajv");
    const ajv = new Ajv({ strict: false, allErrors: true });
    return ajv.compile(JSON.parse(readFileSync(SCHEMA, "utf8")));
  })();

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const targets = resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.log("migrate-opcua-sources: no matching canonical sources — nothing to do");
    return;
  }

  let written = 0;
  let failed = 0;
  const skippedNoMappingId = [];
  for (const file of targets) {
    const src = JSON.parse(readFileSync(join(CANON, file), "utf8"));
    if (!src.sourceId) {
      console.warn(`  ! ${file}: no sourceId — skipped`);
      continue;
    }
    const next = toNext(src);
    // Every nodeMapping must carry an smAttribute (the next/ projection contract).
    const badMaps = (next.nodeMappings ?? []).filter((m) => !m.smAttribute).length;
    if (badMaps > 0) skippedNoMappingId.push(`${file} (${badMaps} mapping(s) w/o smAttribute)`);

    const ok = validate(next);
    if (!ok) {
      failed++;
      console.error(`  FAIL ${file}`);
      for (const e of validate.errors) console.error(`       ${e.instancePath} ${e.message}`);
      continue;
    }
    writeFileSync(join(OUT, file), JSON.stringify(next, null, 2) + "\n", "utf8");
    written++;
    console.log(`  OK   ${file} -> next/sources/opcua/${file}`);
  }

  console.log(`migrate-opcua-sources: wrote ${written}, failed ${failed}, of ${targets.length} target(s)`);
  if (skippedNoMappingId.length) {
    console.warn(`  ! mappings missing smAttribute (still written, but review): ${skippedNoMappingId.join("; ")}`);
  }
  if (failed > 0) process.exit(1);
}

main();

#!/usr/bin/env node
// next/ci/lint-delivery.mjs
//
// Delivery-class GUARDRAIL linter (FR-D2). WARNING-only — never fails the build.
//
// The 'delivery' facet routes an attribute down one of two lanes:
//   - "telemetry"     → high-rate time-series, edge-local TS, raw/aggregate
//   - "transactional" → state/intent/event, hub, on_change, KG + Vault
//
// Mis-routing is a *modelling* mistake, not a syntax error — JSON Schema can't
// catch it. This linter raises soft WARNINGS for the two most common P4 smells:
//
//  (a) delivery="telemetry" on an attribute that is, by name/category, an
//      INTENT / SETPOINT (Set_*, *_setpoint, *_target, *_soll, sp_*, or
//      category=setpoint). Setpoints are written intent — they belong on the
//      transactional/on_change lane, not streamed as raw telemetry.
//
//  (b) delivery="transactional" on an attribute whose SOURCE is a best-effort
//      poll with NO changeDetection (a "full_refresh" or a poll that declares
//      no polling.changeDetection at all). Transactional/on_change semantics
//      assume change is detectable; a blind re-poll can miss or double-count
//      transitions. Cross-checked against next/sources/** via profileRef.
//      (Skipped silently when no matching source is found — coverage, not noise.)
//
// Exit code is ALWAYS 0 (warnings reported, build not blocked). A non-zero
// process.env.DELIVERY_LINT_STRICT=1 flips it to fail-on-warning for opt-in CI.
//
// Run:  node next/ci/lint-delivery.mjs

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROFILES_ROOT = process.env.PROFILES_ROOT
  ? process.env.PROFILES_ROOT.replace(/\/$/, "") + "/"
  : new URL("../profiles/", import.meta.url).pathname;

const SOURCES_ROOT = process.env.SOURCES_ROOT
  ? process.env.SOURCES_ROOT.replace(/\/$/, "") + "/"
  : new URL("../sources/", import.meta.url).pathname;

const STRICT = process.env.DELIVERY_LINT_STRICT === "1";

// ---- helpers ---------------------------------------------------------------

function walkJson(rootDir) {
  const files = [];
  if (!existsSync(rootDir)) return files;
  (function walk(d) {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (entry.endsWith(".json")) files.push(p);
    }
  })(rootDir);
  return files;
}

// (a) heuristic: is this attribute, by name/category, a setpoint/intent?
const SETPOINT_NAME = /(^set[_-])|(_?setpoint)|(_target\b)|(_soll\b)|(^sp_)|(_sp\b)|(_cmd\b)|(_command\b)/i;
function looksLikeSetpoint(attr) {
  const name = String(attr.name ?? "");
  const cat = String(attr.category ?? "").toLowerCase();
  if (cat === "setpoint" || cat === "intent" || cat === "command") return true;
  return SETPOINT_NAME.test(name);
}

// ---- load sources, index by profileRef -------------------------------------

function loadSourcesByProfile() {
  const byProfile = new Map(); // profileRef -> [source,...]
  for (const f of walkJson(SOURCES_ROOT)) {
    let src;
    try { src = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    src.__file = f;
    const refs = [];
    if (typeof src.profileRef === "string") refs.push(src.profileRef);
    if (Array.isArray(src.profileRefs)) refs.push(...src.profileRefs);
    for (const r of refs) {
      if (!byProfile.has(r)) byProfile.set(r, []);
      byProfile.get(r).push(src);
    }
  }
  return byProfile;
}

// Does ANY source for this profile poll best-effort (no changeDetection)?
// Returns the offending source(s), or [] if every source detects change / none found.
function bestEffortSources(profileId, sourcesByProfile) {
  const srcs = sourcesByProfile.get(profileId) || [];
  const offenders = [];
  for (const s of srcs) {
    if (s.syncType !== "polling") continue; // anchor/streaming/webhook out of scope
    const cd = s.polling && s.polling.changeDetection;
    // best-effort = no changeDetection declared, or an explicit full_refresh
    if (!cd || cd === "full_refresh") offenders.push(s);
  }
  return offenders;
}

// ---- main ------------------------------------------------------------------

function lint() {
  const sourcesByProfile = loadSourcesByProfile();
  const profileFiles = walkJson(PROFILES_ROOT);
  const warnings = [];
  let scanned = 0;
  let attrsChecked = 0;

  for (const f of profileFiles) {
    let profile;
    try { profile = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    if (!profile.profileId || !Array.isArray(profile.attributes)) continue;
    scanned++;
    const pid = profile.profileId;

    const offenders = bestEffortSources(pid, sourcesByProfile);

    // (a) telemetry on a setpoint/intent — reported PER ATTRIBUTE (each is distinct).
    for (const attr of profile.attributes) {
      attrsChecked++;
      if (attr.delivery === "telemetry" && looksLikeSetpoint(attr)) {
        warnings.push(
          `${pid} :: ${attr.name}: delivery="telemetry" but the attribute looks like a ` +
          `SETPOINT/INTENT (name/category) — setpoints are written intent and usually ` +
          `belong on the transactional/on_change lane, not streamed as raw telemetry.`
        );
      }
    }

    // (b) transactional attributes fed by a best-effort poll (no changeDetection).
    // This is a SOURCE-level smell (the poll, not the column) — collapse to ONE
    // warning per profile/source so the report stays a guardrail, not per-column noise.
    if (offenders.length) {
      const txnAttrs = profile.attributes.filter((a) => a.delivery === "transactional");
      if (txnAttrs.length) {
        const where = offenders
          .map((s) => `${s.sourceId}(${(s.polling && s.polling.changeDetection) || "no-changeDetection"})`)
          .join(", ");
        warnings.push(
          `${pid}: ${txnAttrs.length} transactional attribute(s) fed by best-effort ` +
          `poll source(s) ${where} (no changeDetection) — on_change/transactional ` +
          `semantics can miss or double-count transitions on a blind re-poll. ` +
          `Consider a timestamp/cdc changeDetection on the source.`
        );
      }
    }
  }

  console.log(
    `lint-delivery: scanned ${scanned} profiles (${attrsChecked} attributes), ` +
    `${sourcesByProfile.size} profile->source mappings`
  );

  if (warnings.length) {
    console.log(`\n${warnings.length} WARNING(S):`);
    for (const w of warnings) console.log("  ⚠ " + w);
  } else {
    console.log("no delivery-lint warnings");
  }

  // GUARDRAIL: never block the build unless explicitly opted-in.
  if (STRICT && warnings.length) {
    console.error("\nDELIVERY_LINT_STRICT=1 → failing on warnings.");
    process.exit(1);
  }
  process.exit(0);
}

lint();

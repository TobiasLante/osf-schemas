#!/usr/bin/env node
// next/ci/lint-recipes.mjs
//
// Cross-reference linter for GitHub-managed recipe master data under
// next/recipes/. JSON Schema (recipe-schema.json) pins the structure; this
// script enforces what it cannot:
//   - version is semver
//   - every `values` key is a reserved recipe:<param> / definition:<param> ref
//   - a [lo,hi] band is a 2-number tuple with lo <= hi
//   - `match` axes are non-empty strings
//   - no two recipes share an identical match AND a ref (one would silently
//     shadow the other — first-match-wins makes the second dead data)
//
// Run:  node next/ci/lint-recipes.mjs
// Exits non-zero on any error.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

const SCHEMA_PATH = new URL("../validation/recipe-schema.json", import.meta.url)
  .pathname;

/**
 * Compile recipe-schema.json. FAIL-CLOSED: if the schema is missing or does not
 * compile we push an ERROR and validate nothing — we never quietly carry on
 * "green" without the check the header promises. A linter that skips its own
 * contract when the contract is broken is worse than no linter.
 */
function compileRecipeSchema(errors) {
  try {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    return new Ajv({ allErrors: true, strict: false }).compile(schema);
  } catch (e) {
    errors.push(
      `validation/recipe-schema.json: could not compile — ${e.message} (recipes NOT schema-checked)`,
    );
    return null;
  }
}

const ROOT = process.env.RECIPES_ROOT
  ? process.env.RECIPES_ROOT.replace(/\/$/, "") + "/"
  : new URL("../recipes/", import.meta.url).pathname;

const PROFILES_ROOT = new URL("../profiles/machines/", import.meta.url).pathname;

const REF_RE = /^(recipe|definition):[A-Za-z0-9_.-]+$/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * CAPT-WINDOW — the signal vocabulary each machine profile actually publishes,
 * keyed by profileId. This is what makes the `regime_markers` check possible, and
 * that check is the whole reason this map exists.
 *
 * 🔥 THE FAILURE MODE IS SILENT, WHICH IS WHY IT NEEDS A LINTER AND NOT A CODE REVIEW.
 * A regime marker naming an attribute the machine does not publish never fires. The
 * boundary never moves. The population quietly stays "everything the edge ever saw" —
 * i.e. exactly the bug `population` was introduced to kill, now wearing the costume of
 * its own fix, and green in CI.
 *
 * This is not a hypothetical. `recipe_id` is the marker a reasonable engineer reaches
 * for first — "a new recipe is obviously a new regime" — and it is what the CAPT-WINDOW
 * brief itself proposed. It does NOT reach the edge: measured on the live sgm-004 UNS,
 * 0 rows match 'recipe' in sm_attribute, topic OR payload. It exists only in the band
 * the it-evaluator delivers to the engine. Declared as a marker it would have produced
 * a population rule that was correct in the schema, passing in CI, and dead on the
 * machine. The profile is the only place that knows what the machine really says.
 */
function loadProfileVocabularies(errors) {
  const vocab = new Map(); // profileId -> Set(attribute names)
  let files;
  try {
    files = readdirSync(PROFILES_ROOT).filter((f) => f.endsWith(".json"));
  } catch (e) {
    errors.push(`profiles/machines: unreadable — ${e.message} (regime markers NOT checked)`);
    return vocab;
  }
  for (const f of files) {
    try {
      const p = JSON.parse(readFileSync(join(PROFILES_ROOT, f), "utf8"));
      if (!p.profileId || !Array.isArray(p.attributes)) continue;
      const names = p.attributes.map((a) => a?.name).filter((n) => typeof n === "string");
      vocab.set(p.profileId, new Set(names));
    } catch (e) {
      errors.push(`profiles/machines/${f}: invalid JSON — ${e.message}`);
    }
  }
  return vocab;
}

function matchKey(match) {
  const m = match ?? {};
  return `a=${m.article ?? "*"}|e=${m.equipment ?? "*"}|s=${m.setup ?? "*"}`;
}

function lint() {
  if (!existsSync(ROOT)) {
    console.log(`lint-recipes: no recipes dir at ${ROOT} — nothing to check`);
    return;
  }
  const files = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  const errors = [];
  const ids = new Map(); // recipeId -> file
  // (matchKey + ref) -> file, to catch silent shadowing.
  const seenBindings = new Map();
  let refs = 0;

  // CAPT-EUR — actually APPLY recipe-schema.json.
  //
  // The header of this file has always claimed "JSON Schema (recipe-schema.json)
  // pins the structure; this script enforces what it cannot" — but nothing ever
  // loaded the schema, here or anywhere else in CI. The schema was decorative:
  // a recipe could contradict it in every field and `npm run validate` stayed
  // green. (Same class of fake-green as the ajv crash `tee` masked on 07-08.)
  //
  // It matters now: the `economics` block is what authorises a € figure in front
  // of a customer, and a mistyped `materialArticleRef` or a missing
  // `counterAttribute` must fail the build, not silently produce a wrong number
  // or no number at all. A contract nobody checks is not a contract.
  const validateSchema = compileRecipeSchema(errors);
  // CAPT-WINDOW — what each machine profile actually publishes, so a regime marker
  // can be checked against the machine instead of against good intentions.
  const vocab = loadProfileVocabularies(errors);

  for (const f of files) {
    const label = `next/recipes/${f}`;
    let r;
    try {
      r = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
    } catch (e) {
      errors.push(`${label}: invalid JSON — ${e.message}`);
      continue;
    }

    if (validateSchema && !validateSchema(r)) {
      for (const e of validateSchema.errors ?? []) {
        errors.push(`${label}: schema${e.instancePath || "/"} ${e.message}`);
      }
    }

    if (!r.recipeId || typeof r.recipeId !== "string") {
      errors.push(`${label}: missing recipeId`);
    } else if (ids.has(r.recipeId)) {
      errors.push(`${label}: duplicate recipeId "${r.recipeId}" (also ${ids.get(r.recipeId)})`);
    } else {
      ids.set(r.recipeId, label);
    }

    if (!SEMVER_RE.test(r.version ?? "")) {
      errors.push(`${label}: version "${r.version}" is not semver (x.y.z)`);
    }

    const match = r.match ?? {};
    for (const axis of ["article", "equipment", "setup"]) {
      if (match[axis] !== undefined && (typeof match[axis] !== "string" || match[axis].length === 0)) {
        errors.push(`${label}: match.${axis} must be a non-empty string`);
      }
    }

    const values = r.values ?? {};
    if (typeof values !== "object" || Array.isArray(values) || Object.keys(values).length === 0) {
      errors.push(`${label}: 'values' must be a non-empty object of recipe:<param> -> SpecValue`);
      continue;
    }
    // CAPT-TRUTH-ZUG3 — every band must say WHERE IT COMES FROM.
    // A band without provenance makes its own violations undecidable: sgm-004's
    // recipe_part_mass_band = [10.20, 10.45] fired 58,796 times against a process
    // centred at 10.400 g (sigma 0.0839, Cp 0.50) — is the RULE wrong or is the
    // PROCESS incapable? The measurements cannot say; only the ORIGIN of the number
    // can. A customer drawing may not be widened; a process estimate may.
    // `unknown` is a legal, honest answer — it is not an escape hatch: it marks the
    // band as un-changeable-without-evidence, which is the truth.
    const TOLERANCE_SOURCES = ["drawing", "customer_spec", "norm", "process_estimate", "unknown"];
    const provenance = r.toleranceSource;
    if (typeof provenance !== "object" || provenance === null || Array.isArray(provenance)) {
      errors.push(
        `${label}: missing 'toleranceSource' — every band must declare where its numbers come from ` +
          `(one of ${TOLERANCE_SOURCES.join(" / ")}, keyed by the same recipe:<param> refs as 'values')`,
      );
    }

    const mk = matchKey(match);
    for (const [ref, val] of Object.entries(values)) {
      refs++;
      if (!REF_RE.test(ref)) {
        errors.push(`${label}: values key "${ref}" must be a reserved ref (recipe:<param> / definition:<param>)`);
      }
      if (provenance && typeof provenance === "object" && !Array.isArray(provenance)) {
        const src = provenance[ref];
        if (src === undefined) {
          errors.push(`${label}: band "${ref}" has no toleranceSource — where does this number come from?`);
        } else if (!TOLERANCE_SOURCES.includes(src)) {
          errors.push(
            `${label}: toleranceSource["${ref}"] = "${src}" is not one of ${TOLERANCE_SOURCES.join(" / ")}`,
          );
        }
      }

      // CAPT-TRUTH-ZUG3.7 — every band must declare the capability it DEMANDS.
      // Cp answers "is this band holdable at all" (the RECIPE's obligation); Ca answers
      // "does the machine hit the nominal" (the MACHINE's obligation). They are
      // Process-Engineering policy and belong in the SSOT — a threshold compiled into a
      // service is a threshold nobody can change without a release.
      //
      // CAPT-SSOT / CAPT-STAT-EDGE (2026-07-12) — and max_stationarity_ratio is the
      // PRECONDITION of both: Cp and Ca are only defined for ONE stationary process.
      //   sigma_short = mean(|x_i - x_(i-1)|) / 1.128   (moving range, d2 for n=2)
      //   stationarity_ratio = stddev(x) / sigma_short
      // Above the threshold the sample holds several states and sigma measures the
      // distance between them, not the process noise — the capability verdict must be
      // WITHHELD (evidence gap), not reported as an incapable process. Measured on
      // sgm-004: mouldTempC 156.4, pressures 3.3, partMass/hotrunner/cushion ~= 1.0.
      const cap = r.capability?.[ref];
      if (!cap || typeof cap !== "object") {
        errors.push(
          `${label}: band "${ref}" has no capability — declare { cp_min, ca_max, max_stationarity_ratio } (what must the band hold, how well must the machine hit it, and how far from stationary may the sample be before no verdict is allowed at all?)`,
        );
      } else {
        if (typeof cap.cp_min !== "number" || !(cap.cp_min > 0)) {
          errors.push(`${label}: capability["${ref}"].cp_min must be a positive number`);
        }
        if (typeof cap.ca_max !== "number" || cap.ca_max < 0 || cap.ca_max > 1) {
          errors.push(`${label}: capability["${ref}"].ca_max must be between 0 and 1`);
        }
        if (typeof cap.max_stationarity_ratio !== "number" || !(cap.max_stationarity_ratio > 1)) {
          errors.push(
            `${label}: capability["${ref}"].max_stationarity_ratio must be a number > 1 ` +
              `(sigma_total / sigma_short; a stationary process sits at ~1.0, so a threshold <= 1 would reject every sample). ` +
              `Pilot policy: 2.0`,
          );
        }

        // CAPT-WINDOW — OVER WHICH POPULATION DOES THIS BAND'S CAPABILITY HOLD?
        //
        // Cp/Ca/Cpk are statements about a SET OF SAMPLES, and until now that set was
        // implicit ("everything the edge ever recorded"). An implicit population is a lie
        // with a confidence interval: on sgm-004 the mould-temperature setpoint changed
        // 70 -> 87.5 degC at 12:24:06, and the full-history mean (75.63 degC) then described
        // an average of two machines, one of which no longer existed. The stationarity gate
        // caught the SPREAD and refused Cp — but the MEAN, and therefore Ca, was computed
        // anyway. So the population must be DECLARED, exactly like cp_min.
        //
        // It is REQUIRED, not optional, for the same reason cp_min is: the fallback for a
        // missing population is the very behaviour we are removing, and a default that
        // restores the bug is not a default, it is a trapdoor.
        const pop = cap.population;
        if (!pop || typeof pop !== "object" || Array.isArray(pop)) {
          errors.push(
            `${label}: capability["${ref}"] has no 'population' — declare WHICH SAMPLES this ` +
              `capability is a statement about (scope: current_regime | full_history). Without it ` +
              `the population silently means "everything the edge ever recorded", which is what ` +
              `made a re-commissioned machine report the average of two regimes.`,
          );
        } else if (pop.scope !== "current_regime" && pop.scope !== "full_history") {
          errors.push(
            `${label}: capability["${ref}"].population.scope must be "current_regime" or "full_history"`,
          );
        } else if (pop.scope === "current_regime") {
          const markers = pop.regime_markers;
          const onChange = Array.isArray(markers?.on_change) ? markers.on_change : [];
          const onReset = Array.isArray(markers?.on_reset) ? markers.on_reset : [];
          if (onChange.length + onReset.length === 0) {
            errors.push(
              `${label}: capability["${ref}"].population is 'current_regime' but declares NO ` +
                `regime_markers — the boundary can never move, so the population is "everything" ` +
                `while claiming to be the current regime. Declare what starts a new process ` +
                `(on_change: mouldId / currentProgram / resin ..., on_reset: shotCount ...), or say ` +
                `scope: full_history and mean it.`,
            );
          }
          // 🔥 THE ONE THAT CATCHES `recipe_id`. A marker the machine never publishes never
          // fires, and a boundary that never moves is not a boundary — it is the old bug,
          // green in CI. Check every marker against what the PROFILE says the machine emits.
          const known = vocab.get(r.profileRef);
          if (r.profileRef && !known) {
            errors.push(
              `${label}: profileRef "${r.profileRef}" matches no profile in profiles/machines — ` +
                `regime markers cannot be checked against the machine's real signal vocabulary`,
            );
          } else if (known) {
            for (const [kind, list] of [
              ["on_change", onChange],
              ["on_reset", onReset],
            ]) {
              for (const attr of list) {
                if (!known.has(attr)) {
                  errors.push(
                    `${label}: capability["${ref}"].population.regime_markers.${kind} names "${attr}", ` +
                      `which the profile ${r.profileRef} does NOT publish. A marker the machine never ` +
                      `sends never fires: the regime boundary would never move and the population would ` +
                      `silently stay "everything the edge ever recorded" — the exact bug 'population' ` +
                      `exists to prevent. (This is how "recipe_id" gets caught: it reads like the obvious ` +
                      `marker and does not exist on the edge at all.)`,
                  );
                }
              }
            }
          }
          if (
            pop.min_sample_n !== undefined &&
            (!Number.isInteger(pop.min_sample_n) || pop.min_sample_n < 1)
          ) {
            errors.push(
              `${label}: capability["${ref}"].population.min_sample_n must be a positive integer — ` +
                `below it the consumer must emit capability_unjudged ("measured, not judged") and it ` +
                `must NOT widen the window to reach n. There is no threshold at which stale data ` +
                `becomes fresh.`,
            );
          }
        }
      }
      if (Array.isArray(val)) {
        if (val.length === 2 && val.every(isNum)) {
          if (val[0] > val[1]) errors.push(`${label}: band "${ref}" = [${val}] has lo > hi`);
        } else if (val.length === 0) {
          errors.push(`${label}: value "${ref}" is an empty array`);
        }
      }
      const bindKey = `${mk}::${ref}`;
      if (seenBindings.has(bindKey)) {
        errors.push(
          `${label}: match ${mk} + ref "${ref}" already bound by ${seenBindings.get(bindKey)} — second is dead data (first-match-wins)`,
        );
      } else {
        seenBindings.set(bindKey, label);
      }
    }

    // Provenance / capability for a band that does not exist is dead data — and worse,
    // it reads like the band IS covered. Catch the drift when a band is renamed or removed.
    for (const [block, name] of [
      [provenance, "toleranceSource"],
      [r.capability, "capability"],
    ]) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      for (const ref of Object.keys(block)) {
        if (!(ref in values)) {
          errors.push(`${label}: ${name}["${ref}"] has no matching band in 'values' — dead entry`);
        }
      }
    }
  }

  console.log(`lint-recipes: scanned ${files.length} recipe files, checked ${refs} refs`);
  if (errors.length) {
    console.error(`FAIL (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("OK");
}

lint();

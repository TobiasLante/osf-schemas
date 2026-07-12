#!/usr/bin/env node
// next/ci/lint-counters.mjs
//
// COUNTER-SEMANTICS linter (CAPT-ZUG4, 2026-07-12) — FAIL-CLOSED.
//
// A cumulative counter and a measurement are different KINDS of number, and
// almost every way of reading the first as if it were the second is wrong:
//
//   mean(counter)          — arithmetic on a ramp; means nothing.
//   sigma/Cp(counter)      — a capability claim about a staircase.
//   max(counter)-min(...)  — the answer you get by default, and it is WRONG the
//                            moment the counter resets.
//
// Until today the ONLY place the difference was written down was the attribute's
// `description` prose — "Good parts produced (cumulative)." No consumer can read
// prose. On sgm-004 that cost a factor of 2.25: max-min says 55.622 good parts,
// the sum of positive increments says 125.210, and the second one is right (it is
// confirmed by an identity that only closes if it is: good 125.210 + scrap 1.742
// = total 126.952 = 8 cavities x shotCount 15.869, exactly).
//
// This is the SAME defect that killed qty_shortfall three hours earlier: its guard
// literal 'offen' was copied out of a DESCRIPTION that had been invented rather
// than measured, the code then did the opposite of the description's stated
// intent, and the rule shipped 11.196 phantom findings and EUR 1.737.072 of
// phantom impact before anyone measured it. A semantic that only humans can see
// is a semantic the machine WILL get wrong. So:
//
//   THE RULE: if an attribute's prose claims it is a running total, the profile
//   must ALSO say so in the machine-readable `counter` facet — or the build fails.
//
// Saying "I do not know how to read this" IS a passing answer:
// `counter: { semantics: "unreadable", aggregation: "refuse" }` satisfies the
// linter and makes the engine refuse to aggregate. What does NOT pass is knowing
// it in prose and leaving the machine to guess. (sgm-004's `totalShots` is exactly
// that case: it steps down 153 times where the machine counters step down 10, so
// it is almost certainly the MOULD's life count following the tool — and it is
// declared 'refuse' rather than given a plausible default that would sum across
// moulds.)
//
// Consistency checks (a facet that contradicts itself is worse than none):
//   - cumulative_resettable  => aggregation MUST be sum_of_positive_deltas.
//     last_minus_first over a resettable counter is the 55.622 answer.
//   - cumulative_monotonic   => aggregation MUST be last_minus_first or
//     sum_of_positive_deltas (the latter is always safe).
//     ...and resetsObserved > 0 CONTRADICTS 'monotonic' outright → error.
//   - delta                  => aggregation MUST be sum.
//   - unreadable             => aggregation MUST be refuse (and vice versa).
//
// Run:  node ci/lint-counters.mjs
//       PROFILE_ROOT=<dir> node ci/lint-counters.mjs   (lint a fixture)

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname; // …/next/ci/
const NEXT = join(HERE, "..");
const ROOT = process.env.PROFILE_ROOT
  ? process.env.PROFILE_ROOT.replace(/\/$/, "")
  : join(NEXT, "profiles");

/** Prose that claims the value is a running total. Deliberately narrow: it must
 *  catch the actual regression (someone types "(cumulative)" and moves on) without
 *  firing on every attribute that merely has the word "count" in its name — a
 *  noisy linter gets disabled, and a disabled linter guards nothing. */
const CUMULATIVE_PROSE = /\bcumulative\b|\brunning total\b|\btotalis(?:ed|er)\b/i;

const VALID = {
  cumulative_resettable: new Set(["sum_of_positive_deltas"]),
  cumulative_monotonic: new Set(["last_minus_first", "sum_of_positive_deltas"]),
  delta: new Set(["sum"]),
  unreadable: new Set(["refuse"]),
};

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith(".json") && !e.startsWith("_")) out.push(p);
  }
  return out;
}

const errors = [];
let profiles = 0;
let facets = 0;

for (const file of walk(ROOT)) {
  let p;
  try {
    p = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${file}: unparseable JSON — ${e.message}`);
    continue;
  }
  const attrs = Array.isArray(p.attributes) ? p.attributes : [];
  if (!attrs.length) continue;
  profiles++;
  const pid = p.profileId || file;

  for (const a of attrs) {
    const label = `${pid}.${a.name}`;
    const c = a.counter;
    const claimsProse = CUMULATIVE_PROSE.test(String(a.description || ""));

    if (!c) {
      // THE regression this linter exists to stop: the semantics live in the prose
      // and nowhere a consumer can reach them.
      if (claimsProse) {
        errors.push(
          `${label}: description says it is a running total ("${String(a.description).slice(0, 60)}…") ` +
            `but there is no machine-readable \`counter\` facet. Prose is not a contract — this is how ` +
            `qty_shortfall shipped 11.196 phantom findings. Declare the facet, or declare ` +
            `{ semantics: "unreadable", aggregation: "refuse" } if the reading is genuinely not known.`,
        );
      }
      continue;
    }

    facets++;
    const { semantics, aggregation, resetsObserved } = c;
    const allowed = VALID[semantics];
    if (!allowed) {
      errors.push(`${label}: unknown counter.semantics "${semantics}"`);
      continue;
    }
    if (!allowed.has(aggregation)) {
      errors.push(
        `${label}: counter.semantics "${semantics}" is incompatible with aggregation "${aggregation}" ` +
          `(allowed: ${[...allowed].join(", ")}). ` +
          (semantics === "cumulative_resettable" && aggregation === "last_minus_first"
            ? "last_minus_first over a RESETTABLE counter is exactly the reading that loses 56 % of sgm-004's output."
            : ""),
      );
    }
    if (aggregation === "refuse" && semantics !== "unreadable") {
      errors.push(`${label}: aggregation "refuse" only makes sense with semantics "unreadable"`);
    }
    // An asserted 'never resets' that HAS been observed resetting is not a nuance;
    // it is a false statement, and every quantity derived from it is wrong.
    if (semantics === "cumulative_monotonic" && Number(resetsObserved) > 0) {
      errors.push(
        `${label}: counter.semantics is "cumulative_monotonic" but resetsObserved=${resetsObserved}. ` +
          `A counter that has been MEASURED resetting is not monotonic — use cumulative_resettable.`,
      );
    }
    if (resetsObserved !== undefined && c.measuredAt === undefined) {
      errors.push(`${label}: counter.resetsObserved=${resetsObserved} without measuredAt — an unmeasured claim is prose again.`);
    }
  }
}

for (const e of errors) console.error(`ERROR ${e}`);
console.log(
  `lint-counters: ${profiles} profiles with attributes, ${facets} counter facet(s) checked`,
);
if (errors.length) {
  console.error(`\nFAILED — ${errors.length} counter-semantics error(s).`);
  process.exit(1);
}
console.log("OK — every counter that claims to be cumulative says so where a machine can read it");

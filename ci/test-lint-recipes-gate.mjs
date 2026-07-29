#!/usr/bin/env node
// ci/test-lint-recipes-gate.mjs — proves the CAPT-REGIME gate-mirror check
// (ci/lint-recipes.mjs) is real and WIRED.
//
// WHY IT EXISTS. `parameters[].gate` has no consumer: the guard that actually runs is
// `when` on the profile constraint, which it-evaluator copies into the spec and edge-api
// compiles into the interval CTE that bounds the capability's population. An unread field
// drifts in silence, and it DID: CAPT-WINDOW (9d50b52) deleted mouldTempC's
// `gate: "inCycle==true"` from recipe-sgm-004-default.json believing it was removing the
// guard. The guard never moved — the profile still gates on inCycle==true — and the lint
// stayed green for 17 days while the recipe described a population the machine was never
// measured over. This test is the RED that would have caught it.
//
// Two layers, same as test-lint-recipes-aim.mjs:
//   (1) unit — gateMirrorErrors()/parseGate() directly;
//   (2) E2E  — spawn `node ci/lint-recipes.mjs` over a fixture recipe dir and assert the
//        exit code, so the check is proven to actually fail the lint.
// Run: node ci/test-lint-recipes-gate.mjs   (exit 0 = pass)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateMirrorErrors, parseGate } from './lint-recipes.mjs';

const LINT = fileURLToPath(new URL('./lint-recipes.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); } };

// A stand-in profile index in the shape loadProfileConstraints() produces: the gated
// constraint carries `when`, the ungated one does not.
const gated = { name: 'recipe_mould_temp_band', when: { attr: 'inCycle', op: 'eq', value: true },
                require: { attr: 'mouldTempC', op: 'between', valueFrom: 'recipe:mould_temp_band' } };
const ungated = { name: 'recipe_cushion_band',
                  require: { attr: 'cushionMm', op: 'between', valueFrom: 'recipe:cushion_band' } };
const constraints = new Map([['SMProfile-Test', {
  byName: new Map([[gated.name, gated], [ungated.name, ungated]]),
  byRef: new Map([[gated.require.valueFrom, gated], [ungated.require.valueFrom, ungated]]),
}]]);

const recipe = (gate, { ref = 'recipe:mould_temp_band', constraintId = 'recipe_mould_temp_band' } = {}) => ({
  recipeId: 'TEST-gate', version: '1.0.0', profileRef: 'SMProfile-Test',
  values: { [ref]: [80, 90] },
  toleranceSource: { [ref]: 'norm' },
  capability: { [ref]: { cp_min: 1.33, ca_max: 0.125, max_stationarity_ratio: 2,
                         population: { scope: 'full_history' } } },
  parameters: [{ param: 'mouldTempC', soll: 85, ...(gate === undefined ? {} : { gate }),
                 valueFrom: ref, constraintId, smAttribute: 'mouldTempC' }],
});

// ── (1) unit: parseGate() — the grammar edge-api's WHEN_OPS accepts ───────────
ok(JSON.stringify(parseGate('inCycle==true')) === JSON.stringify({ attr: 'inCycle', op: 'eq', value: true }),
   'unit — inCycle==true parses to a BOOLEAN, not the string "true"');
ok(JSON.stringify(parseGate('phaseName==HOLD')) === JSON.stringify({ attr: 'phaseName', op: 'eq', value: 'HOLD' }),
   'unit — a bare HOLD parses as a string');
ok(parseGate('coolingFlowLMin>=5')?.op === 'gte', 'unit — >= maps to gte before > is tried');
ok(parseGate('nonsense') === null, 'unit — an unparsable gate is null, not a silent pass');

// ── (2) unit: gateMirrorErrors() — all four states, fail-closed both ways ─────
ok(gateMirrorErrors(recipe('inCycle==true'), 'r', constraints).length === 0,
   'unit GREEN — gate mirrors the operative `when` → no error');
ok(gateMirrorErrors(recipe(undefined), 'r', constraints).length === 1,
   'unit RED   — 🔥 the 9d50b52 drift: no gate while the constraint runs one → error');
ok(/runs under `inCycle==true`/.test(gateMirrorErrors(recipe(undefined), 'r', constraints)[0] ?? ''),
   'unit RED   — the message names the guard the capability is actually taken under');
ok(gateMirrorErrors(recipe('phaseName==HOLD'), 'r', constraints).length === 1,
   'unit RED   — a gate contradicting the operative `when` → error');
ok(gateMirrorErrors(recipe('inCycle==true', { ref: 'recipe:cushion_band', constraintId: 'recipe_cushion_band' }),
                    'r', constraints).length === 1,
   'unit RED   — a gate on an UNGATED constraint → error (decoration on an ungated population)');
ok(gateMirrorErrors(recipe(undefined, { ref: 'recipe:cushion_band', constraintId: 'recipe_cushion_band' }),
                    'r', constraints).length === 0,
   'unit GREEN — no gate, no `when` → no error');
ok(gateMirrorErrors(recipe('inCycle==true', { ref: 'recipe:nope', constraintId: 'recipe_nope' }),
                    'r', constraints).length === 1,
   'unit RED   — a gate for a constraint that does not exist is dead data → error');
ok(gateMirrorErrors(recipe('inCycle=true'), 'r', constraints).length === 1,
   'unit RED   — an unparsable gate fails the build rather than being waved through');

// ── (3) E2E: the check is wired into lint-recipes.mjs ─────────────────────────
// Uses the REAL profiles/machines tree, so the fixture names the real constraint the real
// SMProfile-InjectionMoldingMachine gates — the same pairing the live sgm-004 runs.
const e2e = (gate) => ({
  recipeId: 'TEST-gate-e2e', version: '1.0.0', profileRef: 'SMProfile-InjectionMoldingMachine',
  values: { 'recipe:mould_temp_band': [80, 90] },
  toleranceSource: { 'recipe:mould_temp_band': 'norm' },
  capability: { 'recipe:mould_temp_band': { cp_min: 1.33, ca_max: 0.125, max_stationarity_ratio: 2,
                                            population: { scope: 'full_history' } } },
  parameters: [{ param: 'mouldTempC', soll: 85, ...(gate === undefined ? {} : { gate }),
                 valueFrom: 'recipe:mould_temp_band', constraintId: 'recipe_mould_temp_band',
                 smAttribute: 'mouldTempC' }],
});
function lintExit(recipeObj) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-fx-'));
  try {
    writeFileSync(join(dir, 'r.json'), JSON.stringify(recipeObj));
    execFileSync(process.execPath, [LINT], { env: { ...process.env, RECIPES_ROOT: dir }, stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status ?? 1; } finally { rmSync(dir, { recursive: true, force: true }); }
}
ok(lintExit(e2e('inCycle==true')) === 0, 'E2E  GREEN — mirrored gate: lint-recipes exits 0');
ok(lintExit(e2e(undefined)) === 1, 'E2E  RED   — missing gate: lint-recipes exits 1');
ok(lintExit(e2e('phaseName==HOLD')) === 1, 'E2E  RED   — contradicting gate: lint-recipes exits 1');

console.log(`\ntest-lint-recipes-gate: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

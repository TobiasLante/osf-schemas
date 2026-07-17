#!/usr/bin/env node
// ci/test-lint-recipes-aim.mjs — proves the CAPT-GOLDEN `aim` band-membership
// check (ci/lint-recipes.mjs) is real and WIRED. Two layers:
//   (1) unit — aimErrors() directly: aim inside the band → no error, aim outside
//        (or with no numeric band) → error, fail-closed;
//   (2) E2E  — spawn `node ci/lint-recipes.mjs` over a fixture recipe dir and
//        assert the exit code, so the check is proven to actually fail the lint.
// RED→GREEN: against the pre-fix lint-recipes.mjs the import of aimErrors throws
// (no such export) and an out-of-band aim exits 0 — this test then fails. After
// the fix it passes. Run: node ci/test-lint-recipes-aim.mjs   (exit 0 = pass)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aimErrors } from './lint-recipes.mjs';

const LINT = fileURLToPath(new URL('./lint-recipes.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); } };

// A complete, schema-valid recipe. scope=full_history sidesteps the regime-marker
// vocabulary checks so the fixture isolates the aim behaviour.
const recipe = (aim, valueFrom = 'recipe:part_mass_band') => ({
  recipeId: 'TEST-aim', version: '1.0.0',
  values: { 'recipe:part_mass_band': [10.0, 11.0] },
  toleranceSource: { 'recipe:part_mass_band': 'drawing' },
  capability: {
    'recipe:part_mass_band': {
      cp_min: 1.33, ca_max: 0.125, max_stationarity_ratio: 2,
      population: { scope: 'full_history' },
    },
  },
  parameters: [{ param: 'partMass_g', soll: 10.5, aim, valueFrom, smAttribute: 'partMass_g' }],
});

// ── (1) unit: aimErrors() — both modes on the same input shape ────────────────
ok(aimErrors(recipe(10.6), 'r').length === 0, 'unit GREEN — aim 10.6 inside [10,11] → no error');
ok(aimErrors(recipe(12.0), 'r').length === 1, 'unit RED   — aim 12.0 above [10,11] → one error');
ok(/outside its band/i.test(aimErrors(recipe(12.0), 'r')[0] ?? ''), 'unit RED   — message names the out-of-band aim');
ok((aimErrors(recipe(9.0), 'r')[0] ?? '').includes('[10,11]'), 'unit RED   — aim 9.0 below band caught, band shown');
ok(aimErrors(recipe(10.6, 'recipe:missing'), 'r').length === 1, 'unit RED   — aim with no resolvable band → error (fail-closed)');

// ── (2) E2E: the check is wired into lint-recipes.mjs ─────────────────────────
function lintExit(recipeObj) {
  const dir = mkdtempSync(join(tmpdir(), 'aim-fx-'));
  try {
    writeFileSync(join(dir, 'r.json'), JSON.stringify(recipeObj));
    execFileSync(process.execPath, [LINT], { env: { ...process.env, RECIPES_ROOT: dir }, stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status ?? 1; } finally { rmSync(dir, { recursive: true, force: true }); }
}
ok(lintExit(recipe(10.6)) === 0, 'E2E  GREEN — in-band aim: lint-recipes exits 0');
ok(lintExit(recipe(12.0)) === 1, 'E2E  RED   — out-of-band aim: lint-recipes exits 1');

console.log(`\ntest-lint-recipes-aim: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

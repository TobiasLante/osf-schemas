#!/usr/bin/env node
// ci/test-lint-attribute-aliases.mjs — proves the CAPT-REGIME cross-profile attribute
// equivalence check (ci/lint-attribute-aliases.mjs) is real and WIRED.
//
// The point of the registry is that the equivalence is CHECKED, not merely written down —
// a declared-but-unchecked synonym is the same trap as `parameters[].gate` (declared, read
// by nobody, drifted for 17 days, green in CI). So every way an equivalence can be false
// gets a RED case here.
//
// The B5 case is not hypothetical: on its FIRST run against the real tree this linter
// refused `Act_Energy_Power` == `powerKw`, because the CNC attribute declared kW only in
// its prose and `unit` nowhere — 1 of 44 attributes on that profile carried a unit at all.
//
// Run: node ci/test-lint-attribute-aliases.mjs   (exit 0 = pass)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aliasErrors, kpiTokenErrors } from './lint-attribute-aliases.mjs';

const LINT = fileURLToPath(new URL('./lint-attribute-aliases.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); } };

const attr = (o) => ({ delivery: 'telemetry', scope: 'hub', promotion: '5sec', dataType: 'Float', unit: 'kW', ...o });
const profiles = (overrides = {}) => new Map([
  ['SMProfile-A', { file: 'a.json', attributes: new Map([['Act_Energy_Power', attr(overrides.a ?? {})]]) }],
  ['SMProfile-B', { file: 'b.json', attributes: new Map([['powerKw', attr({ dataType: 'Double', ...(overrides.b ?? {}) })]]) }],
]);
const map = (over = {}) => ({
  semantics: [{
    semantic: 'electrical_power', meaning: 'instantaneous electrical power draw in kilowatts',
    wireKind: 'number', unit: 'kW', delivery: 'telemetry', scope: 'hub', promotion: '5sec',
    members: [{ profileRef: 'SMProfile-A', attribute: 'Act_Energy_Power' },
              { profileRef: 'SMProfile-B', attribute: 'powerKw' }],
    ...over,
  }],
});
const codes = (m, p) => aliasErrors(m, p).map((e) => e.slice(0, 2));

// ── GREEN: Float vs Double is NOT a difference the consumer can see ───────────
ok(aliasErrors(map(), profiles()).length === 0,
   'GREEN — Float vs Double both resolve to wire kind "number" → equivalence certified');

// ── RED: every way the equivalence can be false ───────────────────────────────
ok(codes(map(), profiles({ a: { unit: undefined } })).join() === 'B5',
   '🔥 B5 — the real first-run failure: one side declares no unit → refused');
ok(codes(map(), profiles({ a: { unit: 'W' } })).join() === 'B5',
   'B5 — units disagree (kW vs W) → refused before it becomes a magnitude bug');
ok(codes(map(), profiles({ a: { dataType: 'String' } })).join() === 'B4',
   'B4 — a String against a number semantic → refused');
ok(codes(map(), profiles({ a: { promotion: 'raw' } })).join() === 'B6',
   'B6 — same name, same unit, but never promoted on the same cadence → refused');
ok(codes(map(), profiles({ a: { scope: 'edge' } })).join() === 'B6',
   'B6 — one side never reaches the hub the consumer reads → refused');
ok(codes(map(), profiles({ a: { delivery: 'transactional' } })).join() === 'B6',
   'B6 — delivery contracts disagree → refused');
ok(codes({ semantics: [{ ...map().semantics[0],
     members: [{ profileRef: 'SMProfile-A', attribute: 'nope' },
               { profileRef: 'SMProfile-B', attribute: 'powerKw' }] }] }, profiles()).join() === 'B3',
   'B3 — a member the profile does not declare → dead on arrival, refused');
ok(codes({ semantics: [{ ...map().semantics[0],
     members: [{ profileRef: 'SMProfile-ZZ', attribute: 'x' },
               { profileRef: 'SMProfile-B', attribute: 'powerKw' }] }] }, profiles()).join() === 'B2',
   'B2 — a profileRef that resolves to nothing → refused');
{
  const two = { semantics: [map().semantics[0], { ...map().semantics[0], semantic: 'other_power' }] };
  ok(codes(two, profiles()).join() === 'B7,B7', 'B7 — one attribute claimed by two semantics → refused');
}
ok(codes({ semantics: [{ ...map().semantics[0],
     members: [{ profileRef: 'SMProfile-A', attribute: 'Act_Energy_Power' },
               { profileRef: 'SMProfile-A', attribute: 'Act_Energy_Power' }] }] }, profiles())
     .includes('B8'),
   'B8 — two members on the same profile is a rename, not an equivalence → refused');

// ── B9: the reading semantics (cumulative counter vs measurement vs delta) ────
// The distinction that keeps Act_Energy_Total out of electrical_power, generalised.
const cnt = (o) => ({ semantics: 'cumulative_resettable', aggregation: 'sum_of_positive_deltas', ...o });
const countMap = (over = {}) => ({
  semantics: [{
    semantic: 'part_good', meaning: 'parts produced and accepted, as a cumulative count',
    wireKind: 'number', counter: cnt(), delivery: 'transactional', scope: 'hub', promotion: 'on_change',
    members: [{ profileRef: 'SMProfile-A', attribute: 'Act_Amount_PartGood' },
              { profileRef: 'SMProfile-B', attribute: 'good' }],
    ...over,
  }],
});
const countProfiles = (overrides = {}) => new Map([
  ['SMProfile-A', { file: 'a.json', attributes: new Map([['Act_Amount_PartGood',
    { dataType: 'Int32', delivery: 'transactional', scope: 'hub', promotion: 'on_change',
      counter: cnt(), ...(overrides.a ?? {}) }]]) }],
  ['SMProfile-B', { file: 'b.json', attributes: new Map([['good',
    { dataType: 'Int32', delivery: 'transactional', scope: 'hub', promotion: 'on_change',
      counter: cnt(), ...(overrides.b ?? {}) }]]) }],
]);
ok(aliasErrors(countMap(), countProfiles()).length === 0,
   'GREEN — both sides declare cumulative_resettable/sum_of_positive_deltas → certified');
ok(codes(countMap(), countProfiles({ a: { counter: undefined } })).join() === 'B9',
   '🔥 B9 — the real first-run failure: CNC declared NO counter facet → refused');
ok(codes(countMap(), countProfiles({ a: { counter: cnt({ semantics: 'delta', aggregation: 'sum' }) } }))
     .join() === 'B9,B9',
   'B9 — a DELTA against a cumulative semantic → refused (sum vs sum_of_positive_deltas is not a detail)');
ok(codes(countMap(), countProfiles({ a: { counter: cnt({ aggregation: 'last_minus_first' }) } })).join() === 'B9',
   'B9 — same semantics, different aggregation → refused (last_minus_first loses every reset)');
ok(codes(countMap({ counter: undefined }), countProfiles()).join() === 'B9,B9',
   'B9 — a semantic claiming a plain measurement while members are counters → refused');

// ── B10 / W1: the registry and kpis/*.json are held to the SAME WORD ──────────
const kpi = (token) => [{ file: 'kpis/x.json',
  kpi: { calculation: { inputMappings: { 'SMProfile-A': { Act_Amount_PartGood: token } } } } }];
ok(kpiTokenErrors(countMap(), kpi('part_good')).errs.length === 0,
   'GREEN — KPI canonical token equals the semantic name → no error');
ok(kpiTokenErrors(countMap(), kpi('part_gut')).errs.length === 1,
   'B10 — KPI canonicalises the SAME pair under a different word → refused');
{
  const r = kpiTokenErrors(countMap(), kpi('Act_Amount_PartGood'));
  ok(r.errs.length === 0 && r.warns.length === 1,
     'W1 — an IDENTITY mapping makes no competing claim → warning, not a build failure');
}
ok(kpiTokenErrors(countMap(), [{ file: 'kpis/y.json',
     kpi: { calculation: { inputMappings: { 'SMProfile-A': { Act_Status_Machine: 'Act_Status_Machine' } } } } }])
     .errs.length === 0,
   'GREEN — a pair the registry does not carry is none of its business');

// ── E2E: the check actually fails the build, against the REAL profiles/ tree ──
function lintExit(mapObj) {
  const dir = mkdtempSync(join(tmpdir(), 'attralias-'));
  const file = join(dir, 'attribute-aliases.json');
  try {
    writeFileSync(file, JSON.stringify(mapObj));
    execFileSync(process.execPath, [LINT], { env: { ...process.env, ATTR_ALIAS_FILE: file }, stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status ?? 1; } finally { rmSync(dir, { recursive: true, force: true }); }
}
const real = (over = {}) => ({
  mapId: 'attribute-aliases', version: '1.0.0',
  semantics: [{
    semantic: 'machine_in_cycle', meaning: 'the machine is executing its production cycle',
    wireKind: 'boolean', delivery: 'transactional', scope: 'hub', promotion: 'on_change',
    members: [{ profileRef: 'SMProfile-CNC-Machine', attribute: 'Act_State_InCycle' },
              { profileRef: 'SMProfile-InjectionMoldingMachine', attribute: 'inCycle' }],
    ...over,
  }],
});
ok(lintExit(real()) === 0, 'E2E  GREEN — the real Act_State_InCycle/inCycle pair: exits 0');
ok(lintExit(real({ wireKind: 'number' })) === 1, 'E2E  RED   — same pair claimed numeric: exits 1');
ok(lintExit(real({ promotion: 'raw' })) === 1, 'E2E  RED   — same pair claimed raw: exits 1');

console.log(`\ntest-lint-attribute-aliases: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

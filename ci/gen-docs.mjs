#!/usr/bin/env node
// ci/gen-docs.mjs — renders the drift-prone FACTUAL blocks of README.md and
// schema-guide.md from the tree and contract.json, following the
// gen-contract.mjs / lint-contract.mjs pattern: prose stays hand-written,
// facts are generated between HTML markers.
//
//   node ci/gen-docs.mjs           # (re)generate the gen: blocks in place
//   node ci/gen-docs.mjs --check   # CI drift check (npm run validate:docs):
//                                  # fails red when a committed doc differs
//                                  # from a fresh render.
//
// Blocks (marker pair <!-- gen:<name>:begin --> … <!-- gen:<name>:end -->):
//   tree          — the directory-structure listing (measured from the fs)
//   counts        — profiles/sources/sync/recipes/kpis counts + ids (the same
//                   sums `npm run validate:refs` prints)
//   targetIdProp  — the "Common targetIdProp Values" table, derived from
//                   contract.json nodes (labels grouped by key property) and
//                   edges (which rules actually use each key)
//
// Why this exists: the audit of 2026-07-15 found README/schema-guide
// describing a phantom catalog — profiles/enterprise/, sources/postgresql/
// ("30 mappings"), sync/mqtt|kafka|webhook, "65 Source Bindings / 45 SM
// Profiles", a targetIdProp table full of labels that exist nowhere. Where a
// linter existed the repo was clean; where none existed it had rotted. A doc
// count nobody regenerates is a lie with a publication date — so the counts
// are now rendered from the same tree the linters read, and CI refuses a doc
// that disagrees with a fresh render.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');

// ── helpers ─────────────────────────────────────────────────────────────────
function walkJson(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? walkJson(rel) : e.name.endsWith('.json') ? [rel] : [];
  });
}
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const base = (rel) => path.basename(rel, '.json');

// ── measurements (same counting rules as ci/lint-refs.mjs) ─────────────────
// profiles: skip _-prefixed fixtures, require profileId ?? modelId
const profileFiles = walkJson('profiles')
  .filter((f) => !path.basename(f).startsWith('_'))
  .filter((f) => { const d = readJson(f); return d.profileId ?? d.modelId; });
const profilesByDomain = new Map();
for (const f of profileFiles) {
  const domain = f.split(path.sep)[1];
  profilesByDomain.set(domain, (profilesByDomain.get(domain) ?? 0) + 1);
}

const sourceFiles = walkJson('sources');
const sourcesByType = new Map();
for (const f of sourceFiles) {
  const t = f.split(path.sep)[1];
  if (!sourcesByType.has(t)) sourcesByType.set(t, []);
  sourcesByType.get(t).push(base(f));
}

const syncFiles = walkJson('sync');
const syncByType = new Map();
for (const f of syncFiles) {
  const t = f.split(path.sep)[1];
  if (!syncByType.has(t)) syncByType.set(t, []);
  syncByType.get(t).push(base(f));
}

const recipeFiles = walkJson('recipes').map((f) => ({ id: base(f), parked: !!readJson(f).parked }));
const kpiFiles = walkJson('kpis').map((f) => ({ id: base(f), parked: !!readJson(f).parked }));

const contract = readJson('contract.json');

// ── block: counts ───────────────────────────────────────────────────────────
function renderCounts() {
  const sortedTypes = (m) => [...m.keys()].sort();
  const fmt = (arr) => arr.sort().map((x) => (typeof x === 'string' ? x : x.parked ? `${x.id} *(parked)*` : x.id)).join(', ');
  const rows = [];
  rows.push(`| Profiles | ${profileFiles.length} | ${[...profilesByDomain.keys()].sort().map((d) => `${d} ${profilesByDomain.get(d)}`).join(' · ')} |`);
  for (const t of sortedTypes(sourcesByType))
    rows.push(`| Sources — ${t} | ${sourcesByType.get(t).length} | ${fmt(sourcesByType.get(t))} |`);
  for (const t of sortedTypes(syncByType))
    rows.push(`| Sync — ${t} | ${syncByType.get(t).length} | ${fmt(syncByType.get(t))} |`);
  const parkedR = recipeFiles.filter((r) => r.parked).length;
  const parkedK = kpiFiles.filter((k) => k.parked).length;
  rows.push(`| Recipes | ${recipeFiles.length}${parkedR ? ` (${parkedR} parked)` : ''} | ${fmt(recipeFiles)} |`);
  rows.push(`| KPIs | ${kpiFiles.length}${parkedK ? ` (${parkedK} parked)` : ''} | ${fmt(kpiFiles)} |`);
  return [
    '| Category | Count | Files |',
    '|---|---|---|',
    ...rows,
    '',
    `Measured from the tree by \`ci/gen-docs.mjs\` — the same sums \`npm run validate:refs\` prints (\`lint-refs: ${profileFiles.length} profiles, ${sourceFiles.length} sources, ${syncFiles.length} sync files\`).`,
  ].join('\n');
}

// ── block: targetIdProp ─────────────────────────────────────────────────────
function renderTargetIdProp() {
  const byKey = new Map(); // key -> labels[]
  for (const [label, n] of Object.entries(contract.nodes)) {
    if (!byKey.has(n.key)) byKey.set(n.key, []);
    byKey.get(n.key).push(label);
  }
  const edgeUse = new Map(); // key -> count of edge rules using it as targetIdProp
  for (const e of contract.edges) for (const k of e.targetIdProp ?? []) edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  const keys = [...new Set([...byKey.keys(), ...edgeUse.keys()])].sort();
  const rows = keys.map((k) => {
    const labels = (byKey.get(k) ?? []).sort();
    const resolves = labels.length
      ? labels.join(', ')
      : '⚠ **none** — no profile declares this key (see `contract.json` → `unresolvedTargets`)';
    const used = edgeUse.get(k) ?? 0;
    return `| \`${k}\` | ${resolves} | ${used || '—'} |`;
  });
  return [
    '| targetIdProp | Resolves to label(s) | Edge rules using it |',
    '|---|---|---|',
    ...rows,
    '',
    'Derived from `contract.json` (`nodes` grouped by key property; `edges` for usage). A `targetIdProp` resolves to **every** label sharing that `kgIdProperty` — polymorphic resolution.',
  ].join('\n');
}

// ── block: tree ─────────────────────────────────────────────────────────────
// The set of directories/files is MEASURED; the one-line annotations are the
// hand-maintained map below. An unknown new directory still appears (blank
// annotation) — nothing on disk can stay invisible.
const ANNOTATIONS = {
  'backup/': 'ARCHIVED (v3-era postgresql sources, mqtt/kafka/webhook/manual/bridge syncs; it-fleet; central-ts historian instance) — reference only, loaded by nothing',
  'branding/': 'brand/theme assets',
  'ci/': 'linters + generators (lint-*.mjs, gen-contract.mjs, gen-docs.mjs)',
  'companion-specs/': 'OPC-UA Companion-Spec registry (NodeSet2.xml URLs)',
  'cross-constraints/': 'cross-profile discrepancy constraints (PLAN vs IST rules)',
  'docs/': 'conventions, next2.0 standard, agent-conformance, variable shapes',
  'examples/': 'demo fixtures — NOT canonical (see examples/README.md)',
  'flows/': 'Node-RED flow templates (OPC-UA → UNS standard flow)',
  'historians/': 'historian-sink templates + instances (OUTPUT: UNS → customer DB)',
  'kpis/': 'KPI definitions — inputs drawn from the source-fed vocabulary (lint-kpis)',
  'mappings/': 'protocol canon: DataItem/tag → SM attribute (SSOT for discovery + gen-flows)',
  'profiles/': 'Schema 1: SM Profiles (type system)',
  'profiles/equipment/': 'EquipmentClass, EquipmentModel (compact), Tool',
  'profiles/erp/': 'Article, Customer(-Order), ProductionOrder, ProductDefinition, OperationsResponse',
  'profiles/intelligence/': 'multi-truth layer: Discrepancy, ResolutionProposal, AutoResolveRule, …',
  'profiles/machines/': 'Machine (abstract parent), CNC_Machine, InjectionMoldingMachine',
  'profiles/operations/': 'ISA-95 Part 4: OperationsDefinition, ProcessSegment, Segment{Requirement,Response}, Workorder',
  'profiles/qms/': 'InspectionLot, SPCAnalysis',
  'profiles/wms/': 'MaterialLot, Quant, StorageLocation',
  'recipes/': 'GitHub-managed recipe master data (see recipes/README.md)',
  'sources/': 'Schema 2: Data Sources (instance binding)',
  'sources/mtconnect/': 'MTConnect agent mappings',
  'sources/opcua/': 'OPC-UA endpoint → machine mappings',
  'sources/rest/': 'sim-v5 REST polling (ERP/QMS/WMS projections)',
  'sync/': 'Schema 3: Live Sync (transport layer)',
  'sync/nats/': 'NATS subjects + JetStream stream declarations (suite hub)',
  'sync/opcua-server/': 'Sonder-Edge re-publish (MTConnect → embedded OPC-UA server)',
  'sync/polling/': 'REST polling schedule',
  'unit-conversions/': 'UNECE unit table (discovery-time scale/offset lookup)',
  'validation/': 'ajv meta-schemas (per-file shape validation)',
  'contract.json': 'GENERATED ontology contract (gen-contract.mjs) — agents read this FIRST',
  'schema-guide.md': 'the full schema documentation',
  'README.md': 'this overview',
  'CLAUDE.md': 'agent instructions',
};
const DEEP_DIRS = new Set(['profiles', 'sources', 'sync', 'historians']); // list subdirs
const SKIP = new Set(['.git', 'node_modules', '.github', '.gitignore', 'package.json', 'package-lock.json']);

function renderTree() {
  const lines = ['osf-schemas/'];
  const entries = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => !SKIP.has(e.name))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  const pad = (name) => name.padEnd(24);
  const cnt = (n) => (n ? ` (${n} json)` : '');
  entries.forEach((e, i) => {
    const tee = i === entries.length - 1 ? '└──' : '├──';
    if (e.isDirectory()) {
      const n = walkJson(e.name).length;
      lines.push(`${tee} ${pad(e.name + '/')}${ANNOTATIONS[e.name + '/'] ?? ''}${DEEP_DIRS.has(e.name) ? '' : cnt(n)}`);
      if (DEEP_DIRS.has(e.name)) {
        const subs = fs.readdirSync(path.join(ROOT, e.name), { withFileTypes: true })
          .filter((s) => s.isDirectory()).map((s) => s.name).sort();
        subs.forEach((s, j) => {
          const st = j === subs.length - 1 ? '└──' : '├──';
          const sn = walkJson(path.join(e.name, s)).length;
          lines.push(`│   ${st} ${pad(s + '/')}${ANNOTATIONS[`${e.name}/${s}/`] ?? ''}${cnt(sn)}`);
        });
      }
    } else {
      lines.push(`${tee} ${(ANNOTATIONS[e.name] ? pad(e.name) : e.name)}${ANNOTATIONS[e.name] ?? ''}`);
    }
  });
  return '```\n' + lines.join('\n') + '\n```';
}

// ── injection ───────────────────────────────────────────────────────────────
const BLOCKS = { tree: renderTree, counts: renderCounts, targetIdProp: renderTargetIdProp };
const TARGETS = [
  { file: 'README.md', blocks: ['tree', 'counts'] },
  { file: 'schema-guide.md', blocks: ['tree', 'counts', 'targetIdProp'] },
];

let stale = 0;
for (const { file, blocks } of TARGETS) {
  const abs = path.join(ROOT, file);
  const before = fs.readFileSync(abs, 'utf8');
  let after = before;
  for (const b of blocks) {
    const re = new RegExp(`(<!-- gen:${b}:begin -->\\n)[\\s\\S]*?(<!-- gen:${b}:end -->)`);
    if (!re.test(after)) {
      console.error(`✖ ${file}: marker pair <!-- gen:${b}:begin/end --> not found — the generated block was deleted, restore the markers`);
      process.exit(1);
    }
    after = after.replace(re, `$1${BLOCKS[b]()}\n$2`);
  }
  if (after !== before.replace(/\r\n/g, '\n') && after !== before) {
    if (CHECK) {
      console.error(`✖ ${file}: generated block(s) [${blocks.join(', ')}] are stale — run: npm run gen:docs`);
      stale++;
    } else {
      fs.writeFileSync(abs, after);
      console.log(`gen-docs: ${file} updated [${blocks.join(', ')}]`);
    }
  } else {
    console.log(`gen-docs: ${file} in sync [${blocks.join(', ')}]`);
  }
}
if (CHECK && stale) { console.error('FAIL — docs disagree with a fresh render of the tree/contract.json'); process.exit(1); }
console.log(CHECK ? 'OK — committed docs match a fresh render' : 'OK');

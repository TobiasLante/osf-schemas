#!/usr/bin/env node
// conformance.mjs — measures a live knowledge graph against contract.json
// (write-side conformance, level L2 of docs/agent-conformance.md).
//
//   OSF_KEY=<api key> OSF_BASE=<gateway base> node ci/conformance.mjs <team|graph-url> [...]
//
// A node conforms when ONE OF ITS LABELS is declared in contract.nodes AND the
// node carries that label's key property. Live KG nodes are MULTI-LABELLED and
// stamp a generic 'KgNode' FIRST, so matching labels[0] alone (the pre-2026-07-17
// behaviour) counted every real node non-conformant — the measuring-stick was
// broken, not the graph. An edge conforms when the triple (type, fromLabel,
// toLabel) is covered by a contract edge rule, RESOLVED UP THE parentType CHAIN:
// a CNC_Machine is a subtype of the abstract Machine, which declares
// PART_OF -> ProcessCell, so a live CNC_Machine -[PART_OF]-> ProcessCell edge is
// conformant even though only the parent profile declares the relationship
// (gen-contract.mjs emits parentType/abstract so this resolution is possible).
// Read-only; prints the top offenders so the fix is obvious.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── pure, contract-driven logic (unit-proven by ci/test-conformance.mjs) ──────

// Every label the contract REFERENCES — declared node labels PLUS every label
// used as an edge endpoint (edge `from`/`to`). The latter matters because an
// edge target can be a label the repo has not fully profiled yet (e.g.
// ProcessCell, an unresolvedTarget): it is a legitimate PART_OF target even
// though no node profile declares it. Memoised per contract.
const _knownCache = new WeakMap();
function knownLabels(contract) {
  let s = _knownCache.get(contract);
  if (s) return s;
  s = new Set(Object.keys(contract.nodes || {}));
  for (const e of contract.edges || []) { s.add(e.from); for (const t of e.to || []) s.add(t); }
  _knownCache.set(contract, s);
  return s;
}

// The label a node should be JUDGED by: the first of its labels the contract
// KNOWS (a declared node OR an edge endpoint). Live nodes carry several labels
// and stamp a generic 'KgNode' FIRST, which the contract does not know — so
// labels[0] is the wrong thing to test. Falls back to labels[0] when the
// contract knows none, so a genuinely unknown label is reported, not skipped.
export function pickContractLabel(node, contract) {
  const labels = node.labels || [];
  const known = knownLabels(contract);
  for (const l of labels) if (known.has(l)) return l;
  return labels[0] ?? '?';
}

// A label plus its parentType ancestors. contract.nodes[x].parentType is the
// PARENT's kgNodeLabel (emitted by gen-contract.mjs), so the walk is a direct
// lookup. Cycle-safe.
export function ancestors(label, contract) {
  const chain = [];
  const seen = new Set();
  let cur = label;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = contract.nodes[cur]?.parentType ?? null;
  }
  return chain;
}

export function nodeConforms(node, contract) {
  const l = pickContractLabel(node, contract);
  const spec = contract.nodes[l];
  return !!(spec && node.props && node.props[spec.key] !== undefined);
}

// An edge conforms if some contract edge rule of the same type connects an
// ANCESTOR of the from-label to a label that is (or is an ancestor of) the
// to-label — subtypes inherit their parents' relationships in both positions.
export function edgeConforms(type, fromLabel, toLabel, contract) {
  const froms = ancestors(fromLabel, contract);
  const tos = ancestors(toLabel, contract);
  return (contract.edges || []).some(
    (e) => e.type === type && froms.includes(e.from) && (e.to || []).some((t) => tos.includes(t)),
  );
}

// Classify a whole graph: { nodes:[{id,labels,props}], edges:[{type,source,target}] }.
export function classify(graph, contract) {
  const lbl = Object.fromEntries((graph.nodes || []).map((n) => [n.id, pickContractLabel(n, contract)]));
  let nOk = 0;
  const badLabels = {};
  for (const n of graph.nodes || []) {
    if (nodeConforms(n, contract)) nOk++;
    else { const l = pickContractLabel(n, contract); badLabels[l] = (badLabels[l] || 0) + 1; }
  }
  let eOk = 0;
  const badEdges = {};
  for (const e of graph.edges || []) {
    const f = lbl[e.source], to = lbl[e.target];
    if (edgeConforms(e.type, f, to, contract)) eOk++;
    else { const k = `${f}-[${e.type}]->${to}`; badEdges[k] = (badEdges[k] || 0) + 1; }
  }
  return {
    nodes: { ok: nOk, total: (graph.nodes || []).length, bad: badLabels },
    edges: { ok: eOk, total: (graph.edges || []).length, bad: badEdges },
  };
}

// ── CLI runner (skipped on import) ────────────────────────────────────────────
async function main() {
  const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'contract.json'), 'utf8'));
  const KEY = process.env.OSF_KEY;
  const BASE = process.env.OSF_BASE || 'https://osf-api.zeroguess.ai/api/sim-v5';
  if (!KEY) { console.error('OSF_KEY env var required (no keys in this repo).'); process.exit(2); }

  const args = process.argv.slice(2);
  if (!args.length) { console.error('usage: OSF_KEY=... node ci/conformance.mjs <team> [...]'); process.exit(2); }

  const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join('  ');

  let failed = false;
  for (const t of args) {
    const url = t.startsWith('http') ? t : `${BASE}/hack/${t}/kg/graph?limit=4000`;
    const r = await fetch(url, { headers: { 'X-API-Key': KEY } });
    if (r.status !== 200) { console.log(`${t}: HTTP ${r.status}`); failed = true; continue; }
    const g = await r.json();
    const c = classify(g, contract);
    console.log(`== ${t} ==  nodes conform: ${c.nodes.ok}/${c.nodes.total} (${pct(c.nodes.ok, c.nodes.total)}) | edges conform: ${c.edges.ok}/${c.edges.total} (${pct(c.edges.ok, c.edges.total)})`);
    if (Object.keys(c.nodes.bad).length) console.log(`   non-conformant labels: ${top(c.nodes.bad)}`);
    if (Object.keys(c.edges.bad).length) console.log(`   non-conformant edges : ${top(c.edges.bad)}`);
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

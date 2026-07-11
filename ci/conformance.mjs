#!/usr/bin/env node
// conformance.mjs — measures a live knowledge graph against contract.json
// (write-side conformance, level L2 of docs/agent-conformance.md).
//
//   OSF_KEY=<api key> OSF_BASE=<gateway base> node ci/conformance.mjs <team|graph-url> [...]
//
// A node conforms when its (first) label is declared in contract.nodes AND the
// node carries that label's key property. An edge conforms when the triple
// (type, fromLabel, toLabel) is covered by a contract edge rule.
// Read-only; prints the top offenders so the fix is obvious.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'contract.json'), 'utf8'));
const KEY = process.env.OSF_KEY;
const BASE = process.env.OSF_BASE || 'https://osf-api.zeroguess.ai/api/sim-v5';
if (!KEY) { console.error('OSF_KEY env var required (no keys in this repo).'); process.exit(2); }

const args = process.argv.slice(2);
if (!args.length) { console.error('usage: OSF_KEY=... node ci/conformance.mjs <team> [...]'); process.exit(2); }

const edgeOk = (type, from, to) => contract.edges.some((e) => e.type === type && e.from === from && e.to.includes(to));

let failed = false;
for (const t of args) {
  const url = t.startsWith('http') ? t : `${BASE}/hack/${t}/kg/graph?limit=4000`;
  const r = await fetch(url, { headers: { 'X-API-Key': KEY } });
  if (r.status !== 200) { console.log(`${t}: HTTP ${r.status}`); failed = true; continue; }
  const g = await r.json();
  const lbl = Object.fromEntries(g.nodes.map((n) => [n.id, (n.labels || ['?'])[0]]));

  let nOk = 0; const badLabels = {};
  for (const n of g.nodes) {
    const l = (n.labels || ['?'])[0];
    const spec = contract.nodes[l];
    if (spec && n.props && n.props[spec.key] !== undefined) nOk++;
    else badLabels[l] = (badLabels[l] || 0) + 1;
  }
  let eOk = 0; const badEdges = {};
  for (const e of g.edges) {
    const f = lbl[e.source], to = lbl[e.target];
    if (edgeOk(e.type, f, to)) eOk++;
    else { const k = `${f}-[${e.type}]->${to}`; badEdges[k] = (badEdges[k] || 0) + 1; }
  }
  const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
  console.log(`== ${t} ==  nodes conform: ${nOk}/${g.nodes.length} (${pct(nOk, g.nodes.length)}) | edges conform: ${eOk}/${g.edges.length} (${pct(eOk, g.edges.length)})`);
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join('  ');
  if (Object.keys(badLabels).length) console.log(`   non-conformant labels: ${top(badLabels)}`);
  if (Object.keys(badEdges).length) console.log(`   non-conformant edges : ${top(badEdges)}`);
}
process.exit(failed ? 1 : 0);

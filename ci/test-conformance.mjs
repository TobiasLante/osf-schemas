#!/usr/bin/env node
// ci/test-conformance.mjs — proves the conformance measuring-stick fix
// (ci/conformance.mjs + the parentType/abstract that ci/gen-contract.mjs now
// emits). A live-shaped CNC_Machine node — multi-labelled, generic 'KgNode'
// stamped FIRST — with a PART_OF edge to a ProcessCell must be counted
// CONFORMANT, via (a) picking the contract-known label out of the multi-label
// set and (b) resolving the edge up the parentType chain (CNC_Machine → the
// abstract Machine, which declares PART_OF → ProcessCell). The SAME fixture is
// scored the OLD way here to prove it was NON-conformant before the fix — both
// modes, one run. Run: node ci/test-conformance.mjs   (exit 0 = pass)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, nodeConforms, edgeConforms } from './conformance.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'contract.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`✓ ${m}`); } else { fail++; console.error(`✗ ${m}`); } };

// Sanity: the contract must actually carry the inheritance signal this fix reads.
ok(contract.nodes.CNC_Machine?.parentType === 'Machine',
  `contract emits parentType: CNC_Machine.parentType === "Machine" (got ${contract.nodes.CNC_Machine?.parentType})`);
ok(contract.nodes.Machine?.abstract === true,
  `contract emits abstract: Machine.abstract === true (got ${contract.nodes.Machine?.abstract})`);

// A live-shaped graph: nodes carry the generic 'KgNode' label FIRST, then the
// domain label, exactly as the KG writes them.
const graph = {
  nodes: [
    { id: 'n1', labels: ['KgNode', 'CNC_Machine'], props: { machine_id: 'cnc-001' } },
    { id: 'n2', labels: ['KgNode', 'ProcessCell'], props: { process_cell_id: 'cell-A' } },
  ],
  edges: [{ type: 'PART_OF', source: 'n1', target: 'n2' }],
};

// ── BEFORE: the old measuring stick — labels[0] + no parentType resolution ────
const oldNodeOk = (n) => {
  const l = (n.labels || ['?'])[0];
  const spec = contract.nodes[l];
  return !!(spec && n.props && n.props[spec.key] !== undefined);
};
const oldEdgeOk = (type, from, to) =>
  (contract.edges || []).some((e) => e.type === type && e.from === from && (e.to || []).includes(to));
const oldLbl = Object.fromEntries(graph.nodes.map((n) => [n.id, (n.labels || ['?'])[0]]));
ok(oldNodeOk(graph.nodes[0]) === false, 'BEFORE — CNC_Machine node NON-conformant (labels[0]="KgNode")');
ok(oldEdgeOk('PART_OF', oldLbl.n1, oldLbl.n2) === false, 'BEFORE — PART_OF edge NON-conformant (KgNode-[PART_OF]->KgNode)');

// ── AFTER: the fixed measuring stick ──────────────────────────────────────────
ok(nodeConforms(graph.nodes[0], contract) === true, 'AFTER  — CNC_Machine node conformant (label picked from multi-label set)');
ok(edgeConforms('PART_OF', 'CNC_Machine', 'ProcessCell', contract) === true, 'AFTER  — PART_OF edge conformant (resolved CNC_Machine→Machine)');

const c = classify(graph, contract);
ok(c.nodes.ok === 1, `AFTER  — classify: CNC_Machine conforms; ProcessCell stays a known unresolved target (nodes ok=${c.nodes.ok}/2)`);
ok(c.edges.ok === 1, `AFTER  — classify: PART_OF edge conforms (edges ok=${c.edges.ok}/1)`);

console.log(`\ntest-conformance: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

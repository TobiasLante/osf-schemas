#!/usr/bin/env node
// gen-contract.mjs — generates contract.json, the ONE machine-readable ontology
// contract of this repo: allowed KG node labels (+ id property) and allowed
// relationships, extracted from profiles/**.json. Agents consume contract.json
// FIRST (see CLAUDE.md); the write-side conformance check is ci/conformance.mjs.
//
//   node ci/gen-contract.mjs           # (re)generate contract.json
//   node ci/lint-contract.mjs          # CI drift check: file must match output
//
// Why this exists: in the agent-conformance test of 2026-07-09 two independent
// LLM agents, both given this repo, produced two incompatible ontologies
// (0.0 % conforming writes). Descriptive schemas do not bind agents — an
// extracted, single-file contract + write-side enforcement does.
// See docs/agent-conformance.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.json') ? [p] : [];
  });
}

const files = walk(path.join(ROOT, 'profiles')).filter((f) => !path.basename(f).startsWith('_skeleton'));

const nodes = {};
const edgeMap = new Map(); // "TYPE|From" -> {type, from, to:Set, targetIdProp:Set}
const skipped = [];

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!p.kgNodeLabel || !p.kgIdProperty) { skipped.push(rel); continue; } // e.g. compact equipment model
  nodes[p.kgNodeLabel] = {
    key: p.kgIdProperty,
    profile: p.profileId ?? null,
    category: p.category ?? null,
    source: rel,
  };
  for (const r of p.relationships ?? []) {
    const k = `${r.type}|${p.kgNodeLabel}`;
    if (!edgeMap.has(k)) edgeMap.set(k, { type: r.type, from: p.kgNodeLabel, to: new Set(), targetIdProp: new Set() });
    edgeMap.get(k).to.add(r.target);
    if (r.targetIdProp) edgeMap.get(k).targetIdProp.add(r.targetIdProp);
  }
}

// resolve edge targets against declared labels; keep unresolved visible instead of failing
const labels = new Set(Object.keys(nodes));
const edges = [];
const unresolvedTargets = [];
for (const e of [...edgeMap.values()].sort((a, b) => (a.from + a.type).localeCompare(b.from + b.type))) {
  const to = [...e.to].sort();
  for (const t of to) if (!labels.has(t)) unresolvedTargets.push(`${e.from} -[${e.type}]-> ${t}`);
  edges.push({
    type: e.type,
    from: e.from,
    to,
    ...(e.targetIdProp.size ? { targetIdProp: [...e.targetIdProp].sort() } : {}),
  });
}

const contract = {
  _comment:
    'ONTOLOGY CONTRACT — generated from profiles/** by ci/gen-contract.mjs; do not edit by hand. ' +
    'For agents and sink validators: ONLY these node labels (with their key property) and ONLY these ' +
    'relationship triples may be written to a knowledge graph. Anything not listed here is non-conformant — ' +
    'extend the profile first, then regenerate. Background: docs/agent-conformance.md.',
  contractVersion: '1.0.0',
  generatedBy: 'ci/gen-contract.mjs',
  identity: {
    rule:
      'Machine/equipment nodes MUST use their profile kgNodeLabel with the key property declared in nodes.* below — ' +
      'never invent node identities from source-local ids (machineId, machineNo, pool names, vendor names); those are attributes at most.',
    openConflict:
      'KNOWN CONSOLIDATION ISSUE: repo machine profiles key on machine_id, while the UNS/lab convention (osf_map.machine_map) ' +
      'keys equipment on element_id derived from equipmentPath. Until resolved, this contract reflects the repo profiles (machine_id). ' +
      'Do not mix both in one graph.',
  },
  nodes,
  edges,
  unresolvedTargets: {
    _comment:
      'Relationship targets declared in profiles that do not (yet) resolve to a kgNodeLabel in this repo. ' +
      'Each entry is consolidation work: add the missing profile or fix the target name. New entries should not be added.',
    entries: unresolvedTargets,
  },
  aliases: {
    _comment:
      'Observed non-conformant vocabulary (agent-conformance test 2026-07-09) -> conformant repo form. Never write the left side. ' +
      'Note: RESPONDS_TO, ON_MACHINE, TRIGGERS, FOR_* ARE conformant repo vocabulary (see edges).',
    PERFORMANCE_OF: 'RESPONDS_TO (OperationsResponse -> ProductionOrder)',
    AT_WORKCENTER: 'ON_MACHINE (responses/lots) or EXECUTED_AT (orders)',
    RUNS_ON: 'ON_MACHINE (responses/lots) or EXECUTED_AT (orders)',
    Workcenter: 'use the machine profile kgNodeLabel (e.g. CNC_Machine, Machine) with its declared key',
    Order: 'ProductionOrder',
    FabricationOrder: 'ProductionOrder (fabrication order / job / planned order are the same ISA-95 OperationsRequest)',
    FabricationOrderPerformance: 'OperationsResponse',
    FOPerformance: 'OperationsResponse',
    Serial: 'MaterialLot/Quant level (serialized part) — profile pending, see docs/agent-conformance.md',
  },
  skippedFiles: skipped,
};

const out = path.join(ROOT, 'contract.json');
fs.writeFileSync(out, JSON.stringify(contract, null, 2) + '\n');
console.log(`contract.json: ${Object.keys(nodes).length} labels, ${edges.length} edge rules, ${unresolvedTargets.length} unresolved targets, ${skipped.length} skipped file(s)`);
for (const u of unresolvedTargets) console.log('  unresolved:', u);
for (const s of skipped) console.log('  skipped   :', s);

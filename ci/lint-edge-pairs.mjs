#!/usr/bin/env node
// ci/lint-edge-pairs.mjs — an edge authored in both directions is one relationship, registered once.
//
// Seven relationships are written twice, once in each profile (ProductionOrder EXECUTED_AT Machine,
// Machine EXECUTES ProductionOrder, ...). Nothing tied the two sides together, so one could change
// without the other. i3X 1.0 requires every relationship type to name exactly one reverseOf.
//
//   E1  two edge types that connect the same two labels in opposite directions must be a registered
//       pair in validation/relationship-types.json, or listed there as open
//   E2  a registered pair must really be inverse: if A -T-> B exists, B -reverse(T)-> A must too
//   E3  a type may appear in at most one pair
//
// Run:  node ci/lint-edge-pairs.mjs
import fs from "node:fs";

export function lintEdgePairs(edges, reg) {
  const err = [];
  const rev = new Map(), open = new Map();
  for (const [a, b] of reg.pairs) {
    for (const t of [a, b]) if (rev.has(t)) err.push(`E3  ${t} appears in more than one pair`);
    rev.set(a, b); rev.set(b, a);
  }
  for (const o of reg.open || []) for (const t of o.inverseOf) open.set(`${o.type}|${t}`, true), open.set(`${t}|${o.type}`, true);
  const S = new Set(edges.flatMap((e) => e.to.map((to) => `${e.type}|${e.from}|${to}`)));
  const list = [...S].map((s) => s.split("|"));
  for (const [t, f, to] of list) {
    for (const [t2, f2, to2] of list) {
      if (f2 !== to || to2 !== f || t === t2) continue;
      if (rev.get(t) === t2 || open.has(`${t}|${t2}`)) continue;
      err.push(`E1  ${f} -${t}-> ${to} and ${f2} -${t2}-> ${to2} are one relationship; register [${t}, ${t2}] in validation/relationship-types.json`);
    }
    const r = rev.get(t);
    if (r && !S.has(`${r}|${to}|${f}`)) err.push(`E2  ${f} -${t}-> ${to} is registered with reverse ${r}, but ${to} -${r}-> ${f} is not declared`);
  }
  return [...new Set(err)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const edges = JSON.parse(fs.readFileSync("contract.json", "utf8")).edges;
  const reg = JSON.parse(fs.readFileSync("validation/relationship-types.json", "utf8"));
  const err = lintEdgePairs(edges, reg);
  for (const e of err) console.error("  " + e);
  console.log(`lint-edge-pairs: ${edges.length} edge declarations, ${reg.pairs.length} registered pairs, ${(reg.open || []).length} open — ${err.length} error(s)`);
  process.exit(err.length ? 1 : 0);
}

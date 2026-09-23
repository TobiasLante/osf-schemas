#!/usr/bin/env node
// ci/test-lint-edge-pairs.mjs — every rule turns RED on the defect it names.
import { lintEdgePairs } from "./lint-edge-pairs.mjs";
let failures = 0;
const check = (n, c, d = "") => { if (c) console.log(`  ok   ${n}`); else { failures++; console.error(`  FAIL ${n}${d ? " — " + d : ""}`); } };
const E = [{ type: "EXECUTED_AT", from: "Order", to: ["Machine"] }, { type: "EXECUTES", from: "Machine", to: ["Order"] }];
const R = { pairs: [["EXECUTED_AT", "EXECUTES"]], open: [] };
console.log("lint-edge-pairs self-test");
check("GREEN: both directions, registered as a pair", lintEdgePairs(E, R).length === 0, lintEdgePairs(E, R).join(" | "));
check("RED E1: both directions, not registered", lintEdgePairs(E, { pairs: [], open: [] }).some((e) => e.startsWith("E1")));
check("GREEN: both directions, declared open", lintEdgePairs(E, { pairs: [], open: [{ type: "EXECUTES", inverseOf: ["EXECUTED_AT"] }] }).length === 0);
check("RED E2: a registered pair with one side missing", lintEdgePairs([E[0]], R).some((e) => e.startsWith("E2")));
check("RED E2: the reverse points at the wrong label", lintEdgePairs([E[0], { type: "EXECUTES", from: "Machine", to: ["Tool"] }], R).some((e) => e.startsWith("E2")));
check("RED E3: a type in two pairs", lintEdgePairs(E, { pairs: [["EXECUTED_AT", "EXECUTES"], ["EXECUTES", "RUNS"]], open: [] }).some((e) => e.startsWith("E3")));
console.log(failures ? `test-lint-edge-pairs: ${failures} FAILED` : "test-lint-edge-pairs: all checks passed");
process.exit(failures ? 1 : 0);

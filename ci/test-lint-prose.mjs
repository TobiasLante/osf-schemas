#!/usr/bin/env node
// ci/test-lint-prose.mjs — every rule turns RED on the defect it names.
import { lintProse, LIMIT } from "./lint-prose.mjs";
let failures = 0;
const check = (n, c) => { if (c) console.log(`  ok   ${n}`); else { failures++; console.error(`  FAIL ${n}`); } };
console.log("lint-prose self-test");
check("GREEN: a short description", lintProse("f", { description: "Actual machine status." }).length === 0);
check("RED P1: a description over the limit", lintProse("f", { attributes: [{ description: "x".repeat(LIMIT + 1) }] })[0]?.startsWith("P1"));
check("RED P1: a long _note is prose too", lintProse("f", { _note: "y".repeat(LIMIT + 1) })[0]?.startsWith("P1"));
check("GREEN: a long value that is not prose (a query) is not touched", lintProse("f", { query: "z".repeat(5000) }).length === 0);
check("RED P2: a pointer to a missing history file", lintProse("f", { description: "A. Full text: docs/history/nope.md, x." }, () => false)[0]?.startsWith("P2"));
check("GREEN: a pointer to an existing file", lintProse("f", { description: "A. Full text: docs/history/yes.md, x." }, () => true).length === 0);
console.log(failures ? `test-lint-prose: ${failures} FAILED` : "test-lint-prose: all checks passed");
process.exit(failures ? 1 : 0);

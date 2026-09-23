#!/usr/bin/env node
// ci/test-lint-i3x.mjs — injects one defect at a time into a copy of i3x/ and asserts lint-i3x refuses it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lintI3x } from "./lint-i3x.mjs";
let failures = 0;
const check = (n, c, d = "") => { if (c) console.log(`  ok   ${n}`); else { failures++; console.error(`  FAIL ${n}${d ? " — " + d : ""}`); } };
function copy() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "i3x-"));
  fs.cpSync("i3x", path.join(d, "i3x"), { recursive: true });
  fs.cpSync("profiles", path.join(d, "profiles"), { recursive: true });
  return d;
}
const edit = (d, rel, fn) => { const p = path.join(d, rel); const j = JSON.parse(fs.readFileSync(p, "utf8")); fn(j); fs.writeFileSync(p, JSON.stringify(j, null, 2)); };
const CNC = "i3x/object-types/machines/SMProfile-CNC-Machine.type.json";
const has = (d, code) => lintI3x(d).err.some((e) => e.startsWith(code));
console.log("lint-i3x self-test");
let d = copy(); check("the generated tree is GREEN", lintI3x(d).err.length === 0, lintI3x(d).err.slice(0, 3).join(" | "));
d = copy(); edit(d, CNC, (t) => { t.version = "2.1"; }); check("I1 a version that is not SemVer is RED", has(d, "I1"));
d = copy(); edit(d, CNC, (t) => { delete t.namespaceUri; }); check("I1 a missing namespaceUri is RED", has(d, "I1"));
d = copy(); edit(d, CNC, (t) => { t.schema.allOf[0].$ref = "SMProfile-Ghost.type.json#/schema"; }); check("I2 a dangling $ref is RED", has(d, "I2"));
d = copy(); edit(d, CNC, (t) => { t.schema.allOf[1].properties.Act_Time_Cycle.type = "numeric"; }); check("I2 an invalid JSON Schema type is RED", has(d, "I2"));
d = copy(); edit(d, CNC, (t) => { t.namespaceUri = "urn:ghost"; }); check("I3 an unregistered namespace is RED", has(d, "I3"));
d = copy(); edit(d, "i3x/relationship-types.json", (r) => { r[0].reverseOf = "NOPE"; }); check("I4 a reverseOf that is not registered is RED", has(d, "I4"));
d = copy(); edit(d, CNC, (t) => { t.schema.allOf[1].properties.Act_Time_Cycle["x-unit"] = "MIN"; }); check("I5 a unit changed in the i3X form is RED (round trip)", has(d, "I5"));
d = copy(); edit(d, CNC, (t) => { delete t.schema.allOf[1].properties.Act_Time_Cycle; }); check("I5 a dropped attribute is RED (round trip)", has(d, "I5"));
console.log(failures ? `test-lint-i3x: ${failures} FAILED` : "test-lint-i3x: all checks passed");
process.exit(failures ? 1 : 0);

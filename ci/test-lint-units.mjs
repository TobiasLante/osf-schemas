#!/usr/bin/env node
// ci/test-lint-units.mjs — self-test for lint-units: every rule must turn RED on the defect it names.
// Run:  node ci/test-lint-units.mjs
import { lintUnits } from "./lint-units.mjs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const base = () => ({
  codes: { CEL: "°C", P1: "%", C62: "1", MMT: "mm", CMT: "cm" },
  conversions: [{ from: "CMT", to: "MMT" }],
  physicalCodes: ["CEL"],
  profiles: [
    { file: "p/m.json", json: { profileId: "P-M", attributes: [{ name: "temp", dataType: "Float", unit: "CEL" }, { name: "mode", dataType: "String" }] } },
    { file: "p/c.json", json: { profileId: "P-C", parentType: "P-M", attributes: [{ name: "pos", dataType: "Double", unit: "MMT" }] } },
  ],
  mappings: [{ file: "s/a.json", profileRef: "P-C", entries: [{ smAttribute: "temp", unit: "CEL" }, { smAttribute: "pos", unit: "CMT" }] }],
  recipes: [{ file: "r/a.json", json: { profileRef: "P-C", parameters: [{ param: "t", soll: 200, unit: "CEL", smAttribute: "temp" }, { param: "resin", soll: "PA66", unit: "" }] } }],
  open: { attributes: [], conflicts: [] },
});
const has = (errs, code) => errs.some((e) => e.startsWith(code));

console.log("lint-units self-test");
check("the clean model is GREEN", lintUnits(base()).length === 0, lintUnits(base()).join(" | "));

let m = base(); m.profiles[0].json.attributes[0].unit = "degC";
check("U1 a symbol instead of a code is RED", has(lintUnits(m), "U1"));

m = base(); m.conversions.push({ from: "MAM", to: "CEL" });
check("U2 an invented code in unit-conversions is RED (MAM is megametre, not mA)", has(lintUnits(m), "U2"));

m = base(); m.physicalCodes.push("DAN");
check("U2 an unknown code in physical-rules is RED", has(lintUnits(m), "U2"));

m = base(); delete m.profiles[0].json.attributes[0].unit;
check("U3 a Float without a unit is RED", has(lintUnits(m), "U3"));

m = base(); delete m.profiles[0].json.attributes[0].unit; m.open.attributes.push({ profile: "P-M", attribute: "temp" });
check("U3 the same gap, declared open, is GREEN", lintUnits(m).length === 0, lintUnits(m).join(" | "));

m = base(); m.profiles[0].json.attributes[1].unit = "C62";
check("U4 a String with a unit is RED", has(lintUnits(m), "U4"));

m = base(); m.mappings[0].entries[0].unit = "P1";
check("U5 a source unit the profile does not share, with no conversion, is RED", has(lintUnits(m), "U5"));

check("U5 a source unit WITH a conversion to the profile unit is GREEN (CMT -> MMT)", !has(lintUnits(base()), "U5"));

m = base(); m.mappings[0].entries[0].unit = "P1"; m.open.conflicts.push({ profile: "P-C", attribute: "temp", sourceUnit: "P1" });
check("U5 the same conflict, declared open, is GREEN", lintUnits(m).length === 0, lintUnits(m).join(" | "));

m = base(); m.recipes[0].json.parameters[0].unit = "P1";
check("U6 a recipe unit that differs from its attribute is RED", has(lintUnits(m), "U6"));

m = base(); m.recipes[0].json.parameters[1].unit = "CEL";
check("U4 a non-numeric recipe soll with a unit is RED", has(lintUnits(m), "U4"));

m = base(); m.open.attributes.push({ profile: "P-M", attribute: "temp" });
check("U7 an open entry that is no longer open is RED", has(lintUnits(m), "U7"));

console.log(failures ? `test-lint-units: ${failures} FAILED` : "test-lint-units: all checks passed");
process.exit(failures ? 1 : 0);

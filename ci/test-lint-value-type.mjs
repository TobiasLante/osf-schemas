#!/usr/bin/env node
// ci/test-lint-value-type.mjs — every rule turns RED on the defect it names.
import { lintValueTypes, impliedValueType } from "./lint-value-type.mjs";
let failures = 0;
const check = (n, c, d = "") => { if (c) console.log(`  ok   ${n}`); else { failures++; console.error(`  FAIL ${n}${d ? " — " + d : ""}`); } };
const P = (attrs, extra = {}) => [{ file: "p.json", json: { profileId: "P", kgIdProperty: "machine_id", attributes: attrs, ...extra } }];
const T = new Map([["P", new Set(["nozzleTempC"])]]);
const run = (a) => lintValueTypes(P(a), T).err;
console.log("lint-value-type self-test");
check("Act_ is PV", impliedValueType("Act_Speed_Spindle", {}) === "PV");
check("Act_Ref_ is ID", impliedValueType("Act_Ref_Tool", {}) === "ID");
check("Set_ is SP", impliedValueType("Set_Rate_Feed", {}) === "SP");
check("Setpoint in the name is SP", impliedValueType("dryerSetpointC", {}) === "SP");
check("a recipe target is PV", impliedValueType("nozzleTempC", { recipeTargets: new Set(["nozzleTempC"]) }) === "PV");
check("nothing implied stays null (no guessing)", impliedValueType("hopperFillPct", {}) === null);
check("GREEN: declared as implied", run([{ name: "Act_Time_Cycle", valueType: "PV" }, { name: "machine_id", valueType: "ID" }]).length === 0);
check("RED V1: a value outside the vocabulary", run([{ name: "x", valueType: "IST" }]).some((e) => e.startsWith("V1")));
check("RED V2: Set_ declared PV", run([{ name: "Set_Rate_Feed", valueType: "PV" }]).some((e) => e.startsWith("V2")));
check("RED V2: a recipe target declared SP (the soll lives in the recipe)", run([{ name: "nozzleTempC", valueType: "SP" }]).some((e) => e.startsWith("V2")));
check("RED V2: implied but undeclared", run([{ name: "Act_Time_Cycle" }]).some((e) => e.startsWith("V2")));
check("GREEN: undeclared where nothing is implied", run([{ name: "hopperFillPct" }]).length === 0);
console.log(failures ? `test-lint-value-type: ${failures} FAILED` : "test-lint-value-type: all checks passed");
process.exit(failures ? 1 : 0);

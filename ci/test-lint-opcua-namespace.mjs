#!/usr/bin/env node
// ci/test-lint-opcua-namespace.mjs — self-test for the OPC-UA namespace linter.
//
// The regression case is the REAL one: the exact `opcua-ftlinx-01-event.json` 2.0.1
// declaration that shipped (9 mappings, all `ns=117`, no namespaceUri), checked
// against the REAL NamespaceArray of the FactoryTalk Linx gateway
// (opc.tcp://192.168.178.154:36600, 118 entries, read 2026-08-20T05:44:41Z) and the
// REAL 2-entry array of rockwell-01's own server (:36500, read 2026-08-20T05:45:05Z).
//
// Both directions are asserted, because a linter that only ever says "violation" is
// as useless as one that never does:
//   POSITIVE — the shipped ftlinx-01 declaration is a violation (N1).
//   NEGATIVE — the 14 single-machine `ns=1` sources stay clean, and so does a source
//              that declares the URI. A rule that reddened all 15 would be noise, and
//              noise gets switched off.
//
// Run:  node ci/test-lint-opcua-namespace.mjs

import { lintOpcuaNamespace, pinnedIndex, isTemplateEndpoint, DRIFTABLE_FROM_INDEX } from "./lint-opcua-namespace.mjs";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The 9 event mappings of ftlinx-01 as they shipped in 2.0.1 — verbatim nodeIds. */
const FTLINX_2_0_1_MAPPINGS = [
  "ns=117;s=Machine/status",
  "ns=117;s=Machine/mode",
  "ns=117;s=Machine/partsCount/good",
  "ns=117;s=Machine/partsCount/scrap",
  "ns=117;s=Machine/typeSpecific/cycle/inCycle",
  "ns=117;s=Machine/typeSpecific/cycle/currentProgram",
  "ns=117;s=Machine/typeSpecific/tool/currentToolId",
  "ns=117;s=Machine/typeSpecific/nc/currentBlockN",
  "ns=117;s=Machine/alarms/_Count",
].map((opcuaNodeId) => ({ opcuaNodeId, smAttribute: "x", dataType: "ns=0;i=12" }));

const FTLINX_BASE = {
  sourceId: "opcua-ftlinx-01-event",
  sourceType: "opcua",
  endpoint: "opc.tcp://192.168.178.154:36600",
  machineId: "ftlinx-01",
  machineName: "Rockwell Cell (via FactoryTalk Linx)",
  nodeMappings: FTLINX_2_0_1_MAPPINGS,
};

/** rockwell-01's own onboard server: 2 namespaces, ns=1 is the only vendor one. */
const ROCKWELL_BASE = {
  sourceId: "opcua-rockwell-01-event",
  sourceType: "opcua",
  endpoint: "opc.tcp://192.168.178.154:36500",
  machineId: "rockwell-01",
  nodeMappings: [
    { opcuaNodeId: "ns=1;s=Machine/status", smAttribute: "x", dataType: "ns=0;i=12" },
    { opcuaNodeId: "ns=1;s=Machine/partsCount/good", smAttribute: "y", dataType: "ns=0;i=11" },
  ],
};

console.log("nodeId parsing");
check("ns=117 is read as 117", pinnedIndex("ns=117;s=Machine/status") === 117);
check("ns=1 is read as 1", pinnedIndex("ns=1;s=Machine/status") === 1);
check("a nodeId without ns= yields null, not 0", pinnedIndex("s=Machine/status") === null);
check("a non-string yields null", pinnedIndex(undefined) === null);

console.log("N1 — POSITIVE control: the declaration that actually shipped");
{
  const { errs, exempt } = lintOpcuaNamespace(FTLINX_BASE);
  check("ftlinx-01 2.0.1 is a violation", errs.length === 1, JSON.stringify(errs));
  check("…and it is N1", errs[0]?.startsWith("N1 "), errs[0]);
  check("…naming all 9 mappings", errs[0]?.includes("9/9"), errs[0]);
  check("…naming the index", errs[0]?.includes("ns=117"), errs[0]);
  check("…and it is NOT exempted", exempt === null, String(exempt));
}

console.log("N1 — NEGATIVE control: the same source once it declares the URI");
{
  const fixed = { ...FTLINX_BASE, namespaceUri: "urn:i3x:sim-v5:linx:rockwell-01" };
  const { errs } = lintOpcuaNamespace(fixed);
  check("ftlinx-01 2.1.0 is clean for the linter", errs.length === 0, JSON.stringify(errs));
}
{
  const perMapping = {
    ...FTLINX_BASE,
    nodeMappings: FTLINX_2_0_1_MAPPINGS.map((m) => ({ ...m, namespaceUri: "urn:i3x:sim-v5:linx:rockwell-01" })),
  };
  check("a per-mapping URI also satisfies N1", lintOpcuaNamespace(perMapping).errs.length === 0);
}
{
  const viaConnection = {
    ...FTLINX_BASE,
    connection: { endpoint: FTLINX_BASE.endpoint, namespaceUri: "urn:i3x:sim-v5:linx:rockwell-01" },
  };
  check("connection.namespaceUri also satisfies N1", lintOpcuaNamespace(viaConnection).errs.length === 0);
}

console.log("N1 — NEGATIVE control: single-machine servers must stay clean");
check("rockwell-01 (ns=1, no URI) is clean", lintOpcuaNamespace(ROCKWELL_BASE).errs.length === 0);
check(
  "rockwell-01 with its measured URI is clean",
  lintOpcuaNamespace({ ...ROCKWELL_BASE, namespaceUri: "urn:i3x:sim-v5:cnc:rockwell-01" }).errs.length === 0,
);
check(
  "ns=0 (standard namespace) is clean",
  lintOpcuaNamespace({
    ...ROCKWELL_BASE,
    nodeMappings: [{ opcuaNodeId: "ns=0;i=2258", smAttribute: "x", dataType: "ns=0;i=13" }],
  }).errs.length === 0,
);
check(
  "a nodeId with no explicit ns= is clean",
  lintOpcuaNamespace({
    ...ROCKWELL_BASE,
    nodeMappings: [{ opcuaNodeId: "s=Machine/status", smAttribute: "x", dataType: "ns=0;i=12" }],
  }).errs.length === 0,
);
check("the threshold is 2 and it is declared", DRIFTABLE_FROM_INDEX === 2);
check(
  "ns=2 is already driftable",
  lintOpcuaNamespace({
    ...ROCKWELL_BASE,
    nodeMappings: [{ opcuaNodeId: "ns=2;s=Machine/status", smAttribute: "x", dataType: "ns=0;i=12" }],
  }).errs.length === 1,
);

console.log("N2 — one URI cannot agree with two positions");
{
  const mixed = {
    ...FTLINX_BASE,
    namespaceUri: "urn:i3x:sim-v5:linx:rockwell-01",
    nodeMappings: [
      { opcuaNodeId: "ns=117;s=Machine/status", smAttribute: "x", dataType: "ns=0;i=12" },
      { opcuaNodeId: "ns=89;s=Machine/partsCount/good", smAttribute: "y", dataType: "ns=0;i=11" },
    ],
  };
  const { errs } = lintOpcuaNamespace(mixed);
  check("two different pins under one URI is N2", errs.some((e) => e.startsWith("N2 ")), JSON.stringify(errs));
}

console.log("N3 — a blank URI must not satisfy N1");
{
  const blank = { ...FTLINX_BASE, namespaceUri: "" };
  const { errs } = lintOpcuaNamespace(blank);
  check("empty string is N3", errs.some((e) => e.startsWith("N3 ")), JSON.stringify(errs));
  check("…and N1 still fires, so the hole is not open", errs.some((e) => e.startsWith("N1 ")), JSON.stringify(errs));
}
{
  const junk = { ...FTLINX_BASE, namespaceUri: "rockwell-01" };
  const { errs } = lintOpcuaNamespace(junk);
  check("a bare machine name is N3", errs.some((e) => e.startsWith("N3 ")), JSON.stringify(errs));
}

console.log("EXEMPTION — a template endpoint has nothing to resolve against");
{
  const tmpl = {
    sourceId: "opcua-mtbridge-cnc-01",
    sourceType: "opcua",
    connection: { endpoint: "opc.tcp://MTBRIDGE_HOST:4840/osf/mtbridge" },
    nodeMappings: [{ opcuaNodeId: "ns=2;s=cnc-01/Act_State_InCycle", smAttribute: "x", dataType: "ns=0;i=1" }],
  };
  check("the placeholder endpoint is detected", isTemplateEndpoint(tmpl));
  const { errs, exempt } = lintOpcuaNamespace(tmpl);
  check("no violation is raised", errs.length === 0, JSON.stringify(errs));
  check("but the exemption is REPORTED, not silent", typeof exempt === "string" && exempt.includes("MTBRIDGE_HOST"), String(exempt));
}
{
  const real = {
    sourceId: "opcua-somegateway",
    sourceType: "opcua",
    endpoint: "opc.tcp://192.168.178.154:36600",
    nodeMappings: [{ opcuaNodeId: "ns=2;s=Machine/status", smAttribute: "x", dataType: "ns=0;i=12" }],
  };
  check("a REAL host is not exempted", lintOpcuaNamespace(real).exempt === null);
}

console.log("non-opcua sources are none of this linter's business");
check(
  "a rest source is untouched",
  lintOpcuaNamespace({ sourceId: "erp-x", sourceType: "rest", columnMappings: [] }).errs.length === 0,
);

if (failures) {
  console.error(`test-lint-opcua-namespace: ${failures} failure(s)`);
  process.exit(1);
}
console.log("test-lint-opcua-namespace: all checks passed");

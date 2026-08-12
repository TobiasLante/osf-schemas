#!/usr/bin/env node
// ci/test-lint-source-keys.mjs — self-test for the record-key linter.
//
// The regression case is the REAL one: the exact `sim-v5-wms-quants` 2.0.0
// declaration that shipped, checked against the REAL field list the WMS API
// serves (captured 2026-08-12 from GET http://192.168.178.154:38224/api/wms/quants,
// http=200, rows=500). A double that politely answers `quant_no` would have been
// an accomplice — the whole point is that the upstream never had that field.
//
// Run:  node ci/test-lint-source-keys.mjs

import { lintSourceKeys, keyFields } from "./lint-source-keys.mjs";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The field list the WMS endpoint ACTUALLY serves. Note: no `quant_no`. */
const WMS_RESPONSE_FIELDS = [
  "quant_id",
  "artikel_nr",
  "lager_nr",
  "lagerplatz_id",
  "charge_nr",
  "menge",
  "gesperrt",
  "hergestellt_am",
  "mhd",
  "erstellt_am",
  "aktualisiert_am",
];

const WMS_MAPPINGS = [
  { column: "quant_id", smAttribute: "quant_no", isId: true },
  { column: "artikel_nr", smAttribute: "article_ref" },
  { column: "lager_nr", smAttribute: "warehouse" },
  { column: "lagerplatz_id", smAttribute: "storage_location" },
  { column: "menge", smAttribute: "quantity" },
  { column: "charge_nr", smAttribute: "lot" },
  { column: "gesperrt", smAttribute: "blocked" },
  { column: "aktualisiert_am", smAttribute: "updated_at" },
];

const broken = {
  sourceId: "sim-v5-wms-quants",
  sourceType: "rest",
  response: { format: "json", rootPath: "$.rows", idProperty: "quant_no" },
  columnMappings: WMS_MAPPINGS,
};
const fixed = { ...broken, response: { ...broken.response, idProperty: "quant_id" } };

console.log("lint-source-keys self-test");

// ── the regression that cost 9 days ──────────────────────────────────────────
const brokenErrs = lintSourceKeys(broken);
check(
  "the shipped 2.0.0 WMS source is REJECTED",
  brokenErrs.length > 0,
  `got no violations: ${JSON.stringify(brokenErrs)}`,
);
check("…and names K1 (idProperty is not a declared column)", brokenErrs.some((e) => e.startsWith("K1")));
check("…and names K2 (idProperty contradicts isId)", brokenErrs.some((e) => e.startsWith("K2")));
check(
  "…and suggests the real column",
  brokenErrs.some((e) => e.includes('should almost certainly be "quant_id"')),
);

// The linter's verdict must agree with the REAL upstream, not with a friendly double.
check(
  "the rejected key is genuinely absent from the real WMS response",
  !WMS_RESPONSE_FIELDS.includes(keyFields(broken)[0]),
  `"${keyFields(broken)[0]}" unexpectedly present in ${WMS_RESPONSE_FIELDS.join(",")}`,
);
check(
  "the accepted key is genuinely present in the real WMS response",
  WMS_RESPONSE_FIELDS.includes(keyFields(fixed)[0]),
);
check("the corrected 2.0.1 WMS source is ACCEPTED", lintSourceKeys(fixed).length === 0, JSON.stringify(lintSourceKeys(fixed)));

// ── the rest of the class ────────────────────────────────────────────────────
check(
  "K3 — a pollable source with no key at all is rejected",
  lintSourceKeys({
    sourceId: "x",
    sourceType: "rest",
    columnMappings: [{ column: "a", smAttribute: "A" }],
  }).some((e) => e.startsWith("K3")),
);
check(
  "K3 — a composite primaryKeyColumns key satisfies the requirement",
  lintSourceKeys({
    sourceId: "x",
    sourceType: "rest",
    primaryKeyColumns: ["a", "b"],
    columnMappings: [
      { column: "a", smAttribute: "A" },
      { column: "b", smAttribute: "B" },
    ],
  }).length === 0,
);
check(
  "K4 — two isId columns are rejected",
  lintSourceKeys({
    sourceId: "x",
    sourceType: "rest",
    columnMappings: [
      { column: "a", smAttribute: "A", isId: true },
      { column: "b", smAttribute: "B", isId: true },
    ],
  }).some((e) => e.startsWith("K4")),
);
check(
  "K5 — a primaryKeyColumns entry that no mapping declares is rejected",
  lintSourceKeys({
    sourceId: "x",
    sourceType: "rest",
    primaryKeyColumns: ["ghost"],
    columnMappings: [{ column: "a", smAttribute: "A" }],
  }).some((e) => e.startsWith("K5")),
);
check(
  "K6 — a duplicated smAttribute is rejected (silent last-wins clobber)",
  lintSourceKeys({
    sourceId: "x",
    sourceType: "rest",
    columnMappings: [
      { column: "a", smAttribute: "A", isId: true },
      { column: "b", smAttribute: "A" },
    ],
  }).some((e) => e.startsWith("K6")),
);
check(
  "K6 — a duplicated COLUMN is allowed (legitimate fan-out, in use today)",
  lintSourceKeys({
    sourceId: "x",
    sourceType: "rest",
    columnMappings: [
      { column: "a", smAttribute: "A", isId: true },
      { column: "a", smAttribute: "A2" },
    ],
  }).length === 0,
);
check(
  "a non-pollable source type needs no record key",
  lintSourceKeys({ sourceId: "x", sourceType: "opcua", columnMappings: [] }).length === 0,
);

// ── the honest limit: the static rules CANNOT see an absent upstream field ────
// erp-segment-requirements declares idProperty === isId === "operation_id", and
// /api/operations serves no such field. Internally consistent, externally dead.
// Only the opt-in LIVE mode (L1) decides this — the static pass must stay silent
// so we never pretend to a coverage we do not have.
check(
  "static rules do NOT flag an internally consistent but upstream-absent key",
  lintSourceKeys({
    sourceId: "erp-segment-requirements",
    sourceType: "rest",
    response: { rootPath: "$", idProperty: "operation_id" },
    columnMappings: [
      { column: "operation_id", smAttribute: "segment_requirement_no", isId: true },
      { column: "production_order_no", smAttribute: "production_order_ref" },
    ],
  }).length === 0,
);

console.log(failures === 0 ? "lint-source-keys self-test: PASS" : `lint-source-keys self-test: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

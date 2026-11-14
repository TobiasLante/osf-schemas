# sources/rest/sim-v5-qms-inspections.json — history and reasoning

## version 2.3.0 (core 6.2.0, 14.11.2026, F50 — owner "Spezifischstes Objekt")

**One tested object per inspection lot, the most specific one present.** Version 2.2.0 drew three TESTS edges per lot — to the article
(`article_no`), the material lot (`material_lot_ref`) and the Quant (`quant_ref`) — while an inspection lot is a B2MML TestResult, whose
TestableObjectID is 0..1: a test result tests ONE object. The audit's T19 (edge-max-cardinality) warned. Now the source declares ONE TESTS
edge with `firstOf` (grammar 4.13.0, UNSaC 0.7.2-d): per lot the first alternative whose column is non-empty draws the edge — the Quant
before the material lot before the article (`quant_ref` → quant_no, `material_lot_ref` → material_lot_no, `article_no` → article_no). A lot
with a Quant tests the Quant; without one, the material lot; with neither, the article; with none of the three, no TESTS edge. The columns
stay mapped as before (article_ref, material_lot_ref, quant_ref keep their values on the lot); only the graph edge chooses one object.

## version 2.2.0 (core 6.2.0, 12.11.2026, K21 + K12 / learning T15)

**The RMA lot names what was delivered.** The sim (api-qms, live on PROD 12.11.2026 via opt-c5) gives every inspection lot `material_lot_ref` and
`quant_ref` — always present, `null` = no target. The source maps both onto the attributes of SMProfile-InspectionLot that already carried them
(TESTS → MaterialLot, TESTS → Quant, B2MML TestResult.TestableObjectID) and declares the two edges. Measured by the sim: the delivered lot NEVER
belongs to the complained production order (same order 0 of 2 821 — stock of other production orders is shipped). The chain complaint → machine
therefore runs over `material_lot_ref` → MaterialLot.machine_ref / confirmation_no, never over `production_order_no` (order_ref). Older material
lots are deleted by retention on the sim side (404); the last 7 days are complete (750 of 750).

**The source reads a window and walks it by key.** Before: `changeDetection: timestamp` with `since` = the newest `created_at`, ONE page of 200 —
a lot decided later never came back and a busy day was cut at 200 (learning T15). Now `?since=P7D` and keyset (`after_id`, cursor field
`lot_no`), pages of 5000, every 5 minutes. The sim (12.11.2026): `since` means `created_at ≥ since OR decided_at ≥ since`, so a decision comes
back; the list is sorted by `lot_no` ASC (the key of qms.inspection_lots, unique over every lot_type: QMLOT-R/P/O-…, FALOT-…) in the
database's DEFAULT collation — the keyset guard of the IT reader therefore only asks whether the walk moved (0.7.2 E9, F37), never "greater by
code units". Measured on PROD: since=P1D walked complete (11 336 = DB, no duplicates, 3 pages, slowest 1.65 s cold). A row missing from the
window is NOT deleted — the IT reader sends created and updated only.

# profiles/quality/inspection-lot.json — history and reasoning

Moved verbatim out of `profiles/qms/inspection-lot.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## attributes › state › description

Inspection workflow state. VOCABULARY MEASURED 2026-07-12 over the FULL population (qms.inspection_lots, 331.790 rows, GROUP BY state): exactly one value — DECIDED. The old prose claimed 'OPEN, IN_INSPECTION, DECIDED'; OPEN and IN_INSPECTION have never existed (the sim decides a lot in the same transaction it creates it). The lot_rejected gate `state eq 'DECIDED'` is therefore ALIVE — it just never excludes anything. Verified nightly by ci/check-vocab-drift.mjs.

## attributes › segment_response_ref › description

FK to SegmentResponse.segment_response_no: the segment response (one confirmed operation of the production order) whose material actual carries this lot's result (B2MML SegmentResponse.MaterialActual.TestResult). Through it the lot reaches its production order (RESPONDS_TO). Core 6.4.0 (K-QLOT, owner 19.11.2026).

## core 6.5.0 (0.7.5) — every delivered column of the QMS inspection lot

Owner 19./20.11.2026: „warum bilden wir nicht 46 felder einfach ab, wenn wir sie schon haben?“ — every column the reference plant's sim delivers is mapped; nothing invented, nothing dropped. Measured on sim-v5 PROD (192.168.178.154, GET only) on 19.11.2026.

GET :38261/api/qms/inspection-lots?since=P7D, keyset paging over 200 pages = 40 000 rows, delivers 20 columns; 14 were mapped. Mapped now (profile 3.6.0, source sim-v5-qms-inspections 2.5.0): plan_no → test_specification_ref (QMP-ADHOC 21 543, QMP-SPRITZ-INPROC 18 311, QMP-MECH-IN 138, QMP-FIRSTARTICLE 8 — one plan per lot type), workorder_no → workorder_ref, sales_order_no → sales_order_ref, rma_no → rma_ref, delivery_no → delivery_ref. B2MML 0701 TestResult names none of them (ID, Description, EvaluationDate, Expiration, HierarchyScope, TestableObjectID, OperationsTestRequirementID, EvaluatedCriterionResult, TestResultChild, PropertyMeasurement) and grammar isa95-edges has no TestResult edge to a test specification or an order: refOnly, notInIsa95.

Not mapped: material_lot_refs — a list of lot numbers (0 entries on 18 022 lots, 1 on 20 806, up to 17 151); the core has no list data type and no list edge, and inventing one is not this change's to make. material_lot_ref (one lot) stays mapped; on 1 172 lots it is not in the list.

Code lists over the 40 000 rows: status closed 40 000; state DECIDED 40 000 (as before); lot_type final 21 541, in_process 18 311, goods_receipt 138, first_article 8, RMA_RECEIPT 2; decision ACCEPT 33 914, REWORK 4 051, REJECT 2 035 (as before).

Units: sample_size C62 — a count of units drawn (13 values: 1, 2, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500; 1 on every final lot). quantity (lot_quantity) keeps no fixed unit: it is in the article's unit (137 goods-receipt lots are of KG articles, one of an M article, e.g. lot_quantity 500 or 3 850).

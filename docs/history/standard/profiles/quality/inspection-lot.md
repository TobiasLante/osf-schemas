# profiles/quality/inspection-lot.json — history and reasoning

Moved verbatim out of `profiles/qms/inspection-lot.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## attributes › state › description

Inspection workflow state. VOCABULARY MEASURED 2026-07-12 over the FULL population (qms.inspection_lots, 331.790 rows, GROUP BY state): exactly one value — DECIDED. The old prose claimed 'OPEN, IN_INSPECTION, DECIDED'; OPEN and IN_INSPECTION have never existed (the sim decides a lot in the same transaction it creates it). The lot_rejected gate `state eq 'DECIDED'` is therefore ALIVE — it just never excludes anything. Verified nightly by ci/check-vocab-drift.mjs.

## attributes › segment_response_ref › description

FK to SegmentResponse.segment_response_no: the segment response (one confirmed operation of the production order) whose material actual carries this lot's result (B2MML SegmentResponse.MaterialActual.TestResult). Through it the lot reaches its production order (RESPONDS_TO). Core 6.4.0 (K-QLOT, owner 19.11.2026).

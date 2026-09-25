# sources/rest/erp-process-segments.json — history and reasoning

Moved out of `sources/rest/erp-process-segments.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 13, 25.09.2026)

Reusable stages (ISA-95 ProcessSegment) for the `FOR_PROCESS_SEGMENT` edge of erp-operations-segments. sim-v5 has no separate ProcessSegment route (searched on .154:38060; `/openapi.json` 404); the stage master data are the process_segment_code values of GET /process-segments. Measured 25.09.2026: 588 rows, 4 distinct codes (VORMONTAGE, MONTAGE, PRUEFFELD, VERSAND, 147 each), each with one constant name and operations_type (Vormontage/production, Montage/production, Prüffeld/quality, Versand/production). Only these three columns are mapped: sequence, duration_planned_sec, operations_definition_ref and unit_ref vary per routing step and belong to the OperationsSegment (erp-operations-segments), not to the stage. Rows repeat a stage 147 times; the identity is the code. No edge: the profile's SPECIFIES_EQUIPMENT -> Machine has no per-stage machine column.

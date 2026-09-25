# sources/rest/erp-operations-segments.json — history and reasoning

Moved out of `sources/rest/erp-operations-segments.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

Routing steps (ISA-95 OperationsSegment) from sim-v5 erp-operations GET /process-segments. Measured 25.09.2026: 588 rows, all distinct, ordered by process_segment_no. sim-v5 calls them process segments (PS-PART-A-10 PART_OF OPDEF-PART-A), but a step of one routing with sequence and planned duration is an ISA-95 OperationsSegment (owner 25.09.). Not bound, never invented: process_segment_ref (sim-v5 serves process_segment_code, e.g. VORMONTAGE, which is a code, not a ProcessSegment key), material_ref (no column), equipment_class_ref (unit_ref POOL-* is a machine pool; whether a pool is an EquipmentClass is not decided). Hence only PART_OF OperationsDefinition; FOR_PROCESS_SEGMENT, SPECIFIES_MATERIAL, SPECIFIES_EQUIPMENT stay without a source.

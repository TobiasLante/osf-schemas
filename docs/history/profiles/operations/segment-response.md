# profiles/operations/segment-response.json — history and reasoning

Moved verbatim out of `profiles/operations/segment-response.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM SegmentResponse (ISA-95 Part 4 / B2MML OperationsResponse.SegmentResponse) = the actuals per manufacturing stage. An OperationsResponse (the order actuals) decomposes into ONE SegmentResponse PER ProcessSegment executed. Each SegmentResponse reports the actual values of the stage: material actually consumed/produced (as MaterialLot, with ROLE), equipment used, actual quantity and actual times. 'corresponds to' the SegmentRequirement (target). The measured actual fields carry the SDC quality facet (OPC-UA StatusCode propagation). Plan-vs-actual deviations (qty_shortfall, late) are CROSS-source (it-evaluator), not a single-entity constraints block.

## isa95 › note

ISA-95 Part 4 OperationsResponse.SegmentResponse = actuals per ProcessSegment, with MaterialActual (MaterialUse=role, MaterialLot) + EquipmentActual. 'corresponds to' SegmentRequirement. Plan-vs-actual is Cross-Source (it-evaluator), not a constraints block. SPEC-VS-ACTUAL: measured actual product properties per segment are checked against the recipe target bands (ProductDefinition / recipe valueFrom).

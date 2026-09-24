# profiles/operations/process-segment.json — history and reasoning

Moved verbatim out of `profiles/operations/process-segment.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM ProcessSegment (ISA-95 Part 4 / B2MML ProcessSegment). The reusable CAPABILITY of a manufacturing stage: WHICH resources (equipment / material / personnel class) can perform WHICH activity — independent of any concrete order. TERMINOLOGY RULE : a ProcessSegment is exactly one 'plant' in the MES, i.e. a 'Function' in the the function naming standard (Table 1) — e.g. a forming, dosing, or curing stage. It is therefore bound to the equipment hierarchy: PERFORMED_AT points to the EquipmentUnit (ISA-88 Unit / process stage) on which the segment runs. An OperationsDefinition arranges several ProcessSegments into a routing; an OperationsRequest (ProductionOrder) instantiates it and decomposes per segment into a SegmentRequirement. operations_type carries the ISA-95 'Mixed Schedule' split (production | inventory | quality | maintenance).

## isa95 › note

ISA-95 Part 4 ProcessSegment = reusable manufacturing stage. RULE: ProcessSegment == 'plant' (the MES) == 'Function' (the function naming standard Table 1). PERFORMED_AT binds to the EquipmentUnit (ISA-88 Unit). A SegmentRequirement (PLAN) / SegmentResponse (actuals) references this segment per order. CONTINUOUS PROCESSES (e.g. continuous web/strand goods): here ProcessSegment serves ONLY as a physical classification / filter dimension (= plant = Function), anchored via PERFORMED_AT EquipmentUnit; NO SegmentRequirement/SegmentResponse are instantiated. DISCRETE / segmented manufacturing additionally uses the optional decomposition layer SegmentRequirement (PLAN) / SegmentResponse (actuals). Both readings share the same profile (superset).

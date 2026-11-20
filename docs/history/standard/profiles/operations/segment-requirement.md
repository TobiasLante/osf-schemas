# profiles/operations/segment-requirement.json — history and reasoning

Moved verbatim out of `profiles/operations/segment-requirement.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM SegmentRequirement (ISA-95 Part 4 / B2MML OperationsRequest.SegmentRequirement) = the PLAN per manufacturing stage. An OperationsRequest (ProductionOrder) decomposes into ONE SegmentRequirement PER ProcessSegment traversed (a forming, dosing, or curing stage ...). Each SegmentRequirement carries the target specifications of the stage: material (with ROLE — Being Consumed/Produced/...), equipment, planned quantity and times. This resolves the flat v1 'one order = one implicit segment' view into the real ISA-95 multi-segment structure. Counterpart: SegmentResponse (the actuals), 'corresponds to'. The material ROLE is the core of the 'Mixed Operation Schedule' (Production: Consumed+Produced; Inventory: MovedFrom/MovedTo; Quality: Sample).

## isa95 › note

ISA-95 Part 4 OperationsRequest.SegmentRequirement = PLAN per ProcessSegment, with MaterialRequirement (MaterialUse=role) + EquipmentRequirement. Counterpart SegmentResponse (corresponds to). Multiple SegmentRequirements per order untangle the FabricationOrder interwoven in a the MES source into the logical ISA-95 objects. QUANTITY optional: for continuous processes without a discrete piece count, qty_planned is omitted.

## core 6.5.0 (0.7.5, owner 19./20.11.2026: „warum bilden wir nicht 46 felder einfach ab, wenn wir sie schon haben?“ — every field the sim delivers is mapped)

Measured 19.11.2026 on /api/operations (3 871 operations, 36 fields; erp-job-orders and erp-segment-responses read the same rows). The plan side is mapped here: material_ref (article, REQUIRES_MATERIAL → Article), routing_ref (routing_number), operations_definition_version (routing_version), routing_operation_no, tool_ref (routing_tool_number, the routing's tool; no Tooling source in werk1, so no source edge), setup_planned_min (MIN) and cycle_time_planned_sec (SEC). qty_planned carries C62.

## attributes › routing_ref

The ERP routing number (Arbeitsplan) the order or operation is made by. It is a value, not the FOR_OPERATIONS_DEFINITION edge: measured 19.11.2026 on the reference plant, the ERP routing numbers (`_V4_AP_14-0204-004`, `AP-V4-14-1300-049`, 129 on /api/operations, 102 on /api/orders) never equal an operations definition key of /operations-definitions (`OPDEF-PART-A`, `OPDEF-_V4_BG-GG-020`, 147). An edge on it would never resolve (the lesson of segment-work-center, core 6.0.0). operations_definition_ref stays the edge and stays unbound until the keys meet; the semantic layer can join the two by article.

# profiles/operations/segment-requirement.json — history and reasoning

Moved verbatim out of `profiles/operations/segment-requirement.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM SegmentRequirement (ISA-95 Part 4 / B2MML OperationsRequest.SegmentRequirement) = the PLAN per manufacturing stage. An OperationsRequest (ProductionOrder) decomposes into ONE SegmentRequirement PER ProcessSegment traversed (a forming, dosing, or curing stage ...). Each SegmentRequirement carries the target specifications of the stage: material (with ROLE — Being Consumed/Produced/...), equipment, planned quantity and times. This resolves the flat v1 'one order = one implicit segment' view into the real ISA-95 multi-segment structure. Counterpart: SegmentResponse (the actuals), 'corresponds to'. The material ROLE is the core of the 'Mixed Operation Schedule' (Production: Consumed+Produced; Inventory: MovedFrom/MovedTo; Quality: Sample).

## isa95 › note

ISA-95 Part 4 OperationsRequest.SegmentRequirement = PLAN per ProcessSegment, with MaterialRequirement (MaterialUse=role) + EquipmentRequirement. Counterpart SegmentResponse (corresponds to). Multiple SegmentRequirements per order untangle the FabricationOrder interwoven in a the MES source into the logical ISA-95 objects. QUANTITY optional: for continuous processes without a discrete piece count, qty_planned is omitted.

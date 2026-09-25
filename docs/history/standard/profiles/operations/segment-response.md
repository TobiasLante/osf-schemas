# profiles/operations/segment-response.json — history and reasoning

Moved verbatim out of `profiles/operations/segment-response.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM SegmentResponse (ISA-95 Part 4 / B2MML OperationsResponse.SegmentResponse) = the actuals per manufacturing stage. An OperationsResponse (the order actuals) decomposes into ONE SegmentResponse PER ProcessSegment executed. Each SegmentResponse reports the actual values of the stage: material actually consumed/produced (as MaterialLot, with ROLE), equipment used, actual quantity and actual times. 'corresponds to' the SegmentRequirement (target). The measured actual fields carry the SDC quality facet (OPC-UA StatusCode propagation). Plan-vs-actual deviations (qty_shortfall, late) are CROSS-source (it-evaluator), not a single-entity constraints block.

## isa95 › note

ISA-95 Part 4 OperationsResponse.SegmentResponse = actuals per ProcessSegment, with MaterialActual (MaterialUse=role, MaterialLot) + EquipmentActual. 'corresponds to' SegmentRequirement. Plan-vs-actual is Cross-Source (it-evaluator), not a constraints block. SPEC-VS-ACTUAL: measured actual product properties per segment are checked against the recipe target bands (ProductDefinition / recipe valueFrom).

## W8-OBJECTS (25.09.2026) — order actuals moved to SMProfile-SegmentResponse

Owner 25.09.2026: an order actual measured at a machine (part counts, order, article, program, tool/mould) belongs to the ISA-95 object SegmentResponse, reported by the machine source through `objects[]`, its UNS path under the machine (`<machine>/segment_response/<attr>`). Full move, standard 3.0.0. The machine class keeps `movedAttributes` as the alias trail; each moved attribute on SegmentResponse names `movedFrom`. Kept on the machine as machine state: IMM `shotCount` (the machine's cycle counter) and CNC `Act_Ref_ToolNumber` (the tool in the spindle, edge telemetry).

- `qty_good` counter as measured on SMProfile-InjectionMoldingMachine.good: {"semantics": "cumulative_resettable", "aggregation": "sum_of_positive_deltas", "resetsObserved": 10, "measuredAt": "2026-07-12"}
- `SMProfile-InjectionMoldingMachine.good` → `SMProfile-SegmentResponse.qty_good`; its description was: Good parts produced (cumulative). READ IT WITH `counter.aggregation`, NOT max-min: this counter resets.
- `qty_scrap` counter as measured on SMProfile-InjectionMoldingMachine.scrap: {"semantics": "cumulative_resettable", "aggregation": "sum_of_positive_deltas", "resetsObserved": 10, "measuredAt": "2026-07-12"}
- `SMProfile-InjectionMoldingMachine.scrap` → `SMProfile-SegmentResponse.qty_scrap`; its description was: Scrap parts (cumulative). READ IT WITH `counter.aggregation`, NOT max-min: this counter resets.
- `qty_total` counter as measured on SMProfile-InjectionMoldingMachine.total: {"semantics": "cumulative_resettable", "aggregation": "sum_of_positive_deltas", "resetsObserved": 10, "measuredAt": "2026-07-12"}
- `SMProfile-InjectionMoldingMachine.total` → `SMProfile-SegmentResponse.qty_total`; its description was: Total parts (cumulative). READ IT WITH `counter.aggregation`, NOT max-min: this counter resets.
- `SMProfile-InjectionMoldingMachine.currentProgram` → `SMProfile-SegmentResponse.program_ref`; its description was: Active program / job on the machine.
- `SMProfile-InjectionMoldingMachine.mouldId` → `SMProfile-SegmentResponse.tool_ref`; its description was: Mould / tool currently set up (= IMPLEMENTED_BY tool_id).
- `qty_good` counter as measured on SMProfile-CNC-Machine.Act_Amount_PartGood: {"semantics": "cumulative_resettable", "aggregation": "sum_of_positive_deltas", "resetsObserved": 15, "measuredAt": "2026-07-29"}
- `SMProfile-CNC-Machine.Act_Amount_PartGood` → `SMProfile-SegmentResponse.qty_good`; its description was: Good parts produced (cumulative). Full text: docs/history/standard/profiles/equipment/cnc-machine.md, attributes › Act_Amount_PartGood › description.
- `qty_scrap` counter as measured on SMProfile-CNC-Machine.Act_Amount_PartScrap: {"semantics": "cumulative_resettable", "aggregation": "sum_of_positive_deltas", "resetsObserved": 14, "measuredAt": "2026-07-29"}
- `SMProfile-CNC-Machine.Act_Amount_PartScrap` → `SMProfile-SegmentResponse.qty_scrap`; its description was: Scrap parts (cumulative). Full text: docs/history/standard/profiles/equipment/cnc-machine.md, attributes › Act_Amount_PartScrap › description.
- `SMProfile-CNC-Machine.Act_Amount_PartRework` → `SMProfile-SegmentResponse.qty_rework`; its description was: 
- `SMProfile-CNC-Machine.Act_Ref_ProductionOrder` → `SMProfile-SegmentResponse.production_order_ref`; its description was: 
- `SMProfile-CNC-Machine.Act_Ref_Article` → `SMProfile-SegmentResponse.article_ref`; its description was: 
- `SMProfile-CNC-Machine.Act_Ref_Tool` → `SMProfile-SegmentResponse.tool_ref`; its description was: 
- `SMProfile-CNC-Machine.Act_Ref_Program` → `SMProfile-SegmentResponse.program_ref`; its description was: 
- `SMProfile-CNC-Machine.Act_Ref_ProgramLine` → `SMProfile-SegmentResponse.program_line`; its description was: 
- `SMProfile-CNC-Machine.Act_Status_Program` → `SMProfile-SegmentResponse.program_status`; its description was: 
- attribute-aliases entry [{"profileRef": "SMProfile-CNC-Machine", "attribute": "Act_Amount_PartGood"}, {"profileRef": "SMProfile-InjectionMoldingMachine", "attribute": "good"}] retired: all members are now SMProfile-SegmentResponse.qty_good
- attribute-aliases entry [{"profileRef": "SMProfile-CNC-Machine", "attribute": "Act_Amount_PartScrap"}, {"profileRef": "SMProfile-InjectionMoldingMachine", "attribute": "scrap"}] retired: all members are now SMProfile-SegmentResponse.qty_scrap

# profiles/material/material-lot.json — history and reasoning

Moved verbatim out of `profiles/wms/material-lot.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — ISA-95 Part 2/4 MaterialLot (B2MML MaterialLot). TERMINOLOGY RULE : the word 'batch' is NOT used in ISA-95 and constantly causes confusion in ISA-88 — in ERP/English usage 'batch' means a 'portion' and is consistently a **MaterialLot**, NEVER an activity. A MaterialLot is an identifiable quantity of a material of a specific MaterialDefinition (Article). It sits between MaterialDefinition (SMProfile-Article) and MaterialSublot (SMProfile-Quant): OF_ARTICLE -> Article, HAS_SUBLOT -> Quant. It is produced/consumed in a SegmentResponse (PROCESSED_MATERIAL) or by a Workorder (PRODUCED_BY).

## attributes › job_order_ref › description (Welle 12, 25.09.2026)

FK to JobOrder.job_order_no: the job (one workorder operation) that produced this lot, <workorder_no>.<operation_number>. sim-v5 builds it from the columns workorder_ref + operation_number, never from the lot number; many lots point to one JobOrder. Key of the edge JobOrder REQUIRES_MATERIAL MaterialLot (source edge direction in).

## isa95 › note (Welle 12, 25.09.2026)

ISA-95 MaterialLot = identifiable material quantity of a MaterialDefinition. RULE: ERP 'batch' == MaterialLot (a portion of material), NEVER an activity. Sits between Article (MaterialDefinition) and Quant (MaterialSublot). job_order_ref is the key of the ISA-95 edge JobOrder REQUIRES_MATERIAL MaterialLot (JobOrder.MaterialRequirement.MaterialLotID, MaterialUse Produced/Consumed): the edge is 1:n and carried from the lot side, not a MaterialLot field in B2MML.

## attributes › segment_response_ref › description

FK to SegmentResponse.segment_response_no: the confirmed operation whose material actual made this lot (B2MML 0701 SegmentResponse.MaterialActual.MaterialLotID — a made lot is a material actual of the response, its use "Produced"). The edge runs from the response (ACTUAL_MATERIAL, in-edge of the lot's source); the order is that response's (RESPONDS_TO). Core 6.5.0 (owner 19.11.2026: „eigene Kante für erzeugtes Material statt REQUIRES_MATERIAL“): before, the lot's source drew JobOrder REQUIRES_MATERIAL to the made lot, which reads as "the job needs 2 014 lots". The reference plant fills it once the sim's /material-lots carries the confirmation number (sim list Q4).

## attributes › status › description

Lot status (B2MML MaterialLot.Status) in the source's words. Code list measured 19.11.2026 over 19 981 lots of GET :38060/material-lots?since=P30D (offset paging): AVAILABLE 19 917, RESERVED 64. B2MML 0701 StatusType has no code list, so the list is the source's. The text before core 6.5.0 said „e.g. available, in_production, consumed, blocked“ — none of those occurs.

## core 6.5.0 (0.7.5) — the delivered columns and the unit

Owner 19./20.11.2026: „warum bilden wir nicht 46 felder einfach ab, wenn wir sie schon haben?“ — every column the reference plant's sim delivers is mapped; nothing invented, nothing dropped. Measured on sim-v5 PROD (192.168.178.154, GET only) on 19.11.2026.

GET /material-lots delivers 10 columns, all mapped (confirmation_no → segment_response_ref is mapped and not delivered yet). quantity gets no fixed unit: the source sends unit_of_measure PCS on all 19 981 lots, but 6 994 of them are lots of KG articles (the sprue and regrind byproducts _V4_BY-ANGUSS-* / _V4_BY-REGRIND-*, quantities like 0.64 or 0.96) — the quantity is in the article's unit, and the PCS label on those lots is a finding at the sim, not a unit for the model.

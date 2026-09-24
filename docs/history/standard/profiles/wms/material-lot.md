# profiles/wms/material-lot.json — history and reasoning

Moved verbatim out of `profiles/wms/material-lot.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — ISA-95 Part 2/4 MaterialLot (B2MML MaterialLot). TERMINOLOGY RULE : the word 'batch' is NOT used in ISA-95 and constantly causes confusion in ISA-88 — in ERP/English usage 'batch' means a 'portion' and is consistently a **MaterialLot**, NEVER an activity. A MaterialLot is an identifiable quantity of a material of a specific MaterialDefinition (Article). It sits between MaterialDefinition (SMProfile-Article) and MaterialSublot (SMProfile-Quant): OF_ARTICLE -> Article, HAS_SUBLOT -> Quant. It is produced/consumed in a SegmentResponse (PROCESSED_MATERIAL) or by a Workorder (PRODUCED_BY).

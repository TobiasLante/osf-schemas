# profiles/operations/work-order.json — history and reasoning

Moved verbatim out of `profiles/operations/work-order.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM Workorder (ISA-95 Part 4 / B2MML WorkRequest). TERMINOLOGY RULE : when a FabricationOrder runs across multiple time slots, each slot produces an 'index' (index 1, 2, 3 ...) — and 'each index equals one Workorder in ISA-95; it is a subdivision of the FabricationOrder'. This profile models exactly that subdivision: a Workorder is a time-bounded sub-piece of a ProductionOrder (OperationsRequest). It binds the MaterialLots produced/consumed per slot. (Note: 'batch' is NOT an ISA-95 term — the physical material piece is a MaterialLot, the activity is this Workorder.)

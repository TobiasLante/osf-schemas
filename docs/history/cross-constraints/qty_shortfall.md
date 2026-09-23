# cross-constraints/qty_shortfall.json — history and reasoning

Moved verbatim out of `cross-constraints/qty_shortfall.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

RETIRED. Compared OperationsResponse.quantity_produced (BDE confirmations) against ProductionOrder.qty_planned. Retired on 2026-07-12 after measurement against sim-v5 PROD (.154): the rule was structurally incapable of producing a true finding. The rule body below is PRESERVED VERBATIM as the tombstone record — it is evidence, not configuration. It is never evaluated (retired:true).

# profiles/erp/product-definition.json — history and reasoning

Moved verbatim out of `profiles/erp/product-definition.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — ISA-95 ProductDefinition = the recipe / SOLL master. One spec per article: SPEC_FOR the Article the order produces (the FO/recipe join point), optionally APPLIES_TO an EquipmentClass/line. Each controlled product property carries a TWO-TIER control band: warn (Warngrenze, inner) and action (Eingriffsgrenze, outer). The bands are validated against the measured actuals on OperationsResponse/SegmentResponse (ISA-95 Spec-vs-Actual). This is the MasterProductSpecification; the per-FO ControlProductSpecification is derived from it.

## isa95 › note

ISA-95 ProductDefinition (MasterProductSpecification). Carries the SOLL bands as a TWO-TIER control limit (warn=Warngrenze inner, action=Eingriffsgrenze outer); validated against the measured actuals on OperationsResponse/SegmentResponse (Spec-vs-Actual). The per-FO ControlProductSpecification is derived per order.

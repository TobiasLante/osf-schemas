# sources/rest/erp-operations-definitions.json — history and reasoning

Moved out of `sources/rest/erp-operations-definitions.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

Routings (ISA-95 OperationsDefinition) from sim-v5 erp-operations GET /operations-definitions. Measured 25.09.2026: 147 rows, all distinct, ordered by operations_definition_no; no timestamp column, so full refresh every 15 min. All six profile attributes have a column (product_definition_ref is null on the sampled rows). No edge: the profile declares no relationship, although article_ref is an Article FK (open: an ISA-95 edge OperationsDefinition -> MaterialDefinition would have to be modelled first).

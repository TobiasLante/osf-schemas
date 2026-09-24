# profiles/operations/operations-definition.json — history and reasoning

Moved verbatim out of `profiles/operations/operations-definition.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — Level-3 MOM OperationsDefinition (ISA-95 Part 4 / B2MML OperationsDefinition). The MASTER / master-data side: the reusable routing of an article = the ordered sequence of ProcessSegments required to manufacture it (ISA-95 'Operations Definition' -> 'maps to' Process Segment). It is the counterpart of the executing objects: an OperationsRequest (ProductionOrder) INSTANTIATES this definition, and an OperationsResponse reports the actuals back. Linked to the ProductDefinition (target parameters / recipe binding) via the article. ISA-88 parallel: the OperationsDefinition is the 'master recipe' (static), the running OperationsRequest the 'control recipe' (live).

# profiles/machines/machine.json — history and reasoning

Moved verbatim out of `profiles/machines/machine.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — abstract parent for all machine types (CNC, IMM, …). THIN base: it contributes the shared relationships (PART_OF ProcessCell, PRODUCES Article, EXECUTES ProductionOrder), the generic machine KPI refs, and the isa95 marker — but NO concrete attributes. Each subtype declares its OWN tag set matching exactly what its OPC/sim source delivers (sim-tag == attribute, 1:1); the parent no longer carries generic Pascal names that no source feeds.

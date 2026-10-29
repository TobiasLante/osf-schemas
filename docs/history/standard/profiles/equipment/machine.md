# profiles/equipment/machine.json — history and reasoning

Moved verbatim out of `profiles/machines/machine.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — abstract parent for all machine types (CNC, IMM, …). THIN base: it contributes the shared relationships (PART_OF ProcessCell, PRODUCES Article, EXECUTES ProductionOrder), the generic machine KPI refs, and the isa95 marker — but NO concrete attributes. Each subtype declares its OWN tag set matching exactly what its OPC/sim source delivers (sim-tag == attribute, 1:1); the parent no longer carries generic Pascal names that no source feeds.

## core 5.0.2 (0.6.6, owner 14.10.2026) — the grain

`isa95.grain`: one equipment element at equipment level Unit (ISA-95 Part 2 cl. 5.5; B2MML-Common.xsd `EquipmentLevel1Type` Unit), keyed by
the one Equipment ID `element_id`. CNC-Machine and InjectionMoldingMachine inherit it. Enterprise, Site, Area and WorkCenter name the same
ISA-95 object (Equipment) at their own level and state theirs (UNS audit T5). The shared key is ISA-95's: one Equipment ID across the
role-based hierarchy; whether the levels keep it is the equipment-model question of core 6.0.0. Additive: profile 3.2.0, standard 6.1.0.

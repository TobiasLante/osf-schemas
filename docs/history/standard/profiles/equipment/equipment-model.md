# profiles/equipment/equipment-model.json — history and reasoning

Moved verbatim out of `profiles/equipment/equipment-model.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## _comment

COMPACT EQUIPMENT MODEL — the ONE documented exception to the entity-profile standard. Instead of one entity profile per level it uses (modelId + hierarchy) so the whole ISA-95/ISA-88 equipment tree is readable in a single file. ATTRIBUTE CONVENTION per level: <node>_id (key), <node>_code (raw code), name, <parent>_ref (FK to parent.<parent>_id, realises PART_OF). The order/segments/tools/etc. bind to a LEVEL of this model (e.g. ProductionOrder EXECUTED_AT EquipmentUnit); those targets resolve against the hierarchy node names below. Neutral names (ISA-95 levels 1-3, ISA-88 levels 4-7). DECISION 2026-07-15: the line level is ProcessCell (ISA-88), and in the current deployment the Machine profiles (profiles/machines/**, keyed machine_id) ARE the EquipmentUnit level — the operations edges therefore target Machine/machine_id directly.

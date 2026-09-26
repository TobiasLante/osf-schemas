# sources/rest/erp-machine-pools.json — history and reasoning

Moved out of `sources/rest/erp-machine-pools.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 13, 25.09.2026)

Machine pools as ISA-95 EquipmentClass, the target of `SPECIFIES_EQUIPMENT` from erp-operations-segments (unit_ref). sim-v5 erp-machine-pools GET /pools on .154:38009, measured 25.09.2026: 13 rows {poolId, displayName, poolType, machineIds, updatedAt}, not paged (no limit parameter), so full refresh without pagination. Mapped: poolId -> equipment_class_id, displayName -> name. The three pools the segments name (POOL-VORMONTAGE, POOL-ASSEMBLY_LINE, POOL-PRUEFFELD) are all present. Not mapped: poolType (no profile attribute), machineIds (the membership Equipment -> EquipmentClass is an edge on the Machine side, not modelled here).

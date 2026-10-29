# sources/rest/erp-machine-pools.json — history and reasoning

Moved out of `sources/rest/erp-machine-pools.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 13, 25.09.2026)

Machine pools as ISA-95 EquipmentClass, the target of `SPECIFIES_EQUIPMENT` from erp-operations-segments (unit_ref). sim-v5 erp-machine-pools GET /pools on .154:38009, measured 25.09.2026: 13 rows {poolId, displayName, poolType, machineIds, updatedAt}, not paged (no limit parameter), so full refresh without pagination. Mapped: poolId -> equipment_class_id, displayName -> name. The three pools the segments name (POOL-VORMONTAGE, POOL-ASSEMBLY_LINE, POOL-PRUEFFELD) are all present. Not mapped: poolType (no profile attribute), machineIds (the membership Equipment -> EquipmentClass is an edge on the Machine side, not modelled here).

## The pool is an EquipmentClass, membership measured (core 6.0.0, owner 29.10.2026 ~22:45)

Owner decision: an ERP pool is an EquipmentClass (capability / planning group) and has no place in the equipment tree; this source stays the source of the classes (poolId → equipment_class_id). A machine names its pool by Equipment.EquipmentClassID (SMProfile-Machine equipment_class_ref, edge DEFINED_BY).

Membership, measured 29.10.2026 on .154:38009 GET /pools (13 rows; `machineIds` per pool), against the plant tree of werk1 ("in the model" = an instance id of sites/werk1/instances):

| poolId | displayName | poolType | members | in the model | not in the model |
|---|---|---|---|---|---|
| POOL-ASSEMBLY_LINE | assembly-line pool (8 machines) | ASSEMBLY | 8 | — | line-ML-1, line-ML-2, line-ML-3, line-ML-4, line-PF, line-VM-1, line-VM-2, line-VM-3 |
| POOL-ASSEMBLY_STATION | Montagestationen | ASSEMBLY | 52 | — | asm-L1-ST1, asm-L1-ST2, asm-L1-ST3, asm-L1-ST4, asm-L1-ST5, asm-L1-ST6, asm-L1-ST7, asm-L1-ST8, asm-L2-ST1, asm-L2-ST2, asm-L2-ST3, asm-L2-ST4, asm-L2-ST5, asm-L2-ST6, station-M1-1, station-M1-2, station-M1-3, station-M1-4, station-M1-5, station-M1-6, station-M1-7, station-M1-8, station-M2-1, station-M2-2, station-M2-3, station-M2-4, station-M2-5, station-M2-6, station-M3-1, station-M3-2, station-M3-3, station-M3-4, station-M3-5, station-M4-1, station-M4-2, station-M4-3, station-M4-4, station-M4-5, station-M4-6, station-M4-7, station-PF-1, station-PF-2, station-PF-3, station-VM1-1, station-VM2-1, station-VM3-1, station-pilot-station-1, station-pilot-station-2, station-pilot-station-3, station-pilot-station-4, feeder-pc1-s04, rework-bay-01 |
| POOL-CNC | CNC-Maschinen | CNC | 25 | cnc-001, cnc-002, cnc-mtc-02, cnc-04, cnc-05, cnc-06, cnc-07, cnc-08, cnc-09, cnc-10, cnc-11, cnc-12, cnc-13, cnc-14, cnc-15, cnc-16, cnc-17, cnc-18, cnc-19, cnc-20, rockwell-01 | HB1000P, HB1500-1, HB600P, HB760 |
| POOL-FREMDBEARBEITUNG | Fremdbearbeitung | GENERIC | 2 | — | fb-coating-01, fb-heattreat-01 |
| POOL-HMI | hmi pool (2 machines) | GENERIC | 2 | — | hmi-01, hmi-02 |
| POOL-MOBILE_COBOT | Mobile Cobots | GENERIC | 2 | — | mc-01, mc-02 |
| POOL-PRESS | Presse | PRESS | 3 | — | press-01, press-02, press-03 |
| POOL-PRUEFFELD | Prüffeld | QMS | 1 | — | prueffeld-01 |
| POOL-QMS_INSPECTOR | qms-inspector pool (3 machines) | QMS | 3 | — | qms-cmm-01, qms-vision-01, qms-vision-02 |
| POOL-SGM | sgm pool (22 machines) | SGM | 22 | sgm-001, sgm-02, sgm-03, sgm-004, sgm-005, sgm-006, sgm-07, sgm-08, sgm-09, sgm-10, sgm-11, sgm-12, sgm-13, sgm-14, sgm-15, sgm-16, sgm-17, sgm-18, sgm-19, sgm-20, sgm-21, sgm-22 | — |
| POOL-TMS | Transport / TMS | TRANSPORT | 11 | — | agv-01, agv-02, agv-03, agv-04, agv-05, agv-06, fk-01, fk-02, forklift-01, mtms-forklift-01, mtms-trolley-01 |
| POOL-VORMONTAGE | Vormontage | ASSEMBLY | 2 | vormontage-01, vormontage-02 | — |
| POOL-WMS_ROBOT | wms-robot pool (1 machines) | TRANSPORT | 1 | — | wms-robot-01 |

Every model machine is in exactly one pool, except cnc-mtc-01 and ftlinx-01 (mirror ids, in no pool). The line machines sgm-001/004/005/006 and cnc-001/002/cnc-mtc-02/rockwell-01 are members of POOL-SGM / POOL-CNC although they stand in lines — correct, a class is no place. HB1000P, HB1500-1, HB600P, HB760 are the Heidenhain machines the model holds as cnc-11…cnc-14 (the known two-id issue of the sim). POOL-VORMONTAGE lists vormontage-01/02, which the tree holds as WorkCenters.

NOT YET DRAWN, and why: the membership is a list per pool row (`machineIds`), the edge DEFINED_BY runs from the machine. The grammar has no list-valued fkColumn (i3x uns-compiler kg-edges resolves `String(row[fkColumn])`), no list dataType for equipment_class_ref (String … Json only), and a plant-tree instance may not carry a class reference (instance-schema additionalProperties false; `relations` target instances only). So the membership above is evidence, not data the hub draws: it needs i3x code (an array fkColumn with direction in on this source, or an instance field for the EquipmentClassID). Nothing is hand-copied into the model meanwhile.

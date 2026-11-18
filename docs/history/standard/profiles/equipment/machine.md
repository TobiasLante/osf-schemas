# profiles/equipment/machine.json — history and reasoning

Moved verbatim out of `profiles/machines/machine.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v2.0 — abstract parent for all machine types (CNC, IMM, …). THIN base: it contributes the shared relationships (PART_OF ProcessCell, PRODUCES Article, EXECUTES ProductionOrder), the generic machine KPI refs, and the isa95 marker — but NO concrete attributes. Each subtype declares its OWN tag set matching exactly what its OPC/sim source delivers (sim-tag == attribute, 1:1); the parent no longer carries generic Pascal names that no source feeds.

## core 5.0.2 (0.6.6, owner 14.10.2026) — the grain

`isa95.grain`: one equipment element at equipment level Unit (ISA-95 Part 2 cl. 5.5; B2MML-Common.xsd `EquipmentLevel1Type` Unit), keyed by
the one Equipment ID `element_id`. CNC-Machine and InjectionMoldingMachine inherit it. Enterprise, Site, Area and WorkCenter name the same
ISA-95 object (Equipment) at their own level and state theirs (UNS audit T5). The shared key is ISA-95's: one Equipment ID across the
role-based hierarchy; whether the levels keep it is the equipment-model question of core 6.0.0. Additive: profile 3.2.0, standard 6.1.0.

## core 6.0.0 (0.7.0, owner 29.10.2026) — the signals every machine shares

The thin base of v2.0 ("NO concrete attributes") ends here. The owner table of step 2 (machine signals in the `<Act|Set|Plan>_<Kind>_<Name>`
style, 29.10.2026) lifts the signals that all 22 sim endpoints serve under the same node into SMProfile-Machine, one name for every
machine; CNC-Machine and InjectionMoldingMachine lose their own copy (movedAttributes on the child, `to` = SMProfile-Machine):
Act_Status_Machine (CNC Act_Status_Machine, IMM status), Act_Mode_Machine (CNC Act_Text_MachineMode, IMM mode), Act_Amount_Alarm
(CNC Act_Amount_Alarm, IMM alarmsCount), Act_Time_Uptime (IMM uptimeSeconds), Act_State_ShiftActive (IMM shiftActive; the CNC's
Act_Ref_Shift is the shift id and stays on the CNC), Act_Power_Machine (CNC Act_Energy_Power, IMM powerKw — a power in kW, not an
energy). New: the machine's lifetime part counters Act_Amount_LifeTime / Act_Amount_LifeTimeGood / Act_Amount_LifeTimeScrap (sim node
partsCount total / good / scrap); the quantities of one order stay SegmentResponse qty_*. No source of the demo plant maps the lifetime
counters yet.

## attributes › Act_Status_Machine › description

Actual machine status (sim node Machine/status, the same on every machine). Lifted into SMProfile-Machine in core 6.0.0 (owner
29.10.2026): CNC Act_Status_Machine, IMM status. The enum {RUNNING, IDLE, STOPPED, MAINTENANCE} is the CNC's measurement of 2026-07-12
(docs/history/standard/profiles/equipment/cnc-machine.md, attributes › Act_Status_Machine). The injection moulding machines were not
measured on their own (their profile kept no enum, "VOCABULARY NOT MEASURED YET"); a live read of the sim (GET :38260/api/machines,
30.10.2026) saw RUNNING and IDLE on all 22 of them, the same uppercase words. A word outside the list is caught by the drift check.

## attributes › Act_Mode_Machine › description

Machine operating mode (sim node Machine/mode, the same on every machine). Lifted into SMProfile-Machine in core 6.0.0 (owner
29.10.2026): CNC Act_Text_MachineMode, IMM mode. The enum {AUTO, MANUAL, SETUP} is the CNC's measurement of 2026-07-12; live sampling
of the injection moulding machines (2026-07-13) saw AUTO and SETUP, uppercase, the same dialect.

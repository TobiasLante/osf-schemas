# sources/static/model-equipment-classes.json — history and reasoning

Moved out of `sources/static/model-equipment-classes.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, core 6.2.0 K8, owner 12.11.2026 "unbedingt a")

The pools and the machine groups of werk1 as a fixed list in the model (core 6.2.0 K8, owner 12.11.2026 "unbedingt a"): the 13 pools with the names sim-v5 /pools gives them, the SGM machine groups (equipmentClass of sim-v5 /api/machines) PART_OF POOL-SGM, named by their id (the sim names them no other way). Read by opt-c5 on 13.11.2026 from sim-v5 PROD. The pools are no longer read from the sim (formerly the REST source erp-machine-pools): tools/check-pools-vs-sim.mjs compares this list with the sim, read only. Pool membership of a machine is not here: a machine is DEFINED_BY its class through its settings (equipment_class_ref).

Why a static source and not a second ERP source: two sources of one class collide on its UNS path; the owner decided (12.11.2026, option a) that the pools and the machine groups are kept as a fixed list in the model, and that erp-machine-pools only remains a check against the sim. The grammar (4.13.0, validation/source-schema.json) makes `static` an IT source type: it carries its rows in `records`, the IT engines read it like the list of a csv source (unsac-edge connect-gen 0.3.13 R072-K8B, unsac-it R072-K8C).

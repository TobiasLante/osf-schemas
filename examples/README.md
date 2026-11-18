# `examples/` — customer-specific demo fixtures (NOT canonical)

This folder holds **example / demo** instance data that is intentionally kept
separate from the reusable, customer-**neutral** schema assets.

## Golden Rule

> **Generalize, don't copy.**

Do not paste a specific customer's plant names, line names, unit codes or node
counts into the TYPE assets under `standard/profiles/`. The canonical equipment TYPE profiles of this repo are in
[`standard/profiles/equipment/`](../standard/profiles/equipment/) — `area.json`, `cnc-machine.json`, `cutting-tool.json`, `die.json`, `enterprise.json`, `equipment-class.json`, `equipment-model.json`, `fixture.json`, `injection-molding-machine.json`, `machine.json`, `mould.json`, `physical-asset-class.json`, `site.json`, `tooling.json`, `work-center.json`.
Since core 6.0.0 the plant hierarchy uses ISA-95 role-based levels (enterprise, site, area, work centers such as production lines and
work cells, work units); the levels live in `sites/<plant>/instances/`, not as one profile per level.

(The customer-specific plant hierarchy demo fixture was removed from next on 25.09.2026: customer data never lives in this repo.)


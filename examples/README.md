# `examples/` — customer-specific demo fixtures (NOT canonical)

This folder holds **example / demo** instance data that is intentionally kept
separate from the reusable, customer-**neutral** schema assets.

## Golden Rule

> **Generalize, don't copy.**

Do not paste a specific customer's plant names, line names, unit codes or node
counts into the TYPE assets under `standard/profiles/`. The canonical equipment TYPE
profiles that actually exist in this repo are
[`standard/profiles/equipment/`](../profiles/equipment/): `equipment-class.json`,
`equipment-model.json` (compact model, no SM profile) and `tool.json`.

> **⚠ Honesty note (audit 2026-07-15):** an earlier version of this README
> claimed a full set of canonical ISA-95/ISA-88 type profiles
> (`enterprise.json` · `site.json` · `area.json` · `process-cell.json` ·
> `equipment-unit.json` · `equipment-module.json` · `control-module.json`)
> under a `next/profiles/equipment/` path. **Those files exist nowhere in this
> repo.** The 7-level hierarchy exists only as the instance data inside the
> demo fixture below.

(The customer-specific plant hierarchy demo fixture was removed from next on 25.09.2026: customer data never lives in this repo.)


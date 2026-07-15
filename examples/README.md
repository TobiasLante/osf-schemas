# `examples/` — customer-specific demo fixtures (NOT canonical)

This folder holds **example / demo** instance data that is intentionally kept
separate from the reusable, customer-**neutral** schema assets.

## Golden Rule

> **Generalize, don't copy.**

Do not paste a specific customer's plant names, line names, unit codes or node
counts into the TYPE assets under `profiles/`. The canonical equipment TYPE
profiles that actually exist in this repo are
[`profiles/equipment/`](../profiles/equipment/): `equipment-class.json`,
`equipment-model.json` (compact model, no SM profile) and `tool.json`.

> **⚠ Honesty note (audit 2026-07-15):** an earlier version of this README
> claimed a full set of canonical ISA-95/ISA-88 type profiles
> (`enterprise.json` · `site.json` · `area.json` · `process-cell.json` ·
> `equipment-unit.json` · `equipment-module.json` · `control-module.json`)
> under a `next/profiles/equipment/` path. **Those files exist nowhere in this
> repo.** The 7-level hierarchy exists only as the instance data inside the
> demo fixture below.

## The Rockwool VAM5 reference instance

A concrete, customer-specific instance of a 7-level hierarchy (Enterprise `RW`
→ Site `VAM` → Area `WL` → ProcessCell `VAM5` → 17 Units → 174
EquipmentModules → 34 ControlModules, 229 nodes total) lives here as a **demo
fixture**:

- File: **`examples/anchor-rockwool-vam5.json`**
- Labeled in-file with `"_comment"` / `"_example": true`.

It is an **example of how to populate** a plant hierarchy — it is **not**
canonical and must not be treated as the contract.

**Its labels are outside the contract.** The fixture seeds seven hierarchy
labels — `Enterprise`, `Site`, `Area`, `ProcessCell`, `EquipmentUnit`,
`EquipmentModule`, `ControlModule` — none of which appears in
`contract.json` (no profile in `profiles/**` declares them; `contract.json`
even lists `Machine -[PART_OF]-> ProcessCell` and
`StorageLocation -[PART_OF]-> Area` under `unresolvedTargets` for exactly this
reason). They are **demo-only** vocabulary: agents and sink validators bound
to the contract must not write them, and nothing in this repo may grow a
dependency on them. Resolving the gap (adding hierarchy profiles, or
re-anchoring the fixture onto contract labels) is tracked consolidation work —
until then this note is the fence.

## How the live KG seed works (cross-repo coordinated)

The anchor-loader in the **i3x-v4** repo reads this file at runtime and
publishes it as an OT KG-snapshot (`i3x.kg.snapshot.ot.anchor-rockwool-vam5`)
so kg-builder MERGEs the 229 master-data nodes + 228 `PART_OF` edges into
Neo4j. The loader scans a configurable list of directories for
`sourceType:"static"` files (override via the `ANCHOR_SOURCE_DIRS` env in
i3x-v4); this `examples/` folder is part of the default scan set, so the demo
seed works without extra configuration.

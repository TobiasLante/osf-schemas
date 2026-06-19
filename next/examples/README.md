# `next/examples/` — customer-specific demo fixtures (NOT canonical)

This folder documents the **example / demo** instance data that is intentionally kept
separate from the reusable, customer-**neutral** equipment TYPE assets.

## Golden Rule

> **Generalize, don't copy.**

The canonical, reusable assets are the customer-neutral ISA-95/ISA-88 equipment **TYPE**
profiles under [`next/profiles/equipment/`](../profiles/equipment/):

- `enterprise.json` · `site.json` · `area.json` (ISA-95 role levels 1–3)
- `process-cell.json` · `equipment-unit.json` · `equipment-module.json` · `control-module.json`
  (ISA-88 physical model levels 4–7)

These carry the 7-level hierarchy, the `isa95` block, `relationships` (`PART_OF` via
`targetIdProp`), `propertyMap`, `kgNodeLabel`/`kgIdProperty` and the attribute contract —
all **plant-agnostic**. Do not paste a specific customer's plant names, line names, unit
codes or node counts into these TYPE assets.

## The Rockwool VAM5 reference instance

A concrete, customer-specific instance of this hierarchy (Enterprise `RW` → Site `VAM` →
Area `WL` → ProcessCell `VAM5` → 17 Units → 174 EquipmentModules → 34 ControlModules,
229 nodes total) lives here as a **demo fixture**:

- File: **`next/examples/anchor-rockwool-vam5.json`**
- Labeled in-file with `"_comment"` / `"_example": true`.

It is an **example of how to populate** the neutral hierarchy for one real plant — it is
**not** canonical and must not be treated as the contract.

## How the live KG seed still works after the move (cross-repo coordinated)

The anchor-loader in the **i3x-v4** repo reads this file at runtime and publishes it as an
OT KG-snapshot (`i3x.kg.snapshot.ot.anchor-rockwool-vam5`) so kg-builder MERGEs the 229
master-data nodes + 228 `PART_OF` edges into Neo4j.

The loader scans, in override order, **`next/examples` → `next/sources` → `sources`** for
`sourceType:"static"` files (override via the `ANCHOR_SOURCE_DIRS` env). Because
`next/examples` is now in the default scan set (and scanned *first*), relocating the demo
anchor here keeps the live seed intact — no flag day, no `SOURCE_PATH` to re-point. The
whole `next/` tree is baked into the loader image, so `next/examples/` is present at
runtime.

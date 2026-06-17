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
229 nodes total) exists as a **demo fixture**:

- File: **`next/sources/static/anchor-rockwool-vam5.json`**
- Labeled in-file with `"_comment"` / `"_example": true`.

It is an **example of how to populate** the neutral hierarchy for one real plant — it is
**not** canonical and must not be treated as the contract.

## Why the demo anchor still lives under `next/sources/static/` (variant "a", non-breaking)

The live anchor-loader in the **i3x-v4** repo reads the anchor from its current path
(`next/sources/static/anchor-rockwool-vam5.json`) to seed the live KG (229 master-data
nodes). Physically moving the file here would break that live seed, and the loader is in a
different repo that is out of scope for this change.

Therefore the demo anchor is **kept at its existing path** and only *labeled* as an
example (`_comment` / `_example`). Conceptually it belongs to this example/demo set.

### Welle-2 follow-up (cross-repo, not done here)

If the demo anchor is ever physically relocated into `next/examples/`, the
anchor-loader's `SOURCE_PATH` in **i3x-v4** must be re-pointed to the new location in the
**same** coordinated change — otherwise the live KG seed (229 nodes) breaks. Until then:
keep the file where it is.

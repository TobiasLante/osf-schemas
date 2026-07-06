# next2.0 — merged RW × next standard

`next2.0/` lifts the `next/` schemas onto the standard agreed with the Rockwool (RW) side
(mirror of RW `20260706`). Goal: **no design difference between RW and next2.0.**
`next/` is left untouched; this is a parallel folder on the `next2.0` branch.

## Already aligned (next already carried these — RW adopted them)
`category` (enum machine|equipment|business), flat `kgNodeLabel`/`kgIdProperty`, `abstract`,
`semantics`, `kpiRefs`, dataType vocabulary (`Int32/Int64/Float/Double/String/Boolean/DateTime/Json`).

## Changed in next2.0 (next lifted to the agreed standard)
- **`constraints` → array** of objects, each with a stable `name` (consistent with `attributes[]`/`relationships[]`). Unified schema updated accordingly.
- **`equipmentPath` → active** (was dormant): canonical containment-path key, emitted as the UNS/MQTT topic.

## Kept as-is (agreed asymmetries, not a design difference)
- **`scope`** stays a next-side architectural field (RW does not populate it).
- **`standard`** value stays per side (`OSF` here, `CarToUNS` on RW).

## RW ideas that are now THE standard (next-side population = TODO, not invented here)
- **Typed equipment model** (classes + typed instances) as the canonical equipment-model form — next still ships the `hierarchy` form; converting next's equipment model to typed instances is the open next-side task.
- **VTQ first-class** (value/timestamp/quality + uom) for telemetry — to be applied to next's OT/machine profiles.
- **Per-attribute `description`** — allowed; to be filled for next's attributes.

These are content/population tasks on next's own domains (CNC/ERP/QMS/WMS), deliberately **not invented** here — mirrors how RW still has to fill `semantics`/`kpiRefs`.

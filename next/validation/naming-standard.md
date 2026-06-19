# OSF Naming Standard (`next/`, DORMANT)

**Status:** experimental, **DORMANT** — descriptive only. Nothing live reads or validates
against this. It documents the identifier/label conventions **already in use** and pins one
reserved forward-looking alias (`equipmentPath`). Machine-readable companion:
[`naming-standard.json`](./naming-standard.json).

## Why

A single, **customer-neutral** reference for how identifiers, labels, hierarchy-path keys and
reference properties are named across SMProfiles, sources and the KG. Customer-neutral by
construction: it defines the *shape* of a name, never a specific customer's plant/line/unit
codes (those live only in demo fixtures under [`next/examples/`](../examples/)).

## Principles

1. **Customer-neutral.** Define the shape of a name, never a concrete value.
2. **One identity, one key.** A KG node MERGEs on its stable, owner-independent coalesce key
   (`kg_merge_key`), not on `(id, owner)`. A telemetry source that later maps its `machineId`
   to the same key lands on the **same** node.
3. **Hierarchy in the id.** ISA-88/ISA-95 element ids are dot-delimited, path-prefixed tokens
   tracing the containment chain. This is the `equipmentPath` shape.
4. **ASCII, stable, opaque.** Tokens are `[A-Za-z0-9_-]`, segments joined by `.`; no spaces or
   locale-specific characters. Ids are opaque keys — use `name` for display.
5. **Labels & relationships.** Labels are PascalCase singular nouns
   (`Enterprise`, `Site`, `Area`, `ProcessCell`, `EquipmentUnit`, `EquipmentModule`,
   `ControlModule`, `Machine`, `Equipment`); relationship types are `UPPER_SNAKE_CASE`
   (`PART_OF`, `EXECUTED_AT`).
6. **Reference & identity properties.** References end in `_ref` and carry the parent/target
   `element_id` (e.g. `process_cell_ref`); per-level identity properties end in `_id`
   (e.g. `unit_id`).

## Token table

| Token | Role | Shape | Status |
|---|---|---|---|
| `element_id` | primary identifier (KG MERGE key) | `PATH_SEGMENT('.'PATH_SEGMENT)*` | in-use |
| `kg_merge_key` | owner-independent coalesce key | `= element_id` today | in-use |
| `equipmentPath` | **RESERVED alias** of `element_id` / `kg_merge_key` | dot-delimited containment path | **dormant** |
| `kgNodeLabel` | KG primary label | PascalCase singular noun | in-use |
| `kgIdProperty` | per-level identity property | `lower_snake_case` ending `_id` | in-use |
| `*_ref` | reference to parent/target node | `lower_snake_case` ending `_ref` | in-use |
| relationship type | KG edge type | `UPPER_SNAKE_CASE` | in-use |

## The `equipmentPath` alias (dormant)

`equipmentPath` is a **named, self-documenting alias** for the dot-delimited containment path
that `element_id` / `kg_merge_key` already carry. It is **dormant**: not emitted, not consumed,
not validated anywhere today. When adopted it becomes the canonical, human-meaningful name for
the **same value** — purely additive, no migration of stored ids, fully reversible.

```
equipmentPath = <enterprise>.<site>.<area>.<cell>.<unit>.<module>.<controlmodule>
              (each segment optional below the level the node lives at)
```

## ISA-95 / ISA-88 path levels

| Level | Model | Label | id property | parent ref |
|---|---|---|---|---|
| 1 | ISA-95 | `Enterprise` | `enterprise_id` | — |
| 2 | ISA-95 | `Site` | `site_id` | `enterprise_ref` |
| 3 | ISA-95 | `Area` | `area_id` | `site_ref` |
| 4 | ISA-88 | `ProcessCell` | `process_cell_id` | `area_ref` |
| 5 | ISA-88 | `EquipmentUnit` | `unit_id` | `process_cell_ref` |
| 6 | ISA-88 | `EquipmentModule` | `equipment_module_id` | `unit_ref` |
| 7 | ISA-88 | `ControlModule` | `control_module_id` | `equipment_module_ref` |

> A concrete, customer-specific instantiation of these levels (e.g. an Enterprise→…→ControlModule
> tree with real codes) is a **demo fixture** — see [`next/examples/`](../examples/) and its
> README. Never paste concrete plant codes into the neutral TYPE profiles under
> [`next/profiles/equipment/`](../profiles/equipment/).

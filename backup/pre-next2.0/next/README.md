# `next/` — OSF Schemas 2.0 (ISA-95 Part 4 Operations + SDC)

**Release:** 2.0 — big-bang. Every file under `next/` is at version 2.0.0.
**Status:** staging tree for the unified, customer-neutral OSF schema standard. The live system still
runs off the canonical roots; `next/` is where 2.0 is assembled and validated before promotion.

## What 2.0 is

v2.0 closes the gap the pilot exposed: ISA-95 Part 4 had only a **flat order header**
(ProductionOrder / OperationsResponse) with material+equipment squashed onto the order as refs (one
implicit segment). 2.0 introduces the full **Operations layer** as first-class, customer-neutral profiles
— Schedule→Request→**SegmentRequirement** (PLAN) ‖ Performance→Response→**SegmentResponse** (IST), grounded
in **ProcessSegment**, with Material/Equipment specs that carry a **role** — and keeps the SDC facets
(constraints / quality / semantics) that were already in the meta-schema.

Customer-neutral by construction: the profiles define the *shape*, never a customer's plant/line codes
(those live only in `examples/`).

## Terminology law (ISA-95, binding)

- **ProcessSegment == "plant" (MES) == "Function" (the function naming standard).** A reusable production stage
 (a forming, dosing, or curing stage …), `PERFORMED_AT` an `EquipmentUnit`.
- **"batch" is forbidden** — not an ISA-95 term. The ERP word "batch" == **MaterialLot** (a *portion of
 physical material*, never an activity).
- **Production Request** is the umbrella (production / planned / process / fabrication order, work order,
 job) → `ProductionOrder` (isa95 `OperationsRequest`).
- **Order index == Workorder** = a time-slot subdivision of the order → `Workorder` (isa95 `WorkRequest`).

## The Operations model (new in 2.0, `profiles/operations/`, `category: business`)

```
OperationsDefinition (master / Fertigungsweg) ProcessSegment (= plant = Function)
 │ CONTAINS_SEGMENT │ PERFORMED_AT
 ▼ ▼
ProductionOrder ──INSTANTIATES──▶ OperationsDefinition EquipmentUnit (ISA-88)
 (OperationsRequest, PLAN) ▲
 │ HAS_SEGMENT_REQUIREMENT ┌── USES_EQUIPMENT ┘
 ▼ │
SegmentRequirement ──FOR_SEGMENT──▶ ProcessSegment FOR_MATERIAL──▶ Article
 (PLAN per segment, material_use role) │ CORRESPONDS_TO
 ▲ ▼
ProductionOrder.HAS_WORKORDER ▶ Workorder SegmentResponse (IST per segment)
 │ YIELDS │ PROCESSED_MATERIAL
 ▼ ▼
 MaterialLot ◀──── (Consumed / Produced) ──── MaterialLot
OperationsResponse (IST) ──HAS_SEGMENT_RESPONSE──▶ SegmentResponse
```

| Profile | isa95.objectModel | role |
|---|---|---|
| `operations/operations-definition.json` | OperationsDefinition | master: ordered segments to make an article |
| `operations/process-segment.json` | ProcessSegment | reusable stage = plant = Function; PERFORMED_AT EquipmentUnit |
| `operations/segment-requirement.json` | SegmentRequirement | PLAN per segment: material(role)+equipment+qty+timing |
| `operations/segment-response.json` | SegmentResponse | IST per segment: material actual(role)+equipment actual (quality facet) |
| `operations/work-order.json` | WorkRequest | order time-slot subdivision (FO-index) |
| `erp/production-order.json` | OperationsRequest | order header (PLAN), INSTANTIATES + decomposed by SegmentRequirement |
| `erp/operations-response.json` | OperationsResponse | order header (IST), decomposed by SegmentResponse |
| `wms/material-lot.json` | MaterialLot | the correct term for "batch"; between Article (MaterialDefinition) and Quant (MaterialSublot) |

**`material_use`** (the ISA-95 role on material specs/actuals — the "Being Consumed/Produced/Tested/Moved"):
`Consumed | Produced | Consumable | ByProduct | Sample | MovedFrom | MovedTo`.

**`operations_type`** (the Mixed-schedule split): `production | inventory | quality | maintenance`.

## SDC facets (additive, never required)

- **semantics** — IRI grounding (`iso:62264-…`, `cesmii:…`) for KG-Builder enrichment.
- **quality** — `{onBad: drop|flag|hold}` on measured *actual* attributes (SegmentResponse / OperationsResponse).
- **constraints** — single-entity only (e.g. actual within recipe control-limits via `valueFrom:"recipe:…"`).
 Plan-vs-Ist (qty_shortfall, late_delivery) stays a **cross-source reconcile** (it-evaluator), not a
 single-entity constraint block.

## Structure

```
next/
├── the design notes ← the 2.0 design SSOT (decisions + conventions)
├── validation/ ← unified meta-schema (profile/constraint/source/sync/recipe) + naming-standard
├── profiles/
│ ├── operations/ ← NEW: the ISA-95 Part 4 operations layer
│ ├── equipment/ ← Enterprise → ControlModule (ISA-95/ISA-88)
│ ├── erp/ qms/ wms/ ← business/MOM information objects
│ ├── machines/ ← OT asset profiles (edge-polled OPC)
│ └── intelligence/ ← discrepancy / resolution (own canonical schema)
├── recipes/ ← ProductDefinition / control-limit master data
├── sources/ examples/ ci/ build/
```

## Validation

- AJV against `validation/profile-unified-schema.json` (+ `constraint-schema.json`); category↔folder by
 `ci/lint-category.mjs` (now includes `operations/ → business`); guardrails by `ci/lint-delivery.mjs`;
 constraint cross-refs by `ci/lint-constraints.mjs`; recipe refs by `ci/lint-recipes.mjs`.
- 2.0 status: profiles/sources/recipes validate clean; all linters pass (delivery raises only the known
 CNC-setpoint guardrail warnings).

## Decisions captured

See the design notes. Short form: pilot learnings → neutral repo; no customer shape enters
`next/`. Plan/Ist separation confirmed; segment layer added; terminology law enforced; SDC facets carried.

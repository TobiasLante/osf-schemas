# ISA-95 / ISA-88 conformance of core 6.0.0 (standard 7.0.0)

The measure is ANSI/ISA-95 edition 2018, represented by MESA B2MML 0701 (and BatchML for ISA-88). Every claim a profile makes is
checked by a linter, not by review:

| check | what it holds |
|---|---|
| lint-isa95 I7 | every `isa95.propertyMap` path resolves against B2MML 0701; a path may carry a condition `Child[Field=Value]` (e.g. `SegmentResponse.MaterialActual[MaterialUse=Produced].Quantity`) whose field must exist on the child |
| lint-isa95 I10–I15 | every edge of a profile has its B2MML path in the grammar (`i3x-v5 packages/uns-grammar/validation/relationship-types.json` isa95), or is an extension / derived edge with its reason |
| lint-isa95 I16 | a property outside ISA-95 (`notInIsa95`) carries a `mappingNote` |
| lint-isa95 I19 | a property mapped onto a B2MML field WITH a code list carries an enum that is a subset of that list (Other allowed) |
| lint-isa88 | the same for the BatchML claims of the ISA-88 profiles |

## What core 6.0.0 changed (audit AUDIT-ISA95-2018, 13.10.2026)

- **Equipment levels (H1):** discrete machines are `WorkCell` in a `ProductionLine` (ISA-95 Part 1 role-based hierarchy), not `Unit`
  in a `ProcessCell` (the batch branch). The equipment model holds every Part-1 branch: ProcessCell/Unit, ProductionLine/WorkCell,
  ProductionUnit, StorageZone/StorageUnit, WorkCenter/WorkUnit. UNS paths and element ids do not change.
- **Tooling (H2):** a tool is a physical asset with its own identity, not the implementation of a machine: abstract `Tooling` with
  `Mould`, `Die`, `CuttingTool`, `Fixture`. The tool planned / mounted is PhysicalAssetRequirement / PhysicalAssetActual at the segment.
- **Code lists (H3):** 46 attributes speak the B2MML lists (order and response states, operations type, material use …). A source maps
  its own words with `valueMap`.
- **Test results (S2):** `TestResult` for the resources (personnel qualification, equipment / physical asset capability) next to the
  material result `InspectionLot`; responses name a result per actual (Personnel-, Equipment-, PhysicalAsset-, MaterialActual.TestResult).
- **Work alerts (S4):** `WorkAlert`, `WorkAlertDefinition` — every B2MML 0701 information object has a profile.
- M1–M4, L1, L3, L5, I16: operations / work type, conditional paths, mapped or reasoned fields, see `standard.json` breaking / additive.

## Moving a plant to core 6.0.0

The breaking records drive the move: `core-move` re-levels the instances of a class whose level changed (a line follows its machines;
a line holding two kinds of work unit is listed, never guessed) and moves the words a record names (`values: [{ profile, property,
map }]`) through the sources' consts and valueMaps. Words no record knows — a new list over a source that sends its own words — are
listed for the custodian, never guessed.

## Open

- M5 (which Level-4 objects a Part-4 system may report) and the level pairs of `x-allowedParents` need the text of ISA-95 2018 Part 1/2/5.

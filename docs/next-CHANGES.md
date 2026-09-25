# Branch `next` — what changed against `main` (07e137a)

The table groups the changes by topic; the branch itself has well over a hundred commits, each with its own reasoning in the commit message (`git log main..next`). `npm run validate`, the shape
validation and the mutation test are green. The checks added here moved to TobiasLante/i3x-v5 `packages/schemas-ci` (23.09.; code never in osf-schemas) and run there against this branch (`check-next.sh`).

| commit | what | breaks a consumer? |
|---|---|---|
| units | every unit is a UNECE Rec. 20 code (`CEL`, `BAR`, `MMT`, `P1`); `unece-codes.json` rebuilt from the OPC Foundation table — 11 codes there did not exist (`MAM` meant megametre, not mA); money is `currency` | **yes**: anything that reads `unit` as `degC`, `%`, `pct`, `rpm` |
| valueType | `PV / SP / ID` on 131 attributes, only where the repo already implies it | no, additive |
| prose | 162 long texts moved verbatim to `docs/history/`, the field keeps its first sentence | only if a consumer shows or embeds the long description |
| structure | `backup/` out of the tree; one `equipmentLevel` enum; inverse edges registered | no |
| i3x | `standard/i3x/` generated: the profiles as i3X 1.0 Object Types, proven lossless | no, additive |
| domains | `standard/profiles/` by ISA-95 domain instead of by source system: `equipment/` (machines, equipment classes, tools), `material/` (article, material item/lot, quant, storage location), `operations/` (orders, segments, responses, calendar, customer), `quality/` (inspection lot, SPC), `intelligence/` unchanged; one owner per folder in the governance. The meta-schema of a profile follows its `category`, no longer its folder | **yes**: anything that reads a profile by its old path (`profiles/machines/…`, `profiles/erp/…`); by `profileId` nothing changes |
| mutate | every gating linter proven to catch its defect | no |

## Declared open, not decided here

- `standard/validation/open-units.json`: 88 numeric attributes no source states a unit for, and
  `plastProgress`, which arrives as a 0..1 ratio while the profile says percent.
- `standard/validation/relationship-types.json`: `PART_OF` is the reverse of four `HAS_*` types. i3X allows
  one `reverseOf` per type.
- Attribute names mirror source tags, so they are not renamed. Exceptions noted in
  `standard/validation/naming-standard.md`.

# `next/` — SDC-inspired Augmentation Staging

**Status:** experimental — **NOT for production deploys.**

This folder is a parallel staging tree for **additive** schema extensions inspired by the
Semantic Data Charter (SDC) discussion (2026-05-28). The live system continues to use the
canonical roots (`profiles/`, `sources/`, `sync/`, `validation/`) — **`next/` does not
replace them.**

## Why a parallel tree

We want to evaluate four additive facets without risking the 30+ live edges that depend
on the canonical profiles:

1. **`constraints`** — 4th attribute facet: typed `{when, require, op, severity}` rules,
   one representation read by both the build-time SHACL validator (KG-Builder Phase 1.5)
   and the runtime Edge constraint-detector. Option C from the design discussion
   (JSON as SSOT, SHACL falls out as a build artifact, no SHACL engine at the edge).
2. **`quality`** — 5th attribute facet: OPC-UA StatusCode/Quality propagation
   (`{onBad: drop|flag|hold, nullFlavor}`) — today thrown away at the edge.
3. **`semantics`** — IRI references (cesmii:/iso:/bfo:) for KG-Builder node enrichment.
4. **`cellRef`** + provenance — payload field for Vault hash-chain attestation.

And to add a 4th `discrepancy_class`:

5. **`'constraint'`** — alongside `multi_source | drift | confidence`. Requires
   coordinated change in `services/discrepancy-engine/src/types.ts` on the i3x-v4 side.

## Structure (mirrors the canonical root)

```
next/
├── validation/        ← extended meta-schemas (constraints + quality)
├── profiles/
│   ├── machines/      ← copies of pilot base profiles + constraint/quality blocks
│   └── intelligence/  ← discrepancy.json copy with 'constraint' added to enum
├── build/
│   └── shacl/         ← CI-generated, .gitignored beyond .gitkeep
└── ci/                ← lint-constraints.mjs + json-to-shacl.mjs (later PRs)
```

## Pilot scope (v1)

Pilot one base profile and the discrepancy enum — not all 45 profiles:

- `next/profiles/machines/cnc-machine.json` (when added) — copy of canonical + constraints
- `next/profiles/intelligence/discrepancy.json` (when added) — copy + `'constraint'`
- Pilot edge: cnc-009 (env flag `OSF_SCHEMA_TIER=next`)
- cnc-001 / cnc-002 stay on canonical `profiles/`

If the pilot is stable for ≥2 weeks with no drift and constraint violations flow cleanly
into the steward queue → merge `next/*` into the canonical roots and delete `next/`.

## CI

- `.github/workflows/validate.yml` — canonical, unchanged
- `.github/workflows/validate-next.yml` — separate workflow that **only** runs on
  changes under `next/**`. Failures here do not block PRs that touch only canonical
  paths.

## Cross-repo coordination

Adding the `'constraint'` discrepancy class requires a coordinated PR on
`TobiasLante/i3x-v4` updating `services/discrepancy-engine/src/types.ts`. Do not merge
the `next/profiles/intelligence/discrepancy.json` change until the engine is feature-
flagged to accept it (otherwise it will reject incoming `class:constraint` events).

## Decisions captured

See the SDC strategy memo for the full reasoning. Short form:

- **NOT** going SDC4-conformant (XSD/XML/sdc4.xsd is wrong fit for OT volume).
- Additive in our own JSON SSOT. SHACL emitted as a build artifact, not authored.
- Quality is the killer cherry-pick — would have caught the BadSessionIdInvalid
  frozen-feed incident as `stale` instead of going silent.
- Vault hash-chain (per-record Ed25519) stays — stronger than SDC's element metadata.

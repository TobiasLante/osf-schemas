# profiles/intelligence/discrepancy-constraint.json — history and reasoning

Moved verbatim out of `profiles/intelligence/discrepancy-constraint.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Per-class evidence profile for discrepancy_class 'constraint' (SDC-next) — analogous to discrepancy-multi-source.json. Closes an SSOT gap: the constraint_* evidence fields previously existed only in the engine projection (services/discrepancy-engine/src/types.ts). NEW constraint_rule: mandatory snapshot of the triggering rule version at raise time (SDC visibility concept 2026-06-11) — when specifications are adjusted as a consequence of discrepancies (fix_charter), the history is otherwise no longer interpretable after the first adjustment.

## attributes › constraint_rule › description

Serialized snapshot of the triggering rule version ({when, require, severity}) at raise time. The live catalog lookup (/api/kg/schemas/profiles/:id) additionally remains in place and shows the CURRENT version — a divergence between the two is itself evidence (the specification was changed since the raise).

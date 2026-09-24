# profiles/intelligence/discrepancy.json — history and reasoning

Moved verbatim out of `profiles/intelligence/discrepancy.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Abstract parent for the four discrepancy classes (Multi-Source, Drift, Confidence, Constraint). First-class divergence entity (Pillar 1 — Multi-Truth). Created by the central discrepancy-engine, never edge-sourced — therefore no delivery/scope/promotion wire-contract. Carries the v7 lifecycle: open -> resolved | accepted_known_divergence | escalated | superseded (Concept §17.2). next/ pilot: adds 'constraint' as 4th discrepancy_class — raised when an edge constraint-detector observes a violation of a profile 'constraints' rule (next/validation/constraint-schema.json) and publishes discrepancy.<site>.<machine>.constraint.<constraint_id>. Requires the coordinated 'constraint' class in services/discrepancy-engine/src/types.ts (i3x-v4).

## attributes › discrepancy_class › description

Which detector class produced it (§17.1; 'constraint' = edge constraint-detector, next/ pilot; 'control_limit' = two-tier control-band breach (Warngrenze (warning limit)/Eingriffsgrenze (action limit), op within_limits) with a raise/clear (auto-clear) lifecycle, surfaced on the dedicated OT/IT alarm panels rather than the steward work-off queue)

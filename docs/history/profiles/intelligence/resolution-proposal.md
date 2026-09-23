# profiles/intelligence/resolution-proposal.json — history and reasoning

Moved verbatim out of `profiles/intelligence/resolution-proposal.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

A documented resolution proposal for a Discrepancy that precedes the lifecycle transition and carries the user approval (SDC visibility concept 2026-06-11). Core idea: a Discrepancy is symmetric evidence — either reality diverges from the specification (target=fix_reality) or the specification from reality (target=fix_charter). fix_charter proposals carry the concrete diff of the constraint block; their approval is the osf-schemas PR generated from it (SSOT-as-Git: PR review = audited four-eyes approval, CI validates, gen-flow rolls it out) — the engine builds NO governance of its own for this. Producers are human (steward form), AutoResolveRule or agent (v7 Intelligence, advisory-only — an agent proposes but never transitions itself). Four-eyes invariant: decided_by MUST != proposed_by (enforced by the engine, not expressible by the schema). The Discrepancy transition references the proposal_id so that the approval appears as 'User X approved proposal Y from Z' in the audit chain. The store owner is the discrepancy-engine (system of record).

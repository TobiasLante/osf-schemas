# profiles/intelligence/change-request.json — history and reasoning

Moved verbatim out of `profiles/intelligence/change-request.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

CAPT-GOLDEN — a request to change a TOLERANCE BAND or a steering AIM, raised against a Discrepancy, and RESOLVED by an EXTERNAL authority (not the engine). This is the Golden counterpart to SMProfile-ResolutionProposal, and the two are deliberately different kinds of object. A ResolutionProposal is symmetric evidence closed INSIDE the system (fix_reality acts on the machine; fix_charter becomes an osf-schemas PR whose merge IS the approval). A ChangeRequest is narrower and asymmetric: it asks specifically 'move the band to [lo,hi]' or 'move the aim', and it can only be CLOSED by an authority that owns the number being challenged — a drawing/customer_spec/norm band is NOT the engine's to change, so the engine records the request and carries the authority's ruling VERBATIM. The band the authority hands back (`authoritative_band`) is copied in unaltered at resolution, next to who ruled it (`resolved_by`, an external role) and a signature over the ruling (`resolution_signature`) — so 'the band is now [x,y] because Authority Z ruled it on date D, signed S' is auditable end to end. `tolerance_source` is the SAME vocabulary as recipe-schema.json toleranceSource (drawing / customer_spec / norm / process_estimate / unknown), because WHO may resolve the request follows from WHERE the number came from: a process_estimate can be re-set by Process Engineering; a drawing/customer_spec/norm band needs the drawing/customer/standards owner. INVARIANTS the engine enforces (NOT expressible in this schema): (1) a ChangeRequest MUST carry at least one of `proposed_band` / `proposed_aim`; (2) on status resolved_approved the matching `authoritative_band`/`authoritative_aim` + `resolved_by` + `resolved_at` + `resolution_signature` MUST be present; (3) `resolved_by` MUST be an external authority, never the `requested_by`. The store owner is the discrepancy-engine (system of record); the KG node is written straight in — not edge-sourced — so it carries NO delivery/scope/promotion wire-contract.

## attributes › tolerance_source › description

Provenance of the band being challenged — the SAME vocabulary as recipe-schema.json toleranceSource. It decides WHO can resolve: drawing / customer_spec / norm are BINDING (only the drawing/customer/standards owner may change them); process_estimate is optimisable (Process Engineering); unknown means the origin was never recorded and the request is ungrounded until it is bound.

## attributes › proposed_band › description

The proposed NEW tolerance band, serialized JSON [lo,hi] (same shape as recipe `values` bands). One of proposed_band / proposed_aim MUST be set (engine-enforced). Serialized-JSON String, matching the house style for structured intelligence fields (cf. ResolutionProposal.constraint_diff / evidence_refs).

## attributes › proposed_aim › description

The proposed NEW steering aim (recipe parameters[].aim) — where the process should be centred inside the band. One of proposed_band / proposed_aim MUST be set (engine-enforced). Moving the aim never moves soll or the band; it is a steering change, which is why it can often be resolved without the drawing owner.

## attributes › resolved_by › description

The EXTERNAL authority that resolved the request — the owner of the number's provenance (drawing/customer/standards owner for binding bands, Process Engineering for process_estimate). MUST NOT be requested_by (four-eyes, engine-enforced). The engine builds NO governance of its own here; it records the authority's decision.

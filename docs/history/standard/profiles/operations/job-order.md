# profiles/operations/job-order.json — history and reasoning

Moved out of `profiles/operations/job-order.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## relationships › REQUIRES_MATERIAL › description (2.0.0, Welle 12, 25.09.2026)

The lots the job consumes or produces (B2MML MaterialRequirement, MaterialUse). 1:n: the key sits on the lot (MaterialLot.job_order_ref); the MaterialLot source declares this edge with direction in. targetIdProp is the MaterialLot key (was lot_no = the InspectionLot key, which could never resolve to a MaterialLot).

## isa95 › note (2.0.0, Welle 12, 25.09.2026)

ISA-95 Part 4 JobOrder = one dispatched job of a WorkRequest. The MaterialLot link is JobOrder REQUIRES_MATERIAL MaterialLot (JobOrder.MaterialRequirement.MaterialLotID, forward); it is 1:n, so the key sits on the lot side (MaterialLot.job_order_ref, source edge direction in). material_lot_ref was removed (2.0.0): one value cannot hold many lots, and two carriers for one edge would be two truths (owner 25.09.).

## 1.0.0 → 2.0.0 (Welle 12)

Removed material_lot_ref (attribute and propertyMap JobOrder.MaterialRequirement.MaterialLotID): a single value cannot hold the many lots one job produces (one lot per machine and hour in sim-v5), and keeping it next to MaterialLot.job_order_ref would give one edge two carriers. The edge JobOrder REQUIRES_MATERIAL MaterialLot stays an ISA-95 edge, path JobOrder.MaterialRequirement.MaterialLotID, direction forward in standard/validation/relationship-types.json; only the key moved to the lot side. The relationship targetIdProp was lot_no, which is the key of InspectionLot, not of MaterialLot (material_lot_no): the edge could never have resolved to a MaterialLot. material_use (JobOrder.MaterialRequirement.MaterialUse) is kept; it describes the requirement, not the job, and is not fed by erp-job-orders — whether it stays is an open owner question.

# cross-constraints/parts_counted_vs_booked.json — history and reasoning

Moved verbatim out of `cross-constraints/parts_counted_vs_booked.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

The successor qty_shortfall's tombstone asked for: a left operand from OUTSIDE the ERP — the machine's own counted parts — against the ERP's booking. That is the only genuine IT-vs-OT multi-truth this product can have: two INDEPENDENT systems asserting the SAME fact (how many good parts did machine M make in window W) and disagreeing.

IT IS PARKED, AND NOT BECAUSE THE OPERANDS DISAGREE. It is parked because ONE OF THE TWO SOURCES CANNOT STATE THE FACT AT ALL. A multi-truth needs two parties to the same question. Measured on 2026-07-12 (see blockedBy), the ERP is not a party: it does not know which machine made a part. Arming this rule today would not report a disagreement — it would report the ERP's silence as if it were a denial, and blame the customer's booking discipline for a gap in our own integration. We did that once today already (the pressure gate, Ca 5.385 read as 0.956) and it was the worst thing the system did.

WHEN IT UNPARKS, IT RAISES ONE FINDING PER MACHINE PER WINDOW — never one per order. A shortfall that appears on every order of a machine is not 17.435 findings; it is one sentence about that machine. And a shortfall that appears on EVERY machine is not a finding at all: it is the norm, and the thing that is broken is the booking process, not the factory.

# profiles/operations/customer.json — history and reasoning

Moved verbatim out of `profiles/erp/customer.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## isa95 › note

Level-4 business partner. FOR_CUSTOMER target of ProductionOrder (moved there from the retired SMProfile-CustomerOrder on 2026-08-13, together with customer_ref/customer_name; the upstream serves one order row under four identical id fields, so there was never a separate sales-order entity to hang the customer off).

## core 6.5.0 (0.7.5, owner 19./20.11.2026: „warum bilden wir nicht 46 felder einfach ab, wenn wir sie schon haben?“ — every field the sim delivers is mapped)

Measured 19.11.2026 on /api/customers (all 6 customers). New: email, payment_terms, active, credit_limit (no currency unit in UNECE Rec. 20 — listed in open-units like CustomerOrder.total_amount), currency, tax_id, incoterms, sales_area, delivery_block, billing_block, deactivated_at, deactivated_reason, created_at, updated_at; segment speaks STANDARD, PREMIUM, STRATEGIC. Not mapped: customer_id (= kunde_id), country (= land), zahlungsbedingung (= payment_terms), aktiv (= active).

# profiles/operations/customer-order.json — history and reasoning

Moved verbatim out of `profiles/erp/customer-order.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

RETIRED 2026-08-13 (CAPT-ORDER) — see retiredReason. TOMBSTONE ONLY: nothing binds this profile, no node or edge can be created from it. Its commercial attributes and its FOR_CUSTOMER / FOR_ARTICLE edges are adopted by SMProfile-ProductionOrder v3.0.0. Kept because order_overdue below is a tombstone with 2.712 episodes still open in the KG that discrepancy-engine resolves by constraint_defined_in='SMProfile-CustomerOrder'. --- ORIGINAL: next/ v4 — Level-4 SALES order with a customer delivery commitment. Deliberately separated from the Level-3 OperationsRequest (ProductionOrder) it TRIGGERS: the sim currently conflates both onto one row (Sonderfall), but the clean MOM model keeps sales (L4) and production request/response (L3) apart. Plan-vs-actual deviations (late_delivery, qty_shortfall) are cross-entity OperationsRequest↔OperationsResponse checks and live in the cross-source phase, NOT here. Single-entity deviation: order_overdue (delivery commitment vs now).

## attributes › status › description

Sales-order status, as it reaches THIS profile through OUR source binding. VOCABULARY MEASURED 2026-07-12 against the FULL population of sim-v5 PROD (.154) — all 47.513 customer orders, not a page and not the mapper's source code. /api/customer-orders is the SAME projection as /api/orders and carries exactly five raw statuses: CANCELLED 21.676 -> storniert, INVOICED 19.827 -> abgeschlossen, IN_PRODUCTION 4.305 -> in_arbeit, WAITING_PARTS 1.687 -> freigegeben, ON_HOLD 18 -> freigegeben. sources/rest/erp-customer-orders.json binds ?exclude_status=CANCELLED,INVOICED,SHIPPED, so 6.010 orders reach us and they carry exactly TWO values: in_arbeit and freigegeben. 'offen' (raw DRAFT|PROPOSED|PLANNED) and 'fertig' (raw PRODUCED|COMPLETED) DO NOT EXIST ANYWHERE IN THE ERP — 0 of 47.513 rows, filtered or not. This enum is therefore the COMPLETE image, not a snapshot lower bound. THIS IS THE ROOT CAUSE OF order_overdue's RETIREMENT: its guard was `status eq 'offen'` — a value the source cannot produce. It has raised nothing since 2026-07-06 and CANNOT raise again. Note that an enum containing a fictional value makes ci/lint-vocabulary.mjs fake-green on exactly the guard it exists to catch; the gate is only as honest as the enum. Extend ONLY against a fresh measurement of the full population. --- 2026-08-03, THE ENUM NOW COMES FROM THE PRODUCER'S CONTRACT, NOT FROM A SAMPLE. Chasing observed values one at a time was Sisyphus: the declared set was [freigegeben, in_arbeit], a paginated count added fertig (12) and abgeschlossen (5), and while I was committing that, `offen` appeared once. A live population moves; a vocabulary declared from a sample of it is stale by construction. sim-v5 declares the CLOSED set itself — packages/api-erp/src/shapes.ts:96, 'canonical DE: offen|freigegeben|in_arbeit|fertig|abgeschlossen|storniert'. That is the authority, and it is what is declared here. storniert is DELIBERATELY OMITTED: it is status_raw CANCELLED, which the exclude_status filter this source sends (CANCELLED,INVOICED,SHIPPED) removes, so it cannot arrive through THIS binding. The other five can. Raw mapping measured on the live feed: IN_PRODUCTION -> in_arbeit, WAITING_PARTS + ON_HOLD -> freigegeben, COMPLETED -> fertig, DELIVERED -> abgeschlossen. HOW THE TWO-VALUE DECLARATION SURVIVED SINCE 2026-07-12: the endpoint caps a page at 5000 rows and the FIRST page carries only in_arbeit/freigegeben, so a single unpaginated request CONFIRMS the wrong answer. It caught me too. All values beyond in_arbeit/freigegeben are TERMINAL or pre-release and change no behaviour: every consumer treats only in_arbeit and freigegeben as running (golden-shift ACTIVE_STATUSES, run-builder order-tracker, it-evaluator recipe-band-resolver).

## core 5.0.0 (0.6.0, owner 12.10.2026: "wir machen b)") — status in the B2MML RequestState vocabulary

The profile is bound again: the demo plant's ERP source `sites/werk1/sources/rest/erp-customer-orders.json` delivers it (the tombstone text
above is history). Its `status` left our own German list (offen, freigegeben, in_arbeit, fertig, abgeschlossen) — sim-v5 also sends
`storniert`, so 31k of 128k orders were invalid against the profile — for the RequestState vocabulary of MESA B2MML, the XML implementation
of IEC 62264 (`B2MML-Common.xsd`, `xsd:simpleType RequestState1Type`, B2MML @65cc665): Forecast, Released, Waiting, Cancelled, Ready, Running,
Completed, Aborted, Held, Suspended, Closed, Other. The profile stays an Extension at Level 4 (a sales order is above the MOM boundary; B2MML
0700 has no SalesOrder object); the vocabulary is the one of the OperationsRequest the order triggers. A source maps its own values with the
column's `valueMap`; the demo plant maps offen → Waiting, freigegeben → Released, in_arbeit → Running, fertig → Completed,
abgeschlossen → Closed, storniert → Cancelled. A breaking change (the values change, readers of status must follow): core 5.0.0, standard
6.0.0, the move record `customer-order-status`.

## isa95 › note

Level-4 sales order (B2MML/ERP, above the MOM boundary). Triggers a Level-3 OperationsRequest (ProductionOrder); ISA-95 has no edge for that, the reference is kept as a value. due_date = customer delivery commitment, not the production EndTime. Since core 5.0.0 status speaks B2MML's RequestState (RequestState1Type), the vocabulary of the OperationsRequest the order triggers.

## constraints › customer_order_overdue (core 5.0.4, 0.6.6, owner 16.10.2026 via opt-cc: variant (a), "honest and loud")
An open customer order is past its due date: the delivery commitment to the customer is missed. Open = the B2MML RequestState values before
an end state (B2MML-Common.xsd RequestState1Type): Released, Waiting, Ready, Running, Held, Suspended — not Forecast (not yet committed), not
Completed / Closed / Cancelled / Aborted (end states). due_date is the ERP's customer commitment, not an ISA-95 term (this profile is an ISA-95
extension, Level 4 above the MOM boundary). It follows the retired rule retired:order_overdue@2026-07-12, whose guard (status 'offen') could no
longer be true after the RequestState move of core 5.0.0; the name order_overdue is not reused. No tolerance band (owner: variant a).
Measured before it was proposed (ERP sim, full population, read only, 16.10.2026): of 13.998 open orders 8.858 (63 %) were past the due date —
the first check raises about that many warnings at once (ping the owner before the core move).

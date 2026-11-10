# IT events and the ISA-95 Part 5 verbs

Audit AUDIT-ISA95-2018 (13.10.2026) finding L4, closed with core 6.0.0. The repository claims no conformance to ISA-95 Part 5/6; this table says
how its record events correspond to the B2MML transaction verbs (B2MML 0701 `B2MML-Common.xsd`, Trans*Type), so a reader of the hub can map them.

| record event (IT source → hub) | ISA-95 Part 5 / B2MML verb | action code |
|---|---|---|
| `created` — a row the source did not have before | `SYNC` | `Add` |
| `updated` — a row the source has, with a changed value | `SYNC` | `Change` |
| `deleted` — a row the source no longer has | `SYNC` | `Delete` |
| an answer to a request (not sent by the IT sources today) | `ACKNOWLEDGE` / `CONFIRM` / `RESPOND` | `Accepted`, `Modified`, `Rejected` (RESPOND also `Replaced`) |

A payload may carry `b2m { verb, actionCode }` (standard/payloads/envelope.schema.json); a SYNC row carries the action code of its event.

# SMProfile-CustomerOrder: the retirement record

Moved out of standard/profiles/operations/customer-order.json in core 2.0.0 (F13: the profile keeps a short reason and points here). Nothing of it was changed.

## The profile

Retired 2026-08-13 (retired:SMProfile-CustomerOrder@2026-08-13, by CAPT-ORDER).

RETIRED — the entity was a DUPLICATE OF SMProfile-ProductionOrder, not a level above it.

(1) THE UPSTREAM SERVES ONE ROW, TWICE. Measured 2026-08-13 against the reference simulator, read-only: GET /api/orders and GET /api/customer-orders with the SAME query string (?exclude_status=CANCELLED,INVOICED,SHIPPED&limit=500) return BYTE-IDENTICAL bodies — identical md5 adbe865d603f1e27c562ae6054befb24, 665.809 bytes, 43 fields each, 500 rows each, identical key sets, and field-by-field across all 500 keys ZERO of the 43 fields differ. On every row the four id fields order_id, auftrag_nr, kundenauftrag_nr and production_order_no carry the SAME STRING. There is no field anywhere in the upstream that is a distinct customer-order number. This profile's identity (order_no <- kundenauftrag_nr) and SMProfile-ProductionOrder's identity (production_order_no) were therefore the same key wearing two names.

(2) WHAT THAT COST IN THE GRAPH, measured on the reference installation the same day. 48.486 nodes carry BOTH :CustomerOrder and :ProductionOrder — that is 100 % of :CustomerOrder; :CustomerOrder WITHOUT :ProductionOrder is 0, which is also why withdrawing this profile orphans nothing. TRIGGERS is 48.485 edges of which 48.485 are SELF-LOOPS and 0 join two distinct nodes: the L4->L3 chain 'customer demand triggers a manufacturing order' pointed every order at itself. The reverse edge TRIGGERED_BY has 0 edges and is removed from SMProfile-ProductionOrder in the same change. In the audit log the same duplication is 330.495 business_events under source erp-customer-orders over 46.031 distinct entity ids, of which 46.031 — every single one — are ALSO carried under erp-production-orders.

(3) THE MECHANISM WAS THIS FILE PLUS ITS SOURCE, NOT A SECOND WRITER. it-edge's buildKgSnapshot (services/it-edge/src/kg-snapshot.ts) emits one main object keyed on the source's idProperty and one STUB per declared edge, typed by the profile's relationship target. sites/werk1/sources/rest/erp-customer-orders.json declared idProperty=kundenauftrag_nr and TRIGGERS(fkColumn=production_order_no, target ProductionOrder). Because those two columns hold the same string, every poll emitted {element_id: X, entity_type: 'CustomerOrder'} AND {element_id: X, entity_type: 'ProductionOrder'} plus a relationship X->X. kg-builder MERGEs on (id, owner) and SETs the label afterwards, so the two objects landed on ONE node wearing both labels. The duplication was self-inflicted by one declaration.

(4) WHY NOT TYPE-SCOPE THE ID INSTEAD. Namespacing the CustomerOrder id would have invented a distinction the data does not have: it would turn 48.486 visibly-conflicted nodes into ~46.031 pairs of content-identical nodes — an invisible duplication is worse than a visible conflict. The only option that establishes a real L4/L3 separation is for sim-v5 to serve genuine, separately-keyed customer orders; that is a data-model project against the live sim and is filed as a backlog item, not a fix.

(5) THE FILE STAYS. Its constraint order_overdue is a tombstone with 2.712 episodes still open in the KG, and discrepancy-engine resolves those episodes by constraint_defined_in='SMProfile-CustomerOrder'. Deleting the profile would make 2.712 standing findings unexplainable. The profile is retired, not deleted: nothing binds it (its source is withdrawn and erp-customer-orders is removed from it-edge SOURCE_IDS), so no :CustomerOrder node and no FOR_CUSTOMER/TRIGGERS edge can be created from it again.

(6) WHERE THE ATTRIBUTES WENT. order_no, customer_ref, customer_name, total_amount, currency, due_date and quantity are adopted by SMProfile-ProductionOrder v3.0.0 from the SAME upstream columns (kundenauftrag_nr, kunde_id, kunde_name, gesamtbetrag, waehrung, lieferdatum_soll, geplante_stueckzahl) via sites/werk1/sources/rest/erp-production-orders.json v3.0.0, together with FOR_CUSTOMER and FOR_ARTICLE. This profile was the SOLE writer of customer_name (48.486 nodes) and of order_no on order entities, which is why the adoption is a precondition of the withdrawal and not a follow-up. unit_price is NOT adopted: it is declared here but /api/orders serves no such field and it is set on 0 nodes live, so the it-evaluator's quantity x unit_price fallback for total_amount has never once fired.

### Evidence

```json
{
  "measuredAt": "2026-08-13",
  "measuredAgainst": "the reference simulator (read-only) + Neo4j of the reference installation + central-ts business_events",
  "upstream": {
    "endpointA": "/api/orders?exclude_status=CANCELLED,INVOICED,SHIPPED&limit=500",
    "endpointB": "/api/customer-orders?exclude_status=CANCELLED,INVOICED,SHIPPED&limit=500",
    "bytes": 665809,
    "md5": "adbe865d603f1e27c562ae6054befb24",
    "fieldsEach": 43,
    "rowsEach": 500,
    "fieldsDifferingAcrossAll500Keys": 0,
    "rowsWhereTheFourIdFieldsDisagree": 0,
    "idFieldsCarryingTheSameValue": [
      "order_id",
      "auftrag_nr",
      "kundenauftrag_nr",
      "production_order_no"
    ],
    "distinctCustomerOrderNumberField": null
  },
  "graph": {
    "customerOrderNodes": 48486,
    "alsoProductionOrder": 48486,
    "customerOrderWithoutProductionOrder": 0,
    "triggersEdges": 48485,
    "triggersSelfLoops": 48485,
    "triggersBetweenTwoNodes": 0,
    "triggeredByEdges": 0,
    "forCustomerEdges": 26295,
    "forArticleEdgesFromCustomerOrder": 48490,
    "soleWriterOf": {
      "customer_name": 48486,
      "customer_ref": 48486,
      "due_date": 48486,
      "currency": 47429,
      "total_amount": 46271
    },
    "entityTypeConflictStampedTrue": 1368,
    "entityTypeConflictStampedFalse": 26584,
    "entityTypeConflictNeverStamped": 20534
  },
  "auditLog": {
    "table": "central-ts backend_v4.business_events",
    "erpCustomerOrdersRows": 330495,
    "erpCustomerOrdersDistinctIds": 46031,
    "erpProductionOrdersRows": 762688,
    "erpProductionOrdersDistinctIds": 46033,
    "idOverlap": 46031
  }
}
```

## The rule order_overdue

Retired 2026-07-12 (retired:order_overdue@2026-07-12, by CAPT-INTEGRATE).

RETIRED. The guard is structurally unsatisfiable: `when: status eq 'offen'` keys on a value this attribute CANNOT carry. Measured 2026-07-12 against the FULL population of the reference simulator — all 47.513 customer orders, paginated (the endpoint caps a page at 500; a page is not a population).

(1) 'offen' DOES NOT EXIST. The ERP carries exactly five raw statuses — CANCELLED 21.676, INVOICED 19.827, IN_PRODUCTION 4.305, WAITING_PARTS 1.687, ON_HOLD 18 — and the projection maps them onto storniert / abgeschlossen / in_arbeit / freigegeben / freigegeben. 'offen' is emitted only for raw DRAFT|PROPOSED|PLANNED, and there is NOT ONE such row among all 47.513 (0,00 %). Our source binding (?exclude_status=CANCELLED,INVOICED,SHIPPED) narrows this further: 6.010 orders reach the profile and they carry exactly TWO values, in_arbeit and freigegeben. The guard therefore matches 0 of 6.010 — not 'rarely', but never, and not by accident of today's data: the raw state it needs does not exist in the system at all.

(2) IT HAS BEEN SILENT FOR SIX DAYS, AND THAT LOOKED LIKE HEALTH. Measured in the KG of the reference installation: the newest order_overdue episode was raised 2026-07-06T10:02:21Z. Nothing since. It left 2.712 episodes standing open — raised under an EARLIER vocabulary, before the source began emitting the German canonical set — and those 2.712 have been sitting in the worklist as if they were live findings. A rule that cannot fire is indistinguishable from a factory with no overdue orders. That is the whole defect: a sleeping watchdog and a healthy factory look exactly the same from the outside.

(3) WHY IT WAS NOT SIMPLY REPAIRED. Swapping the literal to 'freigegeben'/'in_arbeit' would not restore the INTENT. The intent is 'an order that is still OPEN and past its promised date'. Both surviving values ARE open states, so the guard would degenerate to 'every order we can see', and the rule would then rest entirely on due_date >= $now. Whether that is a real promise is exactly what is NOT established: the ERP time axis is under repair (CAPT-ERP-TIME: 34.036 operations / 26 % end BEFORE their planned start, a backfill artifact). Re-pointing a dead guard at an unverified date field would convert 2.712 silent phantoms into a loud, continuously-firing lie. A quieter lie is not a truer one.

NOTE ON THE GUARD THAT SHOULD HAVE CAUGHT THIS: ci/lint-vocabulary.mjs checks guard literals against attributes[].enum. Until this same change, customer-order.status DECLARED an enum containing 'offen' (inherited from feat/ci-vocabulary-gate, which derived the enum from the projection's SOURCE CODE rather than from the data). Against that fictional enum the gate PASSED this guard — the vocabulary gate was fake-green on its own flagship case. The enum is corrected in this same commit. A gate is only as honest as the vocabulary it checks against.

### Note

TOMBSTONE — the when/require below are the rule EXACTLY as it ran until 2026-07-12, kept so the 2.712 episodes it left open remain explainable. retired:true means the engine loads it, refuses to evaluate it, and supersedes every open episode with superseded_by=retirementId. Do NOT delete: the history is the evidence. Open customer order past its due date (delivery delay against the customer commitment).

### Evidence

```json
{
  "measuredAt": "2026-07-12",
  "measuredAgainst": "the reference simulator /api/customer-orders (read-only, full pagination) + Neo4j KG of the reference installation",
  "guard": {
    "declared": "status eq 'offen'",
    "literalOccursInFullErp": 0,
    "populationScanned": 47513,
    "rowsReachingProfile": 6010,
    "deliverableValues": [
      "in_arbeit",
      "freigegeben"
    ],
    "rowsEverMatched": 0
  },
  "rawStatusHistogramFullErp": {
    "CANCELLED": 21676,
    "INVOICED": 19827,
    "IN_PRODUCTION": 4305,
    "WAITING_PARTS": 1687,
    "ON_HOLD": 18
  },
  "openEpisodesAtRetirement": 2712,
  "resolvedEpisodes": 4816,
  "lastEpisodeRaisedAt": "2026-07-06T10:02:21.246Z",
  "daysSilentAtRetirement": 6
}
```

# KG Schema Guide — Auto-Build the Knowledge Graph from JSON Schemas

The Knowledge Graph is built automatically from JSON schemas in this repository.
No LLM is needed — the schemas are the single source of truth.

## Directory Structure

<!-- gen:tree:begin -->
```
osf-schemas/
├── backup/                 ARCHIVED (v3-era postgresql sources, mqtt/kafka/webhook/manual/bridge syncs; it-fleet) — reference only, loaded by nothing (327 json)
├── branding/               brand/theme assets (1 json)
├── ci/                     linters + generators (lint-*.mjs, gen-contract.mjs, gen-docs.mjs)
├── companion-specs/        OPC-UA Companion-Spec registry (NodeSet2.xml URLs) (1 json)
├── cross-constraints/      cross-profile discrepancy constraints (PLAN vs IST rules) (4 json)
├── docs/                   conventions, next2.0 standard, agent-conformance, variable shapes
├── examples/               demo fixtures — NOT canonical (see examples/README.md) (5 json)
├── flows/                  Node-RED flow templates (OPC-UA → UNS standard flow) (1 json)
├── historians/             historian-sink templates + instances (OUTPUT: UNS → customer DB)
│   ├── central-ts-tables/       (2 json)
│   ├── grafana-dashboards/      (4 json)
│   ├── influxdb/                (1 json)
│   ├── instances/               (4 json)
│   ├── mssql/                   (1 json)
│   ├── nats-jetstream/          (1 json)
│   ├── postgresql/              (1 json)
│   ├── postgresql-cagg/         (1 json)
│   ├── postgresql-pivot/        (1 json)
│   └── views/                   (1 json)
├── kpis/                   KPI definitions — inputs drawn from the source-fed vocabulary (lint-kpis) (6 json)
├── mappings/               protocol canon: DataItem/tag → SM attribute (SSOT for discovery + gen-flows) (2 json)
├── profiles/               Schema 1: SM Profiles (type system)
│   ├── equipment/              EquipmentClass, EquipmentModel (compact), Tool (3 json)
│   ├── erp/                    Article, Customer(-Order), ProductionOrder, ProductDefinition, OperationsResponse (6 json)
│   ├── intelligence/           multi-truth layer: Discrepancy, ResolutionProposal, AutoResolveRule, … (4 json)
│   ├── machines/               Machine (abstract parent), CNC_Machine, InjectionMoldingMachine (3 json)
│   ├── operations/             ISA-95 Part 4: OperationsDefinition, ProcessSegment, Segment{Requirement,Response}, Workorder (5 json)
│   ├── qms/                    InspectionLot, SPCAnalysis (2 json)
│   └── wms/                    MaterialLot, Quant, StorageLocation (3 json)
├── recipes/                GitHub-managed recipe master data (see recipes/README.md) (3 json)
├── sources/                Schema 2: Data Sources (instance binding)
│   ├── mtconnect/              MTConnect agent mappings (2 json)
│   ├── opcua/                  OPC-UA endpoint → machine mappings (11 json)
│   └── rest/                   sim-v5 REST polling (ERP/QMS/WMS projections) (9 json)
├── sync/                   Schema 3: Live Sync (transport layer)
│   ├── nats/                   NATS subjects + JetStream stream declarations (suite hub) (2 json)
│   ├── opcua-server/           Sonder-Edge re-publish (MTConnect → embedded OPC-UA server) (1 json)
│   └── polling/                REST polling schedule (1 json)
├── unit-conversions/       UNECE unit table (discovery-time scale/offset lookup) (1 json)
├── validation/             ajv meta-schemas (per-file shape validation) (17 json)
├── CLAUDE.md               agent instructions
├── contract.json           GENERATED ontology contract (gen-contract.mjs) — agents read this FIRST
├── README.md               this overview
└── schema-guide.md         the full schema documentation
```
<!-- gen:tree:end -->

## Counts

Verbindlich sind die Linter-Zahlen (`npm run validate` → lint-refs meldet
`N profiles, M sources, K sync files`) — und die Tabelle hier wird von
`ci/gen-docs.mjs` aus demselben Tree **generiert** (`npm run gen:docs`;
`npm run validate:docs` wird rot, wenn sie von einem frischen Render abweicht —
eine Doku-Zahl, die niemand nachrechnet, ist eine Lüge mit Veröffentlichungsdatum).
Alles aus der v3-Ära (PostgreSQL-Sources, MQTT-UNS-/Kafka-/Webhook-Syncs) liegt in
`backup/pre-next2.0/` und wird von keinem Service mehr geladen.

<!-- gen:counts:begin -->
| Category | Count | Files |
|---|---|---|
| Profiles | 26 | equipment 3 · erp 6 · intelligence 4 · machines 3 · operations 5 · qms 2 · wms 3 |
| Sources — mtconnect | 2 | mtconnect-cnc-01, mtconnect-cnc-mtc-02 |
| Sources — opcua | 11 | opcua-cnc-001-event, opcua-cnc-001-telemetry, opcua-cnc-002-event, opcua-cnc-002-telemetry, opcua-mtbridge-cnc-01, opcua-sgm-001-event, opcua-sgm-001-telemetry, opcua-sgm-004-processdata, opcua-sgm-005-processdata, opcua-sgm-006-bde, opcua-sgm-006-processdata |
| Sources — rest | 9 | erp-customer-orders, erp-operations-response, erp-production-orders, erp-segment-requirements, erp-segment-responses, sim-v5-erp-articles, sim-v5-erp-customers, sim-v5-qms-inspections, sim-v5-wms-quants |
| Sync — nats | 2 | jetstream-streams, opcua-to-nats-cnc-mtc-01 |
| Sync — opcua-server | 1 | mtconnect-to-opcua-cnc-mtc-01 |
| Sync — polling | 1 | sim-v5-poll |
| Recipes | 3 (2 parked) | recipe-sgm-004-default, recipe-sgm-004-pa66gf30-bracket-b *(parked)*, recipe-sgm-004-pa66gf30-housing-a *(parked)* |
| KPIs | 6 (2 parked) | availability, energy-per-part *(parked)*, oee, performance *(parked)*, quality-rate, scrap-rate |

Measured from the tree by `ci/gen-docs.mjs` — the same sums `npm run validate:refs` prints (`lint-refs: 26 profiles, 22 sources, 4 sync files`).
<!-- gen:counts:end -->

---

## Historians (`historians/<db>/<template>.json`)

Templates für Historian-Sinks. i3X liefert den Historian **nicht** mit —
der Kunde bringt Postgres/Timescale, MSSQL oder InfluxDB. Diese Templates
sagen dem Node-RED-Flow-Generator, welche `node-red-contrib-*`-Node
benutzt werden muss und wie Verbindung / Tabelle / Insert-Strategie
konfiguriert sind.

**Richtung:** OUTPUT (UNS-Event → Historian-Write). Unterschied zu
`sync/polling/` (das ist INPUT aus einer Kunden-DB).

**Unterstützt:**
- `historians/postgresql/historian-template.json` — `node-red-contrib-postgresql`, optional Timescale-Hypertable + Compression + Retention.
- `historians/mssql/historian-template.json` — `node-red-contrib-mssql-plus`.
- `historians/influxdb/historian-template.json` — `node-red-contrib-influxdb` 2.x, Measurement pro Domain.
- `historians/nats-jetstream/historian-template.json` (v3, additive) — `@i3x/nr-nats` durable consumer auf einem JetStream-Stream → Postgres-Insert in dieselbe `uns_history`-Tabelle. Wird verwendet wenn die Source `transport: ['nats']` setzt; bei `['mqtt','nats']` läuft der MQTT-Historian-Pfad parallel.

Daneben liegen unter `historians/` keine Templates, sondern konkrete Artefakte:
`instances/` (deklarierte Historian-Instanzen edge/central), `central-ts-tables/`
(Central-Timescale-Tabellendefinitionen), `postgresql-cagg/` (Continuous
Aggregates), `postgresql-pivot/` (Pivot-Routing), `views/` und
`grafana-dashboards/`. Die vollständige, generierte Verzeichnisliste steht im
Tree oben.

Template-Shape gemeinsam:
- `nodeRedContrib` — welches contrib-Paket
- `connection` — Env-Interpolation (`${HISTORIAN_*}`)
- `tableStructure` / `pointStructure` — Spalten oder Tags/Fields
- `insertStrategy` — Batch-Größe + Interval + Conflict-Handling
- `subscribeFilters` — welche UNS-Topics bedient werden

---

## Companion-Spec-Registry (`companion-specs/index.json`)

Flat registry of OPC-UA Companion-Spec NodeSet2.xml download URLs.
Referenced by `companionSpec` field on SM-Profiles so the discovery
pipeline can fetch the authoritative NodeSet on demand.

**File:** `companion-specs/index.json`

```json
{
  "version": "1.0.0",
  "updated": "2026-04-16",
  "specs": {
    "<specName>": {
      "url": "https://raw.githubusercontent.com/OPCFoundation/UA-Nodeset/latest/<path>",
      "category": "machines | enterprise | lab | identification | weighing",
      "description": "Human-readable description"
    }
  }
}
```

i3X reads this at server startup from `${SCHEMA_LOCAL_PATH}/companion-specs/index.json`
and flattens it to a `Record<specName, url>`. If the file is missing, the
companion-spec feature disables itself (no hardcoded fallback in code).

---

## Protokoll-Kanon (`mappings/`)

Wie ein Protokoll-Tag auf ein kanonisches SM-Attribut projiziert. Hier liegt die
SSOT für die Projektion — **kein Consumer führt seine eigene Kopie der Tabelle**.

**File:** `mappings/mtconnect-dataitem-map.json`

Keyed auf den DataItem-id-**Suffix** (id minus Device-Prefix, z. B.
`cnc-03-spindle-speed` → `-spindle-speed`), damit eine Tabelle jedes MTConnect-Gerät
bedient. Consumer matchen den **längsten** Suffix zuerst (`-tool-life` vor `-tool`).
Ein Suffix darf mehrere Attribute treiben: das EXECUTION-DataItem liefert drei.

Gelesen von `discovery` (`${OSF_SCHEMAS_PATH}/mappings/…`, mtconnect-Probe) und vom
gen-flows-Exporter. `ci/lint-mtconnect-canon.mjs` (`npm run validate:mtconnect`)
prüft gegen das Profil und gegen jede `sources/mtconnect/*.json`:

- `dataType` des Kanons == `dataType` des Attributs auf `profileRef`
- `valueMap`-Werte passen zum eigenen `dataType`
- jede committete Source stimmt Feld für Feld mit dem Kanon überein
- eine Source, die einen Suffix mappt, emittiert **alle** Attribute, die der Kanon daraus ableitet

Warum: `Act_Status_Machine` stand in discovery hartcodiert als `Int32`/`{ACTIVE:1}`,
während das CNC-Profil längst `String`/`{ACTIVE:"RUNNING"}` sagte. Nichts wurde rot,
weil kein Linter beide verglichen hat (Audit 2026-07-08).

---

## Schema 1: SM Profile

Defines **what types of nodes exist** — their label, ID property, attributes, relationships, and inheritance.

**File:** `profiles/<domain>/<type>.json`

```json
{
  "profileId": "SMProfile-CNC-Machine",
  "version": "1.2.0",
  "standard": "CESMII",
  "displayName": "CNC Machine",
  "parentType": "Machine",
  "abstract": false,
  "attributes": [],
  "relationships": [],
  "kgNodeLabel": "CNC_Machine",
  "kgIdProperty": "machine_id"
}
```

### Key fields

| Field | Purpose |
|-------|---------|
| `kgNodeLabel` | Neo4j label for this node type (e.g. `CNC_Machine`) |
| `kgIdProperty` | Property used as unique ID (e.g. `machine_id`) |
| `parentType` | Parent profile — resolved by `profileId` or `kgNodeLabel` |
| `abstract` | If `true`, skip index creation (parent-only, no direct instances) |
| `attributes` | Array of `{ name, dataType, unit?, category, description?, enum? }` |
| `relationships` | Array of `{ type, target, description? }` |

### `enum` — the vocabulary is part of the contract (enforced)

If an attribute has a finite value range, **declare it**: `"enum": ["OPEN", "CANCELLED", …]`.
This is not decoration. `ci/lint-vocabulary.mjs` (in `npm run validate`, hard gate) refuses
any `eq` / `ne` / `in` guard whose literal is not drawn from a declared vocabulary:

* **Fail-closed.** A `String` attribute compared to a literal **must** declare `enum`, or CI is red.
  No vocabulary → the literal cannot be verified → we do not guess.
* **The literal must be a member** — with a *did-you-mean* hint and the real value list in the message.
* **The declaration is itself checked against the sources.** If a source pins the attribute
  (`{ "const": "fertig" }`, or a `valueMap` with a `"*"` default), the deliverable set is known
  from the SSOT alone: a guard literal outside it is proven dead *offline*, and an `enum` that
  declares an undeliverable value is proven fictional.
* **Recipes:** `match.equipment` must be a machine id declared in `sources/**` (closed set).

**Measure the vocabulary — never write down what you assume.** Measure it at the boundary the
pipeline actually consumes (the source projection), *not* in the database behind it: on 2026-07-12
`erp.orders.status` held `IN_PRODUCTION`/`WAITING_PARTS`, while the REST projection the edge polls
emits `in_arbeit`/`freigegeben`. Linting against the DB dialect would have flagged the **correct**
value as dead. And prefer the projection's **code** over a data snapshot — a snapshot of a live
system is only a lower bound on what the attribute can hold.

`ci/check-vocab-drift.mjs` (nightly, needs the plant network) then holds every declared `enum`
against the real source, pages it to exhaustion, and fails when reality delivers a value the SSOT
does not know. It also reports **zombie guards** (a legal literal that currently matches no row)
and **dead recipes** (`match.article` not in the article master) — loudly, without failing the
build, because absence of rows is not proof of impossibility.

*Why all this: a guard whose literal never occurs filters **nothing** and stays silent. On
2026-07-12 `qty_shortfall`'s `status ne "offen"` — against an attribute pinned to the constant
`"fertig"` — produced 11.196 phantom findings and 1,7 Mio € of phantom impact. The comment above it
described the intention perfectly. Read the `WHERE`, not the `--`.*

### Inheritance

When `parentType` is set, the KG Builder merges at load time:

1. **Attributes**: parent attributes prepended to child. Child overrides on name collision.
2. **Relationships**: parent relationships prepended to child. Child overrides on `type+target` collision.
3. **Multi-level**: grandparent → parent → child works (resolved depth-first).
4. **Cycles**: detected and broken silently (partial inheritance).

**Example:** `CNC_Machine` has `parentType: "Machine"`. `Machine` is a **thin abstract parent** — it carries the identity (`machine_id`) and 3 relationships (`EXECUTES`, `PART_OF`, `PRODUCES`) and **zero attributes of its own**. After inheritance, `CNC_Machine` keeps its own attribute set and gains the 3 Machine relationships plus the `:Machine` parent label.

### What the builder does

```cypher
-- Phase 1: Create range index (skipped for abstract profiles)
CREATE INDEX IF NOT EXISTS FOR (n:CNC_Machine) ON (n.machine_id)

-- Phase 2d: Apply parent labels
MATCH (n:CNC_Machine) SET n:Machine
```

---

## Schema 2: Source Schema

Defines **where to load instance data from** — which database/endpoint, how fields map to node properties, and how to create edges.

### REST Source (business entities)

**File:** `sources/rest/<source-id>.json` — the ONLY active path for ERP/QMS/WMS
entities: the sim-v5 REST projections, polled per `sync/polling/sim-v5-poll.json`.
Direct-PostgreSQL sources are a v3-era pattern — archived under
`backup/pre-next2.0/sources/`, loaded by nothing.

Shortened from the real `sources/rest/erp-production-orders.json`:

```json
{
  "sourceId": "erp-production-orders",
  "sourceType": "rest",
  "syncType": "polling",
  "profileRef": "SMProfile-ProductionOrder",
  "transport": ["nats"],
  "connection": {
    "baseUrl": "http://192.168.178.154:38260",
    "path": "/api/orders?exclude_status=CANCELLED,INVOICED,SHIPPED",
    "method": "GET"
  },
  "response": { "format": "json", "rootPath": "$", "idProperty": "production_order_no" },
  "polling": { "changeDetection": "full_refresh", "intervalMs": 60000 },
  "columnMappings": [
    { "column": "production_order_no", "smAttribute": "production_order_no", "isId": true },
    { "column": "article_no", "smAttribute": "article_ref" },
    { "column": "machine_no", "smAttribute": "machine_ref" }
  ],
  "edges": [
    { "type": "PRODUCES", "fkColumn": "article_no", "targetIdProp": "article_no" },
    { "type": "EXECUTED_AT", "fkColumn": "machine_no", "targetIdProp": "machine_id" }
  ]
}
```

### OPC-UA Source (machines)

**File:** `sources/opcua/<machine-id>-<category>.json`

Shortened from the real `sources/opcua/opcua-sgm-004-processdata.json`:

```json
{
  "sourceId": "opcua-sgm-004-processdata",
  "sourceType": "opcua",
  "syncType": "streaming",
  "transport": ["nats"],
  "profileRef": "SMProfile-InjectionMoldingMachine",
  "connection": { "endpoint": "opc.tcp://192.168.178.154:36063" },
  "machineId": "sgm-004",
  "location": { "enterprise": "factory", "site": "werk1", "area": "sgm", "line": "line-a", "type": "SGM" },
  "nodeMappings": [
    { "opcuaNodeId": "ns=1;s=Machine/status", "smAttribute": "status", "dataType": "String" },
    { "opcuaNodeId": "ns=1;s=Machine/partsCount/good", "smAttribute": "good", "dataType": "Float64" }
  ]
}
```

### Key concepts

**`columnMappings` / `nodeMappings`**: source field → `smAttribute` (KG node property). `isId: true` marks the identity column. Every mapped `smAttribute` MUST exist in the referenced profile — `ci/lint-refs.mjs` (E4) enforces it, and `ci/lint-mtconnect-canon.mjs` holds MTConnect sources against the protocol canon in `mappings/`.

**`edges`**: `fkColumn` → `targetIdProp`. The builder resolves `targetIdProp` to ALL profile labels sharing that `kgIdProperty` (polymorphic resolution).

**`targetIdProp` example:** `"machine_id"` resolves to every label whose `kgIdProperty` is `machine_id` — see the generated *Common `targetIdProp` Values* table below. Add a new machine type with the same key and every existing edge finds it, no source change needed.

**Environment variables:** `"${HISTORIAN_HOST}"`-style values are replaced at load time from `process.env`.

---

## Schema 3: Sync Schema

Defines **how to keep the KG updated** in real-time or near-real-time.

### Supported sync types

| syncType | Transport | Status |
|----------|-----------|--------|
| `nats` / `nats-jetstream` | NATS subjects + JetStream streams (suite hub) | **Active** — the OT transport |
| `polling` | REST periodic query (sim-v5) | **Active** — `sim-v5-poll` |
| `bridge` / opcua-server | MTConnect → embedded OPC-UA re-publish (Sonder-Edge) | **Active** — `mtconnect-to-opcua-cnc-mtc-01` |
| `mqtt`, `kafka`, `rest-webhook`, `manual` | v3-era UNS ingestion | **Archived** → `backup/pre-next2.0/sync/` (referenced deleted profiles/sources; see lint-refs) |

### Polling Sync

**File:** `sync/polling/<sync-id>.json` — every `sourceRef` MUST resolve to a
`sourceId` in `sources/` and its `changeDetection` should match the source's
own `polling` contract (`npm run validate:refs` enforces the reference).

```json
{
  "syncId": "sim-v5-poll",
  "syncType": "polling",
  "pollIntervalMs": 30000,
  "sources": [
    { "sourceRef": "sim-v5-erp-articles", "changeDetection": "full_refresh", "refreshIntervalMs": 300000 },
    { "sourceRef": "erp-production-orders", "changeDetection": "full_refresh", "refreshIntervalMs": 60000 }
  ]
}
```

### NATS / JetStream Sync

**Files:** `sync/nats/<sync-id>.json` — two layers:

- `syncType: "nats"` — subject mapping for one OPC-UA→NATS republish
  (`opcua-to-nats-cnc-mtc-01`). Edge IPCs run a NATS Leaf Node which forwards
  subjects to the central cluster.
- `syncType: "nats-jetstream"` — `jetstream-streams.json`, the SSOT for stream
  names, subject filters and the edge→hub source topology. Consumed by
  `provision-jetstream.sh` (idempotent create/update), by nr-codegen (resolves
  the publish-target stream per delivery class) and by the nats-bridge
  consumers. No stream name is hardcoded in code.

Real shape (shortened from `sync/nats/jetstream-streams.json` — the edge tier
buffers durably in `EDGE_EXPORT`, the hub tier `FACTORY` stream sources it
cross-domain per edge):

```json
{
  "syncId": "jetstream-streams",
  "syncType": "nats-jetstream",
  "tiers": {
    "edge": {
      "streams": [
        { "name": "EDGE_EXPORT",
          "subjectsCapture": ["factory.>", "aggregate.>", "cpp.>"],
          "retention": "limits", "storage": "file", "max_age": "168h" }
      ]
    },
    "hub": {
      "streams": [
        { "name": "FACTORY",
          "subjectsCapture": ["factory.>", "cpp.>", "aggregate.>"],
          "sources": [ { "name": "EDGE_EXPORT", "perEdgeDomain": true,
                         "apiPrefixTemplate": "$JS.edge_${ipcCompact}.API" } ] },
        { "name": "UNS_ALERTS", "subjectsCapture": ["uns.alert.>"], "retention": "workqueue" },
        { "name": "UNS_ACTIONS", "subjectsCapture": ["uns.action.>"], "retention": "workqueue" },
        { "name": "BUSINESS", "subjectsCapture": ["business.>"] }
      ]
    }
  },
  "deliveryClassRouting": {
    "transactional": { "expectStream": "EDGE_EXPORT", "tier": "edge" },
    "telemetry":     { "expectStream": "EDGE_EXPORT", "tier": "edge" }
  }
}
```

**Subject rule (enforced by reality, documented in the file itself):** every
JetStream subject filter starts with a **fixed leading token** (`factory.>`,
`uns.alert.>`, `business.>`). A wildcard-leading filter such as
`*.*.*.*.*.bde.>` overlaps the JetStream API namespace `$JS.>` and NATS
deterministically **rejects** the stream with error 10052 — the former example
in this guide showed exactly that forbidden shape, and the streams it named
(`UNS_EVENTS`) never existed on the cluster.

### Archived sync types (pre-next2.0)

The v3-era MQTT-UNS subscriptions, Kafka consumers, webhook endpoints, manual
CSV imports and MQTT→Kafka bridge configs live in `backup/pre-next2.0/sync/`.
They referenced the pre-cutover profile/source catalog and are kept for
reference only — no service loads them.

---

## KG Build Pipeline

The phases below are what runs against the **active** next2.0 catalog. The
v3-era phases this guide used to list — PostgreSQL direct load (2b), MCP tools
(2c), MQTT live sync (3a), PG LISTEN/NOTIFY (3c), Kafka/Webhook/Manual (3d–f) —
died with the cutover; their configs are archived under `backup/pre-next2.0/`
and the sync table above is the authoritative list of what is active.

```
Phase 1: Type System
  → Load all SM Profiles + resolve inheritance (attributes + relationships)
  → Create range indexes on kgIdProperty per label (skip abstract)

Phase 2: Instance Nodes
  → REST sources (sources/rest/) polled per sync/polling/sim-v5-poll.json —
    UNWIND MERGE nodes, then edges (polymorphic targetIdProp resolution)
  → Machine nodes from the OPC-UA/MTConnect source registrations
    (sources/opcua/, sources/mtconnect/); live values arrive over the
    NATS/JetStream path (sync/nats/), not by direct builder pull
  → Anchor snapshots (demo fixture, see examples/README.md)

Phase 3: Parent Labels
  → MATCH (n:CNC_Machine) SET n:Machine   (for each child→parent pair)

Phase 4: Tombstone Sweep
  → Remove nodes with _lastSeen < current run timestamp

Phase 5: Embeddings
  → Generate vector embeddings for all new/changed nodes
```

---

## Common `targetIdProp` Values

<!-- gen:targetIdProp:begin -->
| targetIdProp | Resolves to label(s) | Edge rules using it |
|---|---|---|
| `analysis_id` | SPCAnalysis | — |
| `area_id` | ⚠ **none** — no profile declares this key (see `contract.json` → `unresolvedTargets`) | 1 |
| `article_no` | Article | 11 |
| `customer_no` | Customer | 1 |
| `discrepancy_id` | ConstraintDiscrepancy, Discrepancy | 3 |
| `equipment_class_id` | EquipmentClass | 1 |
| `lot_no` | InspectionLot | 1 |
| `machine_id` | CNC_Machine, InjectionMoldingMachine, Machine | 8 |
| `material_lot_no` | MaterialLot | 2 |
| `operations_definition_no` | OperationsDefinition | 2 |
| `order_no` | CustomerOrder | 1 |
| `process_cell_id` | ⚠ **none** — no profile declares this key (see `contract.json` → `unresolvedTargets`) | 1 |
| `process_segment_no` | ProcessSegment | 3 |
| `product_definition_no` | ProductDefinition | 1 |
| `production_order_no` | OperationsResponse, ProductionOrder | 8 |
| `proposal_id` | ResolutionProposal | — |
| `quant_no` | Quant | 1 |
| `rule_id` | AutoResolveRule | 2 |
| `segment_requirement_no` | SegmentRequirement | 2 |
| `segment_response_no` | SegmentResponse | 2 |
| `storage_location_id` | StorageLocation | 2 |
| `tool_id` | Tool | 1 |
| `workorder_no` | Workorder | 2 |

Derived from `contract.json` (`nodes` grouped by key property; `edges` for usage). A `targetIdProp` resolves to **every** label sharing that `kgIdProperty` — polymorphic resolution.
<!-- gen:targetIdProp:end -->

---

## Adding a New Machine Type

1. Create `profiles/machines/<type>.json` with `parentType: "Machine"` and `kgIdProperty: "machine_id"`
2. Add the machine's own attributes (the abstract `Machine` parent contributes identity + relationships — it has no attributes of its own)
3. Add OPC-UA mapping in `sources/opcua/<machine-id>-<category>.json`
4. All existing edges with `targetIdProp: "machine_id"` automatically find the new type — **no source schema changes needed**

## Adding a New ERP Entity

1. Create `profiles/erp/<entity>.json` with unique `kgNodeLabel` and `kgIdProperty`
2. Create `sources/rest/<source>.json` with `profileRef` and `columnMappings` against the sim-v5 REST projection (direct-DB `sources/postgresql/` is a v3-era pattern — archived, loaded by nothing)
3. Add `edges` if the entity references other entities (e.g. `article_no` → Article)
4. Add a `sourceRef` entry to `sync/polling/sim-v5-poll.json` for live updates (`npm run validate:refs` checks the reference)

---

## Appendix: v3 Variable Contract — `delivery` / `scope` / `promotion`

> CAPT-V3-PROFILE-PROPS — required since osf-schemas v3.

In v3 every variable in an SM Profile carries a three-property contract that
declares how its data is wired, where it is allowed to land, and what triggers
a publish. These are **required** on every attribute in
`profiles/machines/*.json` (validated by `validation/machine-profile-schema.json`)
and the business-category profiles under `profiles/{erp,operations,qms,wms}/`
(validated by `validation/business-profile-schema.json` — there is no
`profiles/business/` directory).

### `delivery` — wire class

| Value | Meaning |
|-------|---------|
| `telemetry` | Best-effort. NATS JetStream publish, sample loss on disconnect is acceptable. |
| `transactional` | JetStream Pub-Ack + Outbox-Retry. The record is never lost. |

### `scope` — destination world

| Value | Meaning |
|-------|---------|
| `edge` | Stays on the `.99` edge Timescale. **Never** reaches the `.150` central. |
| `hub` | **Must** arrive on the `.150` central (`uns_history` Postgres / KG). |

### `promotion` — emission cadence (IT == OT)

`promotion` is the single, **edge-agnostic** emission-cadence control. **The IT
edge** (business entities, `it-edge`) **and the OT edge** (machine telemetry,
`discovery`/`nr-codegen`) **read and honor `promotion` identically** — the same
`(attribute, promotion)` pair yields the same emit decision on both edges.

| Value | Meaning |
|-------|---------|
| `raw` | (OT) every OPC-UA sample, streamed to the local edge Timescale — only meaningful with `scope: edge`. (IT) carried in the payload only; not a change-trigger. |
| `aggregate` | Edge computes a 5-minute bucket — durations and counts only, **no quotas/percentages**. Not a simple-field change-trigger. |
| `on_change` | Emit when **this** attribute changes. The **only** value that contributes to the change-trigger. |
| `on_cycle_end` | Emit once per completed machine cycle (Class-B snapshot). Not a change-trigger. |
| `on_event` | Event-driven emission. Not a simple-field change-trigger. |
| `never` | **Never** causes a hub emission. Stays in the entity snapshot/payload (downstream still sees the value) but is **excluded from the change-trigger** and is never published on its own. Use for volatile server-managed timestamps (e.g. `updated_at`) that change on every read. |
| `<N>sec` | Periodic emission every **N seconds** (e.g. `5sec`, `10sec`). |
| `<N>min` | Periodic emission every **N minutes** (e.g. `1min`, `15min`). |

**Token grammar.** `promotion` is either one of the enum values above or an
interval token matching the canonical regex:

```
^[0-9]+(sec|min)$          # canonical form: Nsec / Nmin, N >= 1
```

Canonical forms are `Nsec` / `Nmin`; edges additionally tolerate the short
aliases `Ns` → `Nsec` and `Nm`/`Nmin` → `Nmin`. `0sec`/`0min` are invalid (the
regex matches a leading `0`, but the edge parser rejects N < 1).

**Change-trigger rule (the storm fix).** An entity/variable emits an `updated`
event **only if at least one of its `on_change` attributes actually changed.**
`never`/`raw`/`aggregate`/`on_cycle_end`/`on_event` attributes are diffed out of
the trigger — so a volatile `updated_at:never` that the source returns fresh on
every read no longer emits anything.

**Periodic rule.** If any attribute has an interval promotion (`<N>sec`/`<N>min`),
the entity is also emitted on a timer at the **minimum** interval among them
(per-entity for IT, per-variable for OT), carrying the current snapshot.
Created/deleted lifecycle events are unaffected.

### Rules — which combinations are valid

1. `promotion: raw` requires `scope: edge`. Raw samples are never promoted to the central.
2. The edge **cannot compute quotas or percentages** — it has no shift plan, no
   article ideal-cycle-time, no QMS quality verdict. Therefore variables such as
   `oee`, `availability_pct`, `performance`, `quality_pct` **must not exist** as
   machine output variables. Only raw durations (`runtime_5min_sec`,
   `downtime_5min_sec`, `state_*_5min_sec`) and counts (`parts_total_inc_5min`)
   are allowed as `aggregate`. OEE and friends are composed at-query-time on the
   central — they live in `kpiRefs`, never in `attributes`.
3. Business profiles (IT-Edge): by convention `scope` is always `hub` and
   `delivery` is always `transactional`. The fields are still required on every
   attribute for consistency — there is no default.
4. `aggregate` implies `scope: hub` — an edge bucket only exists to be promoted.
5. `never` keeps the value in the payload/snapshot but removes it from the
   change-trigger — it never triggers a publish by itself. Apply it to
   server-managed volatile timestamps (`updated_at`, "last change") that the
   source returns fresh on every read.

See `docs/example-variable-shapes.md` for concrete snippets.

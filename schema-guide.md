# KG Schema Guide — Auto-Build the Knowledge Graph from JSON Schemas

The Knowledge Graph is built automatically from JSON schemas in this repository.
No LLM is needed — the schemas are the single source of truth.

## Directory Structure

```
osf-schemas/
├── companion-specs/       ← OPC-UA Companion-Spec-Registry (NodeSet2.xml URLs)
├── unit-conversions/      ← UNECE-Tabelle (Discovery-Zeit-Lookup für scale/offset)
├── historians/            ← Historian-Sink-Templates (OUTPUT: UNS → Kunden-DB)
│   ├── postgresql/        ← via node-red-contrib-postgresql (Timescale-aware)
│   ├── mssql/             ← via node-red-contrib-mssql-plus
│   ├── influxdb/          ← via node-red-contrib-influxdb (2.x)
│   └── nats-jetstream/    ← via @i3x/nr-nats durable consumer (v3, additive)
├── profiles/              ← Schema 1: SM Profiles (type system)
│   ├── enterprise/        ← ISA-95 hierarchy (Enterprise, Site, Area, ProductionLine, System)
│   ├── machines/          ← Machine types (Machine*, CNC, IMM, FFS, Lathe, Milling, Mould, CNCProgram)
│   ├── erp/               ← ERP domain (Article, Order*, Customer, Supplier, BOM, Stock, Routing, ...)
│   ├── maintenance/       ← Maintenance (MaintenanceOrder, MaintenanceNotification, DowntimeRecord)
│   ├── qms/               ← Quality (InspectionLot, InspectionResult, QualityNotification, SPC, CorrectiveAction)
│   └── wms/               ← Warehouse (GoodsReceipt, TransportOrder, Quant, StorageLocation)
├── sources/               ← Schema 2: Data Sources (instance binding)
│   ├── postgresql/        ← 30 PostgreSQL table → KG node mappings
│   └── opcua/             ← 35 OPC-UA endpoint → machine node mappings
├── sync/                  ← Schema 3: Live Sync (transport layer)
│   ├── mqtt/              ← MQTT UNS subscriptions
│   ├── nats/              ← NATS subjects + JetStream stream declarations (v3)
│   ├── polling/           ← PostgreSQL polling (timestamp + full refresh)
│   ├── kafka/             ← Kafka consumer configs
│   ├── webhook/           ← REST webhook endpoints
│   ├── manual/            ← Manual CSV/JSON import configs
│   └── bridge/            ← MQTT→Kafka bridge (reference only, not executed)
└── schema-guide.md        ← This file

* = abstract parent (Machine, Order) — see Inheritance section
```

## Counts

| Category | Files | Examples |
|----------|-------|---------|
| Profiles | 45 | Machine, CNC_Machine, Article, CustomerOrder, Site, ... |
| Sources (PostgreSQL) | 30 | erpdb-articles, qmsdb-inspection-lots, wmsdb-quants, ... |
| Sources (OPC-UA) | 35 | sgm-001 through sgm-020, bz-1/2/3, ml-1/2, ... |
| Sync (MQTT) | 2 | ISA-95 Walker-Reynolds, shared UNS factory-sim-v3 |
| Sync (Polling) | 3 | erpdb-poll, qmsdb-poll, wmsdb-poll |
| Sync (Kafka) | 1 | kafka-uns-factory (10 topics) |
| Sync (Webhook) | 1 | bde-webhook |
| Sync (Manual) | 1 | csv-import |
| Bridge (ref only) | 2 | mqtt-to-kafka, shared-uns-to-kafka |
| Companion-Specs   | 1 | 12 OPC-UA Companion Specs (CNC, Machinery, Robotics, ...) |
| Historians (Postgres/Timescale) | 1 | postgres-historian-template |
| Historians (MSSQL) | 1 | mssql-historian-template |
| Historians (InfluxDB) | 1 | influxdb-historian-template |

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

### Inheritance

When `parentType` is set, the KG Builder merges at load time:

1. **Attributes**: parent attributes prepended to child. Child overrides on name collision.
2. **Relationships**: parent relationships prepended to child. Child overrides on `type+target` collision.
3. **Multi-level**: grandparent → parent → child works (resolved depth-first).
4. **Cycles**: detected and broken silently (partial inheritance).

**Example:** `CNC_Machine` has `parentType: "Machine"` and empty `attributes: []`. After inheritance, it has all 18 Machine attributes + 3 Machine relationships.

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

### PostgreSQL Source

**File:** `sources/postgresql/<source-id>.json`

```json
{
  "sourceId": "erpdb-production-orders",
  "sourceType": "postgresql",
  "profileRef": "SMProfile-ProductionOrder",
  "connection": {
    "host": "${ERP_DB_HOST}",
    "port": "${ERP_DB_PORT}",
    "database": "erpdb",
    "schema": "llm_test_v3",
    "table": "machineid_nodeid"
  },
  "columnMappings": [
    { "column": "order_no", "smAttribute": "order_no", "isId": true },
    { "column": "article_no", "smAttribute": "article_no" },
    { "column": "machine_no", "smAttribute": "machine_no" }
  ],
  "edges": [
    { "fkColumn": "machine_no", "type": "WORKS_ON", "targetIdProp": "machine_id" },
    { "fkColumn": "article_no", "type": "PRODUCES", "targetIdProp": "article_no" }
  ]
}
```

### OPC-UA Source

**File:** `sources/opcua/<machine-id>.json`

```json
{
  "sourceId": "opcua-sgm-002",
  "sourceType": "opcua",
  "profileRef": "SMProfile-InjectionMoldingMachine",
  "endpoint": "opc.tcp://192.168.178.150:4851",
  "machineId": "SGM-002",
  "machineName": "Spritzgussmaschine 2",
  "location": { "site": "Hauptwerk", "area": "Spritzgusshalle", "line": "SGM-1300" },
  "nodeMappings": [
    { "opcuaNodeId": "ns=1;s=Factory.SGM-002.BDE.Good_Parts", "smAttribute": "Parts_Good" }
  ]
}
```

### Key concepts

**`columnMappings`**: `column` → `smAttribute` (DB column → KG node property). `isId: true` marks the identity column.

**`edges`**: `fkColumn` → `targetIdProp`. The builder resolves `targetIdProp` to ALL profile labels sharing that `kgIdProperty` (polymorphic resolution).

**`targetIdProp` example:** `"machine_id"` resolves to 8+ labels:
```
InjectionMoldingMachine, CNC_Machine, Lathe, MillingMachine,
GrindingMachine, FiveAxisMillingMachine, FFS_Cell, AssemblyLine
```

**Environment variables:** `"${ERP_DB_HOST}"` is replaced at load time from `process.env`.

**Computed columns:** SQL expressions as column values: `"column": "(start_time + interval '1 hour')"`.

---

## Schema 3: Sync Schema

Defines **how to keep the KG updated** in real-time or near-real-time.

### Supported sync types

| syncType | Transport | Handler | Status |
|----------|-----------|---------|--------|
| `mqtt` | MQTT broker subscription | Implemented | Live |
| `polling` | PostgreSQL periodic query | Implemented | Live |
| `pg-notify` | PostgreSQL LISTEN/NOTIFY | Implemented | Live |
| `kafka` | Apache Kafka consumer | Schema validated, handler pending | Planned |
| `rest-webhook` | HTTP POST from external | Schema validated, handler pending | Planned |
| `manual` | CSV/JSON upload via API/UI | Schema validated, handler pending | Planned |
| `nats` | NATS pub/sub via leaf node | v3 additive — `@i3x/nr-nats` package | Active |
| `nats-jetstream` | NATS JetStream durable streams | v3 additive — declares streams + consumers | Active |

### MQTT Sync

**File:** `sync/mqtt/<sync-id>.json`

```json
{
  "syncId": "#shared.uns",
  "syncType": "mqtt",
  "broker": { "host": "${MQTT_HOST}", "port": "${MQTT_PORT}" },
  "topicStructure": {
    "pattern": "Factory/{machineId}/{workOrder}/{tool}/{category}/{attribute}",
    "segments": { "machineId": { "index": 1 }, "attribute": { "index": 5 } },
    "subscribeFilter": "#shared/uns/#"
  },
  "attributeMapping": {
    "strategy": "topic_segment",
    "mappings": [
      { "topicAttribute": "Machine_Status", "smAttribute": "Machine_Status" }
    ]
  }
}
```

### Polling Sync

**File:** `sync/polling/<sync-id>.json`

```json
{
  "syncId": "erpdb-poll",
  "syncType": "polling",
  "pollIntervalMs": 30000,
  "sources": [
    { "sourceRef": "erpdb-production-orders", "changeDetection": "timestamp", "timestampColumn": "last_updated_at" },
    { "sourceRef": "erpdb-stock", "changeDetection": "full_refresh" }
  ]
}
```

### Kafka Sync

**File:** `sync/kafka/<sync-id>.json`

```json
{
  "syncId": "Kafka_UNS",
  "syncType": "kafka",
  "kafka": {
    "bootstrapServers": "${KAFKA_BOOTSTRAP_SERVERS}",
    "consumerGroup": "osf-kg-builder",
    "topics": [
      {
        "topic": "factory.bde.events",
        "profileRef": "SMProfile-InjectionMoldingMachine",
        "keyIdProp": "machine_id",
        "payloadMapping": { "machine_id": "machine_id", "oee": "OEE" }
      }
    ]
  }
}
```

### NATS Sync (v3, additive)

**File:** `sync/nats/<sync-id>.json`

NATS subjects mirror the MQTT topic hierarchy 1:1, dot-separated instead of slash-separated. Edge IPCs run a NATS Leaf Node which forwards subjects to the central cluster — `nats.url` typically points to `nats://nats:4222` inside the IPC compose network.

```json
{
  "syncId": "isa95-uns-nats-walker-reynolds",
  "syncType": "nats",
  "nats": {
    "url": "${NATS_URL}",
    "leafNode": true
  },
  "subjectStructure": {
    "pattern": "{enterprise}.{site}.{area}.{line}.{machine}.{domain}.{attribute}",
    "separator": ".",
    "subscribeFilters": ["*.*.*.*.*.bde.*", "*.*.*.*.*.processdata.*"]
  },
  "payloadSchema": {
    "format": "JSON",
    "headers": { "I3x-Machine": "{machine}", "I3x-Domain": "{domain}" }
  }
}
```

`syncType: "nats-jetstream"` declares JetStream streams + consumer-templates that capture these subjects for durable replay. The connector's `scripts/provision-jetstream.sh` reads such files and idempotently creates/updates streams on the cluster.

```json
{
  "syncId": "jetstream-streams",
  "syncType": "nats-jetstream",
  "streams": [
    {
      "name": "UNS_EVENTS",
      "subjects": ["*.*.*.*.*.bde.>", "*.*.*.*.*.processdata.>"],
      "retention": "limits",
      "storage": "file",
      "max_age": "168h"
    }
  ]
}
```

### Bridge Configs (Reference Only)

Files in `sync/bridge/` describe MQTT→Kafka aggregation bridges. They are **not executed** by the KG Builder — they document the data flow architecture for external bridge services.

---

## KG Build Pipeline

```
Phase 1: Type System
  → Load all SM Profiles + resolve inheritance (attributes + relationships)
  → Create range indexes on kgIdProperty per label (skip abstract)

Phase 2a: OPC-UA Instance Nodes
  → MERGE machine nodes from OPC-UA mappings
  → Create ISA-95 hierarchy: Site → Area → ProductionLine → Machine (PART_OF edges)

Phase 2b: PostgreSQL Instance Nodes
  → Load sources (max 4 concurrent)
  → UNWIND MERGE nodes (batches of 1000)
  → UNWIND MERGE edges (sequential, polymorphic targetIdProp resolution)

Phase 2c: MCP Instance Nodes
  → Call MCP tools, parse JSON response, MERGE nodes + edges

Phase 2d: Parent Labels
  → MATCH (n:CNC_Machine) SET n:Machine  (for each child→parent pair)

Phase 3a: MQTT Live Sync
  → Subscribe topics, buffer 2s, SET properties on matching nodes

Phase 3b: Polling Sync
  → Periodic re-query, upsert changed rows (timestamp or full refresh)

Phase 3c: PG LISTEN/NOTIFY
  → Async notification channels → immediate node updates

Phase 3d-f: Kafka / Webhook / Manual (planned)
  → Schema validated and logged, handlers not yet implemented

Phase 4: Tombstone Sweep
  → Remove nodes with _lastSeen < current run timestamp

Phase 5: Embeddings
  → Generate vector embeddings for all new/changed nodes

Phase 6: Sensor Discovery
  → Auto-create Sensor child nodes from MQTT-tracked variables
```

---

## Common `targetIdProp` Values

| targetIdProp | Resolves to labels |
|---|---|
| `machine_id` | InjectionMoldingMachine, CNC_Machine, Lathe, MillingMachine, GrindingMachine, FiveAxisMillingMachine, FFS_Cell, AssemblyLine |
| `article_no` | Article |
| `order_no` | CustomerOrder, ProductionOrder, PurchaseOrder, MaintenanceOrder |
| `notification_no` | MaintenanceNotification, QualityNotification |
| `lot_no` | InspectionLot, MaterialLot |
| `supplier_id` | Supplier |
| `customer_id` | Customer |
| `location_key` | StorageLocation |
| `result_id` | InspectionResult |
| `ta_nr` | TransportOrder |
| `avis_nr` | GoodsReceipt |
| `quant_id` | Quant |
| `program_id` | CNCProgram |
| `mould_id` | Mould |
| `id` | Enterprise, Site, Area, ProductionLine, System |

---

## Adding a New Machine Type

1. Create `profiles/machines/<type>.json` with `parentType: "Machine"` and `kgIdProperty: "machine_id"`
2. Add only machine-specific attributes (BDE/OEE attributes inherited from Machine parent)
3. Add OPC-UA mapping in `sources/opcua/<machine-id>.json`
4. All existing edges with `targetIdProp: "machine_id"` automatically find the new type — **no source schema changes needed**

## Adding a New ERP Entity

1. Create `profiles/erp/<entity>.json` with unique `kgNodeLabel` and `kgIdProperty`
2. Create `sources/postgresql/<source>.json` with `profileRef` and `columnMappings`
3. Add `edges` if the entity references other entities (e.g. `article_no` → Article)
4. Optionally add to polling sync for live updates

---

## Appendix: v3 Variable Contract — `delivery` / `scope` / `promotion`

> CAPT-V3-PROFILE-PROPS — required since osf-schemas v3.

In v3 every variable in an SM Profile carries a three-property contract that
declares how its data is wired, where it is allowed to land, and what triggers
a publish. These are **required** on every attribute in
`profiles/machines/*.json` (validated by `validation/machine-profile-schema.json`)
and `profiles/business/*.json` (validated by `validation/business-profile-schema.json`).

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

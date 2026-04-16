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
│   └── influxdb/          ← via node-red-contrib-influxdb (2.x)
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

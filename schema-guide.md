# KG Schema Guide — Auto-Build the Knowledge Graph from JSON Schemas

The Knowledge Graph is built automatically from JSON schemas in this repository.
No LLM is needed — the schemas are the single source of truth.

## Directory Structure

```
osf-schemas/
├── profiles/           ← SM Profiles: type system (node labels, properties, idProperty)
│   ├── erp/            ← ERP domain (Article, Customer, Order, BOM, ...)
│   ├── machines/       ← Machine types (InjectionMoldingMachine, CNC_Machine, ...)
│   ├── maintenance/    ← Maintenance domain (MaintenanceOrder, DowntimeRecord, ...)
│   ├── qms/            ← Quality domain (InspectionLot, QualityNotification, ...)
│   └── wms/            ← Warehouse domain (GoodsReceipt, TransportOrder, Quant, ...)
├── sources/            ← Data sources: where to load instance data from
│   ├── postgresql/     ← PostgreSQL table → KG nodes + edges
│   └── opcua/          ← OPC-UA endpoints → machine nodes + live properties
├── sync/               ← Live sync: MQTT/polling for real-time updates
└── schema-guide.md     ← This file
```

## Schema 1: SM Profile

Defines **what types of nodes exist** — their label, ID property, attributes, and relationships.

**File:** `profiles/<domain>/<type>.json`

```json
{
  "profileId": "SMProfile-InjectionMoldingMachine",
  "version": "1.0.0",
  "displayName": "Injection Molding Machine",
  "kgNodeLabel": "InjectionMoldingMachine",
  "kgIdProperty": "machine_id",
  "attributes": [
    { "name": "Machine_Status", "dataType": "Int32", "category": "BDE" },
    { "name": "Parts_Good", "dataType": "Int32", "category": "BDE" },
    { "name": "Temp_Melting", "dataType": "Float", "unit": "°C", "category": "ProcessData" }
  ],
  "relationships": [
    { "type": "PART_OF", "target": "ProductionLine" },
    { "type": "PRODUCES", "target": "Article" }
  ]
}
```

### Key fields
- `kgNodeLabel`: The Neo4j label for this node type (e.g. `InjectionMoldingMachine`)
- `kgIdProperty`: The property used to uniquely identify nodes of this type (e.g. `machine_id`)

### What the builder does
```cypher
-- Create range index for fast MERGE lookups
CREATE INDEX IF NOT EXISTS FOR (n:InjectionMoldingMachine) ON (n.machine_id)
```

---

## Schema 2: Source Schema (PostgreSQL)

Defines **where to load instance data from** — which database table, how columns map to node properties, and how to create edges.

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
    { "column": "machine_no", "smAttribute": "machine_no" },
    { "column": "geplante_stueckzahl", "smAttribute": "planned_qty" }
  ],
  "edges": [
    { "fkColumn": "machine_no", "type": "WORKS_ON", "targetIdProp": "machine_id" },
    { "fkColumn": "article_no", "type": "PRODUCES", "targetIdProp": "article_no" }
  ]
}
```

### Key fields

#### `columnMappings`
- `column`: Database column name (or SQL expression)
- `smAttribute`: Property name on the KG node
- `isId`: true for the column that becomes the node's unique ID

#### `edges`
- `fkColumn`: Database column containing the foreign key value
- `type`: Edge label in Neo4j (e.g. `WORKS_ON`, `FOR_ARTICLE`)
- `targetIdProp`: The `kgIdProperty` of the target node type

### How `targetIdProp` works

The builder resolves `targetIdProp` to all SM Profile labels that have this property as their `kgIdProperty`. This handles polymorphic types automatically.

**Example:** `"targetIdProp": "machine_id"` resolves to:
- `InjectionMoldingMachine` (kgIdProperty: machine_id)
- `CNC_Machine` (kgIdProperty: machine_id)
- `Lathe` (kgIdProperty: machine_id)
- `MillingMachine` (kgIdProperty: machine_id)
- etc.

The builder generates:
```cypher
UNWIND $batch AS row
MATCH (a:ProductionOrder {order_no: row.fromId})
MATCH (b) WHERE (b:InjectionMoldingMachine OR b:CNC_Machine OR b:Lathe OR ...) AND b.machine_id = row.toId
MERGE (a)-[:WORKS_ON]->(b)
```

For non-polymorphic targets (e.g. `"targetIdProp": "article_no"` → only `Article`), the builder generates a simple single-label MATCH:
```cypher
MATCH (b:Article {article_no: row.toId})
```

### Adding a new machine type

1. Create a new SM Profile with `kgIdProperty: "machine_id"`
2. Add an OPC-UA mapping for the machine
3. All existing edges with `targetIdProp: "machine_id"` will automatically find the new machine type — **no source schema changes needed**

---

## Schema 3: OPC-UA Mapping

Defines **which concrete machine** maps to which SM Profile, and maps OPC-UA nodes to SM attributes.

**File:** `sources/opcua/<machine-id>.json`

```json
{
  "mappingId": "opcua-sgm-002",
  "endpoint": "opc.tcp://192.168.178.150:4851",
  "machineId": "SGM-002",
  "machineName": "Spritzgussmaschine 2",
  "profileRef": "SMProfile-InjectionMoldingMachine",
  "location": {
    "site": "Hauptwerk",
    "area": "Spritzgusshalle",
    "line": "SGM-1300"
  },
  "nodeMappings": [
    { "opcuaNodeId": "ns=1;s=Factory.SGM-002.BDE.Good_Parts", "smAttribute": "Parts_Good" },
    { "opcuaNodeId": "ns=1;s=Factory.SGM-002.ProcessData.Temp_Melting", "smAttribute": "Temp_Melting" }
  ]
}
```

---

## Schema 4: Sync Schema (MQTT / Polling)

Defines **how to keep the KG updated in real-time** via MQTT subscriptions or database polling.

**File:** `sync/<sync-id>.json`

```json
{
  "syncId": "mqtt-factory-uns",
  "syncType": "mqtt",
  "broker": { "host": "${MQTT_HOST}", "port": "${MQTT_PORT}" },
  "topic": "Factory/#",
  "payloadFormat": "json",
  "valuePath": "$.Value",
  "timestampPath": "$.timestamp"
}
```

---

## KG Build Pipeline

```
Phase 1: Type System
  → Load all SM Profiles
  → Create range indexes on kgIdProperty per label
  → MERGE machine nodes from OPC-UA mappings
  → Create ISA-95 hierarchy edges (PART_OF)

Phase 2: Instance Data
  → Load PostgreSQL sources (max 4 concurrent)
  → For each source:
    a. Query table → build BulkNode[] with idProp from profile
    b. UNWIND MERGE nodes (batches of 1000, parallel 3)
    c. Build BulkEdge[] from edge schemas (resolve targetIdProp → labels)
    d. UNWIND MERGE edges (sequential, batches of 1000)

Phase 3: Live Sync
  → Subscribe MQTT topics from sync schemas
  → On message: parse payload → SET property on matching KG node
  → Polling sources: periodic re-query → upsert changed rows

Result: A live Knowledge Graph built entirely from schemas.
```

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

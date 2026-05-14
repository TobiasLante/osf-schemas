# OSF Subject Conventions (v3)

Single source of truth for NATS subjects across the i3x v3 stack. The IT-Edges (Welle 1+2) and Telemetry-Edges (existing OT stack) **must not share subjects**; the wire-level separation is a hard rule per `feedback_telemetry_event_strict_separation.md`.

## Two worlds, one bus

| World     | Producer                           | Subject root | Payload shape           |
|-----------|------------------------------------|--------------|-------------------------|
| Telemetry | OPC-UA / OT Edges (Cap-Telemetry)  | `factory.*`  | per-attribute pulses    |
| Events    | PostgreSQL IT-Edges (Cap-IT-Edge-Base) | `business.*` | per-entity change rows  |

No IT-Edge ever publishes to `factory.*`. No Telemetry-Edge ever publishes to `business.*`.

## Telemetry subjects (existing — unchanged)

```
factory.<site>.<area>.<line>.<machine>.<category>.<attribute>
```

Defined in `sources/opcua/*.json` and the OT `#shared.uns` topic pattern. Already live in 0.4.x.

## Event subjects (NEW — IT-Edges, Welle 1)

```
business.<tenant>.<source-id>.<entity>.<event-type>.<id>
```

Components:

| Token        | Example                          | Source                                                    |
|--------------|----------------------------------|-----------------------------------------------------------|
| `tenant`     | `demo`, `kohlgrub-gmbh`          | `tenant` field in the source schema                       |
| `source-id`  | `it-erp-sap`, `it-qms`           | `sourceId` (already prefixed `it-`)                       |
| `entity`     | `production-order`, `customer`   | Lower-kebab of the SMProfile (without `SMProfile-` prefix)|
| `event-type` | `created`, `updated`, `deleted`  | Diff outcome: insert → `created`, update → `updated`, missing row → `deleted` |
| `id`         | The entity's primary-key value   | `tables[].primaryKey` after columnMap                     |

Examples:

```
business.demo.it-erp-sap.production-order.created.PO-1234
business.demo.it-erp-sap.production-order.updated.PO-1234
business.demo.it-qms.quality-record.created.QR-5678
business.demo.it-wms.stock-movement.created.SM-99001
business.demo.it-oee-montage.montage-event.created.EVT-42
```

Wildcards used by consumers:

- `business.demo.>` — all events for the demo tenant
- `business.*.it-erp-sap.>` — all events from a specific edge across tenants
- `business.demo.*.production-order.>` — all production-order events across all ERPs

## Schema deploy (NEW — push schemas from cap-schemas-deployer to IT-Edges)

```
business.schema.deploy.<source-id>
```

Payload: full source-schema JSON. Welle 2 cap-it-edge-base subscribes here and hot-reloads.

```
business.schema.deploy.it-erp-sap
business.schema.deploy.it-qms
business.schema.deploy.it-wms
business.schema.deploy.it-oee-montage
```

## Heartbeat (NEW — per IT-Edge)

```
business.heartbeat.<edge-id>
```

Edge IDs are `it-edge-<source>` (stable, in source-schema `edgeId`).

```
business.heartbeat.it-edge-erp
business.heartbeat.it-edge-qms
business.heartbeat.it-edge-wms
business.heartbeat.it-edge-oee-montage
```

Payload (suggested):

```json
{
  "edgeId": "it-edge-erp",
  "tenant": "demo",
  "ts": "2026-05-14T12:00:00Z",
  "schemaVersion": "3.0.0",
  "tablesPolling": ["production_order", "customer", "stock"],
  "lastPollOk": true,
  "lagMs": 142
}
```

## KG snapshot (extends existing OT convention to IT)

```
i3x.kg.snapshot.<edge-id>
```

Already used by OT-Edges. Same subject space for IT — consumers (kg-builder) discriminate by `edgeId` payload field.

```
i3x.kg.snapshot.it-edge-erp
i3x.kg.snapshot.it-edge-qms
```

## Reserved / forbidden

- IT-Edges **must not** publish under `factory.*`
- Telemetry-Edges **must not** publish under `business.*`
- KPI wave (separate, distributed-execution per `feedback_kpi_distributed_execution.md`) gets its own subject tree — not defined in Welle 1.

## File map

| Convention          | Lives in                                       |
|---------------------|------------------------------------------------|
| Telemetry subjects  | `sources/opcua/*.json` → `#shared.uns` topic   |
| Event subjects      | `sources/postgresql/it-*.json` → `subjects`    |
| Profile definitions | `profiles/business/*.json`                     |
| Validators          | `validation/business-profile-schema.json`, `validation/it-edge-source-schema.json` |

# OSF Subject Conventions (v3)

Single source of truth for NATS subjects across the i3x v3 stack. The IT-Edges (Welle 1+2) and Telemetry-Edges (existing OT stack) **must not share subjects**; the wire-level separation is a hard rule per `feedback_telemetry_event_strict_separation.md`.

## Two worlds, one bus

| World     | Producer                           | Subject roots          | Payload shape           |
|-----------|------------------------------------|------------------------|-------------------------|
| Telemetry | OPC-UA / OT Edges (Cap-Telemetry)  | `factory.*` `aggregate.*` `cpp.*` | class-aware (see table below) |
| Events    | PostgreSQL IT-Edges (Cap-IT-Edge-Base) | `business.*`       | per-entity change rows  |

No IT-Edge ever publishes to `factory.*` / `aggregate.*` / `cpp.*`. No Telemetry-Edge ever publishes to `business.*`.

The OT (Telemetry) world is **not a single subject shape** — the shape is decided by the variable's telemetry class. See the class-aware table below.

## Telemetry-world subjects — class-aware (CAPT-V3-SUBJECT-SCHEME-FIX)

The `factory.*` world is **not one subject shape**. The shape depends on the variable's telemetry class (`delivery` / `scope` / `promotion` on the SMProfile attribute). The `nats-bridge` consumer routes purely by **root token + segment count** — a wrong shape is silently dropped. The NR-Codegen subject-builder and the bridge classifier **must agree on this table**:

| Class | `delivery` / `scope` / `promotion` | Subject shape | Segs | Bridge route |
|-------|-----------------------------------|---------------|------|--------------|
| **A** Roh-Telemetry | `telemetry` / `edge` / `raw` | `factory.<site>.<area>.<line>.<machine>.<category>.<attribute>` | 7 | `telemetry_raw` → **drop** (edge-only by design — Edge-TS is the canonical store; must NOT reach the central DB) |
| **A'** Aggregate | `telemetry` / `hub` / `aggregate` | `aggregate.<site>.<machine>.<window>.<metric>` | 5 | `aggregate` → `uns_aggregates` writer |
| **B** Cycle-Snapshot | `transactional` / `hub` / `on_cycle_end` | `cpp.<site>.<machine>.<op_id>.snapshot` | 5 | `cpp` → cpp-vault consumer |
| **C** Event (OT) | `transactional` / `hub` / `on_change` | `factory.<site>.<machine>.<category>.<attribute>` | 5 | `entity` → machine-events-writer (`machine_events`, append-only) + kg-builder |

### Why Class A (raw telemetry) is 7-seg / dropped

Class-A raw samples stay on the edge (`scope=edge`). The 7-segment `factory.*` shape is *deliberately* classified `telemetry_raw` by the bridge and dropped — the bridge will never persist raw telemetry to the `.150` central DB. The Edge-Timescale on the IPC is the canonical store. This is correct, not a bug.

### Why Class C events are 5-seg `factory.*` and NOT 7-seg

`scope=hub` Class-C events (`Act_Status_Machine`, `Act_Amount_Alarm`, …) **must reach the central DB**. The bridge keeps `factory.*` subjects of **4–6 segments** as the `entity` shape. A 7-segment subject would be dropped as `telemetry_raw` and the compliance-critical event would be lost. Therefore Class-C drops the `area`/`line` segments:

```
factory.<site>.<machine>.<category>.<attribute>
```

The producing edge **must put `machine` in the payload** (`{ machine, variable, value, ts, msg_id, op_id, … }`) — the 5-seg subject's trailing segment is the attribute, not the machine.

#### OT machine events → `machine_events` (append-only), NOT `events` — CAPT-V3-OT-EVENT-LOG

OT machine Class-C events are **immutable audit facts** — an `Act_Status_Machine` change 2→3 at 09:25:30 is a fact, it never changes. They are written to a dedicated **append-only `machine_events`** log on the Hub-Vault DB, NOT to the mutable IT `events` UPSERT table:

* `machine_events` dedup key is `(machine, attribute, ts)` with `INSERT … ON CONFLICT DO NOTHING` — two attributes of one machine at the same `ts` are distinct facts (distinct keys → both rows kept); a re-published fact is idempotently deduped. Never `DO UPDATE`.
* The table is **append-only by trigger** (UPDATE/DELETE/TRUNCATE blocked).
* The NR-Codegen render node emits a **per-fact-unique `msg_id`** (`<machine>.<attribute>.<ts>`); the `tx-out` Outbox dedup key is `payload.msg_id`, NOT `payload.ts` — keying on `ts` alone collapsed two attributes of one machine in the same ms into one message (silent loss).

The bridge's **OT/IT routing split** inside the `entity` shape is derived from the osf-schemas profile directories — an attribute declared by a `profiles/machines/*` profile → OT machine event → `machine_events`; a business-profile entity (`business`/`erp`/`qms`/`wms`/…) → IT entity → `events` (mutable UPSERT, unchanged). No machine-name regex.

### A' / B subject details

* **A' aggregate** — `<window>` is a duration token the bridge `aggregates-writer.parseWindowSeconds` understands (`300s`, `5min`, `1h`, …). Payload: `{ ts, value, sample_count }`. `<metric>` is the variable token. Exactly 5 segments.
* **B cycle snapshot** — `<op_id>` is the per-cycle operation id (runtime value). The codegen emits the static `cpp.<site>.<machine>` prefix; the cycle-detect FSM appends `.<op_id>.snapshot`. Exactly 5 segments.

Defined in `sources/opcua/*.json` (location + machineId + dataCategory) and the SMProfile attribute class. The legacy uniform 7-seg `#shared.uns` pattern (0.4.x) applies to Class A only.

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

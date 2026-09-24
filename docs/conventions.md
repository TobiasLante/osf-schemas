# OSF Subject Conventions

**Signal subjects and UNS paths are no longer described here.** They are model data: `sync/uns-convention.json`
(owner decision 24.09.2026). It is the single source of truth for

- the UNS path of every signal (OT: `{enterprise}/{site}/{area}/{line}/{machine}`, IT: `{enterprise}/{site}/{entity}`,
  Level 4 `{enterprise}/{entity}`), built from `sources[].location` — every source carries one;
- the hub subject per delivery class (OT `factory.{site}.{machine}.telemetry.{attr}` / `factory.{site}.{machine}.event.{attr}`
  on FACTORY; IT `business.{enterprise}.{sourceId}.{entity}.{eventType}.{id}` on BUSINESS, tenant = the ISA-95 enterprise);
- the rule that a route declared in `sync/` (with `source.sourceRef`) wins over the convention.

Its shape is `validation/sync-schema.json` › `definitions.convention`. The i3x-v5 compiler checks it fail-closed:
every scope=hub signal has a hub target, telemetry and events never share a pattern, every address lands in its own
world's stream and in no other, and no two signals share an address or a UNS path. The v3 class table that stood here
(7-segment raw telemetry, `aggregate.*`, `cpp.*`) described the v4 bridge; the parser shapes of that bridge are in
`historians/nats-jetstream/historian-template.json` › `subjectParser.byRoot`.

The subjects below are NOT signals (management, snapshots, alerts/actions) and stay documented here.

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

## Operations subjects — alerts & actions (`uns.*`)

Operational signals are a **third world**, distinct from telemetry (`factory.*`) and IT-events (`business.*`). They live under the fixed leading token `uns.` (Unified-Namespace operations root) and are captured by the hub JetStream streams `UNS_ALERTS` / `UNS_ACTIONS` (`sync/nats/jetstream-streams.json`).

```
uns.alert.<source>.<severity>.<id>
uns.action.<target-edge>.<action-type>.<id>
```

| Token         | Example                              | Meaning                                            |
|---------------|--------------------------------------|----------------------------------------------------|
| `source`      | `it-qms`, `cnc-001`, `oee-montage`  | Edge / service that raised the alert               |
| `severity`    | `info`, `warning`, `critical`        | Alert severity                                     |
| `target-edge` | `cnc-001`, `it-erp-sap`              | Edge the action request is addressed to            |
| `action-type` | `acknowledge`, `setpoint`, `restart` | Requested operation                                |
| `id`          | unique alert / action id             | Correlation id (request/reply for actions)         |

Examples:

```
uns.alert.it-qms.critical.AL-5501          # quality alert
uns.alert.cnc-001.warning.AL-7720          # maintenance alert from an OT edge
uns.action.cnc-001.acknowledge.AC-3300     # plant→edge action request
```

**Why a fixed `uns.` leading token (CAPT-V3-STREAM-SUBJECT-FIX):** the previous filters used a wildcard *leading* token (`*.*.*.*.alerts.>`, `*.*.*.*.*.action.>`). A wildcard first token overlaps the JetStream API namespace `$JS.>`; NATS then refuses to create the stream (error 10052) unless `no_ack:true` is set — which would break the workqueue ack contract. A fixed leading token is mandatory for every JetStream-captured subject. No producer publishes `uns.*` yet — this scheme is **reserved**; the first alert/action producer adopts it.

## Reserved / forbidden

- IT-Edges **must not** publish under `factory.*` / `aggregate.*` / `cpp.*`
- Telemetry-Edges **must not** publish under `business.*`
- No producer publishes under `uns.*` yet — reserved for the alerts/actions wave (see above).
- Every JetStream-captured subject **must have a fixed (non-wildcard) leading token** — a leading wildcard overlaps `$JS.>` and the stream cannot be created.
- KPI wave (separate, distributed-execution per `feedback_kpi_distributed_execution.md`) gets its own subject tree — not defined in Welle 1.

## File map

| Convention          | Lives in                                       |
|---------------------|------------------------------------------------|
| Signal subjects + UNS paths | `sync/uns-convention.json` (+ declared routes in `sync/<transport>/`) |
| Profile definitions | `profiles/business/*.json`                     |
| Validators          | `validation/business-profile-schema.json`, `validation/it-edge-source-schema.json` |

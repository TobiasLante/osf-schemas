# sync/nats/jetstream-streams.json — history and reasoning

Moved verbatim out of `sync/nats/jetstream-streams.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## $description

JetStream stream declarations for the i3x v3 stack — the SINGLE SOURCE OF TRUTH for stream names, subject filters and the edge→hub source topology. Consumed by: (1) scripts/provision-jetstream.sh in the connector/edge repos (idempotent create/update of streams + sources), (2) nr-codegen (resolves which stream a transactional/telemetry NR-node publishes into — see services/nr-codegen/src/streams.ts), (3) the nats-bridge consumer config. No stream name is hardcoded in code — it is resolved against this file. CAPT-V3-HUB-EVENT-PATH.

## tiers › edge › streams › EDGE_EXPORT › $description

Durable export buffer on the edge. Every message the edge must hand to the Hub durably lands here first: Class-A' aggregates (aggregate.*), Class-B cycle snapshots (cpp.*) and Class-C transactional events (factory.* 4-6 segs). The Hub FACTORY stream sources this stream cross-domain. A transactional NR-node (i3x-jetstream-transactional-out) publishes here with expectStream=EDGE_EXPORT — the ack is honest because this stream really captures the subject; on a real failure the NR outbox row stays and the retry-loop owns it.

## tiers › hub › streams › FACTORY › sources › EDGE_EXPORT › $description

Cross-domain source of every Edge-IPC EDGE_EXPORT stream. provision-jetstream.sh expands one source entry per registered edge domain (edge_<ipc>) from the fleet inventory, each with api=$JS.edge_<ipc>.API. filterSubjects scopes WHICH subjects the hub pulls — all three telemetry-world roots so Class-C events reach the bridge events-writer.

## tiers › hub › streams › UNS_ALERTS › $description

Maintenance + quality alerts. Persistent because consumers (operator dashboard, escalation rules) must never miss one. Workqueue retention so each alert delivered once across competing consumers. CAPT-V3-STREAM-SUBJECT-FIX: the former filters `*.*.*.*.*.maintenance.alert.>` / `*.*.*.*.alerts.>` had a wildcard LEADING token — those overlap the JetStream API namespace `$JS.>`, so NATS deterministically rejects stream creation with error 10052 ('subjects that overlap with jetstream api require no-ack'). `no_ack:true` would silence the rejection but break the workqueue ack contract — not done. Fixed with the dedicated fixed leading token `uns.alert.>`: a clean UNS (Unified-Namespace) operations root, sibling of `uns.action.*`, kept strictly out of the telemetry (`factory.*`/`aggregate.*`/`cpp.*`) and IT-event (`business.*`) worlds. No producer publishes alerts yet — the subject scheme is reserved here and documented in docs/conventions.md so the first alert producer adopts it.

## tiers › hub › streams › UNS_ACTIONS › $description

Plant→Edge action requests (request/reply pattern). Consumers ack within configurable deadline; unacked = redelivered until expiry. CAPT-V3-STREAM-SUBJECT-FIX: the former filter `*.*.*.*.*.action.>` had a wildcard LEADING token overlapping `$JS.>` — same error 10052 as UNS_ALERTS. Fixed with the dedicated fixed leading token `uns.action.>`, the operations-world sibling of `uns.alert.*`. No producer publishes actions yet — the subject scheme is reserved here and documented in docs/conventions.md.

## tiers › hub › streams › BUSINESS › $description

Central durable IT business-event stream (CAPT-V3-IT-EVENT-PERSISTENCE). Captures the it-server's business.<tenant>.<source>.<entity>.<event-type>.<id> publishes — ERP/QMS/WMS/OEE entity create/update/delete facts. The it-server is connected straight to the hub NATS (NodePort 30422 / nats.nats.svc:4222), so a single hub stream with a clean leading-token subject filter `business.>` captures the core-NATS publishes durably — no cross-domain source needed (IT services are hub-local, unlike the per-edge OT producers). nats-bridge consumes BUSINESS on a dedicated durable and appends to the hub-vault `business_events` log, the sibling of `machine_events`. This stream REPLACES the never-provisioned ERP_ENTITIES, whose `*.*.erp.>` filter had a wildcard leading token (collision-prone, overlaps $JS, and never matched the actual `business.*` subject scheme).

## deliveryClassRouting › $description

Maps an SMProfile attribute's delivery class to the JetStream stream a generated NR-node publishes into. nr-codegen reads THIS — there is no expect-stream literal in generate.ts. The stream named here must exist in tiers.edge.streams (the NR-node always publishes into its own edge domain; the hub pulls via the declared source).

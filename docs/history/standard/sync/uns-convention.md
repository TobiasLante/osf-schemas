# sync/uns-convention.json — history and reasoning

Moved verbatim out of `sync/uns-convention.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

The UNS path and the hub address of every scope=hub signal that no route in sync/ declares (owner 24.09.). A declared route (sync/<transport>/*.json with source.sourceRef) always wins for its source. Derived from what the model already holds: the ISA-95 hierarchy in sources[].location (every source carries one; a missing location is a check error, there is no default), the stream topology in sync/nats/jetstream-streams.json, the class patterns of sync/nats/opcua-to-nats-cnc-mtc-01.json, and the business subject of the IT edges (business.<tenant>.<sourceId>.<entity>.<eventType>.<id>, tenant = the ISA-95 enterprise).

## worlds.it.categories (1.2.0, Welle 13, 25.09.2026)

`equipment` joins the IT world. The first REST source of a category-equipment class (erp-machine-pools -> SMProfile-EquipmentClass, target of OperationsSegment SPECIFIES_EQUIPMENT) is ERP master data, one row per class, like the business/material/quality rows: it rides the BUSINESS stream with the row as payload, not the per-signal OT subjects of category machine. Before this, a source of category equipment compiled to "has no world".

## version 3.0.0 (core 6.2.0, 12.11.2026, audit core610 3.3)

The subjects changed with core 6.0.0 (0.7.0, R070-GX6): the OT subject gained `{entity}` — `factory.{site}.{entity}.{machine}.telemetry|event.{attr}`,
five tokens before the attribute — and the IT subject gained `{site}` and its new order — `business.{enterprise}.{site}.{entity}.{sourceId}.{eventType}.{id}`.
A changed subject is a breaking change for every reader that subscribes by subject, but the file kept version 2.0.0, and no breaking record of
core 6.0.0 named it (found by the external audit of core 6.1.0, 11.11.2026). 3.0.0 records it. The content is the one of core 6.0.0 and 6.1.0; no
subject changes here. Core 6.2.0 adds no breaking record for it: a record first appears in the core that carries it, so a move 6.1.0 → 6.2.0 would
name a break that happened in 6.0.0 (the hub depth step of a move reads the subject patterns themselves, not the records). From core 6.2.0 the linter
lint-core-versions (i3x-v5 packages/schemas-ci) refuses a changed core file that keeps its version.

## version 4.0.0 (core 6.3.0, 16.11.2026, owner)

The owner compared the Explorer's two trees: "unter entities (also aus den modelle) passt alles, unter topics … der baum komplett anders" —
"der baum unter topics ist komplett anders und falsch als unter entities" → "ja, so wie unter entities. das will ich 1:1 auch in den topics
sehen", and (said of the core of this change, then called 6.2.0; it is core 6.3.0 because 6.2.0 had shipped and is frozen): "ist generisch, basierend auf der ISA95 und NICHT, NIEMALS sim-v5 spezifisch". The 3.0.0 OT subject put the contract
above the machine and left area and work center out (`factory.{site}.{entity}.{machine}…`, GX6 of 30.10.2026, one subject space per contract
like a Kafka topic); its UNS path named a fixed area/line/machine shape. 4.0.0: the OT subject is `{elementId}.{entity}.telemetry|event.{attr}` —
the element's path (the codes along partOf from the Enterprise, the element_id of the EID decision, 30.10.2026), then the contract, the delivery
token and one attribute token; the UNS path is `{elementPath}` (+ `/{entity}` for an object kept at a machine). Any ISA-95 / ISA-88 role level
and any depth: the hub streams take one exact-count capture per element depth of the plant (no `>`, so a telemetry and an event capture never
overlap — measured on nats-server 2.10, 16.11.2026), an edge publishes its machine's element subtree. Kafka keeps one topic per contract and
site; the IT world is unchanged. Hard cut (no customer runs it yet): the move deletes the old form on the hub.


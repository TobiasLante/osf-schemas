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

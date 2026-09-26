# sync/uns-convention.json — history and reasoning

Moved verbatim out of `sync/uns-convention.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

The UNS path and the hub address of every scope=hub signal that no route in sync/ declares (owner 24.09.). A declared route (sync/<transport>/*.json with source.sourceRef) always wins for its source. Derived from what the model already holds: the ISA-95 hierarchy in sources[].location (every source carries one; a missing location is a check error, there is no default), the stream topology in sync/nats/jetstream-streams.json, the class patterns of sync/nats/opcua-to-nats-cnc-mtc-01.json, and the business subject of the IT edges (business.<tenant>.<sourceId>.<entity>.<eventType>.<id>, tenant = the ISA-95 enterprise).

## worlds.it.categories (1.2.0, Welle 13, 25.09.2026)

`equipment` joins the IT world. The first REST source of a category-equipment class (erp-machine-pools -> SMProfile-EquipmentClass, target of OperationsSegment SPECIFIES_EQUIPMENT) is ERP master data, one row per class, like the business/material/quality rows: it rides the BUSINESS stream with the row as payload, not the per-signal OT subjects of category machine. Before this, a source of category equipment compiled to "has no world".

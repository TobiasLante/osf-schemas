# Payloads (v0.1.0)

Until now the syncs named broker and topic but not what travels on them. This folder fixes the payload,
transport by transport, generated from `standard/profiles/**`.

| transport | format | file |
|---|---|---|
| NATS, MQTT | JSON | `json/<folder>/<profileId>.payload.json` (JSON Schema, draft-07) |
| Kafka | Avro | `avro/<folder>/<profileId>.avsc` (value schema, TopicNameStrategy) |

Two shapes, from `standard/sync/uns-convention.json` (`envelope.schema.json`):

- **signal** (category machine): one message per signal, `{element_id, attr, value, timestamp, quality, unit}`.
  The profile payload fixes `attr` to the attribute names and types each value in `x-signals`.
- **entity** (business, material, quality, equipment): one message per row,
  `{eventType, id, entity, timestamp, data}`; `data` carries the profile's attributes, inherited ones included.

A sync binds its payload through its `profileRef`: the payload of a sync is the file named after that
profile. Abstract and retired profiles have no payload.

The files are generated; never edit them by hand. When a profile changes, regenerate them with the
profile. The generator lives outside this repository (schemas only here).

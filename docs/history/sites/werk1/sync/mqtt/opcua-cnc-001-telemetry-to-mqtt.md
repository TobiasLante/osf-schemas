# sync/mqtt/opcua-cnc-001-telemetry-to-mqtt.json — history and reasoning

The JSON says what a thing is; this file keeps why it became that.

## description

Separate MQTT route (owner 26.09.2026, W13b): the vendor software of a UNSaC target (`targets.json` kind `highbyte`, `iflow`
or `node-red` — the target whose consumer carries `opcua-cnc-001-telemetry`) connects DIRECTLY to the OPC UA server of cnc-001 (the endpoint of
`sites/werk1/sources/opcua/opcua-cnc-001-telemetry.json`) and publishes every scope=hub attribute of that source over MQTT, one topic per
attribute. UNSaC writes the product's configuration from this route and pushes it through the product's own API; our edge
(unsac-edge) and our hub (unsac-hub) are not in this data path, and the UNS hub subject of each signal still comes from
`standard/sync/uns-convention.json` (the compiler marks these targets tier `vendor`).

- **Topics:** `topicPatterns` per delivery class. An indexed attribute (`name#i`, one source mapping the same attribute N
  times) is published as the topic level `name/i`, because `#` and `+` are MQTT wildcards and never part of a topic name.
- **Broker:** the v4 vendor broker (v4 `deploy/compose/central.env.example` `VENDOR_MQTT_BROKER_HOST`/`PORT`, the broker the
  v4 HighByte pipeline published to in the E2E proof of 2026-07-02). Credentials never live here: a target names them in
  `targets.json` `broker.secret`. Open (owner): whether the vendor broker stays this one or moves to the broker of the
  vendor host.
- **Parallel options:** HighByte, i-flow and Node-RED are equal targets. Two targets serving the same machine on the same
  broker publish the same topics twice — choose one target per machine.

# sync/nats/opcua-to-nats-cnc-mtc-01.json — history and reasoning

Moved verbatim out of `sync/nats/opcua-to-nats-cnc-mtc-01.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Standard OSF OT edge — subscribes the Sonder-Edge OPC-UA server and publishes promoted telemetry on factory.<site>.<machine>.event.<attr> to the suite NATS hub (FACTORY stream). SSOT consumed by gen-flows.mjs to build the Standard-Edge Node-RED flow. IDENTITY CHAIN: {machine} in subjectPattern = this file's machineId cnc-mtc-01 = the BUS identity of the physical machine 'MTConnect agent device cnc-01' (http://192.168.178.154:35000, device verified 2026-07-15 via /probe). The KG source descriptors of the same chain (sources/mtconnect/mtconnect-cnc-01.json, sources/opcua/opcua-mtbridge-cnc-01.json) carry machineId cnc-01, and the OPC-UA nodes it subscribes are ns=2;s=cnc-01/<smAttribute> (upstream id, see opcua-mtbridge-cnc-01.json). This bus-vs-KG id split is hereby documented, not resolved: unifying it means renaming ids that live in NATS subjects and history — a deliberate decision, not a drive-by fix. Contrast the sister chain cnc-mtc-02 (bridge-free), which uses ONE id everywhere.

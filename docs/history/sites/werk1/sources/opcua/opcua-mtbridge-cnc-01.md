# sources/opcua/opcua-mtbridge-cnc-01.json — history and reasoning

Moved verbatim out of `sources/opcua/opcua-mtbridge-cnc-01.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

STANDARD OPC-UA source descriptor — the normal OSF OT edge's view of the MTConnect Sonder-Edge's embedded OPC-UA server. 100% the standard concept (cf. opcua-cnc-001-telemetry.json): nodeMappings[].opcuaNodeId -> smAttribute against SMProfile-CNC-Machine. NodeId convention is ns=2;s=<machineId>/<smAttribute>, deterministically derived from the profile so the Sonder-Edge server and this descriptor agree without hand-mapping. The standard edge then promotes/publishes exactly as for any OPC-UA machine. IDENTITY: machineId cnc-01 here is deliberately the UPSTREAM id from mtconnect-cnc-01.json (physical machine = MTConnect agent device cnc-01 on http://192.168.178.154:35000, verified 2026-07-15 via /probe), and the nodeIds ns=2;s=cnc-01/* follow that upstream id — NOT the bus id. Downstream, sync/nats/opcua-to-nats-cnc-mtc-01.json publishes this machine on NATS as cnc-mtc-01: on this chain the bus id and the KG id differ (historical; a rename would ripple into NATS subjects and history).

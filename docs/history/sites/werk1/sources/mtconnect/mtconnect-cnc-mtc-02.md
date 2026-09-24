# sources/mtconnect/mtconnect-cnc-mtc-02.json — history and reasoning

Moved verbatim out of `sources/mtconnect/mtconnect-cnc-mtc-02.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Direct MTConnect OT source — NO OPC-UA bridge. Produced by the suite's normal Discovery (POST /api/discovery/mtconnect/browse) against the prod MTConnect agent http://192.168.178.154:35000 (device cnc-03) and deployed via the standard edge-deploy (i3x.schema.deploy.cnc-mtc-02). The edge polls the agent /current and projects each MTConnect DataItem onto a canonical SMProfile-CNC-Machine attribute (join key = smAttribute), then publishes factory.werk1.cnc-mtc-02.event.<attr> straight to the hub. Contrast with mtconnect-cnc-01.json which re-exposes via an embedded OPC-UA server (the customer 'Sonder-Edge' crutch); this descriptor is the first-class, bridge-free path.

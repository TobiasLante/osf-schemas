# sources/opcua/opcua-rockwell-01-telemetry.json — history and reasoning

Moved verbatim out of `sources/opcua/opcua-rockwell-01-telemetry.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## _comment

CAPT-CLOSE 2026-08-20: negative control for the namespace drift detector. This source reads the machine's OWN onboard OPC-UA server opc.tcp://192.168.178.154:36500, whose NamespaceArray has exactly 2 entries, measured at 2026-08-20T05:45:05Z: [0] http://opcfoundation.org/UA/, [1] urn:i3x:sim-v5:cnc:rockwell-01 (ns=1;s=Machine/partsCount/good = 23827, scrap = 1614, status RUNNING). The pinned ns=1 and the namespaceUri below therefore AGREE, so namespace-resolve.ts resolves this source as 'uri_verified_index': no refusal and no index_pinned warning, and the nodeIds are byte-identical to what they were before. NOTE the URI is 'urn:i3x:sim-v5:cnc:rockwell-01' - the SAME physical machine is exposed under a DIFFERENT URI ('urn:i3x:sim-v5:linx:rockwell-01', index 89) by the FactoryTalk Linx gateway on :36600. A namespace URI is per-server, not per-machine.

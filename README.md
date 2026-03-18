# OSF Schemas

Machine type definitions, OPC-UA discovery mappings, and MQTT/UNS runtime mappings for the OpenShopFloor Knowledge Graph.

The KG Builder pulls this repo and automatically constructs a Neo4j Knowledge Graph from these schemas — no LLM, no manual graph construction.

## Structure

```
profiles/                    Schema 1: SM Profiles (type system)
  cnc-machine.json
  lathe.json
  milling-machine.json
  5-axis-milling-machine.json
  grinding-machine.json
  injection-molding-machine.json
  assembly-line.json
  ffs-cell.json

mappings/opcua/              Schema 2: OPC-UA → SM Mapping (instance binding)
  7533.json                  One file per machine (35 total)
  sgm-002.json
  ml-1.json
  bz-1.json
  ...

mappings/uns/                Schema 3: SM → UNS Mapping (MQTT runtime binding)
  factory-sim-v3.json        One file per data source
```

## How it works

See [schema-guide.md](schema-guide.md) for the full documentation.

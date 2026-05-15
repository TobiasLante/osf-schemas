# Example Variable Shapes — v3 `delivery` / `scope` / `promotion`

> CAPT-V3-PROFILE-PROPS. Companion to the appendix in `../schema-guide.md`.
> Concrete, copy-pasteable snippets for the three required variable properties.

## OT-Edge — machine SM Profile (`profiles/machines/*.json`)

Attributes are JSON objects in the `attributes[]` array. The three properties
are required on every one of them.

```json
{
  "attributes": [
    {
      "name": "Act_Speed_Spindle",
      "dataType": "Float",
      "category": "ProcessData.Speed",
      "unit": "rpm",
      "delivery": "telemetry",
      "scope": "edge",
      "promotion": "raw"
    },
    {
      "name": "Runtime_5min_sec",
      "dataType": "Float",
      "category": "BDE",
      "unit": "s",
      "delivery": "telemetry",
      "scope": "hub",
      "promotion": "aggregate"
    },
    {
      "name": "Machine_Status",
      "dataType": "Int32",
      "category": "BDE",
      "enum": [1, 2, 3, 4, 5],
      "delivery": "transactional",
      "scope": "hub",
      "promotion": "on_change"
    },
    {
      "name": "Cycle_Snapshot",
      "dataType": "Json",
      "category": "BDE",
      "delivery": "transactional",
      "scope": "hub",
      "promotion": "on_cycle_end"
    }
  ]
}
```

Equivalent in YAML for readability:

```yaml
# Edge-Telemetry (bleibt auf .99) — Class A
- name: spindle_speed_rpm
  delivery: telemetry
  scope: edge
  promotion: raw

# Edge-Aggregate (kommt zur .150) — Class A'
- name: runtime_5min_sec
  delivery: telemetry
  scope: hub
  promotion: aggregate

# Klasse-C Event (kommt zur .150, Ack-Pflicht)
- name: status
  delivery: transactional
  scope: hub
  promotion: on_change

# Klasse-B Cycle-Snapshot
- name: cycle_snapshot
  delivery: transactional
  scope: hub
  promotion: on_cycle_end
```

## IT-Edge — business SM Profile (`profiles/business/*.json`)

For business profiles `scope` is always `hub` and `delivery` is always
`transactional` — still spelled out on every attribute, no default.

```json
{
  "attributes": [
    {
      "name": "status",
      "dataType": "String",
      "category": "ProductionOrder",
      "enum": ["planned", "released", "in_progress", "done"],
      "delivery": "transactional",
      "scope": "hub",
      "promotion": "on_change"
    },
    {
      "name": "planned_qty",
      "dataType": "Int32",
      "category": "ProductionOrder",
      "delivery": "transactional",
      "scope": "hub",
      "promotion": "on_change"
    }
  ]
}
```

## What is NOT allowed

The edge cannot compute quotas/percentages. These must never appear as machine
output variables — they are composed at-query-time on the central via `kpiRefs`:

```yaml
# INVALID as a machine attribute — edge has no shift plan / ideal cycle time
- name: oee            # FORBIDDEN
- name: availability_pct  # FORBIDDEN
- name: performance    # FORBIDDEN
- name: quality_pct    # FORBIDDEN
```

Provide raw durations and counts instead, and let the central derive the KPI:

```yaml
- name: runtime_5min_sec      delivery: telemetry  scope: hub  promotion: aggregate
- name: downtime_5min_sec     delivery: telemetry  scope: hub  promotion: aggregate
- name: state_setup_5min_sec  delivery: telemetry  scope: hub  promotion: aggregate
- name: parts_total_inc_5min  delivery: telemetry  scope: hub  promotion: aggregate
```

## Combination matrix

| `scope` | `promotion`     | valid? | note |
|---------|-----------------|--------|------|
| edge    | raw             | yes    | raw samples stay on the edge |
| edge    | on_change       | yes    | edge-local change log |
| hub     | raw             | NO     | raw is never promoted to central |
| hub     | aggregate       | yes    | the canonical Class-A' bucket |
| hub     | on_change       | yes    | Class-C event |
| hub     | on_cycle_end    | yes    | Class-B cycle snapshot |

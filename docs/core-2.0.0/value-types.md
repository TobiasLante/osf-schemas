# Core 2.0.0: how the valueTypes were set (F9)

Core 1.0.0 left 219 of 359 properties without a valueType. Core 2.0.0 declares one on every property, by these rules, in this order
(packages/schemas-ci/lint-value-type.mjs agrees: 359/359, 0 errors):

1. **ID** — an identifier or a reference kept as a value: a name ending in `_ref` or `_id`, the profile's kgIdProperty, and the identifiers
   by name: lot, lot_no, characteristic_no, order_no, operation_no, production_order_no (on a booking), order_index, process_segment_code,
   recurrence_key, warehouse, storage_location, constraint_defined_in, assigned_to, requested_by, resolved_by, proposed_by, decided_by,
   charter_pr_url, evidence_refs, resolution_signature.
2. **SP** — commanded or planned (SOLL): the ordered quantity of an order (CustomerOrder.quantity, ProductionOrder.quantity) and
   qty_planned, start_planned, end_planned, planned_start_time, planned_end_time, cycle_time_planned_sec, duration_planned_sec,
   dispatch_sequence, material_ready_at, due_date, customer_due_date, customer_order_qty, total_amount, priority, sample_size, due_at,
   dryerResidenceTargetMin, target_value, proposed_band, proposed_aim, proposed_mode, authoritative_aim.
3. **MD** — master data that describes the object and does not change with operation: the lifecycle status of a definition
   (ProductDefinition, OperationsDefinition) and name, description, machine_type, tool_type, rule_type, type, unit, unit_of_measure,
   abc_class, currency, country, segment, location_type, version_label, operations_type, sequence, customer_name, lead_time_days, cost_hk,
   price_vk, unit_price, param_name, parts_per_shot, lot_type, day_of_week, start_time, end_time, break_minutes, tolerance_source,
   material_use, steward_domain, enabled.
4. **LIM** — an enforced bound: warn_lo, warn_hi, action_lo, action_hi, hopperRefillThresholdPct, authoritative_band, reorder_level,
   safety_stock.
5. **PV** — everything else: what is measured, counted or recorded while it happens (readings, counters, states, actual times and
   quantities, stock, the record of a decision).

A property that already declared a valueType kept it.

# sources/rest/erp-workorders.json — history and reasoning

Moved out of `sources/rest/erp-workorders.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

Workorders (ISA-95 WorkRequest) from sim-v5 erp-operations GET /workorders. Measured 25.09.2026 (.154:38060, GET only): 63,074 rows, all workorder_no distinct (page-through at limit 500, offset 0..63,000; offset 100,000 -> 0 rows), ordered by workorder_no ascending (a stable key, so a page-through is exact). The response carries no timestamp column; since filters on a hidden creation time (2030 -> 0, 2026-09-25T17:00Z -> the orders created after it), so a timestamp delta would miss status changes — full refresh every 15 min (127 requests), paginate so a deleted workorder can be retracted. All six profile attributes have a column; FOR_OPERATIONS_REQUEST joins production_order_ref to ProductionOrder.production_order_no. JobOrder PART_OF Workorder resolves against workorder_no.

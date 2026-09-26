# sources/rest/erp-job-orders.json — history and reasoning

Moved out of `sources/rest/erp-job-orders.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

JobOrders = one row of erp.order_operations (workorder x operation x machine), sim-v5 api-erp GET /api/operations, paged by the immutable key (production_order_no, operation_number). job_order_no = <production_order_no>.<operation_number> is served from Welle 12 S2 on (sim-v5 23cbd9b0); before that the id column is empty and the source yields nothing. PART_OF uses production_order_no as workorder_no (sim convention workorder_no == order id); no source feeds Workorder nodes yet.

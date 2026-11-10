# sources/rest/erp-job-orders.json — history and reasoning

Moved out of `sources/rest/erp-job-orders.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

JobOrders = one row of erp.order_operations (workorder x operation x machine), sim-v5 api-erp GET /api/operations, paged by the immutable key (production_order_no, operation_number). job_order_no = <production_order_no>.<operation_number> is served from Welle 12 S2 on (sim-v5 23cbd9b0); before that the id column is empty and the source yields nothing. PART_OF uses production_order_no as workorder_no (sim convention workorder_no == order id); no source feeds Workorder nodes yet.

## status valueMap (2.1.0, core 6.0.0 audit M-15, 29.10.2026)

CANCELLED → Cancelled added: the ERP's operation statuses are erp.order_operations.status in {OPEN, IN_PROCESS, PARTIAL_CONFIRMED, FINAL_CONFIRMED, CANCELLED} (measured, standard/cross-constraints/qty_shortfall.json retiredReason); Cancelled is the same word in B2MML JobOrderDispatchStatus1Type. OPEN stays unmapped on purpose: whether an open ERP operation is Waiting, Pending or Ready in JobOrderDispatchStatus needs the norm text (no guess). A GET /api/operations?since=P7D on .154 (29.10.2026, 200 rows) carried only FINAL_CONFIRMED 186, PARTIAL_CONFIRMED 12, IN_PROCESS 2.

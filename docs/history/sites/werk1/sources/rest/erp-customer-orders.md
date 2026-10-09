# sources/rest/erp-customer-orders.json — history and reasoning

## description

2026-10-06 (core 3.0.0, owner round 4): core 3.0.0 moved the customer DATA (customer, amount, currency, due dates, ordered quantity) from the
production order to the customer order, and the owner decided that the reference stays: the production order keeps `sales_order_ref`
(= this order's `order_no`), "wir benötigen diesen Verweis durchgehend". Without this source the demo plant's customer orders would stay
empty after the move, because nothing else writes them. The endpoint and the columns are the ones the plant already read before core 3.0.0
(the production-order source mapped kundenauftrag_nr, kunde_id, kunde_name, gesamtbetrag, waehrung, lieferdatum, lieferdatum_soll of
/api/orders) and the ones the v4 source erp-customer-orders read from /api/customer-orders; no column is invented.

MEASURED against the reference simulator's ERP REST API on 2026-10-06 (read only): /api/customer-orders honours limit and offset
(?limit=2 -> 2; pages offset 0 and 5000 at limit 5000 share 0 rows; an offset past the end returns 0 rows, so the it-edge's offset paging
stops), it ignores after_id (so no keyset mode), 121417 rows, kundenauftrag_nr distinct and never null in the first 5000. batchSize 5000
and intervalMs 300000 follow erp-production-orders.

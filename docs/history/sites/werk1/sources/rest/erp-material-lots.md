# sources/rest/erp-material-lots.json — history and reasoning

Moved out of `sources/rest/erp-material-lots.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

Material lots (sim-v5 erp-operations GET /material-lots, B2MML MaterialLot) for SMProfile-MaterialLot. job_order_ref carries the edge JobOrder REQUIRES_MATERIAL MaterialLot from the lot side (direction in, many lots -> one job); sim-v5 serves it from Welle 12 S2 on, empty before. Population measured 25.09.: 2-5 million lots (offset 2,000,000 -> 500 rows, 5,000,000 -> 0), so no full refresh: new lots by created_at >= since; later status changes of an old lot are not seen (the endpoint filters on created_at only).

## polling (measured 25.09.2026, .154:38060, GET only)

Rows are ordered created_at DESC. limit is capped at 500. The offset is honoured and not capped: offset 999,999 and 2,000,000 still return 500 rows (oldest 2026-08-10), 5,000,000 returns 0, so the population is 2-5 million lots and a full refresh per poll is not affordable. since IS honoured and filters created_at >= since: a future value (2030) returns 0 rows, 2026-09-25T17:00Z returns rows from 17:08 on; an unknown parameter is ignored (500 rows). An unparseable since ("ghost") answers an internal error instead of 400 (sim-v5 finding). Consequence: timestamp delta on created_at, 500 per poll every 60 s; at about 20 new lots per minute (measured over the newest 1,000) a poll never reaches the cap. A later status change of an old lot is NOT seen, because the endpoint has no updated_at filter. x-total-count is the page size, not the population.

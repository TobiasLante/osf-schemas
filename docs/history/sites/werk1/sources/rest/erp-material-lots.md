# sources/rest/erp-material-lots.json — history and reasoning

Moved out of `sources/rest/erp-material-lots.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (1.0.0, Welle 12, 25.09.2026)

Material lots (sim-v5 erp-operations GET /material-lots, B2MML MaterialLot) for SMProfile-MaterialLot. job_order_ref carries the edge JobOrder REQUIRES_MATERIAL MaterialLot from the lot side (direction in, many lots -> one job); sim-v5 serves it from Welle 12 S2 on, empty before. Population measured 25.09.: 2-5 million lots (offset 2,000,000 -> 500 rows, 5,000,000 -> 0), so no full refresh: new lots by created_at >= since; later status changes of an old lot are not seen (the endpoint filters on created_at only).

## polling (measured 25.09.2026, .154:38060, GET only)

Rows are ordered created_at DESC. limit is capped at 500. The offset is honoured and not capped: offset 999,999 and 2,000,000 still return 500 rows (oldest 2026-08-10), 5,000,000 returns 0, so the population is 2-5 million lots and a full refresh per poll is not affordable. since IS honoured and filters created_at >= since: a future value (2030) returns 0 rows, 2026-09-25T17:00Z returns rows from 17:08 on; an unknown parameter is ignored (500 rows). An unparseable since ("ghost") answers an internal error instead of 400 (sim-v5 finding). Consequence: timestamp delta on created_at, 500 per poll every 60 s; at about 20 new lots per minute (measured over the newest 1,000) a poll never reaches the cap. A later status change of an old lot is NOT seen, because the endpoint has no updated_at filter. x-total-count is the page size, not the population.

## polling › updated_since (owner point 9, 25.09.2026)

The cursor moved from created_at/since to updated_at/updated_since, so a status change of an old lot is seen. sim-v5 w12/lot-link e5ea4f22 (not live before S2): ?updated_since=<ISO> filters updated_at >= and orders updated_at ASC, material_lot_no ASC (index V234); every row carries updated_at; since/updated_since=ghost -> 400.
Measured live BEFORE S2 (.154:38060, GET only, 25.09.2026 ~20:50): updated_since is IGNORED like any unknown parameter (updated_since=2030-01-01 -> 500 rows, the newest by created_at), rows carry no updated_at, updated_since=ghost -> 200. Until S2 this source therefore sees the newest 500 lots per poll without a working cursor.
Only /material-lots gets the 400 fix: the other :38060 routes still answer since=ghost with 500 (measured live on /workorders, /operations-definitions, /process-segments, /segment-responses; /material-lots too until S2).


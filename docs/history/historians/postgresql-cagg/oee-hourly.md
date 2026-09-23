# historians/postgresql-cagg/oee-hourly.json — history and reasoning

Moved verbatim out of `historians/postgresql-cagg/oee-hourly.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## $description

OEE Continuous Aggregate auf bde_data, refresh alle 5min. Math entspricht v1's public.calculate_oee_with_erp() Formel — 1:1 dieselbe Logik (quality * performance * availability), inline ins CAGG-SELECT statt als PL/pgSQL-Function aufgerufen. Vorteil: Postgres pflegt selbständig, kein externer LISTEN/NOTIFY-Service nötig. SSOT bleibt dieses Schema — Math, Bucket, Refresh-Policy alles hier. Generator (packages/exporters/src/historian-cagg.ts) liest und emittiert idempotent CREATE MATERIALIZED VIEW + add_continuous_aggregate_policy.

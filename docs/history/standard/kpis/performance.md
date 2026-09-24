# kpis/performance.json — history and reasoning

Moved verbatim out of `kpis/performance.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Performance rate — planned vs actual cycle time (Plan_Time_Cycle / Act_Time_Cycle), live on the edge. PARKED — see parkedReason; do not push until a source feeds Plan_Time_Cycle. Input contract: canonical = real CNC wire names (exact-name match binds them without the explicit map); inputMappings carries the identity binding for the consumer's KpiFlowOptions.inputMap contract. Windowed performance for reporting lives in historians/postgresql-cagg/oee-hourly.json (authoritative for time-bucketed factors).

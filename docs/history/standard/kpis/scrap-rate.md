# kpis/scrap-rate.json — history and reasoning

Moved verbatim out of `kpis/scrap-rate.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Percentage of scrap parts out of (good + scrap), computed live on the edge over the CURRENT counter values (since-last-reset ratio — IMM counters are cumulative_resettable; windowed truth lives in historians/postgresql-cagg/oee-hourly.json). Input contract and measurement identical to KPI-Quality-Rate: canonical inputs bound per machine type via `inputMappings[<profileId>]` (= the consumer's KpiFlowOptions.inputMap shape); the consumer's built-in matcher resolves `good`/`scrap` (IMM) and `Act_Amount_PartGood`/`Act_Amount_PartScrap` (CNC) to these inputs with zero false matches (simulated 2026-07-15). v1 computed on `Good_Parts`/`Scrap_Parts`/`Rework_Parts` — none of which existed anywhere. Rework is deliberately absent from the denominator: Act_Amount_PartRework is declared on the CNC profile but fed by NO source (measured 2026-07-15); see KPI-Quality-Rate for the unpark path.

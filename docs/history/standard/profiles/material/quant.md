# profiles/material/quant.json — history and reasoning

Moved verbatim out of `profiles/wms/quant.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v4 — WMS stock unit (Quant) at the storage location, aligned to the LIVE projection of source sim-v5-wms-quants (article_ref/quantity/blocked/warehouse/storage_location), NOT the legacy base profile (article_no/quality_status). Keyed on quant_no. The cross-domain deviation material_unavailable (next/cross-constraints/material_unavailable.json) joins OperationsResponse <-> Quant on article_ref and aggregates the free stock (quantity, filtered to blocked==0). Pure stock carrier, no constraints block (cross-source).

## constraints › stock_level_control_limits › description

TOMBSTONE - the rule body below is preserved VERBATIM as it ran until 2026-08-30. It is evidence, not configuration; retired:true means it is loaded, never evaluated, and its open episodes are superseded with superseded_by=retirementId. Do NOT delete this file. SUCCESSOR: profiles/erp/article.json#stock_below_reorder_level. Original description follows. >>> IT/inventory control limits (Warngrenze (warning limit) + action limit) on the free stock quantity (reorder level / maximum stock level). Stock should stay inside the warn band [20,500]; below 20 or above 500 -> 'warning'-tier alarm (reorder / overstock watch); below the action band lower bound 5 or above 800 -> 'error'-tier alarm (stockout risk / hard overstock). Two-sided control band evaluated centrally by the it-evaluator (IT acquisition); drives the IT alarm panel with a raise/clear lifecycle. LITERAL band = static SSOT for the pilot. --- 2026-07-12 CAPT-STURM: declares a `persistence` policy (anti-chatter). A single sample outside a band is not a deviation — an EPISODE is. `raise` is a Western-Electric run rule (2 of the last 3 evaluations must breach); `clear` is an ISA-18.2 dead-band (the value must return inside the limit by 15 % of the band width, for 3 evaluations). The LIMITS ARE UNCHANGED — this removes chatter, not signal. Declaring it is now MANDATORY for every live `between`/`within_limits` rule (ci/lint-constraints.mjs, fail-closed): a rule the detector cannot police is a rule that reports its own arithmetic instead of the machine. <<<

## core 6.5.0 (0.7.5) — every delivered column of the WMS quant

Owner 19./20.11.2026: „warum bilden wir nicht 46 felder einfach ab, wenn wir sie schon haben?“ — every column the reference plant's sim delivers is mapped; nothing invented, nothing dropped. Measured on sim-v5 PROD (192.168.178.154, GET only) on 19.11.2026.

GET :38224/api/wms/quants (5 000 rows, limit=100000 capped at 5 000) delivers 14 columns; 8 were mapped. Mapped now (profile 3.2.0, source sim-v5-wms-quants 2.4.0): hergestellt_am → manufactured_at, mhd → best_before (empty on all 5 000 rows today), erstellt_am → created_at, deleted, deleted_at. B2MML 0701 MaterialSubLot has none of them: notInIsa95. Not mapped: keyset — the paging cursor of the API, aktualisiert_am|quant_id, two mapped columns joined; no attribute.

blocked gets the code list 0, 1: measured 0 on 4 881, 1 on 119 of 5 000 rows. quantity keeps no fixed unit: it is in the article's unit (EA 4 172, KG 815, Stück 12, M 1 rows by the article's einheit).

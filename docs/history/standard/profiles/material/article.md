# profiles/material/article.json — history and reasoning

Moved verbatim out of `profiles/erp/article.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

next/ v4 - product/material master. Attributes aligned to the LIVE projection of source sim-v5-erp-articles. ISA-95 MaterialDefinition (the definition; physical stock is MaterialLot). --- 2026-08-30 CAPT-ITLANE, 2.1.0: NO LONGER a pure reference entity. It carries the plant's stock position (stock_free / stock_reserved / stock_blocked / stock_available) and its planning thresholds (reorder_level / safety_stock), and with them the single-entity rule stock_below_reorder_level. WHY IT MOVED HERE: the identical statement used to live on profiles/wms/quant.json as a literal band [20,500] over ONE PALLET's quantity, and it could neither be true nor fire. Not true, because a Quant is one lot in one bin - median quantity 1 over a 5000-row window of the live WMS, 4745 of 5000 outside [20,500] - so the band judged 95 % of the population as deviating and meant nothing by it. Not able to fire, because quant_id carries a mint timestamp (Q-<machine>-<YYYYMMDDhhmmss>-<article>), so every production event is a NEW entity, each entity is evaluated exactly once, and the anti-chatter run rule 'k=2 of 3' is arithmetically unreachable on a population that is never observed twice. An article is the opposite on every axis that matters: 221 rows, populationComplete=true on every 30 s poll, and 5.5 of them change per minute - a BOUNDED key space with real re-observation, which is the only kind of subject over which 'persistently outside the band' is a sentence at all. The threshold is not invented either: it is the article's own mindestbestand, and it reaches the wire as a FIELD (constraint_observed.reorder_level, beside constraint_observed.stock_available), never as prose. MEASURED YIELD 2026-08-30: 12 of 221 articles (5.4 %) below their reorder level - against 4745 of 5000 for the rule it replaces. impact_basis is deliberately ABSENT: the affected quantity of a below-reorder finding is a planning shortfall, not a scrapped or unsold lot, so there is no honest euro model to declare, and the episode ranks in the proxy tier rather than carrying a fabricated figure into a euro headline.

## attributes › stock_available › description

AVAILABLE-TO-PROMISE: free minus reserved (verfuegbar). THE operand of stock_below_reorder_level. Deliberately not stock_free: a pallet that is physically present but already committed cannot cover the next demand, and cross-constraints/material_unavailable#successor names exactly this ('a stock operand that is a real reservation/ATP figure, not a raw quant snapshot') as its precondition. MEASURED .154:38260 2026-08-30: present on 218 of 221 rows; the 3 nulls make the rule read 'unknown', never 'ok'.

## attributes › reorder_level › description

Reorder level / Meldebestand from the ERP article master (mindestbestand). THE THRESHOLD OF stock_below_reorder_level, and it is PER ARTICLE: measured 2026-08-30 it takes 43 distinct values from 8 to 5000 (WIP 8/10/20, RAW 20..700, FINISHED 0..5000, CONSUMABLE 80..5000). That range is the evidence that the retired literal band [20,500] on Quant.quantity was a single WIP-shaped number applied to every material in the plant.

## attributes › safety_stock › description

Safety stock (safety_stock). Carried for completeness and NOT used by a rule: measured 2026-08-30 the smallest margin (stock_available - safety_stock) across the 182 articles with a positive safety stock is 230, and all 12 articles currently below their reorder level have safety_stock = 0, so a 'below safety stock' rule could not fire against this population. Declaring it anyway would add a second error-severity alarm with the wire cut - the defect that retired qty_shortfall and material_unavailable. The number is recorded here instead of being asserted by a dormant guard.

## constraints › stock_below_reorder_level › description

TOMBSTONE - the rule body below is preserved VERBATIM as it ran until 2026-11-14. It is evidence, not configuration; retired:true means it is loaded, never evaluated, and its open episodes are superseded with superseded_by=retirementId (retired:stock_below_reorder_level@2026-11-14). Its operand stock_available left the article in core 6.2.0 (next section). Original description follows. >>> Stock below the reorder level: the article's available-to-promise stock (free minus reserved) has fallen under the reorder level the ERP article master declares FOR THIS ARTICLE. The IT/planning counterpart to the OT machine bands - a materials-planning finding about an article, not about a machine.

## core 6.2.0 (0.7.2, owner 14.11.2026) — the stock leaves the article

Core 6.2.0 first kept stock_free, stock_reserved, stock_blocked and stock_available on the article (M-34, 13.11.2026): the stock had become
its own record, SMProfile-OperationsCapability quantity per article × storage location × capability type (B2MML MaterialCapability; the
reference plant's source sim-v5-stock-capability), but "deprecated = error" (owner 07.10.2026, from core 4.0.0) would have refused the move
of every plant of core 6.1.0, which maps the four. Owner 14.11.2026: "direkt umstellen bitte … wir haben das system noch bei keinem kunden am
laufen und somit müssen wir es bei umstellungen bitte im moment nicht überkomplizieren" — no deprecation window. The four are removed
(profile 3.0.0); each is a movedAttributes entry (→ SMProfile-OperationsCapability as quantity, since 6.2.0), so the core move takes their
mappings out of a plant's article sources and lists where they went (standard.json breaking: article-stock-to-capability). One article
figure becomes one record per storage location, told apart by capability_type in the core's own words: Total = on hand, Committed =
reserved (stock_reserved), Unattainable = blocked (stock_blocked), Available = Total − Unattainable − Committed (stock_available). The rule
stock_below_reorder_level compared stock_available with reorder_level on the same record; with the stock on another record it is retired
(above), not repaired in place — a comparison across two records is no single-entity constraint of the article. reorder_level and
safety_stock stay on the article (the thresholds of the ERP article master).

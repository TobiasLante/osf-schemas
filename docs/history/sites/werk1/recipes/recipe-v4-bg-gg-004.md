# recipe-v4-bg-gg-004

## description

Recipe of _V4_BG-GG-004 (Dichtungssatz Getriebe) for its operation 10 Spritzgiessen Dichtungssatz (SGM-GENERIC, routing _V4_AP-BG-GG-004); material family PA66GF30; materials from the BOM: PA66 GF30 Granulat, PP Granulat schwarz; cycle time 22 s from the routing; tool _V4_SGW-004. Windows: typical processing windows of the material family / process (process_estimate), written for R3 of 0.7.0 — not measured on the part. Assumptions: part mass 25 g (no gewicht_kg in the ERP).

## 0.7.0 C (30.10.2026)

The nozzle temperature band is recipe:melt_temp_band, the ref the class declares and its rule recipe_melt_temp_band reads on Act_Temp_Nozzle (was recipe:nozzle_temp_c_band, a second name no class declared; owner 30.10.2026: a recipe value exists only if the class declares it). Values unchanged.

The part mass band is dropped: it rested on an assumed part mass (no gewicht_kg in the ERP, no drawing, not measured) — a value without evidence is dropped, not guessed (owner 30.10.2026). The rule recipe_part_mass_band stays dormant for this article until a drawing or a measurement gives the band.

## 1.2.0 (11.11.2026)

Control limits for the six bands brain-operator watches: recipe:hotrunner_control_limits, recipe:mould_temp_control_limits, recipe:barrel_zone1_control_limits … recipe:barrel_zone4_control_limits. Owner 11.11.2026: control limits in every article recipe, warn at a fixed distance as in the machine default recipes — action = the band itself, warn = the band inset by 3 °C (hot runner), 2 °C (mould) and 3.25 °C (barrel zones 1–4); toleranceSource process_estimate, capability as the band. The bands are unchanged. Before, only the machine default recipes carried control limits, so a job with an article recipe was not watched.

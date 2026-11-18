# recipe-v4-bg-gh-010

## description

Recipe of _V4_BG-GH-010 (O-Ring Set NBR/FKM) for its operation 10 Spritzgiessen O-Ring Set (SGM-GENERIC, routing _V4_AP-BG-GH-010); material family PC; materials from the BOM: PC UV-stabilisiert; cycle time 18 s from the routing; tool _V4_SGW-010. Windows: typical processing windows of the material family / process (process_estimate), written for R3 of 0.7.0 — not measured on the part. Assumptions: part mass 25 g (no gewicht_kg in the ERP).

## 0.7.0 C (30.10.2026)

The nozzle temperature band is recipe:melt_temp_band, the ref the class declares and its rule recipe_melt_temp_band reads on Act_Temp_Nozzle (was recipe:nozzle_temp_c_band, a second name no class declared; owner 30.10.2026: a recipe value exists only if the class declares it). Values unchanged.

The part mass band is dropped: it rested on an assumed part mass (no gewicht_kg in the ERP, no drawing, not measured) — a value without evidence is dropped, not guessed (owner 30.10.2026). The rule recipe_part_mass_band stays dormant for this article until a drawing or a measurement gives the band.

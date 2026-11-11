# recipes/recipe-v4-14-1300-040-pmma.json — history and reasoning

## description (25.09.2026)

Part values of _V4_14-1300-040 on the injection moulding machine class. sgm-006 runs it now: ERP order CO-2026-09-25-045229-7920 and OPC-UA agree, mould MOULD-PART-H-v1 (sim-v5 .154, 25.09.); material _V4_RM-PMMA-TR. Values = the sgm-006 part values parked by W8-RECIPE (measured on the machine, no drawing yet ⇒ process_estimate); history: docs/history/sites/werk1/settings/sgm-006.settings.md.

Owner 25.09.2026: a machine never runs without a recipe. The part values were parked by W8-RECIPE because the old
per-machine file named no part; the part each machine runs was read from sim-v5 on .154 (OPC-UA program + ERP order).
All four bands are process_estimate: they are what the machine holds today, not a drawing. Replace part_mass_band with a
drawing-derived band as soon as the drawing exists (see recipe-v4-12-0044-003-pa66gf30.json for the pattern).

## 0.7.0 R3 (29.10.2026)

18 parameters added from the typical PMMA processing window (process_estimate), the earlier values unchanged.

## 0.7.0 C (30.10.2026)

The nozzle temperature band is recipe:melt_temp_band, the ref the class declares and its rule recipe_melt_temp_band reads on Act_Temp_Nozzle (was recipe:nozzle_temp_c_band, a second name no class declared; owner 30.10.2026: a recipe value exists only if the class declares it). Values unchanged.

## 1.4.0 (11.11.2026)

Control limits for the six bands brain-operator watches: recipe:hotrunner_control_limits, recipe:mould_temp_control_limits, recipe:barrel_zone1_control_limits … recipe:barrel_zone4_control_limits. Owner 11.11.2026: control limits in every article recipe, warn at a fixed distance as in the machine default recipes — action = the band itself, warn = the band inset by 3 °C (hot runner), 2 °C (mould) and 3.25 °C (barrel zones 1–4); toleranceSource process_estimate, capability as the band. The bands are unchanged. Before, only the machine default recipes carried control limits, so a job with an article recipe was not watched.

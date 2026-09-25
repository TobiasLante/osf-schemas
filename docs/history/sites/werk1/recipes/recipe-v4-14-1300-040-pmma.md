# recipes/recipe-v4-14-1300-040-pmma.json — history and reasoning

## description (25.09.2026)

Part values of _V4_14-1300-040 on the injection moulding machine class. sgm-006 runs it now: ERP order CO-2026-09-25-045229-7920 and OPC-UA agree, mould MOULD-PART-H-v1 (sim-v5 .154, 25.09.); material _V4_RM-PMMA-TR. Values = the sgm-006 part values parked by W8-RECIPE (measured on the machine, no drawing yet ⇒ process_estimate); history: docs/history/sites/werk1/settings/sgm-006.settings.md.

Owner 25.09.2026: a machine never runs without a recipe. The part values were parked by W8-RECIPE because the old
per-machine file named no part; the part each machine runs was read from sim-v5 on .154 (OPC-UA program + ERP order).
All four bands are process_estimate: they are what the machine holds today, not a drawing. Replace part_mass_band with a
drawing-derived band as soon as the drawing exists (see recipe-v4-12-0044-003-pa66gf30.json for the pattern).

# recipes/recipe-wip-housing-base-asa-pc.json — history and reasoning

## description (25.09.2026)

Part values of WIP-HOUSING-BASE on the injection moulding machine class. sgm-005 runs it now: OPC-UA shot/currentProgram = WIP-HOUSING-BASE, mould MOULD-PART-G-v1 (sim-v5 .154, 25.09.); ERP article WIP-HOUSING-BASE, BOM _V4_RM-ASA-WS + _V4_RM-PC-TR. Values = the sgm-005 part values parked by W8-RECIPE (measured on the machine, no drawing yet ⇒ process_estimate); history: docs/history/sites/werk1/settings/sgm-005.settings.md.

Owner 25.09.2026: a machine never runs without a recipe. The part values were parked by W8-RECIPE because the old
per-machine file named no part; the part each machine runs was read from sim-v5 on .154 (OPC-UA program + ERP order).
All four bands are process_estimate: they are what the machine holds today, not a drawing. Replace part_mass_band with a
drawing-derived band as soon as the drawing exists (see recipe-v4-12-0044-003-pa66gf30.json for the pattern).

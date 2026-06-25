# next/recipes/ — GitHub-managed recipe master data (ISA-95 ProductDefinition SOLL)

This folder is the **single home for recipe / ProductDefinition master data**, managed in
GitHub — **no other system**. Owner: **Process Engineering**.

A recipe is the data behind the constraint hook **`valueFrom: recipe:<param>`**
(ISA-95 Definition-Leg). A running entity (article × equipment × setup) selects the
active recipe, whose tolerance bands / setpoints become the **RHS** of a constraint —
so the **same** rule (`recipe_hotrunner_temp_band`, …) yields **per-article limits**.

## How it goes live (runtime fetch, no redeploy)

The `it-evaluator` is configured with `RECIPE_SOURCE=github:<owner>/<repo>[@ref][:path]`
(default path `next/recipes`). Its **`GithubRecipeSource`** fetches every `*.json` here at
runtime and refreshes on an interval. **Edit a band, push to GitHub → the new band is live**
on the next refresh. No image rebuild, no edge redeploy.

Until a recipe binds a `valueFrom` ref, the constraint stays **dormant** (skipped, no raise,
no crash) — exactly as with `RECIPE_SOURCE=none`.

## File shape (one file per recipe)

```jsonc
{
 "recipeId": "RECIPE-sgm-004-PA66GF30-housing-A",
 "version": "1.0.0", // bump on any value change
 "owner": "Process Engineering",
 "profileRef": "SMProfile-InjectionMoldingMachine",
 "match": { "article": "housing-A", "equipment": "sgm-004", "setup": "mould-A" },
 "values": { // recipe:<param> -> SpecValue
 "recipe:hotrunner_temp_band": [225, 234], // [lo,hi] for op=between
 "recipe:cycle_time": 42 // scalar for eq/lte/gte
 },
 "parameters": [ /* optional human doc — NOT read by the resolver */ ]
}
```

- **`match`** maps to the entity's binding axes. The evaluator pulls them from the entity
 state via `RECIPE_KEY_ARTICLE_FIELD` / `RECIPE_KEY_EQUIPMENT_FIELD` / `RECIPE_KEY_SETUP_FIELD`
 (defaults `article_ref` / `machine_ref` / `setup_ref`). An empty `match` is a catch-all.
- **`values`** keys are the reserved `recipe:<param>` refs the constraints address
 (`constraint-schema.json` pattern `^(recipe|definition):[A-Za-z0-9_.-]+$`).
- The **first** recipe whose `match` is a subset of the entity key wins **per ref** (a later
 recipe only fills refs an earlier one did not). Order across files is `recipeId`-sorted.

## Validation

- Structure: `next/validation/recipe-schema.json` (ajv).
- Cross-ref + types: `node next/ci/lint-recipes.mjs` (band tuples numeric, ref namespace,
 no duplicate match within a profile).

## Relation to the edge (sgm-004)

The sgm-004 bands here are the recipe master data. The OT **edge stays literal-only**
([[feedback_telemetry_event_strict_separation]]): when the band-delivery path is wired,
the active band is resolved centrally from this file and delivered to the edge detector.
Central/IT entities (the ProductDefinition/oven path) resolve `valueFrom` directly in the
it-evaluator today.

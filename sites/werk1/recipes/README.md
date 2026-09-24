# recipes/ — GitHub-managed recipe master data (ISA-95 ProductDefinition SOLL)

This folder is the **single home for recipe / ProductDefinition master data**, managed in
GitHub — **no other system**. Owner: **Process Engineering**.

A recipe is the data behind the constraint hook **`valueFrom: recipe:<param>`**
(ISA-95 Definition-Leg). A running entity (article × equipment × setup) selects the
active recipe, whose tolerance bands / setpoints become the **RHS** of a constraint —
so the **same** rule (`recipe_hotrunner_temp_band`, …) yields **per-article limits**.

## How it goes live (runtime fetch, no redeploy)

The `it-evaluator` is configured with `RECIPE_SOURCE=github:<owner>/<repo>[@ref][:path]`,
pointed at this folder (`recipes/`). Its **`GithubRecipeSource`** fetches every `*.json`
here at runtime and refreshes on an interval. **Edit a band, push to GitHub → the new band
is live** on the next refresh. No image rebuild, no edge redeploy.

Until a recipe binds a `valueFrom` ref, the constraint stays **dormant** (skipped, no raise,
no crash) — exactly as with `RECIPE_SOURCE=none`.

## File shape (one file per recipe)

Shortened from the real `recipe-sgm-004-pa66gf30-housing-a.json`. Note that
**`toleranceSource` and `capability` are REQUIRED** by
`validation/recipe-schema.json` — a recipe without them fails CI. (An earlier
version of this README showed an example without both; the repo's own CI
rejected the README's own example.)

```jsonc
{
  "recipeId": "RECIPE-sgm-004-PA66GF30-housing-A",
  "version": "3.3.0",                              // bump on any value change
  "owner": "Process Engineering",
  "profileRef": "SMProfile-InjectionMoldingMachine",
  "match": { "article": "housing-A", "equipment": "sgm-004", "setup": "mould-A" },
  "values": {                                      // recipe:<param> -> SpecValue
    "recipe:part_mass_band": [10.01, 10.69],       // [lo,hi] for op=between
    "recipe:mould_temp_band": [80, 90]
  },
  "toleranceSource": {                             // REQUIRED — WHERE each band comes from
    "recipe:part_mass_band": "drawing",            // drawing/customer_spec/norm = BINDING (violation -> fix_reality)
    "recipe:mould_temp_band": "norm"               // process_estimate = correctable (fix_charter) · unknown = evidence gap
  },
  "capability": {                                  // REQUIRED — what each band DEMANDS (PE policy, never code)
    "recipe:part_mass_band": {
      "cp_min": 1.33,                              // below: the BAND is not holdable -> recipe deviates
      "ca_max": 0.125,                             // above: the MACHINE misses the nominal -> machine deviates
      "max_stationarity_ratio": 2,                 // above: sample mixes regimes -> verdict WITHHELD
      "population": {                              // WHICH Grundgesamtheit the verdict is about
        "scope": "current_regime",
        "regime_markers": {
          "on_change": ["mouldId", "currentProgram", "resin"],
          "on_reset": ["shotCount"]
        },
        "min_sample_n": 1000                       // below: capability_unjudged, never topped up from old history
      }
    },
    "recipe:mould_temp_band": { "cp_min": 1.33, "ca_max": 0.125, "max_stationarity_ratio": 2 }
  },
  "parameters": [ /* per-parameter detail — PARTLY CONSUMED: the resolver reads
                     `soll` + `valueFrom` (SpecMeta.soll, the recipe's CLAIM), and the
                     optional `economics` block is the ONLY thing that authorises a
                     €-figure. The rest is documentation. */ ]
}
```

- **`match`** maps to the entity's binding axes. The evaluator pulls them from the entity
  state via `RECIPE_KEY_ARTICLE_FIELD` / `RECIPE_KEY_EQUIPMENT_FIELD` / `RECIPE_KEY_SETUP_FIELD`
  (defaults `article_ref` / `machine_ref` / `setup_ref`). An empty `match` is a catch-all.
- **`values`** keys are the reserved `recipe:<param>` refs the constraints address
  (`constraint-schema.json` pattern `^(recipe|definition):[A-Za-z0-9_.-]+$`).
- The **first** recipe whose `match` is a subset of the entity key wins **per ref** (a later
  recipe only fills refs an earlier one did not). Order across files is `recipeId`-sorted.
- A recipe that can never match (e.g. an article the ERP does not know) is **parked** in-file
  (`parked: true` + `parkedReason`) instead of silently shipping — see
  `recipe-sgm-004-pa66gf30-housing-a.json` for a real, measured example.

## Validation

- Structure: `validation/recipe-schema.json` (ajv, via the CI shape-validation step).
- Cross-ref + types: `node ci/lint-recipes.mjs` (= `npm run validate:recipes`; band tuples
  numeric, ref namespace, no duplicate match within a profile, `match.equipment` must be a
  machine id declared in `sources/**`).

## Relation to the edge (sgm-004)

The sgm-004 bands here are the recipe master data. The OT **edge stays literal-only**
([[feedback_telemetry_event_strict_separation]]): when the band-delivery path is wired,
the active band is resolved centrally from this file and delivered to the edge detector.
Central/IT entities (the ProductDefinition/oven path) resolve `valueFrom` directly in the
it-evaluator today.

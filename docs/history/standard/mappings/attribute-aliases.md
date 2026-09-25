# mappings/attribute-aliases.json — history and reasoning

Moved verbatim out of `mappings/attribute-aliases.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Cross-profile attribute equivalences: which differently-named attributes carry the same measurement. Validated by ci/lint-attribute-aliases.mjs against the profiles themselves — wire kind, unit, and the full delivery contract (delivery / scope / promotion) must agree for every member, or the build fails. See validation/attribute-alias-schema.json for why this is not kpis/*.json inputMappings.

## W8-OBJECTS (25.09.2026)

The entries good ≡ Act_Amount_PartGood and scrap ≡ Act_Amount_PartScrap are retired: both sides moved to one attribute each on SMProfile-SegmentResponse (qty_good, qty_scrap), so there is nothing left to alias. See docs/history/standard/profiles/operations/segment-response.md.

# profiles/_skeleton.template.json — history and reasoning

Moved verbatim out of `profiles/_skeleton.template.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## _comment

SKELETON FIXTURE — copy-template for onboarding a new profile (skeleton-first). NOT a live profile: it has no real attributes/relationships/constraints yet. Copy it into the matching category folder (machines/ | equipment/ | erp|qms|wms/), rename, set a real profileId, switch 'category' to match the folder (machine|equipment|business), fill in isa95.objectModel, then add attributes/relationships/constraints/kpiRefs incrementally. category=machine is the neutral default here (loosest rules); for equipment/business isa95.objectModel is required (already filled with a placeholder). Validates against next/validation/profile-unified-schema.json as a near-empty draft. Block order is the canonical skeleton order. Excluded from the category<->folder lint (it lives directly under profiles/, not in a category folder).

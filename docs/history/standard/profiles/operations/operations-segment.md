# profiles/operations/operations-segment.json — history and reasoning

Moved out of `profiles/operations/operations-segment.json`, where each field holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description (Welle 12, 25.09.2026)

Level-3 MOM OperationsSegment (ISA-95 Part 2 / B2MML OperationsSegment): one step of an OperationsDefinition (routing), with the material and equipment class it needs. No source yet: sim-v5 serves routings (GET /api/arbeitsplaene; erp-operations /operations-definitions + /process-segments, measured 25.09.) — which endpoint feeds this profile is an open model decision (Welle 12). The earlier statement "routings are write-only in sim-v5 today" was wrong: it came from openapi.json, which listed only the editor writes; GET /api/arbeitsplaene answered 574 operations in 242 plans (measured .154:38260, 25.09.2026), and erp-operations serves /operations-definitions (147) and /process-segments (500 per page).

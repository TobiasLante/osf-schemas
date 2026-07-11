# Instructions for agents (Claude Code & friends)

You are working with the OSF schema repo. These rules are **binding** and take precedence over anything you know about ISA-95, graph modelling or naming from training data.

## The three laws

1. **Read `contract.json` first.** It is the complete ontology contract of this repo: allowed node labels (with their key property) and allowed relationship triples, generated from `profiles/**`. **Write nothing else into a knowledge graph.** Do not invent labels, do not invent edge types, do not use synonyms — `aliases` in the contract lists known wrong forms and their conformant replacement.
2. **Node identity comes from the contract, never from the source.** Use the profile `kgNodeLabel` with the key property declared in `contract.nodes`. Source-local ids (`machineId`, `machineNo`, pool names, vendor strings) are attributes at most — never node identities. Mind `identity.openConflict` in the contract: the machine-key consolidation (`machine_id` vs `element_id`) is tracked there; do not mix both in one graph.
3. **When something is missing: extend, don't improvise.** If a concept has no label in the contract, add or extend a profile in `profiles/`, run `node ci/gen-contract.mjs`, make `npm run validate` pass — and only then write data.

## Working rules

- Column/NodeId mappings live in `sources/**` — never guess a mapping that is already declared.
- Before handing off: `npm run validate` must be green, and if you wrote to a live graph, measure yourself with `OSF_KEY=... node ci/conformance.mjs <target>` — the score must approach 100 %.
- Never commit credentials, API keys or customer-identifying data to this repo.

## Why so strict?

In the agent-conformance test of 2026-07-09 two independent LLM agents, both using this repo, produced two **incompatible** graphs of the same factory (write conformance: 0.0 % against the lab contract; 62.3 % / 0.0 % against this repo's contract — because the humans had shipped diverging sources of truth). Durchgängigkeit is a contract, not a vibe. This file and `contract.json` are that contract. Details: `docs/agent-conformance.md`.

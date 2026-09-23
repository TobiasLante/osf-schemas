# mappings/machine-type-aliases.json — history and reasoning

Moved verbatim out of `mappings/machine-type-aliases.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Canonical machine-type vocabulary. Maps the words an operator (or the discovery chat-LLM parsing them) actually uses for a machine class onto the SM profile that models it. Discovery resolves `machineType` through this table BEFORE it considers generating a new profile: v4 serves no live schema writes, so a profile the wizard invents can never be committed, and both map-tags-to-profile and the NATS schema-deploy refuse a profileRef they cannot resolve. Terms are compared NORMALISED — lowercased with every non-alphanumeric character removed, so `Spritzguss-Maschine` and `spritzgussmaschine` are the same term and `Fräsmaschine` becomes `frsmaschine`. List both spellings where a diacritic changes the normalised form (`spritzgiessmaschine` vs `spritzgießmaschine`). Terms must be unique across entries, and a profileRef must name a concrete (non-abstract) profile — a source cannot reference an abstract parent.

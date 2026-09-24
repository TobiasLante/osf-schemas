# historians/postgresql/historian-template.json — history and reasoning

Moved verbatim out of `historians/postgresql/historian-template.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## $description

Historian-Write-Template für Postgres / TimescaleDB via node-red-contrib-postgresql. Tabellen-Shape ist die uns_history aus bigdata_homelab (v1-erprobt, 1:1 zum 6-Segment-UNS-Topic). NR-Flow-Generator (packages/exporters/src/node-red-historian.ts) liest dieses Schema und baut: mqtt-in (Factory/#) → row-builder (parst Topic + Payload zu Spalten-Array) → batch (500/1s) → postgres-insert. Connection-Felder werden aus HISTORIAN_*-env interpoliert. Pusht zur IT-NR-Instanz (NODE_RED_IT_URL), nicht zum OT-NR. LEGACY-STAND 2026-07-15 (CAPT-HIST, gemessen): der hier genannte Generator packages/exporters/src/node-red-historian.ts existiert weder in i3x-v4 noch in i3x-v4-edge und POST /api/export/historian ist im v4-Gateway ein 501-Stub — nichts Aktives liest dieses Template; das 6-Segment-MQTT-Topic (Factory/{site}/{type}/...) ist die v1/MQTT-Ära-Konvention, NICHT die aktive 5-Segment-NATS-Konvention aus docs/conventions.md (dafür: historians/nats-jetstream/historian-template.json).

## topicParser › $description

Vor dem row-builder fügt der Generator einen Function-Node ein, der das 6-Segment-UNS-Topic parst (Factory/site/type/machineId/category/attribute) und msg._machine / _category / _variable setzt. Außerdem klassifiziert er payload.Value zahlsicher zu msg._valueNum / msg._valueText, damit beide Spalten korrekt gefüllt werden.

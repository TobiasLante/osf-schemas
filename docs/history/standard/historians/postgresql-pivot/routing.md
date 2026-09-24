# historians/postgresql-pivot/routing.json — history and reasoning

Moved verbatim out of `historians/postgresql-pivot/routing.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## $description

Pivot-Transformer-Routing für die Wide-Tables in i3x_alpha. Der Generator (packages/exporters/src/historian-pivot.ts) liest dieses Schema, korreliert es mit allen sources/opcua/<source>.json und packages/profiles/machines/*.json, und leitet daraus für jede Regel ab: (a) das DDL der Ziel-Tabelle (Spalten = union der smAttributes aller passenden Sources, Typen aus OPC-UA dataType), (b) den NR-Flow der die Pivot-SQL alle refreshIntervalSec ausführt. Topic-Position-Routing: topic[2]=type, topic[4]=category sind der einzige Match-Key. Neue Maschine = automatischer Pivot ohne Schema-Edit. Neuer Profile-Attribute = idempotent ALTER TABLE ADD COLUMN. KEIN per-Tabelle-Schema, KEIN Hardcoded Spalten-Map.

# ⚰️ ARCHIVIERT 2026-07-17 — `central-ts.json` (v3-Altartefakt, kein Consumer)

> **Tombstone (CAPT-CENTRALTS, 2026-07-17).** `historians/instances/central-ts.json`
> war ein **i3x-v3-Historian-Instanz-Deklarat**, nicht der Live-v4-Central-TS. Es wurde
> hierher verschoben (aus `historians/instances/`), damit die aktive Instanz-Liste nur noch
> die realen **Edge**-TS-Instanzen (`edge-cnc-001`, `edge-cnc-002`, `edge-sgm-001`) enthält.
> Der ursprüngliche Inhalt liegt unverändert daneben (`central-ts.json`) als historische Referenz.

## Warum tot — gemessen, nicht vermutet

Alle Belege am Tag der Archivierung (2026-07-17), i3x-v4 @ `f00c977`, osf-schemas @ `capt/golden-schemas`:

1. **v3-Host + v3-Image.** Die Datei zeigt auf `host: central-ts.i3x-v3.svc.cluster.local`,
   `queryRoute.endpoint: central-ts.i3x-v3.svc.cluster.local:5432`, und wird laut
   `fedBy` von `service: historian`, `image: i3x-zentral/historian:1.0.2`,
   `natsConsumer: central-ts-historian` gespeist — alles i3x-v3-Namensraum.

2. **Der speisende Dienst existiert in v4 nicht.** In `/opt/i3x-v4` gibt es **kein**
   `services/historian`; Grep nach `i3x-zentral/historian`, `central-ts-historian`,
   `servedMachineTypes` = **0 Treffer**.

3. **Kein Consumer liest die Datei.** Voll-Grep über `/opt/i3x-v4`:
   - `historians/instances` → **0 Treffer** (kein Pfad-Load)
   - `subjectFilter` → **0 Treffer** (das Feld liest niemand)
   - per-Typ-Tabellennamen (`cnc_event_data`, `cnc_telemetry_data`,
     `cnc_tool_magazine_event_data`, `sgm_event_data`, `sgm_telemetry_data`,
     `sgm_cavity_telemetry_data`) → **0 Treffer**

   Die zwei Stellen, die den osf-schemas-Baum überhaupt lesen, fassen `historians/` nicht an:
   - `services/kg-query/src/repo/schemas.ts` `listSchemas()` (`/api/kg/schemas`) lädt
     **nur** `profiles/`, `sources/`, `sync/`, `kpis/`. Seine generischen
     `listFiles`/`readFile` sind On-Demand-Datei-Browser; **kein** UI-Pfad fordert
     `historians/instances` an (Grep = 0).
   - `services/schema-publisher/src/git-poll.ts` scannt **nur** `sources/opcua`.

4. **Die 7-seg-`subjectFilter` würde das reale Hub-Wire nie matchen.** Die Datei filtert
   z. B. `factory.*.*.*.cnc-*.event.>` (Maschine an Token 5, 7-Segment-Shape). Class-C-Events
   erreichen die zentrale DB laut `docs/conventions.md` aber als **5-Segment**
   `factory.<site>.<machine>.<category>.<attribute>` (7-Segment wird von der `nats-bridge`
   bewusst als `telemetry_raw` verworfen). Ein aus dieser Datei generierter Consumer hätte
   also **nie** ein zentrales Event gesehen.

5. **Die deklarierten per-Typ-Tabellen wurden nie angelegt (0 Zeilen)** — gemessen auf .99
   (User-Vorbefund, Entscheidungsgrundlage dieser Archivierung).

## Was das hier NICHT betrifft

- **`historians/central-ts-tables/{cnc,sgm}.json`** bleibt aktiv im Repo: das sind die
  DDL-Specs für den `central-ts-init`-Renderer und ein **anderes** Artefakt als diese
  Instanz-Datei. Nicht mit archiviert.
- **Der Live-v4-Central-TS** (`deploy/compose/compose.central.yml`, `deploy/k8s/v4/15-central-ts.yaml`,
  Consumer discrepancy-engine/vault/grafana/flow-aggregator/gateway) ist eine reale,
  generische TimescaleDB — er hat mit dieser v3-Instanz-Deklaration nichts zu tun und wird
  von der Archivierung nicht berührt.

## Validate bleibt grün

- `validate-all.mjs` läuft nur über `profiles/ sources/ sync/ recipes/ mappings/` — `historians/`
  und `backup/` werden nicht gescannt.
- Kein Validator in `ci/` liest `historians/instances` oder `subjectFilter` (Grep = 0).
- Einziger Berührungspunkt: die Baum-Zählung in README.md/schema-guide.md (`gen-docs.mjs`,
  DEEP_DIR `historians`). Wurde nach dem Move mit `npm run gen:docs` frisch regeneriert
  (`instances/` 4 → 3, `backup/` +1). `npm run validate` (inkl. `validate:docs --check`) und
  `validate-all.mjs` bleiben grün.

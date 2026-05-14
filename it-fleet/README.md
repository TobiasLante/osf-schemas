# it-fleet — IT-Edge Inventory (Customer-Konfiguration)

**Single Source of Truth** fuer alle IT-Edges einer i3x v3 Installation.
Analog zu [`i3x-fleet-inventory`](https://github.com/TobiasLante/i3x-fleet-inventory) (das die OT-Edges deklariert), hier deklarativ versioniert die IT-seitigen Edge-Pods (Postgres-Poller, REST-Adapter, ...).

## Was das hier ist

Eine IT-Datenquelle (ERP, QMS, WMS, OEE-System ...) kommt nur in den i3x-v3-Cluster, wenn sie hier eingetragen ist:

- `i3x-suite-it/packages/server` (it-gateway) liest dieses Verzeichnis und exposed `/v1/fleet/it`
- `packages/web` (it-web) zeigt registrierte Edges auch dann, wenn der Pod (noch) nicht laeuft (Status `registered`)
- `scripts/generate-edge-manifests.ts` (im i3x-suite-it Repo) erzeugt aus diesen Files die k8s-Deployment-Manifests in `deploy/k8s/v3/30-it-edge-<edgeId>.yaml`

## Was das hier NICHT ist

- **Source-Schemas** (Tabellen, Spalten, profileRef, columnMap) leben in `osf-schemas/sources/postgresql/<sourceId>.json` — das ist die Schema-Definition. Hier in `it-fleet/` steht nur **wo** der Edge-Pod laeuft, **welcher** Tenant, **welche** k8s-Secrets/ConfigMaps die Connection-Werte liefern.
- **Live-Status** (Heartbeat, last_seen, entity_counts) — kommt aus NATS `business.heartbeat.>` und wird vom it-gateway in-RAM gehalten.
- **Container-Image-Builds** — kein Code, nur Konfig.

## Format

`edges/<edge-id>.yaml` pro IT-Edge. Beispiel `edges/it-erp-sap.yaml`:

```yaml
edgeId: it-erp-sap                # Service-Name im k8s-Cluster
sourceId: it-erp-sap              # references osf-schemas/sources/postgresql/it-erp-sap.json
tenant: demo
customer: customer-x
deployTarget: i3x-v3              # k8s namespace
displayName: ERP - SAP Production
dbConnection:
  type: postgresql
  hostEnv: ERP_DB_HOST            # ConfigMap key it-suite-config/ERP_DB_HOST
  portEnv: ERP_DB_PORT
  userEnv: ERP_DB_USER
  passwordSecret: it-suite-secrets/ERP_DB_PASSWORD
  dbNameEnv: ERP_DB_NAME
pollIntervalMs: 60000             # Default; konkrete Tabellen-Intervalle stehen im sourceSchema
enabled: true
notes: "Demo-Seed auf .150 erpdb. Phase-5b umstellen auf Customer-SAP."
```

## Pflicht-Felder

| Feld | Pflicht | Beispiel | Beschreibung |
|---|---|---|---|
| `edgeId` | x | `it-erp-sap` | k8s-Service-Name (lowercase, kebab-case, max 32 chars) |
| `sourceId` | x | `it-erp-sap` | verweist auf `sources/postgresql/<sourceId>.json` |
| `tenant` | x | `demo` | tenant-key fuer NATS-Subjects (`business.<tenant>.<source>...`) |
| `customer` | x | `customer-x` | Mandant fuer Multi-Customer-Deployment |
| `deployTarget` | x | `i3x-v3` | k8s-Namespace |
| `enabled` | x | `true` | wenn `false`: Generator skipped Manifest, Inventory zeigt `disabled` |
| `displayName` |  | `ERP - SAP` | UI-Label, default = `edgeId` |
| `dbConnection.type` |  | `postgresql` | future-proof; aktuell nur postgresql |
| `dbConnection.*Env` |  | `ERP_DB_HOST` | Schluessel in `it-suite-config` ConfigMap |
| `dbConnection.passwordSecret` |  | `it-suite-secrets/ERP_DB_PASSWORD` | `<secret-name>/<key>` |
| `pollIntervalMs` |  | `60000` | Default-Poll-Interval; per-Tabellen-Override im sourceSchema |
| `notes` |  | freitext | |

## Onboarding-Prozess (neuer IT-Edge)

1. Source-Schema in `osf-schemas/sources/<type>/<source-id>.json` anlegen (Welle-1 manuell, oder Auto-Explore Welle-2)
2. Hier `edges/<edge-id>.yaml` ergaenzen, commit + push (Branch `v3`)
3. (optional) `pnpm tsx scripts/generate-edge-manifests.ts` im `i3x-suite-it`-Repo laufen lassen, generiertes Manifest reviewen + applyen
4. it-web `/edges` zeigt den neuen Edge sofort als `registered` (auch ohne Pod)
5. Sobald der Pod heartbeat schickt, wechselt Status auf `online`

## Decommissioning

1. `enabled: false` setzen, commit + push -> UI zeigt `disabled`
2. Alternativ Datei loeschen + Manifest aus k8s entfernen

## Git-Layout

- Repo: [`osf-schemas`](https://github.com/TobiasLante/osf-schemas), Branch `v3`
- Pfad: `it-fleet/`
- Loaded by: `i3x-suite-it/packages/server` via `OSF_SCHEMAS_REPO_URL` + `SCHEMA_REPO_BRANCH`

## Warum nicht ein eigenes Repo?

Im OT-Fall (`i3x-fleet-inventory`) lebt das Inventory in einem eigenen Repo, weil dort jede Maschine fuer sich onboarded wird (Bootstrap-Script schreibt eine Zeile in `inventory.tsv`). IT ist anders: Die IT-Quelle (ERP/QMS/...) referenziert immer ein konkretes Source-Schema, das schon in `osf-schemas` lebt. Trennen wuerde nur einen zusaetzlichen Clone-Pfad in den Edge-Containern erzwingen. Ein Sub-Verzeichnis im selben Repo halt SSOT und Inventory **synchron commitbar** (Schema-Version + Edge-Topologie in einem PR).

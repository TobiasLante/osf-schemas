#!/usr/bin/env python3
"""Render central-ts CREATE TABLE + hypertable + indexes + retention SQL from
the per-MachineType JSON specs in this folder.

Usage:
    python3 render-ddl.py             # emits SQL for all *.json to stdout
    python3 render-ddl.py cnc sgm     # only the listed types
    python3 render-ddl.py | psql ...  # apply directly to central-ts

Idempotent: all DDL uses IF NOT EXISTS. Re-running adds new tables when a
fresh MachineType file lands in this folder, never alters existing ones
(column changes are an explicit migration captain, not auto-DDL).
"""
import json
import sys
from pathlib import Path


def render_table(t):
    cols = []
    for c in t["columns"]:
        line = f'  "{c["name"]}"   {c["type"]}'
        if c.get("notNull"):
            line += " NOT NULL"
        if c.get("default"):
            line += f" DEFAULT {c['default']}"
        cols.append(line)
    pk = ", ".join(f'"{p}"' for p in t["primaryKey"])
    out = [
        f'CREATE TABLE IF NOT EXISTS public.{t["name"]} (',
        ",\n".join(cols) + ",",
        f"  PRIMARY KEY ({pk})",
        ");",
        f"SELECT create_hypertable('public.{t['name']}','{t['timeColumn']}',"
        f" if_not_exists => TRUE, migrate_data => TRUE);",
    ]
    for idx in t.get("indexes", []):
        out.append(
            f'CREATE INDEX IF NOT EXISTS {idx["name"]} ON public.{t["name"]} {idx["columns"]};'
        )
    if t.get("retention"):
        out.append(
            f"SELECT add_retention_policy('public.{t['name']}',"
            f" INTERVAL '{t['retention'].replace('d',' days')}', if_not_exists => TRUE);"
        )
    out.append("")
    return "\n".join(out)


def main():
    here = Path(__file__).parent
    only = set(a.lower() for a in sys.argv[1:])
    files = sorted(here.glob("*.json"))
    print("-- Auto-generated from historians/central-ts-tables/*.json")
    print("-- Do NOT edit by hand. Source files are SSOT.\n")
    for f in files:
        spec = json.loads(f.read_text())
        if only and f.stem.lower() not in only:
            continue
        print(f"-- ─── {spec['machineType']} ({spec['profileRef']}) "
              f"from {f.name} ───")
        for t in spec["tables"]:
            print(render_table(t))


if __name__ == "__main__":
    main()

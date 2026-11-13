# standard/cross-constraints/ — plan-vs-actual rules across objects

**Active: 0** (core 6.2.0). The four files here are kept as evidence, none of them is evaluated:

| File | State | Why |
|---|---|---|
| late_delivery.json | retired | see its `retired` note |
| material_unavailable.json | retired | see its `retired` note |
| parts_counted_vs_booked.json | parked | see its `parked` note |
| qty_shortfall.json | retired | see its `retired` note |

A cross-constraint becomes active again only as a new version without `retired` / `parked`, with its inputs fed by sources of the plant
(model audit M-41, 0.7.2 K4b).

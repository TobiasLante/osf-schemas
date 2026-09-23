# mappings/mtconnect-dataitem-map.json — history and reasoning

Moved verbatim out of `mappings/mtconnect-dataitem-map.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Canonical MTConnect DataItem -> SM-attribute projection. Keyed by the DataItem-id SUFFIX (the id minus its device-id prefix, e.g. `cnc-03-spindle-speed` -> `-spindle-speed`), so one table serves every MTConnect device. Consumers match the LONGEST suffix first (`-tool-life` wins over `-tool`). One suffix may expand to several attributes: the EXECUTION DataItem drives three. DataItems with no entry here (AVAILABILITY, BLOCK, y/z feedrate ...) carry no SM attribute and are skipped by the consumer.

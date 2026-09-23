# historians/views/machine_index.json — history and reasoning

Moved verbatim out of `historians/views/machine_index.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## $description

Lookup-View die fuer jede Maschine den machine_type und ihre process_table liefert. Aus den existierenden wide-tables abgeleitet — null Maintenance, neue Maschine erscheint automatisch sobald ihr erster pivot-Lauf eine Row schreibt. Das process-Deep-Dive Dashboard nutzt das, um $process_table dynamisch je nach $machine_id zu setzen.

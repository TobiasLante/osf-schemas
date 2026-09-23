# unit-conversions/conversions.json — history and reasoning

Moved verbatim out of `unit-conversions/conversions.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## $description

Unit-Conversion-Tabelle für die Discovery-Pipeline. Wenn Source-Unit ≠ Target-Unit, sucht der Discovery-Code hier nach einem Pair und schreibt `scale` + `offset` ins NodeMapping. Der Flow-Generator / profile-mapper wendet sie dann runtime-frei an: out = in * scale + offset. Keys sind UNECE N°20-Codes (siehe validation/unece-codes.json). Reverse-Pairs explizit eingetragen — keine auto-Inversion, damit die Tabelle komplett sichtbar ist.

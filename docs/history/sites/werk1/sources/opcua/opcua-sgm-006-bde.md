# sources/opcua/opcua-sgm-006-bde.json — history and reasoning

Moved verbatim out of `sources/opcua/opcua-sgm-006-bde.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

OPC-UA BDE source (status/mode/counts/shift) for injection-moulding machine sgm-006 — the sim's Arburg Allrounder 470A (v4-SGM-012) at opc.tcp://192.168.178.154:36065. 2026-07-15: location aligned to the sister convention (enterprise 'factory', area 'sgm', line 'line-a', type 'SGM') — it had shipped area 'Molding'/line 'LineA' with no enterprise/type and therefore landed on a differently-spelled UNS subject than sgm-001/004/005, despite standing in the same physical hall and line.

## version 2.0.1 (core 6.2.0, 12.11.2026, audit core610 §4)

`unitValidation` removed: the discovery result of the onboarding named 94 of 96 attributes the profile no longer has (status, shotCount … before the Act_ rename of core 6.0.0). Nothing reads it; a new discovery run writes a current one.

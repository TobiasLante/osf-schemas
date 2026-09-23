# kpis/energy-per-part.json — history and reasoning

Moved verbatim out of `kpis/energy-per-part.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Energy consumption per good part (Act_Energy_Total / Act_Amount_PartGood). PARKED — see parkedReason; do not push until a source feeds Act_Energy_Total AND its unit + reset semantics are measured. Input contract: canonical = real CNC wire names (exact-name match binds them without the explicit map); inputMappings carries the identity binding for the consumer's KpiFlowOptions.inputMap contract.

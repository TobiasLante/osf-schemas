# profiles/material/material-item.json — history and reasoning

Moved verbatim out of `profiles/wms/material-item.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Abstract parent of SMProfile-MaterialLot (B2MML MaterialLot) and SMProfile-Quant (B2MML MaterialSubLot). Holds only the edge both realise with the SAME B2MML field on their own object: AT_LOCATION (StorageLocation). A sublot is PART of a lot (MaterialSubLot.MaterialLotID), not a kind of it: HAS_SUBLOT and OF_ARTICLE stay on the children, Lot = SubLot stays forbidden. Owner decision 24.09. (CAPT-TOPICS).

# profiles/operations/response.json — history and reasoning

Moved verbatim out of `profiles/erp/response.json`, where each field now holds its first sentence. The JSON says what a thing is; this file keeps why it became that.

## description

Abstract parent of every profile whose ISA-95 object is OperationsResponse: SMProfile-OperationsResponse (per-request aggregate) and SMProfile-BdeConfirmation (per-booking grain). Holds exactly the edges ALL children realise with the SAME B2MML path (RESPONDS_TO, FOR_ARTICLE, ON_MACHINE); a new actuals source with parentType Response finds them without further declaration. Owner decision 24.09. (CAPT-TOPICS).

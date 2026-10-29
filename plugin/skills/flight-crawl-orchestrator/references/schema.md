# Quote schema (one JSON object per line in data/raw/<agent>.jsonl, added to data/sources/quotes/ with `tripdb add-quotes`, which refuses rows that do not fit)

```
{
 "agent": str, "task_id": str, "source": "momondo|google_flights|expedia|airline:XX",
 "observed_at": ISO datetime UTC, "structure": "one_way|return|open_jaw|multi_city",
 "legs_requested": [{"from":"CPH","to":"GUA","date":"2026-12-03"}, ...],   // one per leg, in order
 "rank": int (1 = first shown), "price": number, "currency": str, "price_dkk": number or null,
 "tickets": int or null, "self_transfer": bool or null,
 "fare_brand": str or null, "cabin_bag": str or null, "checked_bag": "incl|paid|none" or null,
 "out":  LEG or null,          // first leg
 "mid":  [LEG, ...],           // multi_city only: legs between first and last
 "home": LEG or null,          // last leg (null for one_way)
 "us_transit": bool or null, "changeable": "free|fee|no|unknown", "link": str or null,
 "flags": [str], "notes": str
}
LEG = {"dep":"2026-12-03T10:05","arr":"...","hours":float,"stops":int,"via":["MAD"],"layover_h":[2.5],
       "carriers":["Iberia"],"flights":["Iberia 3251"],"overnight_layover":bool}
```
- Times are local as shown; hours = the site's total duration for that leg.
- Flags: over_30h, self_transfer, airport_change, us_transit, basic_fare, mix_match, incomplete, long_layover.
- Never guess: unknown fields are null and the row gets `incomplete`.
- A return found by Expedia may carry one leg with "return_date" instead of two legs (legacy).

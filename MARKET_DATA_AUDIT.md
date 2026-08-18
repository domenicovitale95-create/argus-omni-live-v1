# ARGUS Market Data Audit

## Current verified inputs

- Daily fixtures from API-Football.
- Live fixture details and live statistics when available.
- 90-day team histories used by the core ARGUS engine.
- API-Football pre-match prediction percentages for 1X2.
- Real 1X2 odds extracted from the current odds payload.
- Live 1X2 odds when available.

## Multi-market model now active

`src/market-engine.js` reuses the same 90-day historical layer and a Poisson score matrix to derive:

- Over 1.5
- Over 2.5
- Over 3.5
- Under 2.5
- BTTS Yes / No
- Home team Over 0.5
- Away team Over 0.5
- Double Chance 1X / X2
- Top exact-score probabilities

No extra API request is required for these model probabilities once the match/history cache exists.

## Pricing rule

A model probability is not automatically a value bet. PRIME / VALUE require a real market price. If no real price is exposed for that market, ARGUS displays the model probability and fair odds but does not fabricate market edge.

## Corners

The current normalized backend exposes live corner counts in match statistics, but it does not yet provide a validated historical corner model. Therefore corner totals are intentionally marked unavailable unless a real provider corner price/input is present.

## Next backend extension

The existing pre-match odds payload is already fetched for 1X2. Future backend work can parse additional bookmaker markets from the same payload (where API-Football coverage supplies them), avoiding a dedicated extra odds request for each market.
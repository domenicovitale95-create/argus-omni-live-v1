# ARGUS OMNI LIVE

ARGUS OMNI LIVE is a live / in-play football intelligence dashboard designed to ingest match events and market snapshots, evaluate match state, quantify uncertainty, and surface disciplined decision signals.

## V1 included
- Live command-center dashboard
- Match-state scoring engine
- Confidence, pressure and market-edge calculations
- PRIME / WATCH / NO BET classifications
- Demo live feed for immediate testing
- Provider adapter layer for future APIs
- GitHub Pages deployment workflow

## Run locally
Open `index.html` directly, or serve the repository with:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Live data architecture
The frontend must never contain private sportsbook/data-provider keys. Connect live feeds through a secure backend/serverless proxy and return normalized match data to the browser.

Expected normalized match shape:

```json
{
  "id": "match-001",
  "competition": "Competition",
  "home": "Home",
  "away": "Away",
  "minute": 63,
  "score": { "home": 1, "away": 1 },
  "stats": {
    "possessionHome": 54,
    "shotsHome": 11,
    "shotsAway": 7,
    "shotsOnTargetHome": 5,
    "shotsOnTargetAway": 2,
    "cornersHome": 6,
    "cornersAway": 3,
    "dangerousAttacksHome": 38,
    "dangerousAttacksAway": 24
  },
  "markets": {
    "home": 2.25,
    "draw": 3.10,
    "away": 3.70,
    "over25": 1.95,
    "under25": 1.85
  }
}
```

## Disclaimer
ARGUS OMNI LIVE is an analytical decision-support system. Outputs are probabilistic, may be wrong, and are not guarantees of profit.

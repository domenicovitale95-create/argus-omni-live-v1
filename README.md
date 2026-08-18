# ARGUS OMNI LIVE V2

ARGUS OMNI LIVE is a live / in-play football intelligence dashboard. V2 adds a secure server-side API-Football integration so ARGUS can retrieve matches in progress automatically instead of requiring manual match data.

## V2 architecture

- Live fixtures from API-SPORTS / API-Football
- Batched fixture-detail retrieval (up to 20 fixture IDs per request)
- Live match statistics normalization
- Live 1X2 odds ingestion when available
- 60-second server cache to protect API quota
- API key kept server-side via `API_FOOTBALL_KEY`
- PRIME / WATCH / NO BET governance
- Mandatory real-market check: no PRIME or WATCH without complete live 1X2 odds
- Demo feed retained as a safe fallback

## Secure deployment

GitHub Pages can serve the static dashboard but cannot securely hold a private API key. Deploy V2 on Vercel (or another serverless host) so `/api/live` runs server-side.

Required environment variable:

```text
API_FOOTBALL_KEY=your_api_sports_key
```

Never commit the real key to this repository.

## Live flow

1. Browser calls `/api/live`.
2. Server requests `/fixtures?live=all` from API-Football.
3. Live fixture IDs are grouped in batches of 20 and enriched through `/fixtures?ids=...`.
4. Server requests `/odds/live` and extracts usable 1X2 prices when coverage exists.
5. Responses are normalized into the ARGUS match schema.
6. The ARGUS engine calculates pressure, data quality, uncertainty, model probabilities, fair odds, market edge and classification.

## Quota strategy

The live backend caches results for 60 seconds and reuses grouped API calls. This is intentional: a free API-Football account has a limited daily request allowance, so V2 prioritizes disciplined retrieval over excessive polling.

## Files

- `index.html` — command-center UI
- `styles.css` — interface styling
- `app.js` — dashboard behavior
- `src/engine.js` — ARGUS decision engine
- `src/providers.js` — live/demo provider adapter
- `api/live.js` — secure serverless API-Football proxy
- `data/demo-matches.json` — deterministic fallback feed
- `vercel.json` — Vercel function configuration
- `.env.example` — required secret name

## Local development

For the static demo, serve the repository with any static server. For real V2 live mode, use a Vercel-compatible local runtime and configure `API_FOOTBALL_KEY` in the local environment.

## Governance

ARGUS outputs are probabilistic decision-support signals. Missing statistics, incomplete market coverage, stale data or missing odds reduce data quality. V2 refuses PRIME/WATCH classifications when a valid complete 1X2 live market is unavailable. No output guarantees profit.

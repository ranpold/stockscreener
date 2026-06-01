# Stock Screener + Quant Analysis — Design

Date: 2026-06-01

## Goal
React app to screen stocks across a universe, then run detailed quant analysis on a chosen stock. Hosted on Cloudflare (free `*.workers.dev` domain). Code in https://github.com/ranpold/stockscreener.

## Architecture
Single Cloudflare Worker serving both static frontend (Vite build via Static Assets) and `/api/*` routes (Hono). No separate Node server — Workers runtime only.

```
stockscreener/
├─ src/                 # Worker (Hono API + quant engine)
│  ├─ index.ts          # Hono app, mounts routes, serves assets
│  ├─ providers/        # yahoo.ts, finnhub.ts, fmp.ts, index.ts (adapter)
│  ├─ quant/            # risk.ts, technical.ts, fundamental.ts, factor.ts
│  ├─ db/               # client.ts (libsql), schema.ts (migrations), cache.ts
│  ├─ routes/           # screen.ts, stock.ts, watchlists.ts
│  └─ universe/sp500.ts # bundled ticker list
├─ web/                 # React + Vite + TS frontend
├─ wrangler.toml
├─ .dev.vars            # secrets (gitignored)
└─ docs/
```

## Data layer
- Provider adapter interface: `getQuote`, `getOHLCV(range)`, `getFundamentals`, `getProfile`.
- All providers `fetch`-based (Workers has no full Node):
  - **Yahoo** (free, primary): `query1.finance.yahoo.com` chart + quoteSummary endpoints.
  - **Finnhub / FMP** (keyed fallback): fundamentals gaps. Keys via secrets.
- Every fetch cached in Turso with TTL: prices (daily) 12h, fundamentals 24h, quotes 5m.

## Quant engine (pure functions, unit-tested)
- `risk.ts`: daily returns, CAGR, annualized volatility, Sharpe, Sortino, max drawdown, beta vs SPY.
- `technical.ts`: SMA, EMA, RSI(14), MACD(12,26,9), Bollinger(20,2), 12-1 momentum.
- `fundamental.ts`: P/E, P/B, EV/EBITDA, ROE, gross/net margin, rev & EPS growth, Piotroski F-score.
- `factor.ts`: z-scored composite (value, momentum, quality, low-vol) across universe + simple top-decile equal-weight backtest.

## API (Hono routes)
- `GET /api/screen?universe=sp500|watchlist:<id>&...filters` → ranked rows w/ factor scores + key metrics.
- `GET /api/stock/:ticker` → full quant bundle (risk, technical, fundamental, factor) + OHLCV for charting.
- `GET /api/watchlists`, `POST /api/watchlists`, `PUT/DELETE /api/watchlists/:id` → CRUD.
- `GET /api/screens`, `POST /api/screens` → save/load filter presets.

## Persistence (Turso / libSQL)
Tables:
- `cache(key TEXT PK, payload TEXT, expires_at INTEGER)`
- `watchlists(id TEXT PK, name TEXT, created_at INTEGER)`
- `watchlist_tickers(watchlist_id TEXT, ticker TEXT)`
- `screens(id TEXT PK, name TEXT, filters TEXT, created_at INTEGER)`

## Frontend
- **Screener page**: choose universe (S&P 500 preset | watchlist), filter controls (ranges/sliders on metrics), sortable ranked table; click row → deep-dive.
- **Deep-dive `/stock/:ticker`**: price chart (lightweight-charts) + MA/Bollinger overlays; tabbed panels Risk / Technical / Valuation / Factor+Backtest; metric cards with index context.
- **Watchlist manager**: add/remove tickers, persisted.
- TanStack Query for fetching/caching, Tailwind styling.

## Data flow
Browser → TanStack Query → Hono `/api` → Turso cache check → provider on miss → quant engine → JSON → React.

## Testing
- Vitest unit tests on every quant function with known fixtures (correctness is the priority).
- Light route test for `/api/screen` with mocked provider.

## Security / secrets
- Turso URL + token, Finnhub/FMP keys: `.dev.vars` locally, `wrangler secret put` in prod. Never committed.
- `.gitignore` covers `.dev.vars`, `node_modules`, `dist`.

## Deploy
- `npm run build` (vite build in web/) → `wrangler deploy`.
- Free domain: `stockscreener.<account>.workers.dev`.

## Scope / YAGNI
- Daily data (no real-time streaming).
- Single-user, no auth.
- Backtest is simple top-decile equal-weight, not a full engine.

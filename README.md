# QuantScreen — Stock Screener + Quant Analysis

React + Cloudflare Workers app to screen a stock universe by quant factors, then drill
into any name for detailed risk, technical, valuation, and factor analysis.

- **Frontend:** React + Vite + TypeScript, TanStack Query, Tailwind, lightweight-charts.
- **Backend:** Hono on Cloudflare Workers (single Worker serves the SPA + `/api/*`).
- **Data:** Yahoo (free prices/quotes) + FMP (primary fundamentals) + Finnhub (fallback).
- **DB / cache:** Turso (libSQL) — watchlists, screens, and a TTL response cache.

## Quant engine (`src/quant/`)
- **risk** — CAGR, annualized vol, Sharpe, Sortino, max drawdown, beta vs SPY.
- **technical** — SMA/EMA, RSI(14), MACD, Bollinger, 12-1 momentum.
- **fundamental** — P/E, P/B, EV/EBITDA, ROE, margins, growth, Piotroski F-score.
- **factor** — cross-sectional z-scored value/momentum/quality/low-vol composite + top-decile backtest.

All quant functions are pure and unit-tested (`npm test`).

## Local development
```bash
npm install
cp .dev.vars.example .dev.vars   # fill in TURSO + provider keys
npm run dev                      # builds web, runs wrangler dev on :8787
```
Or with hot-reload frontend: run `wrangler dev` and `npm run dev:web` (proxies /api to :8787).

## Deploy (Cloudflare)
```bash
wrangler login
# set production secrets (not committed):
wrangler secret put TURSO_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put FMP_API_KEY
wrangler secret put FINNHUB_API_KEY
npm run deploy                   # builds web + wrangler deploy
```
Served free at `https://stockscreener.<account>.workers.dev`.

## API
- `GET /api/screen?universe=sp500|watchlist:<id>|custom:AAPL,MSFT&minSharpe=&maxPe=&minRoe=&minMomentum=&maxBeta=`
- `GET /api/stock/:ticker?range=1y`
- `GET /api/universe`
- `GET|POST /api/watchlists`, `PUT|DELETE /api/watchlists/:id`

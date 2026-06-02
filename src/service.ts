import type { Client } from "@libsql/client/web";
import { data, type ProviderEnv, type Range } from "./providers";
import { cached, TTL } from "./db/cache";
import { riskMetrics, annualizedVolatility, dailyReturns, type RiskMetrics } from "./quant/risk";
import { technicalSnapshot, momentum, type TechnicalSnapshot } from "./quant/technical";
import type { FundamentalMetrics, RawFundamentals } from "./quant/fundamental";
import { recommend, type Recommendation } from "./quant/recommendation";
import { companyNews, type NewsItem } from "./providers/news";
import { computeFactorScores, type FactorScores, type FactorInputs } from "./quant/factor";

export interface Env extends ProviderEnv {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ASSETS: { fetch: typeof fetch };
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

const MARKET_TICKER = "SPY";

export interface StockAnalysis {
  ticker: string;
  name: string;
  sector?: string;
  isEtf: boolean;
  quote: { price: number; change: number; changePercent: number } | null;
  risk: RiskMetrics;
  technical: TechnicalSnapshot;
  fundamental: FundamentalMetrics;
  recommendation: Recommendation;
  news: NewsItem[];
  ohlcv: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  raw: RawFundamentals | null;
}

async function getCloses(db: Client, ticker: string, range: Range): Promise<number[]> {
  const bars = await cached(db, `ohlcv:${ticker}:${range}`, TTL.ohlcv, () =>
    data.getOHLCV(ticker, range),
  );
  return bars.map((b) => b.close);
}

/** Full deep-dive analysis for one ticker. */
export async function buildStockAnalysis(
  db: Client,
  env: Env,
  ticker: string,
  range: Range = "1y",
): Promise<StockAnalysis | null> {
  const sym = ticker.toUpperCase();
  const bars = await cached(db, `ohlcv:${sym}:${range}`, TTL.ohlcv, () =>
    data.getOHLCV(sym, range),
  );
  if (!bars.length) return null;
  const closes = bars.map((b) => b.close);

  const [marketCloses, profile, quote, fundRes, news] = await Promise.all([
    getCloses(db, MARKET_TICKER, range),
    cached(db, `profile:${sym}`, TTL.profile, () => data.getProfile(sym, env)),
    cached(db, `quote:${sym}`, TTL.quote, () => data.getQuote(sym)),
    cached(db, `fund:${sym}:full`, TTL.fundamentals, () => data.getFundamentals(sym, env, true)),
    cached(db, `news:${sym}`, TTL.news, () => companyNews(sym, env.FINNHUB_API_KEY ?? "")),
  ]);

  const isEtf = (quote?.instrumentType ?? "").toUpperCase() === "ETF";
  const risk = riskMetrics(closes, marketCloses);
  const technical = technicalSnapshot(closes);
  const f = fundRes.metrics;

  const recommendation = recommend({
    isEtf,
    sharpe: risk.sharpe,
    sortino: risk.sortino,
    maxDrawdown: risk.maxDrawdown,
    cagr: risk.cagr,
    lastClose: technical.lastClose,
    sma50: technical.sma50,
    sma200: technical.sma200,
    rsi14: technical.rsi14,
    macd: technical.macd,
    macdSignal: technical.macdSignal,
    momentum12_1: technical.momentum12_1,
    pe: f.pe,
    pb: f.pb,
    roe: f.roe,
    netMargin: f.netMargin,
    piotroski: f.piotroski,
  });

  return {
    ticker: sym,
    name: profile?.name ?? quote?.name ?? sym,
    sector: profile?.sector,
    isEtf,
    quote: quote
      ? { price: quote.price, change: quote.change, changePercent: quote.changePercent }
      : null,
    risk,
    technical,
    fundamental: f,
    recommendation,
    news,
    ohlcv: bars,
    raw: fundRes.raw,
  };
}

export interface ScreenRow {
  ticker: string;
  name?: string;
  sector?: string;
  price: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  beta: number;
  rsi14: number | null;
  momentum: number;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  piotroski: number | null;
  factor: FactorScores | null;
}

export interface ScreenFilters {
  minSharpe?: number;
  maxPe?: number;
  minRoe?: number;
  minMomentum?: number;
  maxBeta?: number;
}

/** Build screen rows across a universe of tickers, then attach cross-sectional factor scores. */
export async function buildScreen(
  db: Client,
  env: Env,
  tickers: string[],
  filters: ScreenFilters = {},
): Promise<ScreenRow[]> {
  // Bounded concurrency to stay within Worker limits.
  const rows: (ScreenRow | null)[] = [];
  const factorInputs: FactorInputs[] = [];
  const CONCURRENCY = 8;

  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (t): Promise<{ row: ScreenRow; fi: FactorInputs } | null> => {
        const sym = t.toUpperCase();
        const bars = await cached(db, `ohlcv:${sym}:1y`, TTL.ohlcv, () => data.getOHLCV(sym, "1y"));
        if (!bars.length) return null;
        const closes = bars.map((b) => b.close);
        const risk = riskMetrics(closes);
        const tech = technicalSnapshot(closes);
        const fundRes = await cached(db, `fund:${sym}`, TTL.fundamentals, () =>
          data.getFundamentals(sym, env, false),
        );
        const fund = fundRes.metrics;
        const mom = momentum(closes);
        const row: ScreenRow = {
          ticker: sym,
          price: tech.lastClose,
          cagr: risk.cagr,
          volatility: risk.annualizedVolatility,
          sharpe: risk.sharpe,
          maxDrawdown: risk.maxDrawdown,
          beta: risk.beta,
          rsi14: tech.rsi14,
          momentum: mom,
          pe: fund.pe,
          pb: fund.pb,
          roe: fund.roe,
          piotroski: fund.piotroski,
          factor: null,
        };
        const fi: FactorInputs = {
          ticker: sym,
          value: fund.pe && fund.pe > 0 ? 1 / fund.pe : null,
          momentum: mom,
          quality: fund.roe,
          lowVol: -annualizedVolatility(dailyReturns(closes)),
        };
        return { row, fi };
      }),
    );
    for (const r of results) {
      if (r) {
        rows.push(r.row);
        factorInputs.push(r.fi);
      }
    }
  }

  const present = rows.filter((r): r is ScreenRow => r !== null);
  const factors = computeFactorScores(factorInputs);
  const byTicker = new Map(factors.map((f) => [f.ticker, f]));
  for (const r of present) r.factor = byTicker.get(r.ticker) ?? null;

  // Apply filters.
  const filtered = present.filter((r) => {
    if (filters.minSharpe !== undefined && r.sharpe < filters.minSharpe) return false;
    if (filters.maxPe !== undefined && (r.pe === null || r.pe > filters.maxPe)) return false;
    if (filters.minRoe !== undefined && (r.roe === null || r.roe < filters.minRoe)) return false;
    if (filters.minMomentum !== undefined && r.momentum < filters.minMomentum) return false;
    if (filters.maxBeta !== undefined && r.beta > filters.maxBeta) return false;
    return true;
  });

  // Default sort: composite factor score desc.
  filtered.sort((a, b) => (b.factor?.composite ?? -Infinity) - (a.factor?.composite ?? -Infinity));
  return filtered;
}

import type { Client } from "@libsql/client/web";
import { data, type ProviderEnv, type Range } from "./providers";
import { cached, cacheGetMany, cacheSetMany, TTL } from "./db/cache";
import { riskMetrics, annualizedVolatility, dailyReturns, historyYears, type RiskMetrics } from "./quant/risk";
import { technicalSnapshot, momentum, type TechnicalSnapshot } from "./quant/technical";
import type { FundamentalMetrics, RawFundamentals } from "./quant/fundamental";
import { recommend, type Recommendation } from "./quant/recommendation";
import { companyNews } from "./providers/news";
import { getEtfBreakdown } from "./providers/yahooEtf";
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
  historyYears: number;
  raw: RawFundamentals | null;
}

/** Full deep-dive analysis for one ticker. */
export async function buildStockAnalysis(
  db: Client,
  env: Env,
  ticker: string,
  range: Range = "1y",
): Promise<StockAnalysis | null> {
  const sym = ticker.toUpperCase();

  // Fire every critical dependency at once — no sequential waves. News and ETF
  // holdings are deliberately NOT here; they're fetched separately (below the fold)
  // so they don't gate the recommendation/stats first paint.
  const [bars, marketBars, profile, quote, fundRes] = await Promise.all([
    cached(db, `ohlcv:${sym}:${range}`, TTL.ohlcv, () => data.getOHLCV(sym, range, env)),
    cached(db, `ohlcv:${MARKET_TICKER}:${range}`, TTL.ohlcv, () => data.getOHLCV(MARKET_TICKER, range, env)),
    cached(db, `profile:${sym}`, TTL.profile, () => data.getProfile(sym, env)),
    cached(db, `quote:${sym}`, TTL.quote, () => data.getQuote(sym, env)),
    cached(db, `fund:${sym}:full`, TTL.fundamentals, () => data.getFundamentals(sym, env, true)),
  ]);
  if (!bars.length) return null;
  const closes = bars.map((b) => b.close);
  const marketCloses = marketBars.map((b) => b.close);

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
    historyYears: historyYears(closes),
    raw: fundRes.raw,
  };
}

/** Latest news for a ticker (separate from analysis; below-the-fold). */
export function getNews(db: Client, env: Env, ticker: string) {
  const sym = ticker.toUpperCase();
  return cached(db, `news:${sym}`, TTL.news, () => companyNews(sym, env.FINNHUB_API_KEY ?? ""));
}

/** ETF sector + holdings breakdown (separate; only the Holdings tab needs it). */
export function getEtf(db: Client, ticker: string) {
  const sym = ticker.toUpperCase();
  return cached(db, `etf:${sym}`, TTL.etf, () => getEtfBreakdown(sym));
}

export interface Snapshot {
  ticker: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  isEtf: boolean;
  verdict: Recommendation["verdict"];
  score: number;
  sharpe: number;
  cagr: number;
  momentum: number;
  volatility: number;
  pe: number | null;
}

/** Compute a snapshot synchronously from prefetched closes + (optional) cached fundamentals/quote. */
function computeSnapshot(
  sym: string,
  closes: number[],
  fundRes: { metrics: FundamentalMetrics } | null,
  quote: { name?: string; instrumentType?: string } | null,
): Snapshot | null {
  if (closes.length < 2) return null;
  const risk = riskMetrics(closes);
  const tech = technicalSnapshot(closes);
  const f: Partial<FundamentalMetrics> = fundRes?.metrics ?? {};
  const isEtf = (quote?.instrumentType ?? "").toUpperCase() === "ETF";
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const rec = recommend({
    isEtf,
    sharpe: risk.sharpe,
    sortino: risk.sortino,
    maxDrawdown: risk.maxDrawdown,
    cagr: risk.cagr,
    lastClose: tech.lastClose,
    sma50: tech.sma50,
    sma200: tech.sma200,
    rsi14: tech.rsi14,
    macd: tech.macd,
    macdSignal: tech.macdSignal,
    momentum12_1: tech.momentum12_1,
    pe: f.pe ?? null,
    pb: f.pb ?? null,
    roe: f.roe ?? null,
    netMargin: f.netMargin ?? null,
    piotroski: f.piotroski ?? null,
  });
  return {
    ticker: sym,
    name: quote?.name ?? sym,
    price: last,
    changePercent: prev ? last / prev - 1 : null,
    isEtf,
    verdict: rec.verdict,
    score: rec.score,
    sharpe: risk.sharpe,
    cagr: risk.cagr,
    momentum: tech.momentum12_1,
    volatility: risk.annualizedVolatility,
    pe: f.pe ?? null,
  };
}

/**
 * Build watchlist snapshots with a tight subrequest budget (Workers cap):
 * - batched cache reads/writes (one round-trip each)
 * - ONE Yahoo `spark` call for all missing closes (no per-ticker burst)
 * - fundamentals/quote used only if already cached (no per-ticker FMP calls)
 */
export async function buildSnapshots(db: Client, _env: Env, tickers: string[]): Promise<Snapshot[]> {
  const syms = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
  const snapMap = await cacheGetMany<Snapshot>(db, syms.map((s) => `snap:${s}`));
  const misses = syms.filter((s) => !snapMap.has(`snap:${s}`));

  if (misses.length) {
    const [fundMap, quoteMap, closesMap] = await Promise.all([
      cacheGetMany<{ metrics: FundamentalMetrics }>(db, misses.map((s) => `fund:${s}:full`)),
      cacheGetMany<{ name?: string; instrumentType?: string }>(db, misses.map((s) => `quote:${s}`)),
      data.getSparkCloses(misses, "1y"),
    ]);
    const toCache: { key: string; value: unknown; ttl: number }[] = [];
    for (const s of misses) {
      const snap = computeSnapshot(
        s,
        closesMap.get(s) ?? [],
        fundMap.get(`fund:${s}:full`) ?? null,
        quoteMap.get(`quote:${s}`) ?? null,
      );
      if (snap) {
        snapMap.set(`snap:${s}`, snap);
        toCache.push({ key: `snap:${s}`, value: snap, ttl: TTL.snapshot });
      }
    }
    await cacheSetMany(db, toCache);
  }

  const out: Snapshot[] = [];
  for (const s of syms) {
    const snap = snapMap.get(`snap:${s}`);
    if (snap) out.push(snap);
  }
  return out;
}

export interface IdeasResult {
  low: Snapshot[];
  medium: Snapshot[];
  high: Snapshot[];
}

/**
 * "Ideas to invest now": scan the ideas universe, classify each by volatility
 * (annualized) into Low/Medium/High risk, and take the top picks per bucket by
 * recommendation score. ETFs surface naturally in the Low/Medium tiers.
 */
export async function buildIdeas(db: Client, env: Env, universe: string[]): Promise<IdeasResult> {
  const snaps = await buildSnapshots(db, env, universe);
  const low: Snapshot[] = [];
  const medium: Snapshot[] = [];
  const high: Snapshot[] = [];
  for (const s of snaps) {
    if (s.volatility < 0.25) low.push(s);
    else if (s.volatility <= 0.45) medium.push(s);
    else high.push(s);
  }
  const top = (arr: Snapshot[], n: number) => arr.sort((a, b) => b.score - a.score).slice(0, n);
  return { low: top(low, 10), medium: top(medium, 10), high: top(high, 10) };
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
        const bars = await cached(db, `ohlcv:${sym}:1y`, TTL.ohlcv, () => data.getOHLCV(sym, "1y", env));
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

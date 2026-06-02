import type { DataProvider, OHLCVBar, Profile, Quote, Range } from "./types";
import {
  fundamentalMetrics,
  piotroskiScore,
  type FundamentalMetrics,
  type RawFundamentals,
} from "../quant/fundamental";
import { yahooProvider, yahooSparkCloses } from "./yahoo";
import { fmpFundamentals, fmpProfile } from "./fmp";
import { finnhubFundamentals, finnhubQuote, finnhubProfile } from "./finnhub";
import { twelveOHLCV, twelveFundamentals } from "./twelvedata";
import { stooqOHLCV } from "./stooq";

export type { OHLCVBar, Profile, Quote, Range, DataProvider };

export interface ProviderEnv {
  FINNHUB_API_KEY?: string;
  FMP_API_KEY?: string;
  TWELVE_DATA_API_KEY?: string;
}

export interface FundamentalsResult {
  metrics: FundamentalMetrics;
  raw: RawFundamentals | null;
}

function emptyMetrics(): FundamentalMetrics {
  return {
    pe: null,
    pb: null,
    evEbitda: null,
    roe: null,
    grossMargin: null,
    netMargin: null,
    revenueGrowth: null,
    epsGrowth: null,
    piotroski: null,
  };
}

/** Copy defined, non-null values from src into target only where target is still null. */
function fillGaps(target: FundamentalMetrics, src: Partial<FundamentalMetrics>): void {
  for (const key of Object.keys(src) as (keyof FundamentalMetrics)[]) {
    const v = src[key];
    if ((target[key] === null || target[key] === undefined) && v !== null && v !== undefined) {
      target[key] = v;
    }
  }
}

const OUTPUTSIZE: Record<string, number> = { "1mo": 30, "3mo": 70, "6mo": 130, "1y": 260, "2y": 520, "5y": 1300 };

/**
 * Aggregated data access with fallback chains so we degrade gracefully when a
 * source hits a rate limit:
 *   prices       Yahoo -> Twelve Data -> Stooq
 *   quote        Yahoo -> Finnhub
 *   profile      Yahoo -> FMP -> Finnhub
 *   fundamentals FMP -> Finnhub -> Twelve Data -> Yahoo (raw)
 */
export const data = {
  async getOHLCV(ticker: string, range: Range, env?: ProviderEnv): Promise<OHLCVBar[]> {
    let bars = await yahooProvider.getOHLCV(ticker, range);
    if (!bars.length && env?.TWELVE_DATA_API_KEY) {
      bars = await twelveOHLCV(ticker, env.TWELVE_DATA_API_KEY, OUTPUTSIZE[range] ?? 300);
    }
    if (!bars.length) bars = await stooqOHLCV(ticker);
    return bars;
  },

  async getChartBars(ticker: string, timeframe: string, env?: ProviderEnv): Promise<OHLCVBar[]> {
    let bars = await yahooProvider.getChartBars(ticker, timeframe);
    // Twelve Data only covers daily here; skip for intraday (1d/5d) timeframes.
    if (!bars.length && env?.TWELVE_DATA_API_KEY && timeframe !== "1d" && timeframe !== "5d") {
      bars = await twelveOHLCV(ticker, env.TWELVE_DATA_API_KEY, OUTPUTSIZE[timeframe] ?? 300);
    }
    return bars;
  },

  getSparkCloses(symbols: string[], range = "1y"): Promise<Map<string, number[]>> {
    return yahooSparkCloses(symbols, range);
  },

  async getQuote(ticker: string, env?: ProviderEnv): Promise<Quote | null> {
    const y = await yahooProvider.getQuote(ticker);
    if (y) return y;
    if (env?.FINNHUB_API_KEY) return finnhubQuote(ticker, env.FINNHUB_API_KEY);
    return null;
  },

  async getProfile(ticker: string, env: ProviderEnv): Promise<Profile | null> {
    const y = await yahooProvider.getProfile(ticker);
    if (y && y.sector) return y;
    if (env.FMP_API_KEY) {
      const f = await fmpProfile(ticker, env.FMP_API_KEY);
      if (f) return f;
    }
    if (env.FINNHUB_API_KEY) {
      const fh = await finnhubProfile(ticker, env.FINNHUB_API_KEY);
      if (fh) return fh;
    }
    return y;
  },

  /**
   * Fundamentals bundle. `full=true` (deep-dive) pulls statements for Piotroski/growth;
   * `full=false` (screen) stays lightweight to respect provider rate limits.
   */
  async getFundamentals(
    ticker: string,
    env: ProviderEnv,
    full = false,
  ): Promise<FundamentalsResult> {
    const metrics = emptyMetrics();
    let raw: RawFundamentals | null = null;

    if (env.FMP_API_KEY) {
      const fmp = await fmpFundamentals(ticker, env.FMP_API_KEY, full);
      if (fmp) {
        fillGaps(metrics, fmp.metrics);
        if (fmp.raw) raw = fmp.raw;
      }
    }

    if ((metrics.pe === null || metrics.roe === null) && env.FINNHUB_API_KEY) {
      const fh = await finnhubFundamentals(ticker, env.FINNHUB_API_KEY);
      if (fh) fillGaps(metrics, fh.metrics);
    }

    // Twelve Data fallback when FMP+Finnhub still left core valuation gaps.
    if ((metrics.pe === null || metrics.pb === null) && env.TWELVE_DATA_API_KEY) {
      const td = await twelveFundamentals(ticker, env.TWELVE_DATA_API_KEY);
      if (td) fillGaps(metrics, td.metrics);
    }

    // Yahoo raw as a last resort (only for deep-dive, where we want statements for Piotroski).
    if (full && (!raw || raw.netIncome === undefined)) {
      const yraw = await yahooProvider.getFundamentals(ticker);
      if (yraw) raw = raw ? { ...yraw, ...raw } : yraw;
    }

    if (raw) {
      fillGaps(metrics, fundamentalMetrics(raw));
      if (metrics.piotroski === null) metrics.piotroski = piotroskiScore(raw);
    }

    return { metrics, raw };
  },
};

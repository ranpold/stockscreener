import type { DataProvider, OHLCVBar, Profile, Quote, Range } from "./types";
import {
  fundamentalMetrics,
  piotroskiScore,
  type FundamentalMetrics,
  type RawFundamentals,
} from "../quant/fundamental";
import { yahooProvider } from "./yahoo";
import { fmpFundamentals, fmpProfile } from "./fmp";
import { finnhubFundamentals } from "./finnhub";

export type { OHLCVBar, Profile, Quote, Range, DataProvider };

export interface ProviderEnv {
  FINNHUB_API_KEY?: string;
  FMP_API_KEY?: string;
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

/**
 * Aggregated data access. Yahoo serves prices/quotes (free); FMP is the primary
 * fundamentals source, with Finnhub then Yahoo filling any gaps.
 */
export const data = {
  getOHLCV(ticker: string, range: Range): Promise<OHLCVBar[]> {
    return yahooProvider.getOHLCV(ticker, range);
  },

  getQuote(ticker: string): Promise<Quote | null> {
    return yahooProvider.getQuote(ticker);
  },

  async getProfile(ticker: string, env: ProviderEnv): Promise<Profile | null> {
    const y = await yahooProvider.getProfile(ticker);
    if (y && y.sector) return y;
    if (env.FMP_API_KEY) {
      const f = await fmpProfile(ticker, env.FMP_API_KEY);
      if (f) return f;
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

    const needsMore = metrics.pe === null || metrics.roe === null;
    if (needsMore && env.FINNHUB_API_KEY) {
      const fh = await finnhubFundamentals(ticker, env.FINNHUB_API_KEY);
      if (fh) fillGaps(metrics, fh.metrics);
    }

    // Yahoo raw as a last resort (only for deep-dive, where we want statements for Piotroski).
    if (full && (!raw || raw.netIncome === undefined)) {
      const yraw = await yahooProvider.getFundamentals(ticker);
      if (yraw) raw = raw ? { ...yraw, ...raw } : yraw;
    }

    // Derive any still-missing metrics from raw, and compute Piotroski from raw.
    if (raw) {
      fillGaps(metrics, fundamentalMetrics(raw));
      if (metrics.piotroski === null) metrics.piotroski = piotroskiScore(raw);
    }

    return { metrics, raw };
  },
};

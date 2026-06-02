import type { FundamentalMetrics, RawFundamentals } from "../quant/fundamental";
import type { Profile } from "./types";

const BASE = "https://financialmodelingprep.com/stable";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j: any = await res.json();
    // FMP returns an error object (not array) on problems.
    if (j && !Array.isArray(j) && j["Error Message"]) return null;
    return j;
  } catch {
    return null;
  }
}

const n = (x: any): number | undefined => (typeof x === "number" && !Number.isNaN(x) ? x : undefined);

export interface FmpFundamentals {
  metrics: Partial<FundamentalMetrics>;
  raw: RawFundamentals | null;
}

/**
 * FMP fundamentals via the /stable API.
 * - `full=false`: one key-metrics-ttm call (roe, ev/ebitda, pe via earnings yield).
 *   Keeps screening within the free 250/day budget (~1 call per name).
 * - `full=true`: also pulls ratios-ttm + 3 statements for pb, margins, growth, Piotroski.
 */
export async function fmpFundamentals(
  ticker: string,
  apiKey: string,
  full: boolean,
): Promise<FmpFundamentals | null> {
  if (!apiKey) return null;
  const sym = encodeURIComponent(ticker);
  const metrics: Partial<FundamentalMetrics> = {};

  // Run key-metrics in parallel with the (optional) statements batch — one wave.
  const kmP = getJson(`${BASE}/key-metrics-ttm?symbol=${sym}&apikey=${apiKey}`);
  const statementsP = full
    ? Promise.all([
        getJson(`${BASE}/ratios-ttm?symbol=${sym}&apikey=${apiKey}`),
        getJson(`${BASE}/income-statement?symbol=${sym}&period=annual&limit=2&apikey=${apiKey}`),
        getJson(`${BASE}/balance-sheet-statement?symbol=${sym}&period=annual&limit=2&apikey=${apiKey}`),
        getJson(`${BASE}/cash-flow-statement?symbol=${sym}&period=annual&limit=2&apikey=${apiKey}`),
        getJson(`${BASE}/profile?symbol=${sym}&apikey=${apiKey}`),
      ])
    : Promise.resolve<[any, any, any, any, any]>([null, null, null, null, null]);
  const [km, [ratios, inc, bal, cf, profile]] = await Promise.all([kmP, statementsP]);

  const k = Array.isArray(km) ? km[0] : null;
  if (k) {
    if (n(k.returnOnEquityTTM) !== undefined) metrics.roe = k.returnOnEquityTTM;
    if (n(k.evToEBITDATTM) !== undefined) metrics.evEbitda = k.evToEBITDATTM;
    const ey = n(k.earningsYieldTTM);
    if (ey !== undefined && ey !== 0) metrics.pe = 1 / ey;
  }

  let raw: RawFundamentals | null = null;
  if (full) {
    const r = Array.isArray(ratios) ? ratios[0] : null;
    if (r) {
      if (n(r.priceToEarningsRatioTTM) !== undefined) metrics.pe = r.priceToEarningsRatioTTM;
      if (n(r.priceToBookRatioTTM) !== undefined) metrics.pb = r.priceToBookRatioTTM;
      if (n(r.grossProfitMarginTTM) !== undefined) metrics.grossMargin = r.grossProfitMarginTTM;
      if (n(r.netProfitMarginTTM) !== undefined) metrics.netMargin = r.netProfitMarginTTM;
    }
    const i0 = inc?.[0] ?? {};
    const i1 = inc?.[1] ?? {};
    const b0 = bal?.[0] ?? {};
    const b1 = bal?.[1] ?? {};
    const c0 = cf?.[0] ?? {};
    const p = profile?.[0] ?? {};
    raw = {
      price: n(p.price),
      eps: n(i0.eps),
      netIncome: n(i0.netIncome),
      prevNetIncome: n(i1.netIncome),
      ebitda: n(i0.ebitda),
      revenue: n(i0.revenue),
      prevRevenue: n(i1.revenue),
      grossProfit: n(i0.grossProfit),
      prevGrossProfit: n(i1.grossProfit),
      totalAssets: n(b0.totalAssets),
      prevTotalAssets: n(b1.totalAssets),
      totalLiabilities: n(b0.totalLiabilities),
      prevTotalLiabilities: n(b1.totalLiabilities),
      currentAssets: n(b0.totalCurrentAssets),
      currentLiabilities: n(b0.totalCurrentLiabilities),
      prevCurrentAssets: n(b1.totalCurrentAssets),
      prevCurrentLiabilities: n(b1.totalCurrentLiabilities),
      shareholderEquity: n(b0.totalStockholdersEquity),
      sharesOutstanding: n(i0.weightedAverageShsOut),
      prevSharesOutstanding: n(i1.weightedAverageShsOut),
      operatingCashFlow: n(c0.operatingCashFlow ?? c0.netCashProvidedByOperatingActivities),
    };
    if (raw.revenue !== undefined && raw.prevRevenue) {
      metrics.revenueGrowth = raw.revenue / raw.prevRevenue - 1;
    }
    const e0 = n(i0.eps);
    const e1 = n(i1.eps);
    if (e0 !== undefined && e1 !== undefined && e1 !== 0) metrics.epsGrowth = e0 / e1 - 1;
  }

  if (Object.keys(metrics).length === 0 && !raw) return null;
  return { metrics, raw };
}

/** FMP company profile (price, name, sector). Fills Yahoo's crumb-gated gaps. */
export async function fmpProfile(ticker: string, apiKey: string): Promise<Profile | null> {
  if (!apiKey) return null;
  const data = await getJson(
    `${BASE}/profile?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`,
  );
  const p = Array.isArray(data) ? data[0] : null;
  if (!p) return null;
  return {
    ticker,
    name: p.companyName ?? ticker,
    sector: p.sector,
    industry: p.industry,
    exchange: p.exchangeShortName ?? p.exchange,
  };
}

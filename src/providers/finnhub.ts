import type { FundamentalMetrics, RawFundamentals } from "../quant/fundamental";
import type { Quote, Profile } from "./types";
import type { SearchResult } from "./search";

const BASE = "https://finnhub.io/api/v1";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const n = (x: any): number | undefined => (typeof x === "number" && !Number.isNaN(x) ? x : undefined);

export interface FinnhubFundamentals {
  metrics: Partial<FundamentalMetrics>;
  raw: RawFundamentals | null;
}

/**
 * Finnhub fundamentals fallback (free tier). One /stock/metric call returns a broad
 * metric bag; we map the fields we use. Returns null if no key or no data.
 */
export async function finnhubFundamentals(
  ticker: string,
  apiKey: string,
): Promise<FinnhubFundamentals | null> {
  if (!apiKey) return null;
  const data = await getJson(
    `${BASE}/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${apiKey}`,
  );
  const m = data?.metric;
  if (!m) return null;
  const metrics: Partial<FundamentalMetrics> = {};
  const pe = n(m.peTTM) ?? n(m.peBasicExclExtraTTM);
  if (pe !== undefined) metrics.pe = pe;
  const pb = n(m.pbQuarterly) ?? n(m.pbAnnual);
  if (pb !== undefined) metrics.pb = pb;
  const roe = n(m.roeTTM);
  if (roe !== undefined) metrics.roe = roe / 100; // Finnhub reports percent
  const gm = n(m.grossMarginTTM);
  if (gm !== undefined) metrics.grossMargin = gm / 100;
  const nm = n(m.netProfitMarginTTM) ?? n(m.netMarginTTM);
  if (nm !== undefined) metrics.netMargin = nm / 100;
  const ev = n(m["currentEv/freeCashFlowTTM"]);
  if (ev === undefined && n(m.evToEbitdaTTM) !== undefined) metrics.evEbitda = m.evToEbitdaTTM;
  const eg = n(m.epsGrowthTTMYoy);
  if (eg !== undefined) metrics.epsGrowth = eg / 100;
  const rg = n(m.revenueGrowthTTMYoy);
  if (rg !== undefined) metrics.revenueGrowth = rg / 100;

  if (Object.keys(metrics).length === 0) return null;
  return { metrics, raw: null };
}

/** Finnhub real-time quote fallback (free /quote): price + daily change. */
export async function finnhubQuote(ticker: string, apiKey: string): Promise<Quote | null> {
  if (!apiKey) return null;
  const d = await getJson(`${BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`);
  if (!d || typeof d.c !== "number" || d.c === 0) return null;
  return {
    ticker,
    price: d.c,
    change: typeof d.d === "number" ? d.d : 0,
    changePercent: typeof d.dp === "number" ? d.dp / 100 : 0,
  };
}

/** Finnhub company profile fallback (free /stock/profile2): name, exchange, type. */
export async function finnhubProfile(ticker: string, apiKey: string): Promise<Profile | null> {
  if (!apiKey) return null;
  const p = await getJson(`${BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`);
  if (!p || !p.name) return null;
  return {
    ticker,
    name: p.name,
    industry: p.finnhubIndustry,
    exchange: p.exchange,
  };
}

/** Finnhub symbol search fallback (free /search). */
export async function finnhubSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  if (!apiKey) return [];
  const d = await getJson(`${BASE}/search?q=${encodeURIComponent(query)}&token=${apiKey}`);
  const results: any[] = d?.result ?? [];
  return results
    .filter((r) => r.symbol && !r.symbol.includes(".")) // prefer plain US symbols
    .slice(0, 8)
    .map((r) => ({
      symbol: r.symbol,
      name: r.description ?? r.symbol,
      type: r.type === "ETP" ? "etf" : "stock",
    }));
}

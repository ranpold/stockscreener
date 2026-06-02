// Twelve Data — keyed fallback (free 800/day) for prices and, best-effort, fundamentals.

import type { OHLCVBar } from "./types";
import type { FundamentalMetrics } from "../quant/fundamental";

const BASE = "https://api.twelvedata.com";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j: any = await res.json();
    if (j?.status === "error") return null;
    return j;
  } catch {
    return null;
  }
}

const n = (x: any): number | undefined => {
  const v = typeof x === "string" ? Number(x) : x;
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
};

/** Daily OHLCV via /time_series. Returns chronological bars. */
export async function twelveOHLCV(ticker: string, apiKey: string, outputsize = 300): Promise<OHLCVBar[]> {
  if (!apiKey) return [];
  const url = `${BASE}/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=${outputsize}&apikey=${apiKey}`;
  const data = await getJson(url);
  const values: any[] = data?.values ?? [];
  if (!values.length) return [];
  const bars: OHLCVBar[] = [];
  for (const v of values) {
    const close = n(v.close);
    if (close === undefined || !v.datetime) continue;
    bars.push({
      time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open: n(v.open) ?? close,
      high: n(v.high) ?? close,
      low: n(v.low) ?? close,
      close,
      volume: n(v.volume) ?? 0,
    });
  }
  // Twelve Data returns newest-first; we want oldest-first.
  return bars.reverse();
}

/** Best-effort fundamentals via /statistics (some fields gated on free tier). */
export async function twelveFundamentals(
  ticker: string,
  apiKey: string,
): Promise<{ metrics: Partial<FundamentalMetrics> } | null> {
  if (!apiKey) return null;
  const data = await getJson(`${BASE}/statistics?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`);
  const s = data?.statistics;
  if (!s) return null;
  const val = s.valuations_metrics ?? {};
  const fin = s.financials ?? {};
  const metrics: Partial<FundamentalMetrics> = {};
  const pe = n(val.trailing_pe);
  if (pe !== undefined) metrics.pe = pe;
  const pb = n(val.price_to_book_mrq);
  if (pb !== undefined) metrics.pb = pb;
  const evEbitda = n(val.enterprise_to_ebitda);
  if (evEbitda !== undefined) metrics.evEbitda = evEbitda;
  const roe = n(fin.return_on_equity_ttm);
  if (roe !== undefined) metrics.roe = roe;
  const pm = n(fin.profit_margin);
  if (pm !== undefined) metrics.netMargin = pm;
  return Object.keys(metrics).length ? { metrics } : null;
}

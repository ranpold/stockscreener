// Top gainers / losers, computed from a universe via Yahoo's batch quote endpoint
// (crumb-gated, same handshake as ETF holdings). Best-effort; [] on failure.

import { getCrumb, YAHOO_UA } from "./yahooEtf";

export interface Mover {
  symbol: string;
  name: string;
  price: number;
  changePercent: number; // fraction (0.05 = +5%)
}
export interface Movers {
  gainers: Mover[];
  losers: Mover[];
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function getMovers(symbols: string[], top = 6): Promise<Movers> {
  const cr = await getCrumb();
  if (!cr) return { gainers: [], losers: [] };
  const all: Mover[] = [];
  for (const group of chunk(symbols, 50)) {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${group.join(
        ",",
      )}&crumb=${encodeURIComponent(cr.crumb)}`;
      const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Cookie: cr.cookie } });
      if (!res.ok) continue;
      const j: any = await res.json();
      const rows: any[] = j?.quoteResponse?.result ?? [];
      for (const r of rows) {
        const cp = r.regularMarketChangePercent;
        const price = r.regularMarketPrice;
        if (typeof cp !== "number" || typeof price !== "number") continue;
        all.push({
          symbol: r.symbol,
          name: r.shortName ?? r.longName ?? r.symbol,
          price,
          changePercent: cp / 100, // Yahoo returns percent points
        });
      }
    } catch {
      // skip this chunk
    }
  }
  if (!all.length) return { gainers: [], losers: [] };
  const sorted = [...all].sort((a, b) => b.changePercent - a.changePercent);
  return {
    gainers: sorted.slice(0, top),
    losers: sorted.slice(-top).reverse(),
  };
}

// Stooq — no-key EOD daily price fallback (CSV). Last resort when Yahoo + Twelve Data fail.
// Note: Stooq enforces a low daily hit quota; only used when other sources return nothing.

import type { OHLCVBar } from "./types";

export async function stooqOHLCV(ticker: string): Promise<OHLCVBar[]> {
  // US listings on Stooq use the ".us" suffix; dots in tickers aren't supported.
  const sym = `${ticker.toLowerCase().replace(/\..*$/, "")}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.startsWith("<") || /exceeded/i.test(text)) return [];
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    // Header: Date,Open,High,Low,Close,Volume
    const bars: OHLCVBar[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [date, o, h, l, c, v] = lines[i].split(",");
      const close = Number(c);
      if (!date || Number.isNaN(close)) continue;
      bars.push({
        time: Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000),
        open: Number(o) || close,
        high: Number(h) || close,
        low: Number(l) || close,
        close,
        volume: Number(v) || 0,
      });
    }
    return bars;
  } catch {
    return [];
  }
}

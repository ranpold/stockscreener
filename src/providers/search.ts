// Symbol search by name or ticker. FMP /stable is primary (reliable, keyed);
// Yahoo search is a free fallback. Results are ranked to prefer US listings.

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string; // "stock" | "etf" | other
}

async function getJson(url: string, headers?: Record<string, string>): Promise<any | null> {
  try {
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const US_EXCH = new Set(["NASDAQ", "NYSE", "AMEX", "NYSE ARCA", "BATS", "NYSEARCA", "NMS", "PCX"]);

function rank(a: SearchResult, b: SearchResult): number {
  const aus = a.exchange && US_EXCH.has(a.exchange.toUpperCase()) ? 0 : 1;
  const bus = b.exchange && US_EXCH.has(b.exchange.toUpperCase()) ? 0 : 1;
  if (aus !== bus) return aus - bus;
  // Prefer plain symbols (no dot suffix like AAPL.DE).
  const adot = a.symbol.includes(".") ? 1 : 0;
  const bdot = b.symbol.includes(".") ? 1 : 0;
  return adot - bdot;
}

async function fmpSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(query)}&limit=15&apikey=${apiKey}`;
  const data = await getJson(url);
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    symbol: d.symbol,
    name: d.name,
    exchange: d.exchange,
    type: undefined, // FMP search-name doesn't return type; resolved lazily elsewhere
  }));
}

async function yahooSearch(query: string): Promise<SearchResult[]> {
  const data = await getJson(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
    { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  );
  const quotes = data?.quotes;
  if (!Array.isArray(quotes)) return [];
  return quotes
    .filter((q: any) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      exchange: q.exchDisp,
      type: q.quoteType === "ETF" ? "etf" : "stock",
    }));
}

export async function searchSymbols(
  query: string,
  env: { FMP_API_KEY?: string },
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  let results: SearchResult[] = [];
  if (env.FMP_API_KEY) results = await fmpSearch(q, env.FMP_API_KEY);
  if (results.length === 0) results = await yahooSearch(q);
  // Dedupe by symbol, rank, cap.
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    if (seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
  return deduped.sort(rank).slice(0, 8);
}

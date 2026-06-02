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

function makeRank(query: string) {
  const q = query.trim().toUpperCase();
  return (a: SearchResult, b: SearchResult): number => {
    // Exact ticker match wins (so typing "ARM" surfaces ARM, not "Armstrong").
    const aexact = a.symbol.toUpperCase() === q ? 0 : 1;
    const bexact = b.symbol.toUpperCase() === q ? 0 : 1;
    if (aexact !== bexact) return aexact - bexact;
    // Then US listings.
    const aus = a.exchange && US_EXCH.has(a.exchange.toUpperCase()) ? 0 : 1;
    const bus = b.exchange && US_EXCH.has(b.exchange.toUpperCase()) ? 0 : 1;
    if (aus !== bus) return aus - bus;
    // Then plain symbols (no dot suffix like AAPL.DE).
    const adot = a.symbol.includes(".") ? 1 : 0;
    const bdot = b.symbol.includes(".") ? 1 : 0;
    return adot - bdot;
  };
}

function mapFmp(data: any): SearchResult[] {
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    symbol: d.symbol,
    name: d.name,
    exchange: d.exchange,
    type: undefined,
  }));
}

// Query FMP by both symbol and name so tickers AND company names both resolve.
async function fmpSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const enc = encodeURIComponent(query);
  const base = "https://financialmodelingprep.com/stable";
  const [bySymbol, byName] = await Promise.all([
    getJson(`${base}/search-symbol?query=${enc}&limit=15&apikey=${apiKey}`),
    getJson(`${base}/search-name?query=${enc}&limit=15&apikey=${apiKey}`),
  ]);
  return [...mapFmp(bySymbol), ...mapFmp(byName)];
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
  env: { FMP_API_KEY?: string; FINNHUB_API_KEY?: string },
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  let results: SearchResult[] = [];
  if (env.FMP_API_KEY) results = await fmpSearch(q, env.FMP_API_KEY);
  if (results.length === 0) results = await yahooSearch(q);
  if (results.length === 0 && env.FINNHUB_API_KEY) {
    const { finnhubSearch } = await import("./finnhub");
    results = await finnhubSearch(q, env.FINNHUB_API_KEY);
  }
  // Dedupe by symbol, rank, cap.
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    if (!r.symbol || seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
  return deduped.sort(makeRank(q)).slice(0, 8);
}

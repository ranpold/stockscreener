// Typed client for the Worker API. Types mirror src/service.ts responses.

export interface FactorScores {
  ticker: string;
  valueZ: number | null;
  momentumZ: number | null;
  qualityZ: number | null;
  lowVolZ: number | null;
  composite: number;
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

export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RiskMetrics {
  cagr: number;
  annualizedVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  beta: number;
}

export interface TechnicalSnapshot {
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  momentum12_1: number;
  lastClose: number;
}

export interface FundamentalMetrics {
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  roe: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  piotroski: number | null;
}

export interface SubScore {
  key: string;
  label: string;
  score: number | null;
  weight: number;
}

export interface Recommendation {
  score: number;
  verdict: "Strong Buy" | "Buy" | "Hold" | "Reduce" | "Avoid";
  subScores: SubScore[];
  positives: string[];
  negatives: string[];
  disclaimer: string;
}

export interface NewsItem {
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary?: string;
  image?: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

export interface EtfHolding {
  symbol: string;
  name: string;
  weight: number;
}
export interface EtfSector {
  sector: string;
  weight: number;
}
export interface EtfBreakdown {
  holdings: EtfHolding[];
  sectors: EtfSector[];
}

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
  news: NewsItem[];
  etf: EtfBreakdown | null;
}

export interface Watchlist {
  id: string;
  name: string;
  createdAt: number;
  tickers: string[];
}

export interface ScreenFilters {
  minSharpe?: number;
  maxPe?: number;
  minRoe?: number;
  minMomentum?: number;
  maxBeta?: number;
}

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  screen(universe: string, filters: ScreenFilters): Promise<{ rows: ScreenRow[]; count: number }> {
    const p = new URLSearchParams({ universe });
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && !Number.isNaN(v)) p.set(k, String(v));
    }
    return getJson(`/api/screen?${p.toString()}`);
  },

  stock(ticker: string): Promise<StockAnalysis> {
    return getJson(`/api/stock/${encodeURIComponent(ticker)}`);
  },

  chart(ticker: string, range: string): Promise<{ bars: OHLCVBar[] }> {
    return getJson(`/api/chart/${encodeURIComponent(ticker)}?range=${range}`);
  },

  search(q: string): Promise<{ results: SearchResult[] }> {
    return getJson(`/api/search?q=${encodeURIComponent(q)}`);
  },

  // Resolve free text (name or ticker) to a real symbol via search. null if no match.
  async resolveSymbol(input: string): Promise<string | null> {
    const term = input.trim();
    if (!term) return null;
    const { results } = await api.search(term);
    return results[0]?.symbol ?? null;
  },

  async resolveSymbols(inputs: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const i of inputs) {
      const s = await api.resolveSymbol(i);
      if (s) out.push(s);
    }
    return Array.from(new Set(out));
  },

  universe(): Promise<{ sp500: string[] }> {
    return getJson(`/api/universe`);
  },

  watchlists(): Promise<Watchlist[]> {
    return getJson(`/api/watchlists`);
  },

  async createWatchlist(name: string, tickers: string[]): Promise<Watchlist> {
    const res = await fetch(`/api/watchlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tickers }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async updateWatchlist(id: string, tickers: string[]): Promise<void> {
    const res = await fetch(`/api/watchlists/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    if (!res.ok) throw new Error(await res.text());
  },

  async deleteWatchlist(id: string): Promise<void> {
    await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
  },

  me(): Promise<{ user: AuthUser | null }> {
    return getJson(`/api/auth/me`);
  },

  async logout(): Promise<void> {
    await fetch(`/api/auth/logout`, { method: "POST" });
  },
};

// Formatting helpers shared across pages.
export const fmt = {
  pct(x: number | null | undefined, digits = 1): string {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return `${(x * 100).toFixed(digits)}%`;
  },
  num(x: number | null | undefined, digits = 2): string {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return x.toFixed(digits);
  },
  money(x: number | null | undefined): string {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    return `$${x.toFixed(2)}`;
  },
};

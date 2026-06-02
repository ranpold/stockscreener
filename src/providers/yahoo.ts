import type { DataProvider, OHLCVBar, Profile, Quote, Range } from "./types";
import type { RawFundamentals } from "../quant/fundamental";

const BASE = "https://query1.finance.yahoo.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Chart timeframe -> Yahoo (range, interval). Short ranges use intraday bars.
const CHART_PARAMS: Record<string, { range: string; interval: string }> = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "30m" },
  "1mo": { range: "1mo", interval: "1d" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "2y": { range: "2y", interval: "1d" },
  "5y": { range: "5y", interval: "1wk" },
};

function parseBars(result: any): OHLCVBar[] {
  if (!result) return [];
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const bars: OHLCVBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = adj?.[i] ?? q.close?.[i];
    if (close == null) continue;
    bars.push({
      time: ts[i],
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return bars;
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Batch close-price series for many tickers in one (chunked) Yahoo `spark` call —
 * avoids firing one chart request per ticker (which trips rate limits on watchlists).
 */
export async function yahooSparkCloses(
  symbols: string[],
  range = "1y",
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const nums = (a: any[]): number[] => (a ?? []).filter((x) => typeof x === "number");
  // Yahoo spark caps symbols per request, so use small chunks with light pacing.
  const groups = chunk(symbols, 15);
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (gi > 0) await new Promise((r) => setTimeout(r, 120));
    const url = `${BASE}/v8/finance/spark?symbols=${group.map(encodeURIComponent).join(",")}&range=${range}&interval=1d`;
    let data = await getJson(url);
    if (!data) {
      await new Promise((r) => setTimeout(r, 400));
      data = await getJson(url);
    }
    if (!data) continue;
    // Shape A: { spark: { result: [{ symbol, response:[{indicators:{quote:[{close}]}}] }] } }
    const results = data?.spark?.result;
    if (Array.isArray(results)) {
      for (const r of results) {
        const resp = r.response?.[0];
        const closes = nums(resp?.indicators?.quote?.[0]?.close ?? resp?.close);
        if (closes.length) out.set(r.symbol, closes);
      }
    } else {
      // Shape B (flat): { SYM: { close:[...], timestamp:[...] }, ... }
      for (const [sym, v] of Object.entries<any>(data)) {
        const closes = nums(v?.close ?? v?.indicators?.quote?.[0]?.close);
        if (closes.length) out.set(sym, closes);
      }
    }
  }
  return out;
}

export const yahooProvider: DataProvider = {
  name: "yahoo",

  // Daily bars for a coarse range — used for quant analysis (always ~1y daily).
  async getOHLCV(ticker: string, range: Range): Promise<OHLCVBar[]> {
    const url = `${BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
    let bars = parseBars((await getJson(url))?.chart?.result?.[0]);
    if (!bars.length) {
      // One retry after a short backoff to ride out a transient rate-limit.
      await new Promise((r) => setTimeout(r, 400));
      bars = parseBars((await getJson(url))?.chart?.result?.[0]);
    }
    return bars;
  },

  // Chart bars for a UI timeframe — intraday for short ranges (today/week).
  async getChartBars(ticker: string, timeframe: string): Promise<OHLCVBar[]> {
    const p = CHART_PARAMS[timeframe] ?? CHART_PARAMS["1y"];
    const url = `${BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${p.range}&interval=${p.interval}`;
    const data = await getJson(url);
    return parseBars(data?.chart?.result?.[0]);
  },

  async getQuote(ticker: string): Promise<Quote | null> {
    const data = await getJson(
      `${BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
    );
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    return {
      ticker,
      price,
      change: price - prev,
      changePercent: prev ? (price - prev) / prev : 0,
      name: meta.shortName ?? meta.longName,
      instrumentType: meta.instrumentType,
    };
  },

  async getFundamentals(ticker: string): Promise<RawFundamentals | null> {
    const modules = [
      "defaultKeyStatistics",
      "financialData",
      "incomeStatementHistory",
      "balanceSheetHistory",
      "cashflowStatementHistory",
      "summaryDetail",
      "price",
    ].join(",");
    const data = await getJson(
      `${BASE}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`,
    );
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    const raw = (x: any): number | undefined =>
      x && typeof x.raw === "number" ? x.raw : undefined;

    const ks = r.defaultKeyStatistics ?? {};
    const fin = r.financialData ?? {};
    const price = r.price ?? {};
    const incomes = r.incomeStatementHistory?.incomeStatementHistory ?? [];
    const balances = r.balanceSheetHistory?.balanceSheetStatements ?? [];
    const cashflows = r.cashflowStatementHistory?.cashflowStatements ?? [];

    const inc0 = incomes[0] ?? {};
    const inc1 = incomes[1] ?? {};
    const bal0 = balances[0] ?? {};
    const bal1 = balances[1] ?? {};
    const cf0 = cashflows[0] ?? {};

    return {
      price: raw(price.regularMarketPrice) ?? raw(fin.currentPrice),
      eps: raw(ks.trailingEps),
      bookValuePerShare: raw(ks.bookValue),
      enterpriseValue: raw(ks.enterpriseValue),
      ebitda: raw(fin.ebitda),
      netIncome: raw(inc0.netIncome),
      prevNetIncome: raw(inc1.netIncome),
      totalAssets: raw(bal0.totalAssets),
      prevTotalAssets: raw(bal1.totalAssets),
      operatingCashFlow: raw(cf0.totalCashFromOperatingActivities) ?? raw(fin.operatingCashflow),
      totalLiabilities: raw(bal0.totalLiab),
      prevTotalLiabilities: raw(bal1.totalLiab),
      currentAssets: raw(bal0.totalCurrentAssets),
      currentLiabilities: raw(bal0.totalCurrentLiabilities),
      prevCurrentAssets: raw(bal1.totalCurrentAssets),
      prevCurrentLiabilities: raw(bal1.totalCurrentLiabilities),
      sharesOutstanding: raw(ks.sharesOutstanding),
      prevSharesOutstanding: raw(ks.sharesOutstanding),
      revenue: raw(inc0.totalRevenue) ?? raw(fin.totalRevenue),
      prevRevenue: raw(inc1.totalRevenue),
      grossProfit: raw(inc0.grossProfit),
      prevGrossProfit: raw(inc1.grossProfit),
      shareholderEquity: raw(bal0.totalStockholderEquity),
      epsGrowth: raw(fin.earningsGrowth),
    };
  },

  async getProfile(ticker: string): Promise<Profile | null> {
    const data = await getJson(
      `${BASE}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,price`,
    );
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    const ap = r.assetProfile ?? {};
    const price = r.price ?? {};
    return {
      ticker,
      name: price.shortName ?? price.longName ?? ticker,
      sector: ap.sector,
      industry: ap.industry,
      exchange: price.exchangeName,
    };
  },
};

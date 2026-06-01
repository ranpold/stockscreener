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

export const yahooProvider: DataProvider = {
  name: "yahoo",

  async getOHLCV(ticker: string, range: Range): Promise<OHLCVBar[]> {
    const url = `${BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
    const data = await getJson(url);
    const result = data?.chart?.result?.[0];
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

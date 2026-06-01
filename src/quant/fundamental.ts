// Fundamental metrics + Piotroski F-score. Pure functions over a raw fundamentals bag.

/** Raw fundamentals as gathered from providers. All optional; missing -> metric null. */
export interface RawFundamentals {
  price?: number;
  eps?: number; // trailing EPS
  bookValuePerShare?: number;
  enterpriseValue?: number;
  ebitda?: number;
  netIncome?: number;
  prevNetIncome?: number;
  totalAssets?: number;
  prevTotalAssets?: number;
  operatingCashFlow?: number;
  totalLiabilities?: number;
  prevTotalLiabilities?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  prevCurrentAssets?: number;
  prevCurrentLiabilities?: number;
  sharesOutstanding?: number;
  prevSharesOutstanding?: number;
  revenue?: number;
  prevRevenue?: number;
  grossProfit?: number;
  prevGrossProfit?: number;
  shareholderEquity?: number;
  epsGrowth?: number;
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

function ratio(a?: number, b?: number): number | null {
  if (a === undefined || b === undefined || b === 0) return null;
  return a / b;
}

/** Piotroski F-score (0-9). Returns null if too little data to compute meaningfully. */
export function piotroskiScore(f: RawFundamentals): number | null {
  const checks: (boolean | null)[] = [];
  // Profitability
  checks.push(f.netIncome !== undefined ? f.netIncome > 0 : null);
  checks.push(f.operatingCashFlow !== undefined ? f.operatingCashFlow > 0 : null);
  const roa =
    f.netIncome !== undefined && f.totalAssets ? f.netIncome / f.totalAssets : undefined;
  const prevRoa =
    f.prevNetIncome !== undefined && f.prevTotalAssets
      ? f.prevNetIncome / f.prevTotalAssets
      : undefined;
  checks.push(roa !== undefined && prevRoa !== undefined ? roa > prevRoa : null);
  checks.push(
    f.operatingCashFlow !== undefined && f.netIncome !== undefined
      ? f.operatingCashFlow > f.netIncome
      : null,
  );
  // Leverage / liquidity
  const lev = ratio(f.totalLiabilities, f.totalAssets);
  const prevLev = ratio(f.prevTotalLiabilities, f.prevTotalAssets);
  checks.push(lev !== null && prevLev !== null ? lev < prevLev : null);
  const cr = ratio(f.currentAssets, f.currentLiabilities);
  const prevCr = ratio(f.prevCurrentAssets, f.prevCurrentLiabilities);
  checks.push(cr !== null && prevCr !== null ? cr > prevCr : null);
  checks.push(
    f.sharesOutstanding !== undefined && f.prevSharesOutstanding !== undefined
      ? f.sharesOutstanding <= f.prevSharesOutstanding
      : null,
  );
  // Efficiency
  const gm = ratio(f.grossProfit, f.revenue);
  const prevGm = ratio(f.prevGrossProfit, f.prevRevenue);
  checks.push(gm !== null && prevGm !== null ? gm > prevGm : null);
  const at = ratio(f.revenue, f.totalAssets);
  const prevAt = ratio(f.prevRevenue, f.prevTotalAssets);
  checks.push(at !== null && prevAt !== null ? at > prevAt : null);

  const known = checks.filter((c) => c !== null) as boolean[];
  if (known.length < 5) return null; // not enough data to be meaningful
  return known.reduce((acc, c) => acc + (c ? 1 : 0), 0);
}

export function fundamentalMetrics(f: RawFundamentals): FundamentalMetrics {
  const pe = ratio(f.price, f.eps);
  const pb = ratio(f.price, f.bookValuePerShare);
  const evEbitda = ratio(f.enterpriseValue, f.ebitda);
  const roe = ratio(f.netIncome, f.shareholderEquity);
  const grossMargin = ratio(f.grossProfit, f.revenue);
  const netMargin = ratio(f.netIncome, f.revenue);
  const revenueGrowth =
    f.revenue !== undefined && f.prevRevenue ? f.revenue / f.prevRevenue - 1 : null;
  const epsGrowth = f.epsGrowth ?? null;
  return {
    pe,
    pb,
    evEbitda,
    roe,
    grossMargin,
    netMargin,
    revenueGrowth,
    epsGrowth,
    piotroski: piotroskiScore(f),
  };
}

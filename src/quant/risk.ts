// Risk & return metrics. All functions pure; inputs are plain number arrays.
// Prices are assumed chronological (oldest -> newest), daily close.

const TRADING_DAYS = 252;

/** Simple daily returns from a price series. Length = prices.length - 1. */
export function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev === 0) {
      out.push(0);
      continue;
    }
    out.push(prices[i] / prev - 1);
  }
  return out;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1). */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Annualized growth rate from first to last price.
 * For spans under one year we do NOT annualize — extrapolating a partial year
 * (e.g. a 2-month IPO) produces absurd numbers. Instead we return the total
 * return over the available period.
 */
export function cagr(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first <= 0) return 0;
  const totalReturn = last / first - 1;
  const years = (prices.length - 1) / TRADING_DAYS;
  // Below ~11 months of data, don't annualize — extrapolating a partial year
  // (e.g. a recent IPO) produces absurd CAGRs. Report the total return instead.
  if (years < 0.9) return totalReturn;
  return (last / first) ** (1 / years) - 1;
}

/** Years of price history represented by the series (trading-day based). */
export function historyYears(prices: number[]): number {
  return prices.length > 1 ? (prices.length - 1) / TRADING_DAYS : 0;
}

/** Annualized volatility from daily returns. */
export function annualizedVolatility(returns: number[]): number {
  return stddev(returns) * Math.sqrt(TRADING_DAYS);
}

/** Annualized Sharpe ratio. riskFreeAnnual e.g. 0.04 for 4%. */
export function sharpe(returns: number[], riskFreeAnnual = 0.04): number {
  const vol = annualizedVolatility(returns);
  if (vol === 0) return 0;
  const annualReturn = mean(returns) * TRADING_DAYS;
  return (annualReturn - riskFreeAnnual) / vol;
}

/** Annualized Sortino ratio (downside deviation only). */
export function sortino(returns: number[], riskFreeAnnual = 0.04): number {
  if (returns.length < 2) return 0;
  const dailyRf = riskFreeAnnual / TRADING_DAYS;
  const downside = returns.map((r) => Math.min(0, r - dailyRf));
  const dd = Math.sqrt(mean(downside.map((d) => d * d))) * Math.sqrt(TRADING_DAYS);
  if (dd === 0) return 0;
  const annualReturn = mean(returns) * TRADING_DAYS;
  return (annualReturn - riskFreeAnnual) / dd;
}

/** Maximum drawdown as a negative fraction (e.g. -0.35 = -35%). */
export function maxDrawdown(prices: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    if (peak > 0) {
      const dd = p / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/** Covariance of two equal-length arrays (sample, n-1). */
export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

/** Beta of asset returns vs market returns. */
export function beta(assetReturns: number[], marketReturns: number[]): number {
  const varMarket = stddev(marketReturns) ** 2;
  if (varMarket === 0) return 0;
  return covariance(assetReturns, marketReturns) / varMarket;
}

export interface RiskMetrics {
  cagr: number;
  annualizedVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  beta: number;
}

/** Compute the full risk bundle. marketPrices optional (for beta). */
export function riskMetrics(prices: number[], marketPrices?: number[]): RiskMetrics {
  const rets = dailyReturns(prices);
  let b = 0;
  if (marketPrices && marketPrices.length > 1) {
    const mret = dailyReturns(marketPrices);
    const n = Math.min(rets.length, mret.length);
    b = beta(rets.slice(-n), mret.slice(-n));
  }
  return {
    cagr: cagr(prices),
    annualizedVolatility: annualizedVolatility(rets),
    sharpe: sharpe(rets),
    sortino: sortino(rets),
    maxDrawdown: maxDrawdown(prices),
    beta: b,
  };
}

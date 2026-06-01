// Cross-sectional factor scoring + simple top-decile backtest.

export interface FactorInputs {
  ticker: string;
  // raw factor signals (higher = "more of that factor")
  value?: number | null; // e.g. earnings yield = 1/PE
  momentum?: number | null; // 12-1 momentum
  quality?: number | null; // e.g. ROE
  lowVol?: number | null; // e.g. -annualizedVolatility (higher = lower vol)
}

export interface FactorScores {
  ticker: string;
  valueZ: number | null;
  momentumZ: number | null;
  qualityZ: number | null;
  lowVolZ: number | null;
  composite: number;
}

function zscores(values: (number | null)[]): (number | null)[] {
  const known = values.filter((v) => v !== null) as number[];
  if (known.length < 2) return values.map(() => null);
  const m = known.reduce((a, b) => a + b, 0) / known.length;
  const sd = Math.sqrt(known.reduce((a, b) => a + (b - m) ** 2, 0) / (known.length - 1));
  if (sd === 0) return values.map(() => (null));
  return values.map((v) => (v === null ? null : (v - m) / sd));
}

/**
 * Compute z-scored factor exposures across a universe and an equal-weight composite.
 * Missing factor for a name contributes 0 to its composite (treated as neutral).
 */
export function computeFactorScores(inputs: FactorInputs[]): FactorScores[] {
  const valueZ = zscores(inputs.map((i) => i.value ?? null));
  const momentumZ = zscores(inputs.map((i) => i.momentum ?? null));
  const qualityZ = zscores(inputs.map((i) => i.quality ?? null));
  const lowVolZ = zscores(inputs.map((i) => i.lowVol ?? null));
  return inputs.map((inp, idx) => {
    const parts = [valueZ[idx], momentumZ[idx], qualityZ[idx], lowVolZ[idx]];
    const present = parts.filter((p) => p !== null) as number[];
    const composite = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 0;
    return {
      ticker: inp.ticker,
      valueZ: valueZ[idx],
      momentumZ: momentumZ[idx],
      qualityZ: qualityZ[idx],
      lowVolZ: lowVolZ[idx],
      composite,
    };
  });
}

export interface BacktestResult {
  periods: number;
  topDecileReturn: number; // cumulative
  universeReturn: number; // cumulative equal-weight
  excessReturn: number;
}

/**
 * Simple single-rebalance backtest: rank by composite, take top decile,
 * compare equal-weight forward return vs equal-weight universe forward return.
 * forwardReturns must align by index with scores.
 */
export function topDecileBacktest(
  scores: FactorScores[],
  forwardReturns: number[],
): BacktestResult {
  const n = Math.min(scores.length, forwardReturns.length);
  if (n === 0) {
    return { periods: 0, topDecileReturn: 0, universeReturn: 0, excessReturn: 0 };
  }
  const rows = scores
    .slice(0, n)
    .map((s, i) => ({ composite: s.composite, ret: forwardReturns[i] }))
    .sort((a, b) => b.composite - a.composite);
  const decileSize = Math.max(1, Math.floor(n / 10));
  const top = rows.slice(0, decileSize);
  const topRet = top.reduce((a, r) => a + r.ret, 0) / top.length;
  const uniRet = rows.reduce((a, r) => a + r.ret, 0) / rows.length;
  return {
    periods: 1,
    topDecileReturn: topRet,
    universeReturn: uniRet,
    excessReturn: topRet - uniRet,
  };
}

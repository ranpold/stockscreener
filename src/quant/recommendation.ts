// Rule-based quant recommendation. Pure + deterministic: combines risk, technical,
// and (for stocks) fundamental signals into 0-100 sub-scores, then a weighted verdict.
// ETFs skip value/quality (no meaningful fundamentals) and reweight to price-based signals.

export interface RecommendationInput {
  isEtf: boolean;
  // risk
  sharpe: number;
  sortino: number;
  maxDrawdown: number; // negative fraction
  cagr: number;
  // technical
  lastClose: number;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  momentum12_1: number;
  // fundamental (null for ETFs / missing data)
  pe: number | null;
  pb: number | null;
  roe: number | null;
  netMargin: number | null;
  piotroski: number | null;
}

export interface SubScore {
  key: string;
  label: string;
  score: number | null; // 0-100, null = not enough data
  weight: number;
}

export type Verdict = "Strong Buy" | "Buy" | "Hold" | "Reduce" | "Avoid";

export interface Recommendation {
  score: number; // 0-100 composite
  verdict: Verdict;
  subScores: SubScore[];
  positives: string[];
  negatives: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "Educational, rule-based signal — not financial advice. Quant scores can be wrong; do your own research.";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Linear map value in [lo,hi] -> [0,100], clamped. Higher input = higher score. */
const scaleUp = (x: number, lo: number, hi: number) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);

/** Linear map where LOWER input = higher score (e.g. valuation multiples). */
const scaleDown = (x: number, best: number, worst: number) =>
  clamp(((worst - x) / (worst - best)) * 100, 0, 100);

const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function valueScore(pe: number | null, pb: number | null): number | null {
  const parts: (number | null)[] = [];
  if (pe !== null && pe > 0) parts.push(scaleDown(pe, 10, 40));
  if (pb !== null && pb > 0) parts.push(scaleDown(pb, 1, 12));
  return avg(parts);
}

function qualityScore(
  roe: number | null,
  netMargin: number | null,
  piotroski: number | null,
): number | null {
  const parts: (number | null)[] = [];
  if (roe !== null) parts.push(scaleUp(roe, 0, 0.3));
  if (netMargin !== null) parts.push(scaleUp(netMargin, 0, 0.3));
  if (piotroski !== null) parts.push((piotroski / 9) * 100);
  return avg(parts);
}

function momentumScore(momentum12_1: number): number {
  return scaleUp(momentum12_1, -0.3, 0.3);
}

function trendScore(
  lastClose: number,
  sma50: number | null,
  sma200: number | null,
  macd: number | null,
  macdSignal: number | null,
): number | null {
  const parts: number[] = [];
  if (sma50 !== null) parts.push(lastClose > sma50 ? 100 : 0);
  if (sma200 !== null) parts.push(lastClose > sma200 ? 100 : 0);
  if (macd !== null && macdSignal !== null) parts.push(macd > macdSignal ? 100 : 0);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function riskScore(sharpe: number, sortino: number, maxDrawdown: number): number {
  const parts = [scaleUp(sharpe, 0, 2.5), scaleUp(sortino, 0, 3.5), scaleUp(maxDrawdown, -0.6, 0)];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function verdictFor(score: number): Verdict {
  if (score >= 78) return "Strong Buy";
  if (score >= 62) return "Buy";
  if (score >= 45) return "Hold";
  if (score >= 32) return "Reduce";
  return "Avoid";
}

export function recommend(input: RecommendationInput): Recommendation {
  const value = input.isEtf ? null : valueScore(input.pe, input.pb);
  const quality = input.isEtf ? null : qualityScore(input.roe, input.netMargin, input.piotroski);
  const momentum = momentumScore(input.momentum12_1);
  const trend = trendScore(input.lastClose, input.sma50, input.sma200, input.macd, input.macdSignal);
  const risk = riskScore(input.sharpe, input.sortino, input.maxDrawdown);

  // Weights — momentum/trend (price action) carry more so strong performers are
  // rewarded. ETFs drop value/quality and lean even harder on momentum.
  const weights = input.isEtf
    ? { value: 0, quality: 0, momentum: 0.4, trend: 0.3, risk: 0.3 }
    : { value: 0.12, quality: 0.18, momentum: 0.27, trend: 0.21, risk: 0.22 };

  const subScores: SubScore[] = [
    { key: "value", label: "Valuation", score: value, weight: weights.value },
    { key: "quality", label: "Quality", score: quality, weight: weights.quality },
    { key: "momentum", label: "Momentum", score: momentum, weight: weights.momentum },
    { key: "trend", label: "Trend", score: trend, weight: weights.trend },
    { key: "risk", label: "Risk-adj. return", score: risk, weight: weights.risk },
  ];

  // Weighted average over sub-scores that have data.
  let wsum = 0;
  let acc = 0;
  for (const s of subScores) {
    if (s.score !== null && s.weight > 0) {
      acc += s.score * s.weight;
      wsum += s.weight;
    }
  }
  let composite = wsum > 0 ? acc / wsum : 50;

  const positives: string[] = [];
  const negatives: string[] = [];

  // Momentum kicker: reward strong, confirmed uptrends so leaders get a Buy, not Hold.
  // Triggers on big 12-1 momentum while price holds above its 200-day average.
  const aboveLong = input.sma200 !== null && input.lastClose > input.sma200;
  if (input.momentum12_1 >= 0.4 && (aboveLong || input.sma200 === null)) {
    const kicker = Math.min(10, (input.momentum12_1 - 0.4) * 25);
    composite += kicker;
    positives.push(`Strong momentum — up ${(input.momentum12_1 * 100).toFixed(0)}% (12-1) in an uptrend`);
  }

  // Overbought guard — softened so we don't punish healthy momentum; only extreme RSI.
  if (input.rsi14 !== null) {
    if (input.rsi14 > 82) {
      composite -= 5;
      negatives.push(`Very overbought — RSI ${input.rsi14.toFixed(0)} (>82), near-term pullback risk`);
    } else if (input.rsi14 < 30) {
      positives.push(`Oversold — RSI ${input.rsi14.toFixed(0)} (<30), possible bounce`);
    }
  }
  composite = clamp(composite, 0, 100);

  // Human-readable drivers.
  const reasonText: Record<string, [string, string]> = {
    value: ["Attractively valued vs typical multiples", "Expensive on P/E or P/B"],
    quality: ["Strong profitability & balance sheet", "Weak profitability / quality"],
    momentum: ["Positive 12-1 price momentum", "Negative price momentum"],
    trend: ["Trading above key moving averages", "Below key moving averages (downtrend)"],
    risk: ["Healthy risk-adjusted returns (Sharpe/Sortino)", "Poor risk-adjusted returns"],
  };
  for (const s of subScores) {
    if (s.score === null || s.weight === 0) continue;
    if (s.score >= 70) positives.push(reasonText[s.key][0]);
    else if (s.score <= 40) negatives.push(reasonText[s.key][1]);
  }

  return {
    score: Math.round(composite),
    verdict: verdictFor(composite),
    subScores,
    positives,
    negatives,
    disclaimer: DISCLAIMER,
  };
}

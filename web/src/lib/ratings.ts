// Per-metric "what it is" descriptions + good/fair/bad ratings for the deep-dive.

export type Tone = "pos" | "neutral" | "neg";
export interface Rating {
  tone: Tone;
  label: string;
}

// Short description of what each metric means.
export const DESC: Record<string, string> = {
  cagr: "Annualized return",
  cagrTotal: "Total return (under 1yr listed)",
  volatility: "Annualized price swings — lower is calmer",
  sharpe: "Return per unit of risk (>1 good)",
  sortino: "Like Sharpe, penalizes downside only",
  maxDrawdown: "Worst peak-to-trough drop",
  beta: "Sensitivity to the market (1 = moves with index)",
  rsi14: "Momentum 0–100 (>70 hot, <30 cold)",
  sma50: "50-day average price",
  sma200: "200-day average price (long-term trend)",
  ema20: "20-day exponential average (recent trend)",
  macd: "Trend momentum vs its signal line",
  macdSignal: "MACD signal line",
  macdHistogram: "MACD minus signal (>0 bullish)",
  momentum: "12-month return excluding last month",
  bollingerUpper: "Upper volatility band",
  bollingerLower: "Lower volatility band",
  lastClose: "Most recent closing price",
  pe: "Price ÷ earnings — valuation",
  pb: "Price ÷ book value",
  evEbitda: "Enterprise value ÷ EBITDA",
  roe: "Profit generated on shareholder equity",
  grossMargin: "Gross profit as % of revenue",
  netMargin: "Net profit as % of revenue",
  revenueGrowth: "Year-over-year revenue growth",
  epsGrowth: "Year-over-year earnings-per-share growth",
  piotroski: "Financial-health score 0–9",
  earningsYield: "Earnings ÷ price (value signal)",
};

const POS: Tone = "pos";
const NEU: Tone = "neutral";
const NEG: Tone = "neg";

/** Rate a metric value good/fair/bad. ctx.lastClose enables price-vs-level ratings. */
export function rate(key: string, v: number | null, ctx?: { lastClose?: number }): Rating | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const close = ctx?.lastClose;
  switch (key) {
    case "cagr":
      return v >= 0.15 ? { tone: POS, label: "Strong" } : v >= 0 ? { tone: NEU, label: "Modest" } : { tone: NEG, label: "Negative" };
    case "volatility":
      return v < 0.2 ? { tone: POS, label: "Low" } : v <= 0.35 ? { tone: NEU, label: "Moderate" } : { tone: NEG, label: "High" };
    case "sharpe":
      return v >= 1 ? { tone: POS, label: "Strong" } : v >= 0 ? { tone: NEU, label: "Modest" } : { tone: NEG, label: "Poor" };
    case "sortino":
      return v >= 1.5 ? { tone: POS, label: "Strong" } : v >= 0 ? { tone: NEU, label: "Modest" } : { tone: NEG, label: "Poor" };
    case "maxDrawdown":
      return v > -0.2 ? { tone: POS, label: "Shallow" } : v >= -0.4 ? { tone: NEU, label: "Moderate" } : { tone: NEG, label: "Deep" };
    case "beta":
      return v < 0.8 ? { tone: POS, label: "Defensive" } : v <= 1.2 ? { tone: NEU, label: "Market-like" } : { tone: NEG, label: "Aggressive" };
    case "rsi14":
      return v > 70 ? { tone: NEG, label: "Overbought" } : v < 30 ? { tone: POS, label: "Oversold" } : { tone: NEU, label: "Neutral" };
    case "momentum":
      return v > 0.05 ? { tone: POS, label: "Positive" } : v < -0.05 ? { tone: NEG, label: "Negative" } : { tone: NEU, label: "Flat" };
    case "macdHistogram":
    case "macd":
      return v > 0 ? { tone: POS, label: "Bullish" } : v < 0 ? { tone: NEG, label: "Bearish" } : { tone: NEU, label: "Flat" };
    case "sma50":
    case "sma200":
    case "ema20":
      if (close === undefined) return null;
      return close >= v ? { tone: POS, label: "Price above" } : { tone: NEG, label: "Price below" };
    case "pe":
      return v <= 0 ? { tone: NEG, label: "No earnings" } : v < 15 ? { tone: POS, label: "Cheap" } : v <= 30 ? { tone: NEU, label: "Fair" } : { tone: NEG, label: "Expensive" };
    case "pb":
      return v < 1.5 ? { tone: POS, label: "Cheap" } : v <= 5 ? { tone: NEU, label: "Fair" } : { tone: NEG, label: "Rich" };
    case "evEbitda":
      return v < 10 ? { tone: POS, label: "Cheap" } : v <= 16 ? { tone: NEU, label: "Fair" } : { tone: NEG, label: "Rich" };
    case "roe":
      return v >= 0.15 ? { tone: POS, label: "Strong" } : v >= 0.05 ? { tone: NEU, label: "OK" } : { tone: NEG, label: "Weak" };
    case "grossMargin":
      return v >= 0.4 ? { tone: POS, label: "Strong" } : v >= 0.2 ? { tone: NEU, label: "OK" } : { tone: NEG, label: "Thin" };
    case "netMargin":
      return v >= 0.15 ? { tone: POS, label: "Strong" } : v >= 0.05 ? { tone: NEU, label: "OK" } : { tone: NEG, label: "Thin" };
    case "revenueGrowth":
    case "epsGrowth":
      return v >= 0.15 ? { tone: POS, label: "Strong" } : v >= 0 ? { tone: NEU, label: "Modest" } : { tone: NEG, label: "Declining" };
    case "piotroski":
      return v >= 7 ? { tone: POS, label: "Strong" } : v >= 4 ? { tone: NEU, label: "Fair" } : { tone: NEG, label: "Weak" };
    case "earningsYield":
      return v >= 0.06 ? { tone: POS, label: "Attractive" } : v >= 0.03 ? { tone: NEU, label: "Fair" } : { tone: NEG, label: "Low" };
    default:
      return null;
  }
}

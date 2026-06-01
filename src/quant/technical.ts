// Technical indicators. Pure functions over a chronological close-price series.

/** Simple moving average. Returns array aligned to input; leading values are null until window filled. */
export function sma(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Exponential moving average. Seeded with SMA of first `period` values. */
export function ema(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length < period) return out;
  const k = 2 / (period + 1);
  let prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < prices.length; i++) {
    prev = prices[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. Returns array aligned to input; null until `period` deltas available. */
export function rsi(prices: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD line, signal line, histogram. */
export function macd(prices: number[], fast = 12, slow = 26, signalPeriod = 9): MACDResult {
  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);
  const macdLine: (number | null)[] = prices.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );
  // signal = EMA of macd line over the non-null region
  const firstIdx = macdLine.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(prices.length).fill(null);
  if (firstIdx !== -1) {
    const dense = macdLine.slice(firstIdx).map((v) => v as number);
    const sig = ema(dense, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
  }
  const histogram: (number | null)[] = prices.map((_, i) =>
    macdLine[i] !== null && signal[i] !== null ? (macdLine[i] as number) - (signal[i] as number) : null,
  );
  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/** Bollinger Bands: middle = SMA, bands = +/- mult * stddev (population over window). */
export function bollinger(prices: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(prices, period);
  const upper: (number | null)[] = new Array(prices.length).fill(null);
  const lower: (number | null)[] = new Array(prices.length).fill(null);
  for (let i = period - 1; i < prices.length; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const m = middle[i] as number;
    const variance = window.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { upper, middle, lower };
}

/**
 * 12-1 momentum: return over last `lookback` days excluding the most recent `skip` days.
 * If the series is shorter than the ideal window, the lookback is clamped to what's
 * available (needs at least ~20 usable days), so ~1y of data still yields a signal.
 */
export function momentum(prices: number[], lookback = 252, skip = 21): number {
  const lb = Math.min(lookback, prices.length - 1 - skip);
  if (lb < 20) return 0;
  const end = prices[prices.length - 1 - skip];
  const start = prices[prices.length - 1 - lb];
  if (!start || start === 0) return 0;
  return end / start - 1;
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

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

/** Latest-value snapshot of all indicators for table/card display. */
export function technicalSnapshot(prices: number[]): TechnicalSnapshot {
  const m = macd(prices);
  const bb = bollinger(prices);
  return {
    sma50: last(sma(prices, 50)),
    sma200: last(sma(prices, 200)),
    ema20: last(ema(prices, 20)),
    rsi14: last(rsi(prices, 14)),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHistogram: last(m.histogram),
    bollingerUpper: last(bb.upper),
    bollingerLower: last(bb.lower),
    momentum12_1: momentum(prices),
    lastClose: prices.length ? last(prices) : 0,
  };
}

import { describe, it, expect } from "vitest";
import {
  dailyReturns,
  mean,
  stddev,
  cagr,
  maxDrawdown,
  beta,
  covariance,
} from "../src/quant/risk";
import { sma, ema, rsi, momentum, bollinger } from "../src/quant/technical";
import { piotroskiScore, fundamentalMetrics } from "../src/quant/fundamental";
import { computeFactorScores, topDecileBacktest } from "../src/quant/factor";

describe("risk", () => {
  it("dailyReturns computes simple returns", () => {
    const r = dailyReturns([100, 110, 99]);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(-0.1, 10);
  });

  it("mean and stddev", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  it("cagr over one year of flat-doubling", () => {
    // 253 prices => 252 steps = 1 year, doubling
    const prices = [100, ...Array(251).fill(0).map((_, i) => 100 + i), 200];
    // not exact doubling pattern; use clean case instead:
    const clean = Array(253).fill(0).map((_, i) => 100 * (1 + i / 252));
    const c = cagr(clean);
    expect(c).toBeCloseTo(1.0, 1); // ~doubled in a year
    expect(prices.length).toBe(253);
  });

  it("cagr does not annualize sub-1-year history (IPO case)", () => {
    // ~2 months (42 trading days), +50% — must report total ~0.5, not extrapolated
    const prices = Array(42).fill(0).map((_, i) => 100 * (1 + (0.5 * i) / 41));
    const c = cagr(prices);
    expect(c).toBeCloseTo(0.5, 2);
    expect(c).toBeLessThan(1); // not blown up by annualization
  });

  it("maxDrawdown finds worst peak-to-trough", () => {
    expect(maxDrawdown([100, 120, 60, 80])).toBeCloseTo(-0.5, 5);
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });

  it("covariance and beta of perfectly correlated series", () => {
    const a = [0.01, 0.02, -0.01, 0.03];
    const market = a; // identical => beta 1
    expect(covariance(a, market)).toBeCloseTo(stddev(a) ** 2, 10);
    expect(beta(a, market)).toBeCloseTo(1, 6);
  });

  it("beta of 2x leveraged series is ~2", () => {
    const market = [0.01, -0.02, 0.03, -0.01, 0.02];
    const asset = market.map((r) => 2 * r);
    expect(beta(asset, market)).toBeCloseTo(2, 6);
  });
});

describe("technical", () => {
  it("sma fills leading nulls then averages", () => {
    const s = sma([1, 2, 3, 4, 5], 3);
    expect(s).toEqual([null, null, 2, 3, 4]);
  });

  it("ema seeds with sma and is non-null after period", () => {
    const e = ema([1, 2, 3, 4, 5, 6], 3);
    expect(e[0]).toBeNull();
    expect(e[1]).toBeNull();
    expect(e[2]).toBeCloseTo(2, 6); // sma of 1,2,3
    expect(e[5]).not.toBeNull();
  });

  it("rsi of monotonic rising series is 100", () => {
    const prices = Array(20).fill(0).map((_, i) => 100 + i);
    const r = rsi(prices, 14);
    expect(r[r.length - 1]).toBeCloseTo(100, 6);
  });

  it("rsi stays within 0..100", () => {
    const prices = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const r = rsi(prices, 14).filter((v) => v !== null) as number[];
    for (const v of r) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("momentum returns 0 with insufficient data", () => {
    expect(momentum([1, 2, 3], 252, 21)).toBe(0);
  });

  it("bollinger middle equals sma", () => {
    const prices = Array(25).fill(0).map((_, i) => 10 + Math.sin(i));
    const bb = bollinger(prices, 20, 2);
    const s = sma(prices, 20);
    expect(bb.middle[24]).toBeCloseTo(s[24] as number, 10);
    expect(bb.upper[24]! > bb.middle[24]!).toBe(true);
    expect(bb.lower[24]! < bb.middle[24]!).toBe(true);
  });
});

describe("fundamental", () => {
  it("computes pe, pb, margins", () => {
    const m = fundamentalMetrics({
      price: 100,
      eps: 5,
      bookValuePerShare: 50,
      revenue: 1000,
      grossProfit: 400,
      netIncome: 100,
      shareholderEquity: 500,
    });
    expect(m.pe).toBe(20);
    expect(m.pb).toBe(2);
    expect(m.grossMargin).toBe(0.4);
    expect(m.netMargin).toBe(0.1);
    expect(m.roe).toBe(0.2);
  });

  it("null when denominators missing", () => {
    const m = fundamentalMetrics({ price: 100 });
    expect(m.pe).toBeNull();
    expect(m.pb).toBeNull();
  });

  it("piotroski returns null with too little data", () => {
    expect(piotroskiScore({ netIncome: 10 })).toBeNull();
  });

  it("piotroski scores a strong company high", () => {
    const score = piotroskiScore({
      netIncome: 120,
      prevNetIncome: 80,
      operatingCashFlow: 150,
      totalAssets: 1000,
      prevTotalAssets: 1000,
      totalLiabilities: 300,
      prevTotalLiabilities: 400,
      currentAssets: 500,
      currentLiabilities: 200,
      prevCurrentAssets: 400,
      prevCurrentLiabilities: 250,
      sharesOutstanding: 100,
      prevSharesOutstanding: 100,
      grossProfit: 500,
      prevGrossProfit: 400,
      revenue: 1000,
      prevRevenue: 900,
    });
    expect(score).toBe(9);
  });
});

describe("factor", () => {
  it("z-scores center the cross-section", () => {
    const scores = computeFactorScores([
      { ticker: "A", value: 1, momentum: 0.1, quality: 0.2, lowVol: -0.1 },
      { ticker: "B", value: 2, momentum: 0.2, quality: 0.3, lowVol: -0.2 },
      { ticker: "C", value: 3, momentum: 0.3, quality: 0.4, lowVol: -0.3 },
    ]);
    // middle name should have ~0 value-z
    expect(scores[1].valueZ).toBeCloseTo(0, 6);
    expect(scores[0].composite).toBeLessThan(scores[2].composite);
  });

  it("backtest top decile vs universe", () => {
    const scores = computeFactorScores(
      Array(20)
        .fill(0)
        .map((_, i) => ({ ticker: `T${i}`, value: i, momentum: i, quality: i, lowVol: i })),
    );
    // forward returns correlate with composite => top decile beats universe
    const forward = Array(20).fill(0).map((_, i) => i / 100);
    const bt = topDecileBacktest(scores, forward);
    expect(bt.topDecileReturn).toBeGreaterThan(bt.universeReturn);
    expect(bt.excessReturn).toBeGreaterThan(0);
  });
});

import { recommend, type RecommendationInput } from "../src/quant/recommendation";

const baseRec: RecommendationInput = {
  isEtf: false,
  sharpe: 1.2, sortino: 1.5, maxDrawdown: -0.2, cagr: 0.15,
  lastClose: 100, sma50: 95, sma200: 90, rsi14: 55,
  macd: 1, macdSignal: 0.5, momentum12_1: 0.2,
  pe: 18, pb: 3, roe: 0.22, netMargin: 0.2, piotroski: 8,
};

describe("recommendation", () => {
  it("strong company scores high and recommends buy", () => {
    const r = recommend(baseRec);
    expect(r.score).toBeGreaterThan(60);
    expect(["Strong Buy", "Buy"]).toContain(r.verdict);
    expect(r.positives.length).toBeGreaterThan(0);
    expect(r.disclaimer).toMatch(/not financial advice/i);
  });

  it("weak company scores low", () => {
    const r = recommend({
      ...baseRec,
      sharpe: -0.5, sortino: -0.4, maxDrawdown: -0.55,
      lastClose: 80, sma50: 95, sma200: 110, macd: -1, macdSignal: 0.2, momentum12_1: -0.25,
      pe: 60, pb: 11, roe: 0.01, netMargin: 0.01, piotroski: 2,
    });
    expect(r.score).toBeLessThan(40);
    expect(["Reduce", "Avoid"]).toContain(r.verdict);
    expect(r.negatives.length).toBeGreaterThan(0);
  });

  it("ETF excludes value/quality and still scores", () => {
    const r = recommend({ ...baseRec, isEtf: true, pe: null, pb: null, roe: null, netMargin: null, piotroski: null });
    const value = r.subScores.find((s) => s.key === "value")!;
    expect(value.score).toBeNull();
    expect(value.weight).toBe(0);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("overbought RSI adds a negative and dents score", () => {
    const hot = recommend({ ...baseRec, rsi14: 85 });
    const calm = recommend({ ...baseRec, rsi14: 55 });
    expect(hot.score).toBeLessThan(calm.score);
    expect(hot.negatives.join(" ")).toMatch(/overbought/i);
  });

  it("strong momentum in an uptrend gets a kicker and reads as a positive", () => {
    const hot = recommend({ ...baseRec, momentum12_1: 0.8, sma200: 50, lastClose: 100 });
    expect(hot.positives.join(" ")).toMatch(/strong momentum/i);
    const flat = recommend({ ...baseRec, momentum12_1: 0.1 });
    expect(hot.score).toBeGreaterThanOrEqual(flat.score);
  });

  it("score always within 0..100", () => {
    const r = recommend({ ...baseRec, sharpe: 99, sortino: 99, momentum12_1: 99 });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

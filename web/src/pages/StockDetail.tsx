import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fmt, type StockAnalysis } from "../api";
import MetricCard from "../components/MetricCard";
import RecommendationPanel from "../components/RecommendationPanel";

// Lazy-loaded so lightweight-charts isn't in the initial bundle.
const PriceChart = lazy(() => import("../components/PriceChart"));

type Tab = "risk" | "technical" | "valuation" | "factor";

const RANGES = ["3mo", "6mo", "1y", "2y", "5y"] as const;

export default function StockDetail() {
  const { ticker = "" } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState<string>("1y");
  const [tab, setTab] = useState<Tab>("risk");
  const [recovering, setRecovering] = useState(false);

  const { data, isLoading, isError } = useQuery<StockAnalysis>({
    queryKey: ["stock", ticker, range],
    queryFn: () => api.stock(ticker, range),
    retry: false,
  });

  // If the symbol isn't valid (e.g. someone navigated to /stock/APPLE), try to
  // resolve it via search and redirect to the real symbol instead of dead-ending.
  useEffect(() => {
    if (!isError || !ticker) return;
    let cancelled = false;
    setRecovering(true);
    api
      .resolveSymbol(ticker)
      .then((sym) => {
        if (!cancelled && sym && sym.toUpperCase() !== ticker.toUpperCase()) {
          navigate(`/stock/${sym}`, { replace: true });
        }
      })
      .finally(() => !cancelled && setRecovering(false));
    return () => {
      cancelled = true;
    };
  }, [isError, ticker, navigate]);

  if (isLoading || (isError && recovering))
    return <div className="text-muted py-12 text-center">Loading {ticker}…</div>;
  if (isError || !data)
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-neg">
          Couldn't find “{ticker}”. It may not be a valid symbol — try searching by company name.
        </div>
        <Link to="/" className="text-accent text-sm">← Back to search</Link>
      </div>
    );

  const q = data.quote;
  const tones = (x: number | null | undefined) =>
    x === null || x === undefined ? "neutral" : x >= 0 ? "pos" : "neg";

  return (
    <div className="space-y-5">
      <Link to="/" className="text-accent text-sm">← Back</Link>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{data.ticker}</span>
            <span className="text-muted font-normal text-base sm:text-lg">{data.name}</span>
            {data.isEtf && (
              <span className="text-[11px] bg-edge px-2 py-0.5 rounded text-muted font-normal">ETF</span>
            )}
          </h1>
          {data.sector && <div className="text-muted text-sm">{data.sector}</div>}
        </div>
        {q && (
          <div className="text-right shrink-0">
            <div className="text-xl sm:text-2xl font-semibold tabular-nums">{fmt.money(q.price)}</div>
            <div className={`text-sm tabular-nums ${q.change >= 0 ? "text-pos" : "text-neg"}`}>
              {q.change >= 0 ? "+" : ""}
              {fmt.num(q.change)} ({fmt.pct(q.changePercent)})
            </div>
          </div>
        )}
      </div>

      <RecommendationPanel rec={data.recommendation} isEtf={data.isEtf} />

      <div className="bg-panel border border-edge rounded-lg p-4">
        <div className="flex justify-end gap-1 mb-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2 py-1 rounded ${
                range === r ? "bg-accent text-white" : "text-muted hover:bg-panel2"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <Suspense fallback={<div className="h-[360px] grid place-items-center text-muted text-sm">Loading chart…</div>}>
          <PriceChart bars={data.ohlcv} />
        </Suspense>
      </div>

      <div className="flex gap-1 border-b border-edge overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {([
          ["risk", "Risk & Return"],
          ["technical", "Technical"],
          ["valuation", "Valuation"],
          ["factor", "Factor"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap shrink-0 ${
              tab === key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "risk" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="CAGR" value={fmt.pct(data.risk.cagr)} tone={tones(data.risk.cagr)} hint="annualized" />
          <MetricCard label="Volatility" value={fmt.pct(data.risk.annualizedVolatility)} hint="annualized σ" />
          <MetricCard label="Sharpe" value={fmt.num(data.risk.sharpe)} tone={tones(data.risk.sharpe)} hint="rf 4%" />
          <MetricCard label="Sortino" value={fmt.num(data.risk.sortino)} tone={tones(data.risk.sortino)} hint="downside" />
          <MetricCard label="Max Drawdown" value={fmt.pct(data.risk.maxDrawdown)} tone="neg" />
          <MetricCard label="Beta" value={fmt.num(data.risk.beta)} hint="vs SPY" />
        </div>
      )}

      {tab === "technical" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Last Close" value={fmt.money(data.technical.lastClose)} />
          <MetricCard label="SMA 50" value={fmt.money(data.technical.sma50 ?? undefined)} />
          <MetricCard label="SMA 200" value={fmt.money(data.technical.sma200 ?? undefined)} />
          <MetricCard label="EMA 20" value={fmt.money(data.technical.ema20 ?? undefined)} />
          <MetricCard
            label="RSI 14"
            value={fmt.num(data.technical.rsi14, 1)}
            tone={data.technical.rsi14 == null ? "neutral" : data.technical.rsi14 > 70 ? "neg" : data.technical.rsi14 < 30 ? "pos" : "neutral"}
            hint=">70 overbought"
          />
          <MetricCard label="MACD" value={fmt.num(data.technical.macd, 2)} tone={tones(data.technical.macd)} />
          <MetricCard label="MACD Signal" value={fmt.num(data.technical.macdSignal, 2)} />
          <MetricCard label="MACD Hist" value={fmt.num(data.technical.macdHistogram, 2)} tone={tones(data.technical.macdHistogram)} />
          <MetricCard label="Boll Upper" value={fmt.money(data.technical.bollingerUpper ?? undefined)} />
          <MetricCard label="Boll Lower" value={fmt.money(data.technical.bollingerLower ?? undefined)} />
          <MetricCard label="Momentum 12-1" value={fmt.pct(data.technical.momentum12_1)} tone={tones(data.technical.momentum12_1)} />
        </div>
      )}

      {tab === "valuation" && data.isEtf && (
        <div className="text-muted text-sm bg-panel2 border border-edge rounded-lg p-3 mb-3">
          This is an ETF — single-company valuation ratios (P/E, ROE, Piotroski) don't apply to a fund
          the way they do to a stock. The recommendation above weights price trend and risk-adjusted
          return instead. Any values shown below are fund-level approximations and may be blank.
        </div>
      )}
      {tab === "valuation" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="P/E" value={fmt.num(data.fundamental.pe, 1)} />
          <MetricCard label="P/B" value={fmt.num(data.fundamental.pb, 2)} />
          <MetricCard label="EV/EBITDA" value={fmt.num(data.fundamental.evEbitda, 1)} />
          <MetricCard label="ROE" value={fmt.pct(data.fundamental.roe)} tone={tones(data.fundamental.roe)} />
          <MetricCard label="Gross Margin" value={fmt.pct(data.fundamental.grossMargin)} />
          <MetricCard label="Net Margin" value={fmt.pct(data.fundamental.netMargin)} tone={tones(data.fundamental.netMargin)} />
          <MetricCard label="Revenue Growth" value={fmt.pct(data.fundamental.revenueGrowth)} tone={tones(data.fundamental.revenueGrowth)} />
          <MetricCard label="EPS Growth" value={fmt.pct(data.fundamental.epsGrowth)} tone={tones(data.fundamental.epsGrowth)} />
          <MetricCard label="Piotroski F" value={data.fundamental.piotroski?.toString() ?? "—"} hint="0–9" tone={data.fundamental.piotroski == null ? "neutral" : data.fundamental.piotroski >= 7 ? "pos" : data.fundamental.piotroski <= 3 ? "neg" : "neutral"} />
        </div>
      )}

      {tab === "factor" && (
        <div className="space-y-3">
          <p className="text-muted text-sm">
            Factor exposures are cross-sectional z-scores — they're computed against a universe in the
            screener. Run a screen to rank this name against peers. Here are its standalone signals:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Earnings Yield" value={data.fundamental.pe && data.fundamental.pe > 0 ? fmt.pct(1 / data.fundamental.pe) : "—"} hint="value proxy" />
            <MetricCard label="Momentum 12-1" value={fmt.pct(data.technical.momentum12_1)} tone={tones(data.technical.momentum12_1)} />
            <MetricCard label="ROE" value={fmt.pct(data.fundamental.roe)} hint="quality proxy" tone={tones(data.fundamental.roe)} />
            <MetricCard label="Volatility" value={fmt.pct(data.risk.annualizedVolatility)} hint="low-vol proxy (lower=better)" />
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold mb-2">Latest news</h2>
        {data.news.length === 0 ? (
          <div className="text-muted text-sm bg-panel border border-edge rounded-lg p-4">
            No recent headlines found for {data.ticker}.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.news.map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-panel border border-edge rounded-lg p-3 hover:border-accent transition flex gap-3"
              >
                {n.image && (
                  <img src={n.image} alt="" className="w-20 h-20 object-cover rounded shrink-0" loading="lazy" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink line-clamp-2">{n.headline}</div>
                  <div className="text-[11px] text-muted mt-1">
                    {n.source}
                    {n.datetime ? ` · ${new Date(n.datetime * 1000).toLocaleDateString()}` : ""}
                  </div>
                  {n.summary && <div className="text-xs text-muted mt-1 line-clamp-2">{n.summary}</div>}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, fmt, type StockAnalysis } from "../api";
import MetricCard from "../components/MetricCard";
import RatedMetric from "../components/RatedMetric";
import RecommendationPanel from "../components/RecommendationPanel";
import { DESC } from "../lib/ratings";

// Lazy-loaded so lightweight-charts isn't in the initial bundle.
const PriceChart = lazy(() => import("../components/PriceChart"));

type Tab = "risk" | "technical" | "valuation" | "holdings" | "factor";

// UI timeframe -> API range param.
const RANGES: [string, string][] = [
  ["1d", "1D"],
  ["5d", "1W"],
  ["1mo", "1M"],
  ["3mo", "3M"],
  ["6mo", "6M"],
  ["1y", "1Y"],
  ["5y", "5Y"],
];

export default function StockDetail() {
  const { ticker = "" } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState<string>("1mo");
  const [tab, setTab] = useState<Tab>("risk");
  const [recovering, setRecovering] = useState(false);

  const { data, isLoading, isError } = useQuery<StockAnalysis>({
    queryKey: ["stock", ticker],
    queryFn: () => api.stock(ticker),
    retry: false,
  });

  // Chart bars are fetched separately and keyed by timeframe, so switching ranges
  // only updates the chart (keepPreviousData = no flash) and never the whole page.
  const chartQuery = useQuery({
    queryKey: ["chart", ticker, range],
    queryFn: () => api.chart(ticker, range),
    placeholderData: keepPreviousData,
    enabled: !!ticker, // fetch in parallel with the analysis, not after it
    retry: false,
  });

  // News + ETF holdings load separately (below the fold) so they don't slow the
  // recommendation/stats first paint.
  const newsQuery = useQuery({
    queryKey: ["news", ticker],
    queryFn: () => api.news(ticker),
    enabled: !!data,
    retry: false,
  });
  const etfQuery = useQuery({
    queryKey: ["etf", ticker],
    queryFn: () => api.etf(ticker),
    enabled: !!data && !!data.isEtf,
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

  // Price + change aligned to the selected timeframe (like Robinhood).
  // "Today" uses the quote (vs previous close); other periods use first->last of the series.
  const bars = chartQuery.data?.bars ?? [];
  const rangeLabel: Record<string, string> = {
    "1d": "Today",
    "5d": "Past week",
    "1mo": "Past month",
    "3mo": "Past 3 months",
    "6mo": "Past 6 months",
    "1y": "Past year",
    "5y": "Past 5 years",
  };
  let price = q?.price ?? 0;
  let change = q?.change ?? 0;
  let pct = q?.changePercent ?? 0;
  if (range !== "1d" && bars.length > 1) {
    price = bars[bars.length - 1].close;
    const first = bars[0].close;
    change = price - first;
    pct = first ? change / first : 0;
  }
  const hasPrice = !!q || bars.length > 0;

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
        {hasPrice && (
          <div className="text-right shrink-0">
            <div className="text-xl sm:text-2xl font-semibold tabular-nums">{fmt.money(price)}</div>
            <div className={`text-sm tabular-nums ${change >= 0 ? "text-pos" : "text-neg"}`}>
              {change >= 0 ? "+" : ""}
              {fmt.num(change)} ({fmt.pct(pct)})
              <span className="text-muted ml-1.5 text-xs">{rangeLabel[range] ?? ""}</span>
            </div>
          </div>
        )}
      </div>

      <RecommendationPanel rec={data.recommendation} isEtf={data.isEtf} />

      <div className="bg-panel border border-edge rounded-lg p-4">
        <div className="flex justify-end gap-1 mb-2">
          {RANGES.map(([tf, label]) => (
            <button
              key={tf}
              onClick={() => setRange(tf)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                range === tf ? "bg-accent text-white" : "text-muted hover:bg-panel2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`relative transition-opacity ${chartQuery.isFetching ? "opacity-60" : ""}`}>
          {(chartQuery.data?.bars?.length ?? 0) > 0 ? (
            <Suspense fallback={<div className="h-[360px] grid place-items-center text-muted text-sm">Loading chart…</div>}>
              <PriceChart bars={chartQuery.data!.bars} />
            </Suspense>
          ) : (
            <div className="h-[360px] grid place-items-center text-muted text-sm">
              {chartQuery.isFetching ? "Loading chart…" : "No price data for this range."}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-edge overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {([
          ["risk", "Risk & Return"],
          ["technical", "Technical"],
          data.isEtf ? ["holdings", "Holdings"] : ["valuation", "Valuation"],
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
          <RatedMetric metric="cagr" label={data.historyYears < 0.9 ? "Total Return" : "CAGR"} value={fmt.pct(data.risk.cagr)} raw={data.risk.cagr} hint={data.historyYears < 0.9 ? DESC.cagrTotal : DESC.cagr} />
          <RatedMetric metric="volatility" label="Volatility" value={fmt.pct(data.risk.annualizedVolatility)} raw={data.risk.annualizedVolatility} />
          <RatedMetric metric="sharpe" label="Sharpe" value={fmt.num(data.risk.sharpe)} raw={data.risk.sharpe} />
          <RatedMetric metric="sortino" label="Sortino" value={fmt.num(data.risk.sortino)} raw={data.risk.sortino} />
          <RatedMetric metric="maxDrawdown" label="Max Drawdown" value={fmt.pct(data.risk.maxDrawdown)} raw={data.risk.maxDrawdown} />
          <RatedMetric metric="beta" label="Beta" value={fmt.num(data.risk.beta)} raw={data.risk.beta} />
        </div>
      )}

      {tab === "technical" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Last Close" value={fmt.money(data.technical.lastClose)} hint={DESC.lastClose} />
          <RatedMetric metric="sma50" label="SMA 50" value={fmt.money(data.technical.sma50 ?? undefined)} raw={data.technical.sma50} ctx={{ lastClose: data.technical.lastClose }} />
          <RatedMetric metric="sma200" label="SMA 200" value={fmt.money(data.technical.sma200 ?? undefined)} raw={data.technical.sma200} ctx={{ lastClose: data.technical.lastClose }} />
          <RatedMetric metric="ema20" label="EMA 20" value={fmt.money(data.technical.ema20 ?? undefined)} raw={data.technical.ema20} ctx={{ lastClose: data.technical.lastClose }} />
          <RatedMetric metric="rsi14" label="RSI 14" value={fmt.num(data.technical.rsi14, 1)} raw={data.technical.rsi14} />
          <RatedMetric metric="macd" label="MACD" value={fmt.num(data.technical.macd, 2)} raw={data.technical.macd} />
          <MetricCard label="MACD Signal" value={fmt.num(data.technical.macdSignal, 2)} hint={DESC.macdSignal} />
          <RatedMetric metric="macdHistogram" label="MACD Hist" value={fmt.num(data.technical.macdHistogram, 2)} raw={data.technical.macdHistogram} />
          <MetricCard label="Boll Upper" value={fmt.money(data.technical.bollingerUpper ?? undefined)} hint={DESC.bollingerUpper} />
          <MetricCard label="Boll Lower" value={fmt.money(data.technical.bollingerLower ?? undefined)} hint={DESC.bollingerLower} />
          <RatedMetric metric="momentum" label="Momentum 12-1" value={fmt.pct(data.technical.momentum12_1)} raw={data.technical.momentum12_1} />
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
          <RatedMetric metric="pe" label="P/E" value={fmt.num(data.fundamental.pe, 1)} raw={data.fundamental.pe} />
          <RatedMetric metric="pb" label="P/B" value={fmt.num(data.fundamental.pb, 2)} raw={data.fundamental.pb} />
          <RatedMetric metric="evEbitda" label="EV/EBITDA" value={fmt.num(data.fundamental.evEbitda, 1)} raw={data.fundamental.evEbitda} />
          <RatedMetric metric="roe" label="ROE" value={fmt.pct(data.fundamental.roe)} raw={data.fundamental.roe} />
          <RatedMetric metric="grossMargin" label="Gross Margin" value={fmt.pct(data.fundamental.grossMargin)} raw={data.fundamental.grossMargin} />
          <RatedMetric metric="netMargin" label="Net Margin" value={fmt.pct(data.fundamental.netMargin)} raw={data.fundamental.netMargin} />
          <RatedMetric metric="revenueGrowth" label="Revenue Growth" value={fmt.pct(data.fundamental.revenueGrowth)} raw={data.fundamental.revenueGrowth} />
          <RatedMetric metric="epsGrowth" label="EPS Growth" value={fmt.pct(data.fundamental.epsGrowth)} raw={data.fundamental.epsGrowth} />
          <RatedMetric metric="piotroski" label="Piotroski F" value={data.fundamental.piotroski?.toString() ?? "—"} raw={data.fundamental.piotroski} />
        </div>
      )}

      {tab === "factor" && (
        <div className="space-y-3">
          <p className="text-muted text-sm">
            Standalone factor signals for this name (the screener z-scores these against a peer universe):
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <RatedMetric metric="earningsYield" label="Earnings Yield" value={data.fundamental.pe && data.fundamental.pe > 0 ? fmt.pct(1 / data.fundamental.pe) : "—"} raw={data.fundamental.pe && data.fundamental.pe > 0 ? 1 / data.fundamental.pe : null} hint="Value factor — earnings ÷ price" />
            <RatedMetric metric="momentum" label="Momentum 12-1" value={fmt.pct(data.technical.momentum12_1)} raw={data.technical.momentum12_1} hint="Momentum factor" />
            <RatedMetric metric="roe" label="ROE" value={fmt.pct(data.fundamental.roe)} raw={data.fundamental.roe} hint="Quality factor" />
            <RatedMetric metric="volatility" label="Volatility" value={fmt.pct(data.risk.annualizedVolatility)} raw={data.risk.annualizedVolatility} hint="Low-vol factor — lower is better" />
          </div>
        </div>
      )}

      {tab === "holdings" && (
        etfQuery.isLoading ? (
          <div className="text-muted text-sm py-6 text-center">Loading holdings…</div>
        ) : etfQuery.data?.etf && (etfQuery.data.etf.holdings.length > 0 || etfQuery.data.etf.sectors.length > 0) ? (
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <h3 className="text-sm font-semibold mb-3">Sector breakdown</h3>
              {etfQuery.data.etf.sectors.length === 0 ? (
                <div className="text-muted text-sm">Not available.</div>
              ) : (
                <div className="space-y-2">
                  {etfQuery.data.etf.sectors.map((s) => (
                    <div key={s.sector} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-ink">{s.sector}</span>
                        <span className="text-muted tabular-nums">{fmt.pct(s.weight)}</span>
                      </div>
                      <div className="h-1.5 bg-panel2 rounded overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${Math.min(100, s.weight * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Top 10 holdings</h3>
              {etfQuery.data.etf.holdings.length === 0 ? (
                <div className="text-muted text-sm">Not available.</div>
              ) : (
                <div className="divide-y divide-edge/50">
                  {etfQuery.data.etf.holdings.map((h) => (
                    <div key={h.symbol} className="flex items-center justify-between py-2 text-sm">
                      <span className="min-w-0">
                        <Link to={`/stock/${h.symbol}`} className="text-accent font-semibold">{h.symbol}</Link>
                        <span className="text-muted ml-2 text-xs truncate">{h.name}</span>
                      </span>
                      <span className="tabular-nums text-ink shrink-0">{fmt.pct(h.weight)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-muted text-sm bg-panel border border-edge rounded-lg p-4">
            Holdings breakdown isn't available for this ETF right now.
          </div>
        )
      )}

      <div>
        <h2 className="text-lg font-bold mb-2">Latest news</h2>
        {newsQuery.isLoading ? (
          <div className="text-muted text-sm bg-panel border border-edge rounded-lg p-4">Loading news…</div>
        ) : (newsQuery.data?.news?.length ?? 0) === 0 ? (
          <div className="text-muted text-sm bg-panel border border-edge rounded-lg p-4">
            No recent headlines found for {data.ticker}.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {newsQuery.data!.news.map((n, i) => (
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

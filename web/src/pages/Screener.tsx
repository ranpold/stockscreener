import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, fmt, type ScreenRow, type ScreenFilters, type Watchlist } from "../api";

type SortKey = keyof Pick<
  ScreenRow,
  "ticker" | "price" | "cagr" | "volatility" | "sharpe" | "maxDrawdown" | "beta" | "momentum" | "pe" | "roe" | "piotroski"
>;

const numClass = (x: number) => (x >= 0 ? "text-pos" : "text-neg");

function FilterInput({
  label,
  value,
  onChange,
  step = "0.1",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 bg-panel2 border border-edge rounded px-2 py-1 text-ink text-sm focus:border-accent outline-none"
      />
    </label>
  );
}

export default function Screener() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [universe, setUniverse] = useState(searchParams.get("universe") || "sp500");
  const [custom, setCustom] = useState("");
  const [analyze, setAnalyze] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Auto-run the screen when arriving via a "Screen this →" link (?universe=...).
  const [submitted, setSubmitted] = useState<{ universe: string; filters: ScreenFilters } | null>(
    () => {
      const u = searchParams.get("universe");
      return u ? { universe: u, filters: {} } : null;
    },
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "sharpe", dir: -1 });

  const { data: watchlists } = useQuery<Watchlist[]>({
    queryKey: ["watchlists"],
    queryFn: api.watchlists,
  });

  const query = useQuery({
    queryKey: ["screen", submitted],
    queryFn: () => api.screen(submitted!.universe, submitted!.filters),
    enabled: !!submitted,
  });

  const run = () => {
    const f: ScreenFilters = {};
    const map: Record<string, keyof ScreenFilters> = {
      minSharpe: "minSharpe",
      maxPe: "maxPe",
      minRoe: "minRoe",
      minMomentum: "minMomentum",
      maxBeta: "maxBeta",
    };
    for (const [k, target] of Object.entries(map)) {
      const v = filters[k];
      if (v !== undefined && v !== "") f[target] = Number(v);
    }
    let uni = universe;
    if (universe === "custom") uni = `custom:${custom}`;
    setSubmitted({ universe: uni, filters: f });
  };

  const rows = query.data?.rows ?? [];
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const an = av === null || av === undefined ? -Infinity : (av as number);
    const bn = bv === null || bv === undefined ? -Infinity : (bv as number);
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
    return (an - bn) * sort.dir;
  });

  const th = (key: SortKey, label: string, align = "right") => (
    <th
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
      className={`px-3 py-2 cursor-pointer select-none hover:text-ink text-${align} whitespace-nowrap`}
    >
      {label}
      {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Stock Screener</h1>
        <p className="text-muted text-sm">Rank a universe by quant factors, then drill into any name.</p>
      </div>

      <div className="bg-panel border border-edge rounded-lg p-4">
        <div className="text-xs text-muted mb-1">Analyze any ticker — full risk / technical / valuation / factor breakdown</div>
        <div className="flex gap-2">
          <input
            value={analyze}
            onChange={(e) => setAnalyze(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && analyze.trim()) navigate(`/stock/${analyze.trim()}`);
            }}
            placeholder="e.g. AAPL"
            className="flex-1 bg-panel2 border border-edge rounded px-3 py-2 text-ink text-sm focus:border-accent outline-none"
          />
          <button
            onClick={() => analyze.trim() && navigate(`/stock/${analyze.trim()}`)}
            className="bg-accent hover:brightness-110 text-white text-sm font-medium px-5 py-2 rounded transition"
          >
            Analyze →
          </button>
        </div>
      </div>

      <div className="bg-panel border border-edge rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Universe
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              className="bg-panel2 border border-edge rounded px-2 py-1.5 text-ink text-sm focus:border-accent outline-none"
            >
              <option value="sp500">S&P 500 (sample)</option>
              <option value="custom">Custom tickers</option>
              {watchlists?.map((w) => (
                <option key={w.id} value={`watchlist:${w.id}`}>
                  ★ {w.name}
                </option>
              ))}
            </select>
          </label>
          {universe === "custom" && (
            <label className="flex flex-col gap-1 text-xs text-muted flex-1 min-w-[220px]">
              Tickers (comma-separated)
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="AAPL, MSFT, NVDA"
                className="bg-panel2 border border-edge rounded px-2 py-1.5 text-ink text-sm focus:border-accent outline-none"
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <FilterInput label="Min Sharpe" value={filters.minSharpe ?? ""} onChange={(v) => setFilters((f) => ({ ...f, minSharpe: v }))} placeholder="e.g. 1" />
          <FilterInput label="Max P/E" value={filters.maxPe ?? ""} onChange={(v) => setFilters((f) => ({ ...f, maxPe: v }))} step="1" placeholder="e.g. 30" />
          <FilterInput label="Min ROE" value={filters.minRoe ?? ""} onChange={(v) => setFilters((f) => ({ ...f, minRoe: v }))} step="0.05" placeholder="0.15" />
          <FilterInput label="Min Momentum" value={filters.minMomentum ?? ""} onChange={(v) => setFilters((f) => ({ ...f, minMomentum: v }))} step="0.05" placeholder="0.1" />
          <FilterInput label="Max Beta" value={filters.maxBeta ?? ""} onChange={(v) => setFilters((f) => ({ ...f, maxBeta: v }))} placeholder="1.5" />
          <div className="flex items-end">
            <button
              onClick={run}
              className="bg-accent hover:brightness-110 text-white text-sm font-medium px-5 py-2 rounded transition"
            >
              Run screen
            </button>
          </div>
        </div>
      </div>

      {query.isFetching && (
        <div className="text-muted text-sm py-8 text-center">
          Crunching the universe… (first run fetches + caches each name, give it a moment)
        </div>
      )}
      {query.isError && (
        <div className="text-neg text-sm py-4">Error: {String(query.error)}</div>
      )}

      {!query.isFetching && sorted.length > 0 && (
        <div className="bg-panel border border-edge rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-xs border-b border-edge bg-panel2">
              <tr>
                {th("ticker", "Ticker", "left")}
                <th className="px-3 py-2 text-right">Score</th>
                {th("price", "Price")}
                {th("cagr", "CAGR")}
                {th("volatility", "Vol")}
                {th("sharpe", "Sharpe")}
                {th("maxDrawdown", "MaxDD")}
                {th("beta", "Beta")}
                {th("momentum", "Mom")}
                {th("pe", "P/E")}
                {th("roe", "ROE")}
                {th("piotroski", "Piotroski")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.ticker}
                  onClick={() => navigate(`/stock/${r.ticker}`)}
                  className="border-b border-edge/50 hover:bg-panel2 cursor-pointer"
                >
                  <td className="px-3 py-2 font-semibold text-accent">{r.ticker}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.factor ? r.factor.composite.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.money(r.price)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${numClass(r.cagr)}`}>{fmt.pct(r.cagr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.pct(r.volatility)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.num(r.sharpe)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neg">{fmt.pct(r.maxDrawdown)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.num(r.beta)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${numClass(r.momentum)}`}>{fmt.pct(r.momentum)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.num(r.pe, 1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.pct(r.roe)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.piotroski ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!query.isFetching && submitted && sorted.length === 0 && !query.isError && (
        <div className="text-muted text-sm py-8 text-center">No names matched. Loosen the filters.</div>
      )}
    </div>
  );
}

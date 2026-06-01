import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, fmt, type ScreenRow, type ScreenFilters, type Watchlist } from "../api";
import SearchBox from "../components/SearchBox";

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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-ink text-sm placeholder:text-muted/50 focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none transition"
      />
    </label>
  );
}

export default function Screener() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [universe, setUniverse] = useState(searchParams.get("universe") || "sp500");
  const [custom, setCustom] = useState("");
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
        <SearchBox />
      </div>

      <div className="bg-panel border border-edge rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-edge">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">Screen</span>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              className="bg-bg border border-edge rounded-lg px-3 py-2 text-ink text-sm focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none transition"
            >
              <option value="sp500">S&P 500 (sample)</option>
              <option value="custom">Custom tickers</option>
              {watchlists?.map((w) => (
                <option key={w.id} value={`watchlist:${w.id}`}>
                  ★ {w.name}
                </option>
              ))}
            </select>
            {universe === "custom" && (
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="AAPL, MSFT, NVDA"
                className="bg-bg border border-edge rounded-lg px-3 py-2 text-ink text-sm w-56 placeholder:text-muted/50 focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none transition"
              />
            )}
          </div>
          <button
            onClick={run}
            disabled={query.isFetching}
            className="bg-accent hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2 rounded-lg transition shrink-0"
          >
            {query.isFetching ? "Running…" : "Run screen"}
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="text-[11px] font-medium text-muted uppercase tracking-wide mb-3">
            Filters <span className="text-muted/60 normal-case">· optional</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <FilterInput label="Min Sharpe" value={filters.minSharpe ?? ""} onChange={(v) => setFilters((f) => ({ ...f, minSharpe: v }))} placeholder="e.g. 1" />
            <FilterInput label="Max P/E" value={filters.maxPe ?? ""} onChange={(v) => setFilters((f) => ({ ...f, maxPe: v }))} step="1" placeholder="e.g. 30" />
            <FilterInput label="Min ROE" value={filters.minRoe ?? ""} onChange={(v) => setFilters((f) => ({ ...f, minRoe: v }))} step="0.05" placeholder="0.15" />
            <FilterInput label="Min Momentum" value={filters.minMomentum ?? ""} onChange={(v) => setFilters((f) => ({ ...f, minMomentum: v }))} step="0.05" placeholder="0.1" />
            <FilterInput label="Max Beta" value={filters.maxBeta ?? ""} onChange={(v) => setFilters((f) => ({ ...f, maxBeta: v }))} placeholder="1.5" />
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

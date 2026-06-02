import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fmt, type EarningsEvent } from "../api";
import SearchBox from "../components/SearchBox";

const HOUR_LABEL: Record<string, string> = { bmo: "Pre-market", amc: "After close", dmh: "Mid-day" };

function fmtDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function EarningsCalendar() {
  const { data, isLoading } = useQuery({ queryKey: ["earnings"], queryFn: api.earnings });
  const events = data?.events ?? [];
  if (isLoading) return <div className="text-muted text-sm">Loading earnings…</div>;
  if (events.length === 0) return <div className="text-muted text-sm">No upcoming earnings found.</div>;

  // Group by date.
  const byDate = new Map<string, EarningsEvent[]>();
  for (const e of events.slice(0, 24)) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  return (
    <div className="space-y-4">
      {[...byDate.entries()].map(([date, evs]) => (
        <div key={date}>
          <div className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1.5">{fmtDate(date)}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {evs.map((e) => (
              <Link
                key={e.symbol}
                to={`/stock/${e.symbol}`}
                className="flex items-center justify-between bg-panel2 border border-edge rounded-lg px-3 py-2 hover:border-accent transition"
              >
                <span className="font-semibold text-accent">{e.symbol}</span>
                <span className="text-xs text-muted flex items-center gap-2">
                  {e.epsEstimate != null && <span>EPS est {fmt.money(e.epsEstimate)}</span>}
                  {HOUR_LABEL[e.hour] && <span className="bg-edge px-1.5 py-0.5 rounded">{HOUR_LABEL[e.hour]}</span>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const POPULAR: { symbol: string; label: string }[] = [
  { symbol: "AAPL", label: "Apple" },
  { symbol: "NVDA", label: "NVIDIA" },
  { symbol: "MSFT", label: "Microsoft" },
  { symbol: "ARM", label: "Arm" },
  { symbol: "TSLA", label: "Tesla" },
  { symbol: "AMZN", label: "Amazon" },
  { symbol: "GOOGL", label: "Alphabet" },
  { symbol: "META", label: "Meta" },
];

const ETFS: { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "VTI", label: "Total Market" },
  { symbol: "SMH", label: "Semis" },
];

function Chips({ items }: { items: { symbol: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <Link
          key={p.symbol}
          to={`/stock/${p.symbol}`}
          className="bg-panel2 border border-edge rounded-lg px-3 py-1.5 text-sm hover:border-accent hover:text-accent transition"
        >
          <span className="font-semibold">{p.symbol}</span>
          <span className="text-muted ml-1.5 text-xs">{p.label}</span>
        </Link>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 pt-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Quant analysis on any stock or ETF</h1>
        <p className="text-muted text-sm">
          Search a name or ticker for a full risk, technical, valuation, factor, and
          recommendation breakdown — plus the latest news.
        </p>
      </div>

      <div className="bg-panel border border-edge rounded-xl p-4">
        <SearchBox />
      </div>

      <div className="space-y-3">
        <div className="text-[11px] font-medium text-muted uppercase tracking-wide">Popular stocks</div>
        <Chips items={POPULAR} />
      </div>

      <div className="space-y-3">
        <div className="text-[11px] font-medium text-muted uppercase tracking-wide">ETFs</div>
        <Chips items={ETFS} />
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Upcoming earnings</h2>
          <span className="text-xs text-muted">major companies</span>
        </div>
        <EarningsCalendar />
      </div>

      <p className="text-center text-xs text-muted">
        Build custom lists under <Link to="/watchlists" className="text-accent">Watchlists</Link>.
      </p>
    </div>
  );
}

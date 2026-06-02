import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fmt, type EarningsEvent, type Mover } from "../api";
import SearchBox from "../components/SearchBox";

function MoverRow({ m }: { m: Mover }) {
  const up = m.changePercent >= 0;
  return (
    <Link
      to={`/stock/${m.symbol}`}
      className="flex items-center justify-between bg-panel2 border border-edge rounded-lg px-3 py-2 hover:border-accent transition"
    >
      <span className="min-w-0">
        <span className="font-semibold text-accent">{m.symbol}</span>
        <span className="text-muted ml-2 text-xs truncate">{m.name}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="text-ink tabular-nums text-sm">{fmt.money(m.price)}</span>
        <span className={`ml-2 tabular-nums text-sm ${up ? "text-pos" : "text-neg"}`}>
          {up ? "+" : ""}
          {fmt.pct(m.changePercent)}
        </span>
      </span>
    </Link>
  );
}

function Movers() {
  const { data, isLoading } = useQuery({ queryKey: ["movers"], queryFn: api.movers });
  if (isLoading) return <div className="text-muted text-sm">Loading movers…</div>;
  const gainers = data?.gainers ?? [];
  const losers = data?.losers ?? [];
  if (gainers.length === 0 && losers.length === 0)
    return <div className="text-muted text-sm">Movers unavailable right now.</div>;
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-pos uppercase tracking-wide">▲ Top gainers</div>
        {gainers.map((m) => (
          <MoverRow key={m.symbol} m={m} />
        ))}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-neg uppercase tracking-wide">▼ Top losers</div>
        {losers.map((m) => (
          <MoverRow key={m.symbol} m={m} />
        ))}
      </div>
    </div>
  );
}

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
          <h2 className="text-lg font-bold">Today's movers</h2>
          <span className="text-xs text-muted">major stocks</span>
        </div>
        <Movers />
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Upcoming earnings</h2>
          <span className="text-xs text-muted">next 3 weeks</span>
        </div>
        <EarningsCalendar />
      </div>

      <p className="text-center text-xs text-muted">
        Build custom lists under <Link to="/watchlists" className="text-accent">Watchlists</Link>.
      </p>
    </div>
  );
}

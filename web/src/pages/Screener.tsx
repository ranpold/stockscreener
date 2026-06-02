import { useEffect, useRef, useState } from "react";
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
        <span className="text-ink num text-sm">{fmt.money(m.price)}</span>
        <span className={`ml-2 num text-sm ${up ? "text-pos" : "text-neg"}`}>
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

// A distinct hue per day column (low-alpha tint over the dark theme).
const DAY_HUES = ["#5b8dff", "#16c784", "#a78bfa", "#f5a623", "#22d3ee", "#fb7185", "#34d399"];

function dayHeader(d: string): { weekday: string; date: string } {
  const dt = new Date(d + "T00:00:00");
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: "long" }),
    date: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

// Tile size tier from estimated annual revenue (proxy for company size).
function tier(rev: number | null): { pad: string; ticker: string; showName: boolean } {
  const r = rev ?? 0;
  if (r >= 30e9) return { pad: "py-5", ticker: "text-2xl", showName: true };
  if (r >= 8e9) return { pad: "py-4", ticker: "text-xl", showName: true };
  if (r >= 1.5e9) return { pad: "py-3", ticker: "text-base", showName: false };
  return { pad: "py-2", ticker: "text-sm", showName: false };
}

function EarningsCalendar() {
  const { data, isLoading } = useQuery({ queryKey: ["earnings"], queryFn: api.earnings });
  const events = data?.events ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    updateArrows();
    const onResize = () => updateArrows();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [events.length]);

  if (isLoading) return <div className="text-muted text-sm">Loading earnings…</div>;
  if (events.length === 0) return <div className="text-muted text-sm">No upcoming earnings found.</div>;

  const byDate = new Map<string, EarningsEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const days = [...byDate.entries()].slice(0, 10);
  const scrollBy = (dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1"
      >
        {days.map(([date, evs], i) => {
          const hue = DAY_HUES[i % DAY_HUES.length];
          const { weekday, date: dlabel } = dayHeader(date);
          return (
            <div
              key={date}
              className="shrink-0 w-[200px] rounded-xl border border-edge overflow-hidden flex flex-col"
              style={{ background: `linear-gradient(180deg, ${hue}1f, ${hue}0a)` }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: `${hue}33` }}>
                <div className="text-sm font-bold" style={{ color: hue }}>{weekday}</div>
                <div className="text-[11px] text-muted">{dlabel} · {evs.length}</div>
              </div>
              <div className="p-2 flex flex-col gap-2">
                {evs.map((e) => {
                  const t = tier(e.revenueEstimate);
                  return (
                    <Link
                      key={e.symbol}
                      to={`/stock/${e.symbol}`}
                      className={`block rounded-lg bg-panel2/80 border border-edge/60 px-3 ${t.pad} hover:border-accent hover:bg-panel2 transition`}
                    >
                      <div className={`font-extrabold tracking-tight leading-none num ${t.ticker}`}>{e.symbol}</div>
                      {t.showName && e.epsEstimate != null && (
                        <div className="text-[10px] text-muted mt-1">EPS est {fmt.money(e.epsEstimate)}</div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {canLeft && (
        <>
          <div className="pointer-events-none absolute left-0 inset-y-0 w-14 bg-gradient-to-r from-bg to-transparent" />
          <button
            onClick={() => scrollBy(-440)}
            aria-label="Scroll left"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 grid place-items-center rounded-full bg-panel2/95 border border-edge text-accent shadow-card hover:border-accent transition"
          >
            ‹
          </button>
        </>
      )}
      {canRight && (
        <>
          <div className="pointer-events-none absolute right-0 inset-y-0 w-14 bg-gradient-to-l from-bg to-transparent" />
          <button
            onClick={() => scrollBy(440)}
            aria-label="Scroll right"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 grid place-items-center rounded-full bg-panel2/95 border border-edge text-accent shadow-card hover:border-accent transition"
          >
            ›
          </button>
        </>
      )}
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
    <div className="max-w-3xl mx-auto space-y-8 pt-6 animate-fade-up">
      <div className="text-center space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Quant analysis on any stock or ETF</h1>
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

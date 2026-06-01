import { Link } from "react-router-dom";
import SearchBox from "../components/SearchBox";

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

      <p className="text-center text-xs text-muted">
        Build custom lists under <Link to="/watchlists" className="text-accent">Watchlists</Link>.
      </p>
    </div>
  );
}

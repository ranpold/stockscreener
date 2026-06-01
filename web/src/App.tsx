import { Link, Route, Routes, useLocation } from "react-router-dom";
import Screener from "./pages/Screener";
import StockDetail from "./pages/StockDetail";
import Watchlists from "./pages/Watchlists";

function Nav() {
  const loc = useLocation();
  const link = (to: string, label: string) => {
    const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
          active ? "bg-accent text-white" : "text-muted hover:text-ink hover:bg-panel2"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <header className="border-b border-edge bg-panel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2 sm:gap-4">
        <Link to="/" className="font-bold text-ink tracking-tight shrink-0">
          <span className="text-accent">◆</span> QuantScreen
        </Link>
        <nav className="flex gap-1 sm:ml-2">
          {link("/", "Search")}
          {link("/watchlists", "Watchlists")}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-full">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <Routes>
          <Route path="/" element={<Screener />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
          <Route path="/watchlists" element={<Watchlists />} />
        </Routes>
      </main>
    </div>
  );
}

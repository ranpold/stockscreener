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
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center gap-4">
        <Link to="/" className="font-bold text-ink tracking-tight">
          <span className="text-accent">◆</span> QuantScreen
        </Link>
        <nav className="flex gap-1 ml-2">
          {link("/", "Screener")}
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
      <main className="max-w-7xl mx-auto px-5 py-6">
        <Routes>
          <Route path="/" element={<Screener />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
          <Route path="/watchlists" element={<Watchlists />} />
        </Routes>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SearchResult } from "../api";

/** Typeahead search by company name or ticker. Selecting a result opens its deep-dive. */
export default function SearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search.
  useEffect(() => {
    setError("");
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await api.search(term);
        setResults(r.results);
        setOpen(true);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (symbol: string) => {
    setOpen(false);
    setQ("");
    navigate(`/stock/${symbol.toUpperCase()}`);
  };

  // Resolve the current text to a real symbol via search, then navigate.
  // Never navigates to raw typed text (avoids "/stock/APPLE" 404s).
  const submit = async () => {
    const term = q.trim();
    if (!term) return;
    if (results[active]) return go(results[active].symbol);
    setLoading(true);
    setError("");
    try {
      const list = results.length ? results : (await api.search(term)).results;
      if (list.length) go(list[0].symbol);
      else setError(`No match for "${term}". Try a company name or ticker.`);
    } catch {
      setError("Search failed — try again.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="text-xs text-muted mb-1">
        Analyze any stock or ETF — search by company name or ticker
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder="e.g. Apple, NVDA, Vanguard S&P 500, SPY"
          className="flex-1 bg-panel2 border border-edge rounded px-3 py-2 text-ink text-sm focus:border-accent outline-none"
        />
        <button
          onClick={() => void submit()}
          className="bg-accent hover:brightness-110 text-white text-sm font-medium px-5 py-2 rounded transition"
        >
          Analyze →
        </button>
      </div>
      {error && <div className="text-neg text-xs mt-1">{error}</div>}

      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full bg-panel2 border border-edge rounded-lg shadow-xl overflow-hidden">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">Searching…</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.symbol)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${
                i === active ? "bg-accent/20" : ""
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-accent w-16 shrink-0">{r.symbol}</span>
                <span className="text-ink text-sm truncate">{r.name}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {r.type === "etf" && (
                  <span className="text-[10px] bg-edge px-1.5 py-0.5 rounded text-muted">ETF</span>
                )}
                {r.exchange && <span className="text-[11px] text-muted">{r.exchange}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

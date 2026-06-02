import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Watchlist } from "../api";

export default function Watchlists() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: api.me });
  const loggedIn = !!me?.user;

  const { data: lists, isLoading } = useQuery<Watchlist[]>({
    queryKey: ["watchlists"],
    queryFn: api.watchlists,
    enabled: loggedIn,
  });

  const [name, setName] = useState("");
  const [tickers, setTickers] = useState("");
  const [addTo, setAddTo] = useState<Record<string, string>>({});
  const [addErr, setAddErr] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["watchlists"] });

  const create = useMutation({
    mutationFn: async () => {
      const raw = tickers.split(",").map((t) => t.trim()).filter(Boolean);
      const resolved = await api.resolveSymbols(raw);
      return api.createWatchlist(name.trim(), resolved);
    },
    onSuccess: () => {
      setName("");
      setTickers("");
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, tickers }: { id: string; tickers: string[] }) =>
      api.updateWatchlist(id, tickers),
    onSuccess: invalidate,
  });

  // Resolve free text to a valid symbol before adding it to a watchlist.
  const addTicker = async (w: Watchlist) => {
    const raw = (addTo[w.id] ?? "").trim();
    if (!raw) return;
    setAddErr((s) => ({ ...s, [w.id]: "" }));
    const sym = await api.resolveSymbol(raw);
    if (!sym) {
      setAddErr((s) => ({ ...s, [w.id]: `No match for "${raw}"` }));
      return;
    }
    const next = Array.from(new Set([...w.tickers, sym]));
    update.mutate({ id: w.id, tickers: next });
    setAddTo((s) => ({ ...s, [w.id]: "" }));
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWatchlist(id),
    onSuccess: invalidate,
  });

  if (!meLoading && !loggedIn)
    return (
      <div className="max-w-md mx-auto text-center space-y-4 pt-10">
        <h1 className="text-xl font-bold">Watchlists</h1>
        <p className="text-muted text-sm">
          Sign in with Google to create and save your own watchlists. Your lists are private to you.
        </p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center gap-2 bg-white text-[#1f1f1f] text-sm font-medium px-4 py-2 rounded-md hover:brightness-95 transition"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </a>
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Watchlists</h1>
        <p className="text-muted text-sm">Your private lists of tickers. Click any ticker for analysis.</p>
      </div>

      <div className="bg-panel border border-edge rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-sm">New watchlist</h2>
        <div className="flex flex-wrap gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Megacap Tech)"
            className="bg-panel2 border border-edge rounded px-3 py-2 text-sm flex-1 min-w-[180px] focus:border-accent outline-none"
          />
          <input
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="AAPL, MSFT, NVDA"
            className="bg-panel2 border border-edge rounded px-3 py-2 text-sm flex-1 min-w-[180px] focus:border-accent outline-none"
          />
          <button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="bg-accent disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded"
          >
            Create
          </button>
        </div>
      </div>

      {isLoading && <div className="text-muted text-sm">Loading…</div>}

      <div className="space-y-3">
        {lists?.map((w) => (
          <div key={w.id} className="bg-panel border border-edge rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{w.name}</h3>
              <button onClick={() => remove.mutate(w.id)} className="text-neg text-xs hover:underline">
                Delete
              </button>
            </div>
            {w.tickers.length > 0 && (
              <div className="text-[11px] text-muted mt-3">Click a ticker for full quant analysis →</div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {w.tickers.length === 0 && <span className="text-muted text-xs">No tickers yet.</span>}
              {w.tickers.map((t) => (
                <span key={t} className="bg-panel2 border border-edge rounded px-1 py-1 text-xs flex items-center gap-1">
                  <Link
                    to={`/stock/${t}`}
                    className="px-2 py-0.5 rounded text-accent font-semibold hover:bg-accent hover:text-white transition"
                  >
                    {t} →
                  </Link>
                  <button
                    onClick={() => update.mutate({ id: w.id, tickers: w.tickers.filter((x) => x !== t) })}
                    className="text-muted hover:text-neg px-1"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-3 items-center">
              <input
                value={addTo[w.id] ?? ""}
                onChange={(e) => setAddTo((s) => ({ ...s, [w.id]: e.target.value }))}
                placeholder="Add ticker or name"
                className="bg-panel2 border border-edge rounded px-2 py-1 text-xs w-40 focus:border-accent outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addTicker(w);
                }}
              />
              <button onClick={() => void addTicker(w)} className="text-accent text-xs hover:underline">
                Add
              </button>
              {addErr[w.id] && <span className="text-neg text-xs">{addErr[w.id]}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

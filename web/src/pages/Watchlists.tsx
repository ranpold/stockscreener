import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Watchlist } from "../api";

export default function Watchlists() {
  const qc = useQueryClient();
  const { data: lists, isLoading } = useQuery<Watchlist[]>({
    queryKey: ["watchlists"],
    queryFn: api.watchlists,
  });

  const [name, setName] = useState("");
  const [tickers, setTickers] = useState("");
  const [addTo, setAddTo] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["watchlists"] });

  const create = useMutation({
    mutationFn: () =>
      api.createWatchlist(
        name.trim(),
        tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
      ),
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

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWatchlist(id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Watchlists</h1>
        <p className="text-muted text-sm">Custom universes you can screen against.</p>
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
              <div className="flex gap-3 items-center">
                <Link to={`/?universe=watchlist:${w.id}`} className="text-accent text-xs">
                  Screen this →
                </Link>
                <button onClick={() => remove.mutate(w.id)} className="text-neg text-xs hover:underline">
                  Delete
                </button>
              </div>
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
            <div className="flex gap-2 mt-3">
              <input
                value={addTo[w.id] ?? ""}
                onChange={(e) => setAddTo((s) => ({ ...s, [w.id]: e.target.value }))}
                placeholder="Add ticker"
                className="bg-panel2 border border-edge rounded px-2 py-1 text-xs w-32 focus:border-accent outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addTo[w.id]?.trim()) {
                    const next = Array.from(new Set([...w.tickers, addTo[w.id].trim().toUpperCase()]));
                    update.mutate({ id: w.id, tickers: next });
                    setAddTo((s) => ({ ...s, [w.id]: "" }));
                  }
                }}
              />
              <span className="text-muted text-xs self-center">press Enter</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

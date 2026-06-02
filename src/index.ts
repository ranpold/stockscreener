import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDb, ensureSchema } from "./db/client";
import { buildStockAnalysis, buildScreen, type Env, type ScreenFilters } from "./service";
import { SP500 } from "./universe/sp500";
import { watchlistRoutes } from "./routes/watchlists";
import { authRoutes } from "./routes/auth";
import { searchSymbols } from "./providers/search";
import { data as dataProvider } from "./providers";

const dataChart = (ticker: string, tf: string) => dataProvider.getChartBars(ticker, tf);

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

/**
 * Serve a public GET response from Cloudflare's edge cache when possible.
 * On a miss it runs `build`, caches 200s for `ttl` seconds, and returns.
 * Repeat views are served at the edge (~RTT) without recomputing or touching Turso.
 */
async function edgeCached(
  c: { req: { url: string }; executionCtx: ExecutionContext },
  ttl: number,
  build: () => Promise<{ status: number; data: unknown }>,
): Promise<Response> {
  const key = new Request(new URL(c.req.url).toString());
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const { status, data } = await build();
  const res = new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": status === 200 ? `public, max-age=${ttl}` : "no-store",
    },
  });
  if (status === 200) c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
}

app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }));

app.get("/api/universe", (c) => edgeCached(c, 86400, async () => ({ status: 200, data: { sp500: SP500 } })));

// Search symbols by company name or ticker (stocks + ETFs).
app.get("/api/search", (c) => {
  const q = c.req.query("q") ?? "";
  if (q.trim().length < 1) return c.json({ results: [] });
  return edgeCached(c, 3600, async () => {
    try {
      const results = await searchSymbols(q, c.env);
      return { status: 200, data: { results } };
    } catch (e) {
      return { status: 500, data: { error: String(e), results: [] } };
    }
  });
});

// Deep-dive analysis for one ticker. Analysis always uses ~1y daily data
// (stats are meaningless on intraday); the chart timeframe is fetched separately.
app.get("/api/stock/:ticker", (c) => {
  const ticker = c.req.param("ticker");
  return edgeCached(c, 600, async () => {
    const client = getDb(c.env);
    await ensureSchema(client);
    try {
      const analysis = await buildStockAnalysis(client, c.env, ticker);
      if (!analysis) return { status: 404, data: { error: "no data for ticker" } };
      return { status: 200, data: analysis };
    } catch (e) {
      return { status: 500, data: { error: String(e) } };
    }
  });
});

// Chart bars for a UI timeframe (decoupled from analysis; intraday for short ranges).
app.get("/api/chart/:ticker", (c) => {
  const ticker = c.req.param("ticker");
  const tf = c.req.query("range") || "1y";
  const short = tf === "1d" || tf === "5d";
  return edgeCached(c, short ? 300 : 1800, async () => {
    const bars = await dataChart(ticker, tf);
    if (!bars.length) return { status: 404, data: { error: "no data", bars: [] } };
    return { status: 200, data: { bars } };
  });
});

// Screen a universe.
app.get("/api/screen", async (c) => {
  const universe = c.req.query("universe") || "sp500";
  const num = (q: string | undefined): number | undefined =>
    q !== undefined && q !== "" ? Number(q) : undefined;
  const filters: ScreenFilters = {
    minSharpe: num(c.req.query("minSharpe")),
    maxPe: num(c.req.query("maxPe")),
    minRoe: num(c.req.query("minRoe")),
    minMomentum: num(c.req.query("minMomentum")),
    maxBeta: num(c.req.query("maxBeta")),
  };
  const client = getDb(c.env);
  await ensureSchema(client);

  let tickers: string[];
  if (universe.startsWith("watchlist:")) {
    const id = universe.slice("watchlist:".length);
    const rs = await client.execute({
      sql: "SELECT ticker FROM watchlist_tickers WHERE watchlist_id = ?",
      args: [id],
    });
    tickers = rs.rows.map((r) => String(r.ticker));
  } else if (universe.startsWith("custom:")) {
    tickers = universe
      .slice("custom:".length)
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
  } else {
    tickers = SP500;
  }

  if (!tickers.length) return c.json({ rows: [], universe, count: 0 });

  try {
    const rows = await buildScreen(client, c.env, tickers, filters);
    return c.json({ rows, universe, count: rows.length });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.route("/api/auth", authRoutes);
app.route("/api/watchlists", watchlistRoutes);

// Static assets (Vite build) served by the ASSETS binding for everything else.
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;

import { Hono } from "hono";
import type { Client } from "@libsql/client/web";
import { getDb, ensureSchema } from "../db/client";
import type { Env } from "../service";

function uid(): string {
  return crypto.randomUUID();
}

export const watchlistRoutes = new Hono<{ Bindings: Env }>();

async function db(env: Env): Promise<Client> {
  const client = getDb(env);
  await ensureSchema(client);
  return client;
}

// List all watchlists with their tickers.
watchlistRoutes.get("/", async (c) => {
  const client = await db(c.env);
  const lists = await client.execute("SELECT id, name, created_at FROM watchlists ORDER BY created_at DESC");
  const tickers = await client.execute("SELECT watchlist_id, ticker FROM watchlist_tickers");
  const byList = new Map<string, string[]>();
  for (const t of tickers.rows) {
    const id = String(t.watchlist_id);
    if (!byList.has(id)) byList.set(id, []);
    byList.get(id)!.push(String(t.ticker));
  }
  return c.json(
    lists.rows.map((l) => ({
      id: String(l.id),
      name: String(l.name),
      createdAt: Number(l.created_at),
      tickers: byList.get(String(l.id)) ?? [],
    })),
  );
});

// Create a watchlist.
watchlistRoutes.post("/", async (c) => {
  const body = await c.req.json<{ name: string; tickers?: string[] }>();
  if (!body?.name) return c.json({ error: "name required" }, 400);
  const client = await db(c.env);
  const id = uid();
  await client.execute({
    sql: "INSERT INTO watchlists (id, name, created_at) VALUES (?, ?, ?)",
    args: [id, body.name, Date.now()],
  });
  const tickers = (body.tickers ?? []).map((t) => t.toUpperCase());
  for (const t of tickers) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO watchlist_tickers (watchlist_id, ticker) VALUES (?, ?)",
      args: [id, t],
    });
  }
  return c.json({ id, name: body.name, tickers, createdAt: Date.now() }, 201);
});

// Replace tickers on a watchlist.
watchlistRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; tickers?: string[] }>();
  const client = await db(c.env);
  if (body.name) {
    await client.execute({ sql: "UPDATE watchlists SET name = ? WHERE id = ?", args: [body.name, id] });
  }
  if (body.tickers) {
    await client.execute({ sql: "DELETE FROM watchlist_tickers WHERE watchlist_id = ?", args: [id] });
    for (const t of body.tickers.map((x) => x.toUpperCase())) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO watchlist_tickers (watchlist_id, ticker) VALUES (?, ?)",
        args: [id, t],
      });
    }
  }
  return c.json({ ok: true });
});

// Delete a watchlist.
watchlistRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const client = await db(c.env);
  await client.execute({ sql: "DELETE FROM watchlist_tickers WHERE watchlist_id = ?", args: [id] });
  await client.execute({ sql: "DELETE FROM watchlists WHERE id = ?", args: [id] });
  return c.json({ ok: true });
});

import { Hono } from "hono";
import type { Client } from "@libsql/client/web";
import { getDb, ensureSchema } from "../db/client";
import type { Env } from "../service";
import { getUser, type SessionUser } from "../auth";

function uid(): string {
  return crypto.randomUUID();
}

export const watchlistRoutes = new Hono<{ Bindings: Env }>();

async function db(env: Env): Promise<Client> {
  const client = getDb(env);
  await ensureSchema(client);
  return client;
}

async function requireUser(env: Env, req: Request): Promise<SessionUser | null> {
  if (!env.SESSION_SECRET) return null;
  return getUser(req, env.SESSION_SECRET);
}

// List the current user's watchlists with their tickers.
watchlistRoutes.get("/", async (c) => {
  const user = await requireUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "auth required" }, 401);
  const client = await db(c.env);
  const lists = await client.execute({
    sql: "SELECT id, name, created_at FROM watchlists WHERE user_id = ? ORDER BY created_at DESC",
    args: [user.sub],
  });
  const ids = lists.rows.map((l) => String(l.id));
  const byList = new Map<string, string[]>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const tickers = await client.execute({
      sql: `SELECT watchlist_id, ticker FROM watchlist_tickers WHERE watchlist_id IN (${placeholders})`,
      args: ids,
    });
    for (const t of tickers.rows) {
      const id = String(t.watchlist_id);
      if (!byList.has(id)) byList.set(id, []);
      byList.get(id)!.push(String(t.ticker));
    }
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

// Create a watchlist owned by the current user.
watchlistRoutes.post("/", async (c) => {
  const user = await requireUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "auth required" }, 401);
  const body = await c.req.json<{ name: string; tickers?: string[] }>();
  if (!body?.name) return c.json({ error: "name required" }, 400);
  const client = await db(c.env);
  const id = uid();
  await client.execute({
    sql: "INSERT INTO watchlists (id, name, created_at, user_id) VALUES (?, ?, ?, ?)",
    args: [id, body.name, Date.now(), user.sub],
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

// Verify the watchlist belongs to the user before mutating.
async function owns(client: Client, id: string, userSub: string): Promise<boolean> {
  const rs = await client.execute({
    sql: "SELECT 1 FROM watchlists WHERE id = ? AND user_id = ?",
    args: [id, userSub],
  });
  return rs.rows.length > 0;
}

// Replace name/tickers on the user's watchlist.
watchlistRoutes.put("/:id", async (c) => {
  const user = await requireUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "auth required" }, 401);
  const id = c.req.param("id");
  const client = await db(c.env);
  if (!(await owns(client, id, user.sub))) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ name?: string; tickers?: string[] }>();
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

// Delete the user's watchlist.
watchlistRoutes.delete("/:id", async (c) => {
  const user = await requireUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "auth required" }, 401);
  const id = c.req.param("id");
  const client = await db(c.env);
  if (!(await owns(client, id, user.sub))) return c.json({ error: "not found" }, 404);
  await client.execute({ sql: "DELETE FROM watchlist_tickers WHERE watchlist_id = ?", args: [id] });
  await client.execute({ sql: "DELETE FROM watchlists WHERE id = ?", args: [id] });
  return c.json({ ok: true });
});

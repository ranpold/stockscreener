import type { Client } from "@libsql/client/web";

/** Read a cached JSON value if not expired. */
export async function cacheGet<T>(db: Client, key: string): Promise<T | null> {
  const now = Date.now();
  const rs = await db.execute({
    sql: "SELECT payload, expires_at FROM cache WHERE key = ?",
    args: [key],
  });
  const row = rs.rows[0];
  if (!row) return null;
  if (Number(row.expires_at) < now) return null;
  try {
    return JSON.parse(String(row.payload)) as T;
  } catch {
    return null;
  }
}

/** Write a JSON value with a TTL in seconds. */
export async function cacheSet<T>(db: Client, key: string, value: T, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  await db.execute({
    sql: "INSERT INTO cache (key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at",
    args: [key, JSON.stringify(value), expiresAt],
  });
}

/** Read many cached JSON values in one query. Returns a Map of key -> value (non-expired). */
export async function cacheGetMany<T>(db: Client, keys: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (!keys.length) return out;
  const now = Date.now();
  const placeholders = keys.map(() => "?").join(",");
  const rs = await db.execute({
    sql: `SELECT key, payload, expires_at FROM cache WHERE key IN (${placeholders})`,
    args: keys,
  });
  for (const row of rs.rows) {
    if (Number(row.expires_at) < now) continue;
    try {
      out.set(String(row.key), JSON.parse(String(row.payload)) as T);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Write many cached JSON values in one batched round-trip. */
export async function cacheSetMany(
  db: Client,
  entries: { key: string; value: unknown; ttl: number }[],
): Promise<void> {
  if (!entries.length) return;
  const now = Date.now();
  await db.batch(
    entries.map((e) => ({
      sql: "INSERT INTO cache (key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at",
      args: [e.key, JSON.stringify(e.value), now + e.ttl * 1000],
    })),
    "write",
  );
}

/** Get-or-compute helper with TTL caching. */
export async function cached<T>(
  db: Client,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(db, key);
  if (hit !== null) return hit;
  const fresh = await compute();
  // Only cache non-empty results to avoid pinning failures.
  if (fresh !== null && fresh !== undefined && !(Array.isArray(fresh) && fresh.length === 0)) {
    await cacheSet(db, key, fresh, ttlSeconds);
  }
  return fresh;
}

export const TTL = {
  quote: 300, // 5 min
  ohlcv: 43200, // 12 h
  fundamentals: 86400, // 24 h
  profile: 604800, // 7 d
  screen: 3600, // 1 h
  news: 3600, // 1 h
  etf: 86400, // 24 h
  snapshot: 600, // 10 min
};

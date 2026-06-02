import { createClient, type Client } from "@libsql/client/web";

export interface DbEnv {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

let cached: Client | null = null;

/** Get a libSQL client. Reused across requests in the same isolate. */
export function getDb(env: DbEnv): Client {
  if (cached) return cached;
  cached = createClient({ url: env.TURSO_URL, authToken: env.TURSO_AUTH_TOKEN });
  return cached;
}

let initialized = false;

/** Create tables if missing. Idempotent; runs once per isolate. */
export async function ensureSchema(db: Client): Promise<void> {
  if (initialized) return;
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS watchlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        user_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS watchlist_tickers (
        watchlist_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        PRIMARY KEY (watchlist_id, ticker)
      )`,
      `CREATE TABLE IF NOT EXISTS screens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filters TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      // Speeds eviction of expired rows (PK already covers key lookups).
      `CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)`,
    ],
    "write",
  );
  // Add user ownership to watchlists for DBs created before the column existed
  // (idempotent; ignore "duplicate column").
  try {
    await db.execute("ALTER TABLE watchlists ADD COLUMN user_id TEXT");
  } catch {
    // column already exists
  }
  // Index the per-user watchlist lookup (WHERE user_id = ? ORDER BY created_at DESC).
  // Created after the ALTER so the column is guaranteed to exist.
  try {
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id, created_at)",
    );
  } catch {
    // ignore
  }
  // Opportunistic eviction of expired cache rows — once per isolate, fast via the
  // index above — so the cache table doesn't grow unbounded.
  try {
    await db.execute({ sql: "DELETE FROM cache WHERE expires_at < ?", args: [Date.now()] });
  } catch {
    // ignore
  }
  initialized = true;
}

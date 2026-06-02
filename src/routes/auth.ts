import { Hono } from "hono";
import type { Env } from "../service";
import { getDb, ensureSchema } from "../db/client";
import {
  signSession,
  sessionCookie,
  clearSessionCookie,
  tempCookie,
  clearCookie,
  parseCookies,
  getUser,
  type SessionUser,
} from "../auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

const STATE_COOKIE = "qs_oauth_state";

function redirectUri(reqUrl: string): string {
  return `${new URL(reqUrl).origin}/api/auth/callback`;
}

function randomState(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Decode a JWT payload without verifying — safe here because the id_token comes
// straight from Google's token endpoint over TLS (server-to-server exchange).
function decodeJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

// Begin OAuth: redirect to Google consent.
authRoutes.get("/login", (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: "auth not configured" }, 500);
  const state = randomState();
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(c.req.url),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  c.header("Set-Cookie", tempCookie(STATE_COOKIE, state));
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// OAuth callback: verify state, exchange code, upsert user, set session.
authRoutes.get("/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = parseCookies(c.req.header("Cookie") ?? null)[STATE_COOKIE];
  if (!code || !state || !cookieState || state !== cookieState) {
    return c.redirect("/?auth=error");
  }
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET || !c.env.SESSION_SECRET) {
    return c.redirect("/?auth=error");
  }

  // Exchange the code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(c.req.url),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.redirect("/?auth=error");
  const tokens: any = await tokenRes.json();
  const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  if (!claims?.sub || !claims?.email) return c.redirect("/?auth=error");

  const user: SessionUser = {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };

  // Upsert the user.
  const db = getDb(c.env);
  await ensureSchema(db);
  await db.execute({
    sql: `INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture`,
    args: [user.sub, user.email, user.name ?? null, user.picture ?? null, Date.now()],
  });

  const token = await signSession(user, c.env.SESSION_SECRET);
  c.header("Set-Cookie", sessionCookie(token), { append: true });
  c.header("Set-Cookie", clearCookie(STATE_COOKIE), { append: true });
  return c.redirect("/?auth=ok");
});

// Current user (null if not logged in).
authRoutes.get("/me", async (c) => {
  if (!c.env.SESSION_SECRET) return c.json({ user: null });
  const user = await getUser(c.req.raw, c.env.SESSION_SECRET);
  return c.json({ user });
});

// Log out.
authRoutes.post("/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});

// Session auth: signed (HS256) httpOnly cookie carrying the Google identity.
// No third-party auth service; Google OIDC handled in routes/auth.ts.

export interface SessionUser {
  sub: string; // Google user id
  email: string;
  name?: string;
  picture?: string;
}

const COOKIE = "qs_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeStr(str: string): string {
  return b64urlEncode(enc.encode(str));
}
function b64urlDecodeToStr(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  return dec.decode(bytes);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a session JWT (HS256) with a 30-day expiry. */
export async function signSession(user: SessionUser, secret: string): Promise<string> {
  const header = b64urlEncodeStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64urlEncodeStr(
    JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
  );
  const data = `${header}.${payload}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64urlEncode(sig)}`;
}

/** Verify a session JWT and return the user, or null if invalid/expired. */
export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)),
  );
  const given = b64urlDecodeBytes(sig);
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const obj = JSON.parse(b64urlDecodeToStr(payload));
    if (typeof obj.exp === "number" && obj.exp < Math.floor(Date.now() / 1000)) return null;
    if (!obj.sub || !obj.email) return null;
    return { sub: obj.sub, email: obj.email, name: obj.name, picture: obj.picture };
  } catch {
    return null;
  }
}

function b64urlDecodeBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// --- Cookie helpers ---

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}
export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
export function tempCookie(name: string, value: string): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}
export function clearCookie(name: string): string {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const SESSION_COOKIE = COOKIE;

/** Read + verify the session user from a request, or null. */
export async function getUser(req: Request, secret: string): Promise<SessionUser | null> {
  const token = parseCookies(req.headers.get("Cookie"))[COOKIE];
  if (!token) return null;
  return verifySession(token, secret);
}

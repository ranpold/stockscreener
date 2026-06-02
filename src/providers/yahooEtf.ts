// ETF holdings + sector weightings via Yahoo quoteSummary `topHoldings`.
// quoteSummary is crumb/cookie gated, so we do the cookie->crumb handshake once
// per isolate and reuse it. Best-effort: returns null on any failure.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface EtfHolding {
  symbol: string;
  name: string;
  weight: number; // fraction (0..1)
}
export interface EtfSector {
  sector: string;
  weight: number;
}
export interface EtfBreakdown {
  holdings: EtfHolding[];
  sectors: EtfSector[];
}

let crumbCache: { cookie: string; crumb: string; ts: number } | null = null;
const CRUMB_TTL = 25 * 60 * 1000;

export const YAHOO_UA = UA;

export async function getCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) return crumbCache;
  try {
    const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
    const setCookies = (r1.headers as any).getSetCookie?.() ?? [];
    const cookie = (setCookies as string[]).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return null;
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.length > 24 || /\s/.test(crumb)) return null; // crumbs are short tokens
    crumbCache = { cookie, crumb, ts: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}

const SECTOR_LABELS: Record<string, string> = {
  realestate: "Real Estate",
  consumer_cyclical: "Consumer Cyclical",
  basic_materials: "Basic Materials",
  consumer_defensive: "Consumer Defensive",
  technology: "Technology",
  communication_services: "Communication Services",
  financial_services: "Financial Services",
  utilities: "Utilities",
  industrials: "Industrials",
  energy: "Energy",
  healthcare: "Healthcare",
};

function label(key: string): string {
  return SECTOR_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export async function getEtfBreakdown(ticker: string): Promise<EtfBreakdown | null> {
  const cr = await getCrumb();
  if (!cr) return null;
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      ticker,
    )}?modules=topHoldings&crumb=${encodeURIComponent(cr.crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cr.cookie } });
    if (!res.ok) return null;
    const j: any = await res.json();
    const th = j?.quoteSummary?.result?.[0]?.topHoldings;
    if (!th) return null;
    const holdings: EtfHolding[] = (th.holdings ?? [])
      .map((h: any) => ({
        symbol: h.symbol,
        name: h.holdingName ?? h.symbol,
        weight: h.holdingPercent?.raw ?? 0,
      }))
      .filter((h: EtfHolding) => h.symbol);
    const sectors: EtfSector[] = (th.sectorWeightings ?? [])
      .map((o: any) => {
        const key = Object.keys(o)[0];
        return { sector: label(key), weight: o[key]?.raw ?? 0 };
      })
      .filter((s: EtfSector) => s.weight > 0)
      .sort((a: EtfSector, b: EtfSector) => b.weight - a.weight);
    if (!holdings.length && !sectors.length) return null;
    return { holdings: holdings.slice(0, 10), sectors };
  } catch {
    return null;
  }
}

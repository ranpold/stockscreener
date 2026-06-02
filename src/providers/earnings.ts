// Upcoming earnings calendar via Finnhub /calendar/earnings (free tier).

export interface EarningsEvent {
  date: string; // YYYY-MM-DD
  symbol: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  hour: string; // "bmo" | "amc" | "dmh" | ""
  quarter?: number;
  year?: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Next `days` of earnings. Prefers recognizable names (the `known` set) and otherwise
 * larger companies (those with a revenue estimate), sorted by date. [] without a key.
 */
export async function upcomingEarnings(
  apiKey: string,
  known: Set<string> = new Set(),
  days = 45,
): Promise<EarningsEvent[]> {
  if (!apiKey) return [];
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${ymd(from)}&to=${ymd(to)}&token=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    const list: any[] = (data?.earningsCalendar ?? []).filter((e: any) => e.symbol && e.epsEstimate != null);
    // Prefer recognizable (S&P sample) names; only fall back to the broader set
    // (large-caps with a revenue estimate) when too few big names are reporting soon.
    // Prefer recognizable (S&P sample) names; only fall back to the broader set
    // (large-caps with a revenue estimate) if NO known names report in the window.
    const knownEv = list.filter((e) => known.has(e.symbol));
    const chosen = knownEv.length > 0 ? knownEv : list.filter((e) => e.revenueEstimate != null);
    return chosen
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 24)
      .map((e) => ({
        date: e.date,
        symbol: e.symbol,
        epsEstimate: e.epsEstimate ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
        hour: e.hour ?? "",
        quarter: e.quarter,
        year: e.year,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } catch {
    return [];
  }
}

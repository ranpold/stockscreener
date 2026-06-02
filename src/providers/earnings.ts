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
    // Analyst-covered names (EPS estimate present). Revenue estimate (when present)
    // sizes the tile; recognizable (S&P) names sort first within a day.
    const list: any[] = (data?.earningsCalendar ?? []).filter(
      (e: any) => e.symbol && e.epsEstimate != null,
    );
    return list
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        const ak = known.has(a.symbol) ? 0 : 1;
        const bk = known.has(b.symbol) ? 0 : 1;
        if (ak !== bk) return ak - bk;
        return (b.revenueEstimate ?? 0) - (a.revenueEstimate ?? 0);
      })
      .slice(0, 120)
      .map((e) => ({
        date: e.date,
        symbol: e.symbol,
        epsEstimate: e.epsEstimate ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
        hour: e.hour ?? "",
        quarter: e.quarter,
        year: e.year,
      }));
  } catch {
    return [];
  }
}

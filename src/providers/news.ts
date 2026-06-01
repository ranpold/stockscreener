// Company news via Finnhub /company-news (free tier). Returns recent headlines.

export interface NewsItem {
  headline: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
  summary?: string;
  image?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function companyNews(
  ticker: string,
  apiKey: string,
  days = 14,
): Promise<NewsItem[]> {
  if (!apiKey) return [];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(
    ticker,
  )}&from=${ymd(from)}&to=${ymd(to)}&token=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((a: any) => a.headline && a.url)
      .slice(0, 12)
      .map((a: any) => ({
        headline: a.headline,
        source: a.source ?? "",
        url: a.url,
        datetime: a.datetime ?? 0,
        summary: a.summary || undefined,
        image: a.image || undefined,
      }));
  } catch {
    return [];
  }
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmt, type Snapshot } from "../api";

type RiskFilter = "all" | "high" | "medium" | "low";

const VERDICT_STYLE: Record<Snapshot["verdict"], string> = {
  "Strong Buy": "bg-pos/20 text-pos",
  Buy: "bg-pos/15 text-pos",
  Hold: "bg-yellow-500/15 text-yellow-400",
  Reduce: "bg-neg/15 text-neg",
  Avoid: "bg-neg/20 text-neg",
};

function riskTier(v: number): { label: string; color: string } {
  if (v < 0.25) return { label: "Low risk", color: "#16c784" };
  if (v <= 0.45) return { label: "Med risk", color: "#f5a623" };
  return { label: "High risk", color: "#ea3943" };
}

function IdeaCard({ s }: { s: Snapshot }) {
  const up = (s.changePercent ?? 0) >= 0;
  const risk = riskTier(s.volatility);
  return (
    <Link
      to={`/stock/${s.ticker}`}
      className="block bg-panel2 border border-edge rounded-xl p-3 shadow-card card-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-bold text-accent">{s.ticker}</span>
          {s.isEtf && <span className="text-[10px] bg-edge px-1 rounded text-muted">ETF</span>}
        </div>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
          style={{ background: `${risk.color}22`, color: risk.color }}
        >
          {risk.label}
        </span>
      </div>
      <div className="text-[11px] text-muted truncate">{s.name}</div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <span className="text-lg font-semibold num">{fmt.money(s.price ?? undefined)}</span>
        {s.changePercent != null && (
          <span className={`text-xs num ${up ? "text-pos" : "text-neg"}`}>
            {up ? "+" : ""}
            {fmt.pct(s.changePercent)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${VERDICT_STYLE[s.verdict]}`}>
          {s.verdict} · {s.score}
        </span>
        <span className="text-[11px] text-muted">Details →</span>
      </div>
      <div className="flex gap-3 mt-2 text-[11px] text-muted num">
        <span>Vol {fmt.pct(s.volatility)}</span>
        <span>Sharpe {fmt.num(s.sharpe)}</span>
      </div>
    </Link>
  );
}

function RiskSection({
  title,
  subtitle,
  hue,
  picks,
}: {
  title: string;
  subtitle: string;
  hue: string;
  picks: Snapshot[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: hue }} />
        <h2 className="text-lg font-bold">{title} risk</h2>
        <span className="text-xs text-muted">{subtitle}</span>
      </div>
      {picks.length === 0 ? (
        <div className="text-muted text-sm">No picks right now.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {picks.map((s) => (
            <IdeaCard key={s.ticker} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Ideas() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["ideas"], queryFn: api.ideas });
  const [filter, setFilter] = useState<RiskFilter>("all");

  const tabs: { key: RiskFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "high", label: "High risk" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
  ];
  const show = (k: RiskFilter) => filter === "all" || filter === k;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ideas to invest now</h1>
        <p className="text-muted text-sm mt-1">
          Top-ranked names by our quant score, grouped by risk (volatility). ETFs included.
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition ${
              filter === t.key ? "bg-accent text-white" : "bg-panel2 border border-edge text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-muted text-sm py-8 text-center">Scanning the market…</div>}
      {isError && <div className="text-neg text-sm py-8 text-center">Couldn't load ideas. Try again.</div>}

      {data && (
        <div className="space-y-8">
          {show("high") && <RiskSection title="High" subtitle="aggressive · vol > 45%" hue="#ea3943" picks={data.high} />}
          {show("medium") && <RiskSection title="Medium" subtitle="balanced · vol 25–45%" hue="#f5a623" picks={data.medium} />}
          {show("low") && <RiskSection title="Low" subtitle="steadier · vol < 25%" hue="#16c784" picks={data.low} />}
        </div>
      )}

      <p className="text-[11px] text-muted border-t border-edge pt-3">
        Educational, rule-based rankings — not financial advice. Scores lean on recent price
        momentum and trend; do your own research before investing.
      </p>
    </div>
  );
}

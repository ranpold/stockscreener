import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmt, type Snapshot } from "../api";

const VERDICT_STYLE: Record<Snapshot["verdict"], string> = {
  "Strong Buy": "bg-pos/20 text-pos",
  Buy: "bg-pos/15 text-pos",
  Hold: "bg-yellow-500/15 text-yellow-400",
  Reduce: "bg-neg/15 text-neg",
  Avoid: "bg-neg/20 text-neg",
};

function IdeaCard({ s }: { s: Snapshot }) {
  const up = (s.changePercent ?? 0) >= 0;
  return (
    <Link
      to={`/stock/${s.ticker}`}
      className="block bg-panel2 border border-edge rounded-xl p-3 shadow-card card-hover"
    >
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-accent">{s.ticker}</span>
        {s.isEtf && <span className="text-[10px] bg-edge px-1 rounded text-muted">ETF</span>}
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

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-up">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ideas to invest now</h1>
        <p className="text-muted text-sm mt-1">
          Top-ranked names by our quant score, grouped by risk (volatility). ETFs included.
        </p>
      </div>

      {isLoading && <div className="text-muted text-sm py-8 text-center">Scanning the market…</div>}
      {isError && <div className="text-neg text-sm py-8 text-center">Couldn't load ideas. Try again.</div>}

      {data && (
        <>
          <RiskSection title="Low" subtitle="steadier · vol < 25%" hue="#16c784" picks={data.low} />
          <RiskSection title="Medium" subtitle="balanced · vol 25–45%" hue="#f5a623" picks={data.medium} />
          <RiskSection title="High" subtitle="aggressive · vol > 45%" hue="#ea3943" picks={data.high} />
        </>
      )}

      <p className="text-[11px] text-muted border-t border-edge pt-3">
        Educational, rule-based rankings — not financial advice. Scores lean on recent price
        momentum and trend; do your own research before investing.
      </p>
    </div>
  );
}

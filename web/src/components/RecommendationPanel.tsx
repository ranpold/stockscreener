import type { Recommendation } from "../api";

const VERDICT_STYLE: Record<Recommendation["verdict"], string> = {
  "Strong Buy": "bg-pos/20 text-pos border-pos/40",
  Buy: "bg-pos/15 text-pos border-pos/30",
  Hold: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Reduce: "bg-neg/15 text-neg border-neg/30",
  Avoid: "bg-neg/20 text-neg border-neg/40",
};

function scoreColor(s: number): string {
  if (s >= 62) return "text-pos";
  if (s >= 45) return "text-yellow-400";
  return "text-neg";
}

function Bar({ label, score }: { label: string; score: number | null }) {
  if (score === null)
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-28 text-muted">{label}</span>
        <span className="text-muted">n/a</span>
      </div>
    );
  const color = score >= 62 ? "bg-pos" : score >= 45 ? "bg-yellow-400" : "bg-neg";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted">{label}</span>
      <div className="flex-1 h-2 bg-panel2 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums">{Math.round(score)}</span>
    </div>
  );
}

export default function RecommendationPanel({ rec, isEtf }: { rec: Recommendation; isEtf: boolean }) {
  return (
    <div className="bg-panel border border-edge rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-center">
          <div className={`text-4xl font-bold tabular-nums ${scoreColor(rec.score)}`}>{rec.score}</div>
          <div className="text-[11px] text-muted">/ 100</div>
        </div>
        <div>
          <span className={`inline-block px-3 py-1 rounded-md border text-sm font-semibold ${VERDICT_STYLE[rec.verdict]}`}>
            {rec.verdict}
          </span>
          <div className="text-xs text-muted mt-1">
            Composite quant signal {isEtf ? "(ETF: price & risk weighted)" : "(value · quality · momentum · trend · risk)"}
          </div>
        </div>
        <div className="flex-1 min-w-full sm:min-w-[240px] space-y-1.5">
          {rec.subScores.map((s) => (
            <Bar key={s.key} label={s.label} score={s.weight === 0 ? null : s.score} />
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {rec.positives.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-pos mb-1">Why it scores well</div>
            <ul className="text-xs text-ink space-y-1">
              {rec.positives.map((p, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-pos">▲</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {rec.negatives.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neg mb-1">Watch-outs</div>
            <ul className="text-xs text-ink space-y-1">
              {rec.negatives.map((p, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-neg">▼</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted mt-4 border-t border-edge pt-2">{rec.disclaimer}</div>
    </div>
  );
}

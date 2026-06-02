export default function MetricCard({
  label,
  value,
  hint,
  badge,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  badge?: string;
  tone?: "neutral" | "pos" | "neg";
}) {
  const color = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink";
  const badgeColor =
    tone === "pos"
      ? "bg-pos/15 text-pos"
      : tone === "neg"
        ? "bg-neg/15 text-neg"
        : "bg-edge text-muted";
  const accent = tone === "pos" ? "#16c784" : tone === "neg" ? "#ea3943" : "#26314a";
  return (
    <div
      className="relative bg-panel2 border border-edge rounded-xl p-3 overflow-hidden shadow-card"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs text-muted">{label}</div>
        {badge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${badgeColor}`}>{badge}</span>
        )}
      </div>
      <div className={`text-lg font-semibold num mt-0.5 ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}

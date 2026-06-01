export default function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "pos" | "neg";
}) {
  const color = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink";
  return (
    <div className="bg-panel2 border border-edge rounded-lg p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

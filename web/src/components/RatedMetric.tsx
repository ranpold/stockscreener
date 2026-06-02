import MetricCard from "./MetricCard";
import { rate, DESC } from "../lib/ratings";

/** MetricCard that auto-derives its good/bad badge + tone + description from the metric key. */
export default function RatedMetric({
  metric,
  label,
  value,
  raw,
  ctx,
  hint,
}: {
  metric: string;
  label: string;
  value: string;
  raw: number | null;
  ctx?: { lastClose?: number };
  hint?: string;
}) {
  const r = rate(metric, raw, ctx);
  return (
    <MetricCard
      label={label}
      value={value}
      tone={r?.tone ?? "neutral"}
      badge={r?.label}
      hint={hint ?? DESC[metric]}
    />
  );
}

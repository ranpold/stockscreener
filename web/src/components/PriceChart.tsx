import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, type IChartApi } from "lightweight-charts";
import type { OHLCVBar } from "../api";

const UP = "#22c55e";
const DOWN = "#ef4444";

/** Robinhood-style area chart: close price as a thin line with a gradient fill,
 *  colored green/red by the period's net direction. No candles, minimal grid. */
export default function PriceChart({ bars }: { bars: OHLCVBar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || bars.length === 0) return;
    const up = bars[bars.length - 1].close >= bars[0].close;
    const color = up ? UP : DOWN;

    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: "#141925" }, textColor: "#8b96a8" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1c2333" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: {
        mode: 1,
        vertLine: { color: "#8b96a8", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a3346" },
        horzLine: { color: "#8b96a8", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a3346" },
      },
      handleScale: false,
      handleScroll: false,
      height: 360,
      autoSize: true,
    });
    chartRef.current = chart;

    const area = chart.addAreaSeries({
      lineColor: color,
      lineWidth: 2,
      topColor: up ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.28)",
      bottomColor: "rgba(20,25,37,0)",
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: color,
      crosshairMarkerBackgroundColor: color,
    });
    area.setData(bars.map((b) => ({ time: b.time as any, value: b.close })));

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars]);

  return <div ref={ref} className="w-full h-[360px]" />;
}

import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi } from "lightweight-charts";
import type { OHLCVBar } from "../api";

/** Candlestick price chart with a 50-day SMA overlay. */
export default function PriceChart({ bars }: { bars: OHLCVBar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: "#141925" }, textColor: "#8b96a8" },
      grid: { vertLines: { color: "#1c2333" }, horzLines: { color: "#1c2333" } },
      rightPriceScale: { borderColor: "#2a3346" },
      timeScale: { borderColor: "#2a3346" },
      height: 360,
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candle.setData(
      bars.map((b) => ({
        time: b.time as any,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    // 50-day SMA overlay
    const period = 50;
    if (bars.length >= period) {
      const sma: { time: any; value: number }[] = [];
      let sum = 0;
      for (let i = 0; i < bars.length; i++) {
        sum += bars[i].close;
        if (i >= period) sum -= bars[i - period].close;
        if (i >= period - 1) sma.push({ time: bars[i].time as any, value: sum / period });
      }
      const line = chart.addLineSeries({ color: "#4f8cff", lineWidth: 2, priceLineVisible: false });
      line.setData(sma);
    }

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars]);

  return <div ref={ref} className="w-full h-[360px]" />;
}

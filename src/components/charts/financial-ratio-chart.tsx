"use client";

import { FinancialLineChart } from "./financial-line-chart";
import type { ChartProps } from "./chart-theme";

/** Ratio series arrive already scaled to percent; this adds the % formatting. */
export function FinancialRatioChart(props: Omit<ChartProps, "format" | "unitLabel">) {
  return <FinancialLineChart {...props} unitLabel="%" format={(n: number) => `${n.toFixed(1)}%`} />;
}

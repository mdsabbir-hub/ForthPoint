"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_COLOR, CHART_COLORS, GRID_COLOR, type ChartProps } from "./chart-theme";
import { ChartTooltip } from "./chart-tooltip";

export function FinancialBarChart({ data, series, unitLabel, format, height = 260 }: ChartProps) {
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart of ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="period" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
          <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => format(v)} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip format={format} unitLabel={unitLabel} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

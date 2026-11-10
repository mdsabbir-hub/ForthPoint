"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_COLOR, CHART_COLORS, GRID_COLOR, type ChartProps } from "./chart-theme";
import { ChartTooltip } from "./chart-tooltip";

export function FinancialLineChart({ data, series, unitLabel, format, height = 260 }: ChartProps) {
  return (
    <div style={{ height }} role="img" aria-label={`Line chart of ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="period" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
          <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => format(v)} />
          <Tooltip content={<ChartTooltip format={format} unitLabel={unitLabel} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

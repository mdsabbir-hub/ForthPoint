"use client";

interface Entry { name?: string; value?: number | string | null; color?: string; payload?: Record<string, number | string | null> }

export function ChartTooltip({ active, payload, format, unitLabel }: { active?: boolean; payload?: Entry[]; format: (n: number) => string; unitLabel: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload ?? {};
  return (
    <div className="rounded border border-line bg-raised p-3 text-xs shadow-lg">
      <div className="font-semibold">{String(point.period ?? "")}</div>
      <div className="mb-1 text-muted">Period end {String(point.endDate ?? "")} · {unitLabel}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{typeof p.value === "number" ? format(p.value) : "n/a"}</span>
        </div>
      ))}
    </div>
  );
}

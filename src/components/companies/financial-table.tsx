import { Card } from "@/components/ui/card";
import { classificationMark, formatValue, unitLabel } from "@/lib/public/format";
import type { PivotResult } from "@/lib/public/pivot";

export function FinancialTable({ title, result }: { title: string; result: PivotResult }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      {result.rows.length === 0 ? (
        <Card className="p-4 text-sm text-muted">Data unavailable for this period type.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="sticky left-0 bg-surface p-2 font-normal">Metric</th>
                {result.columns.map((c) => (
                  <th key={c.key} className="p-2 text-right font-normal" title={`Period end ${c.endDate}`}>
                    {c.label}{c.isForecast && !c.label.endsWith("E") ? " E" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.rows.map((r) => (
                <tr key={r.code}>
                  <td className="sticky left-0 bg-surface p-2">
                    <div>{r.label}</div>
                    <div className="font-mono text-xs text-muted">{unitLabel(r.unit, r.currency)}</div>
                  </td>
                  {r.cells.map((cell, i) => (
                    <td key={result.columns[i].key} className="p-2 text-right font-mono">
                      {cell ? (
                        <>
                          {formatValue(cell.value, r.unit)}
                          {classificationMark(cell.classification) ? <sup className="ml-0.5 text-muted">{classificationMark(cell.classification)}</sup> : null}
                        </>
                      ) : (
                        <span className="text-muted" title="Not available in the published research">n/a</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

export function TableLegend() {
  return (
    <p className="text-xs text-muted">
      n/a means the figure is not in the published research. C calculated, N normalized, E estimate. Unmarked figures are as reported. Hover a column heading for its period end date.
    </p>
  );
}

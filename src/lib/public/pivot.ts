import type { LineItem } from "../finance/statements";
import { chartNumber } from "./format";

export interface MetricRow {
  code: string;
  value: number;
  unit: string;
  currency: string | null;
  classification: string;
  period: { label: string; type: string; endDate: string; isForecast: boolean };
}
export interface Column { key: string; label: string; endDate: string; isForecast: boolean }
export interface Cell { value: number; classification: string }
export interface TableRow { code: string; label: string; unit: string; currency: string | null; cells: (Cell | null)[] }
export interface PivotResult { columns: Column[]; rows: TableRow[] }
export type PeriodGroup = "annual" | "interim";

const inGroup = (type: string, g: PeriodGroup) => (g === "annual" ? type === "annual" : type !== "annual");

/** Builds a statement table. A period with no value stays null; it is never turned into zero. */
export function pivot(all: MetricRow[], items: LineItem[], group: PeriodGroup): PivotResult {
  const codes = new Set(items.map((i) => i.code));
  const rows = all.filter((r) => codes.has(r.code) && inGroup(r.period.type, group));
  const cols = new Map<string, Column>();
  for (const r of rows) {
    const key = `${r.period.type}:${r.period.endDate}`;
    if (!cols.has(key)) cols.set(key, { key, label: r.period.label, endDate: r.period.endDate, isForecast: r.period.isForecast });
  }
  const columns = Array.from(cols.values()).sort((a, b) => a.endDate.localeCompare(b.endDate));
  const out: TableRow[] = [];
  for (const item of items) {
    const mine = rows.filter((r) => r.code === item.code);
    if (mine.length === 0) continue;
    const cells = columns.map((c) => {
      const hit = mine.find((r) => `${r.period.type}:${r.period.endDate}` === c.key);
      return hit ? { value: hit.value, classification: hit.classification } : null;
    });
    out.push({ code: item.code, label: item.label, unit: mine[0].unit, currency: mine[0].currency, cells });
  }
  return { columns, rows: out };
}

export interface ChartPoint { period: string; endDate: string; [series: string]: number | string | null }

/** One point per period. Missing values are null so charts leave a gap instead of drawing zero. */
export function chartSeries(result: PivotResult, codes: string[]): ChartPoint[] {
  const picked = result.rows.filter((r) => codes.includes(r.code));
  return result.columns.map((col, i) => {
    const point: ChartPoint = { period: col.label, endDate: col.endDate };
    for (const r of picked) {
      const cell = r.cells[i];
      point[r.code] = cell ? chartNumber(cell.value, r.unit) : null;
    }
    return point;
  });
}

export function hasAnyValue(points: ChartPoint[], codes: string[]): boolean {
  return points.some((p) => codes.some((c) => typeof p[c] === "number"));
}

export interface Latest { value: number; unit: string; currency: string | null; classification: string; periodLabel: string; endDate: string }

/** Latest actual (non-forecast) annual value for a metric, or null if there is none. */
export function latestAnnual(all: MetricRow[], code: string): Latest | null {
  const hits = all.filter((r) => r.code === code && r.period.type === "annual" && !r.period.isForecast);
  if (hits.length === 0) return null;
  const r = hits.reduce((a, b) => (b.period.endDate > a.period.endDate ? b : a));
  return { value: r.value, unit: r.unit, currency: r.currency, classification: r.classification, periodLabel: r.period.label, endDate: r.period.endDate };
}

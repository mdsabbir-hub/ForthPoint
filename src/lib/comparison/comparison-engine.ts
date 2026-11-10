import { absoluteChange, percentChange } from "../finance/calculations";

export type DiffType = "added" | "changed" | "removed" | "period" | "unit" | "classification" | "formula" | "source" | "sheet_added" | "sheet_removed";

export interface MetricSnap {
  metricCode: string;
  periodKey: string;
  periodLabel: string;
  value: number;
  unit: string;
  classification: string;
  formulaText: string | null;
  sheet: string;
  cellRef: string;
}

export interface DiffRow {
  changeType: DiffType;
  metricCode: string | null;
  periodKey: string | null;
  periodLabel: string | null;
  oldValue: number | null;
  newValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  oldText: string | null;
  newText: string | null;
  sheet: string | null;
  cellRef: string | null;
}

const ORDER: DiffType[] = ["changed", "removed", "unit", "classification", "formula", "source", "period", "sheet_added", "sheet_removed", "added"];

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
const flat = (s: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();

function blank(): Omit<DiffRow, "changeType"> {
  return { metricCode: null, periodKey: null, periodLabel: null, oldValue: null, newValue: null, absoluteChange: null, percentChange: null, oldText: null, newText: null, sheet: null, cellRef: null };
}

/**
 * Compares a new snapshot with the previously published one. A missing value is never treated as zero:
 * a metric absent on one side is "added" or "removed", never a change to or from 0.
 * With no baseline (first publication) every value is "added".
 */
export function compareSnapshots(oldM: MetricSnap[] | null, newM: MetricSnap[], oldSheets: string[] | null, newSheets: string[]): DiffRow[] {
  const out: DiffRow[] = [];
  const key = (m: MetricSnap) => `${m.metricCode}|${m.periodKey}`;
  const oldMap = new Map((oldM ?? []).map((m) => [key(m), m]));
  const newMap = new Map(newM.map((m) => [key(m), m]));

  for (const n of newM) {
    const o = oldMap.get(key(n));
    const base = { ...blank(), metricCode: n.metricCode, periodKey: n.periodKey, periodLabel: n.periodLabel, sheet: n.sheet, cellRef: n.cellRef };
    if (!o) {
      out.push({ ...base, changeType: "added", newValue: n.value });
      continue;
    }
    if (!same(o.value, n.value)) {
      out.push({ ...base, changeType: "changed", oldValue: o.value, newValue: n.value, absoluteChange: absoluteChange(o.value, n.value), percentChange: percentChange(o.value, n.value) });
    }
    if (o.unit !== n.unit) out.push({ ...base, changeType: "unit", oldValue: o.value, newValue: n.value, oldText: o.unit, newText: n.unit });
    if (o.classification !== n.classification) out.push({ ...base, changeType: "classification", oldValue: o.value, newValue: n.value, oldText: o.classification, newText: n.classification });
    if (flat(o.formulaText) !== flat(n.formulaText)) out.push({ ...base, changeType: "formula", oldValue: o.value, newValue: n.value, oldText: o.formulaText, newText: n.formulaText });
    if (`${o.sheet}!${o.cellRef}` !== `${n.sheet}!${n.cellRef}`) out.push({ ...base, changeType: "source", oldValue: o.value, newValue: n.value, oldText: `${o.sheet}!${o.cellRef}`, newText: `${n.sheet}!${n.cellRef}` });
  }
  for (const o of oldM ?? []) {
    if (newMap.has(key(o))) continue;
    out.push({ ...blank(), changeType: "removed", metricCode: o.metricCode, periodKey: o.periodKey, periodLabel: o.periodLabel, oldValue: o.value, sheet: o.sheet, cellRef: o.cellRef });
  }

  if (oldM) {
    const oldPeriods = new Map(oldM.map((m) => [m.periodKey, m.periodLabel]));
    const newPeriods = new Map(newM.map((m) => [m.periodKey, m.periodLabel]));
    for (const [k, label] of newPeriods) if (!oldPeriods.has(k)) out.push({ ...blank(), changeType: "period", periodKey: k, periodLabel: label, newText: `Period added: ${label}` });
    for (const [k, label] of oldPeriods) if (!newPeriods.has(k)) out.push({ ...blank(), changeType: "period", periodKey: k, periodLabel: label, oldText: `Period removed: ${label}` });
  }
  if (oldSheets) {
    const lo = new Set(oldSheets.map((s) => s.toLowerCase()));
    const ln = new Set(newSheets.map((s) => s.toLowerCase()));
    for (const s of newSheets) if (!lo.has(s.toLowerCase())) out.push({ ...blank(), changeType: "sheet_added", sheet: s, newText: s });
    for (const s of oldSheets) if (!ln.has(s.toLowerCase())) out.push({ ...blank(), changeType: "sheet_removed", sheet: s, oldText: s });
  }
  return out.sort((a, b) => ORDER.indexOf(a.changeType) - ORDER.indexOf(b.changeType) || (a.metricCode ?? "").localeCompare(b.metricCode ?? "") || (a.periodKey ?? "").localeCompare(b.periodKey ?? ""));
}

export function summarize(rows: DiffRow[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const r of rows) s[r.changeType] = (s[r.changeType] ?? 0) + 1;
  return s;
}

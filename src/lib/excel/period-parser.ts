import type { CellValue, ParsedPeriod } from "./types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function lastDay(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}
function monthEnd(total: number): string {
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(lastDay(y, m))}`;
}

/** Fiscal year Y is the year in which it ends. fyEndMonth is 1-12 (12 = calendar year). */
export function parsePeriod(input: CellValue, fyEndMonth = 12): ParsedPeriod | null {
  if (input === null || input instanceof Date || typeof input === "boolean") return null;
  const text = String(input).trim().replace(/\s+/g, " ");
  if (!text) return null;
  const fyEnd = (year: number) => year * 12 + (fyEndMonth - 1);
  const ok = (y: number) => y >= 1990 && y <= 2100;

  let m = /^(?:fy\s*)?(\d{4})\s*([aef])?$/i.exec(text);
  if (m) {
    const y = Number(m[1]);
    if (!ok(y)) return null;
    const flag = (m[2] ?? "").toLowerCase();
    const forecast = flag === "e" || flag === "f";
    return { type: "annual", fiscalYear: y, periodEnd: monthEnd(fyEnd(y)), label: `FY${y}${forecast ? "E" : ""}`, isDerived: false, isForecast: forecast };
  }
  m = /^h([12])\s*(?:fy\s*)?(\d{4})\s*([ef])?\s*(\(derived\))?$/i.exec(text);
  if (m) {
    const y = Number(m[2]);
    if (!ok(y)) return null;
    const h = Number(m[1]);
    const end = h === 1 ? fyEnd(y) - 6 : fyEnd(y);
    const forecast = (m[3] ?? "").length > 0;
    return { type: "half", fiscalYear: y, periodEnd: monthEnd(end), label: `H${h} ${y}${forecast ? "E" : ""}`, isDerived: Boolean(m[4]), isForecast: forecast };
  }
  m = /^q([1-4])\s*(?:fy\s*)?(\d{4})\s*([ef])?\s*(\(derived\))?$/i.exec(text);
  if (m) {
    const y = Number(m[2]);
    if (!ok(y)) return null;
    const q = Number(m[1]);
    const forecast = (m[3] ?? "").length > 0;
    return { type: "quarterly", fiscalYear: y, periodEnd: monthEnd(fyEnd(y) - (4 - q) * 3), label: `Q${q} ${y}${forecast ? "E" : ""}`, isDerived: Boolean(m[4]), isForecast: forecast };
  }
  return null;
}

export function periodKey(p: ParsedPeriod): string {
  return `${p.type}:${p.periodEnd}`;
}

import type { RawCell } from "./types";

export type ExtractedValue =
  | { kind: "number"; value: number; storedAsText: boolean }
  | { kind: "missing"; reason: "blank" | "marker" }
  | { kind: "no_cached_value" }
  | { kind: "error"; error: string }
  | { kind: "invalid"; raw: string };

const MISSING_MARKERS = /^(n\/?a|n\.a\.|nm|na|-|–|—|\?)$/i;

/** Converts one cell into a number or an explicit reason it has none. Never returns 0 for missing data. */
export function extractNumber(cell: RawCell | undefined): ExtractedValue {
  if (!cell) return { kind: "missing", reason: "blank" };
  if (cell.errorValue) return { kind: "error", error: cell.errorValue };
  if (cell.formula && !cell.hasCachedValue) return { kind: "no_cached_value" };
  const v = cell.value;
  if (v === null || v === undefined) return { kind: "missing", reason: "blank" };
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "number", value: v, storedAsText: false } : { kind: "invalid", raw: String(v) };
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return { kind: "missing", reason: "blank" };
    if (MISSING_MARKERS.test(t)) return { kind: "missing", reason: "marker" };
    if (/^[+-]?\d{1,3}(,\d{3})*(\.\d+)?$|^[+-]?\d+(\.\d+)?$/.test(t)) {
      return { kind: "number", value: Number(t.replace(/,/g, "")), storedAsText: true };
    }
    return { kind: "invalid", raw: t };
  }
  return { kind: "invalid", raw: String(v) };
}

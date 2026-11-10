import type { CellValue, RawCell, RawSheet, RawWorkbook } from "./types";

export function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function refOf(row: number, col: number): string {
  return `${colLetter(col)}${row}`;
}

export function cellAt(sheet: RawSheet, row: number, col: number): RawCell | undefined {
  return sheet.cells.get(refOf(row, col));
}

export function findSheet(wb: RawWorkbook, name: string): RawSheet | undefined {
  const target = name.trim().toLowerCase();
  return wb.sheets.find((s) => s.name.trim().toLowerCase() === target);
}

export function cellByRef(wb: RawWorkbook, sheet: string, ref: string): RawCell | undefined {
  return findSheet(wb, sheet)?.cells.get(ref.toUpperCase());
}

export function textOf(v: CellValue): string {
  if (v === null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function normLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function numberOf(cell: RawCell | undefined): number | null {
  if (!cell || cell.errorValue) return null;
  return typeof cell.value === "number" && Number.isFinite(cell.value) ? cell.value : null;
}

export function toJsonSafe(v: CellValue): string | number | boolean | null {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** Serializable form, used for synthetic test fixtures. */
export interface SheetJson {
  name: string;
  cells: Array<{ ref: string; value: string | number | boolean | null; formula?: string | null; cached?: boolean; error?: string | null }>;
}

export function workbookFromJson(sheets: SheetJson[]): RawWorkbook {
  return {
    sheets: sheets.map((s) => {
      const cells = new Map<string, RawCell>();
      let maxRow = 0;
      let maxCol = 0;
      for (const c of s.cells) {
        const m = /^([A-Z]+)(\d+)$/.exec(c.ref);
        if (!m) continue;
        const col = colNumber(m[1]);
        const row = Number(m[2]);
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
        const formula = c.formula ?? null;
        cells.set(c.ref, {
          ref: c.ref,
          row,
          col,
          value: c.value,
          formula,
          hasCachedValue: formula ? (c.cached ?? c.value !== null) : true,
          errorValue: c.error ?? null,
        });
      }
      return { name: s.name, maxRow, maxCol, cells };
    }),
  };
}

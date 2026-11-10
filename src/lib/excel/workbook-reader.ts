import ExcelJS from "exceljs";
import type { CellValue, RawCell, RawSheet, RawWorkbook } from "./types";

export const READ_LIMITS = { maxSheets: 80, maxCells: 250_000 };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !(v instanceof Date);
}

function plain(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  if (isObject(v)) {
    if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? "").join("");
    if (typeof v.text === "string") return v.text; // hyperlink
    if ("result" in v) return plain(v.result);
  }
  return null;
}

/** Reads cell values, formula text and cached results. Does not recalculate anything. */
export async function readWorkbook(buffer: Buffer): Promise<RawWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  if (wb.worksheets.length > READ_LIMITS.maxSheets) {
    throw new Error(`Workbook has ${wb.worksheets.length} sheets; limit is ${READ_LIMITS.maxSheets}.`);
  }
  let total = 0;
  const sheets: RawSheet[] = [];
  for (const ws of wb.worksheets) {
    const cells = new Map<string, RawCell>();
    let maxRow = 0;
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        total += 1;
        if (total > READ_LIMITS.maxCells) throw new Error(`Workbook exceeds ${READ_LIMITS.maxCells} populated cells.`);
        const raw: unknown = cell.value;
        let formula: string | null = null;
        let value: CellValue;
        let errorValue: string | null = null;
        let hasCached = true;
        if (isObject(raw) && ("formula" in raw || "sharedFormula" in raw)) {
          const f = (cell as unknown as { formula?: string }).formula ?? (typeof raw.formula === "string" ? raw.formula : null);
          formula = f ? `=${f}` : "=";
          const result = raw.result;
          if (isObject(result) && typeof result.error === "string") {
            errorValue = result.error;
            value = null;
          } else {
            value = plain(result);
          }
          hasCached = result !== undefined && result !== null;
        } else if (isObject(raw) && typeof raw.error === "string") {
          errorValue = raw.error;
          value = null;
        } else {
          value = plain(raw);
        }
        maxRow = Math.max(maxRow, rowNumber);
        maxCol = Math.max(maxCol, colNumber);
        cells.set(cell.address, {
          ref: cell.address,
          row: rowNumber,
          col: colNumber,
          value,
          formula,
          hasCachedValue: hasCached,
          errorValue,
        });
      });
    });
    sheets.push({ name: ws.name, maxRow, maxCol, cells });
  }
  return { sheets };
}

import { cellAt, colLetter, textOf } from "./cells";
import { parsePeriod } from "./period-parser";
import type { RawSheet } from "./types";

export interface TableBlock {
  headerRow: number;
  labelColumn: string;
  periodColumns: string[];
  rowLabels: string[];
}

/** Finds rows whose cells (right of column A) are mostly reporting periods. Used for diagnostics. */
export function analyzeWorksheet(sheet: RawSheet, fyEndMonth = 12): TableBlock[] {
  const blocks: TableBlock[] = [];
  for (let r = 1; r <= sheet.maxRow; r++) {
    const cols: string[] = [];
    for (let c = 2; c <= sheet.maxCol; c++) {
      const cell = cellAt(sheet, r, c);
      if (cell && parsePeriod(cell.value, fyEndMonth)) cols.push(colLetter(c));
    }
    if (cols.length >= 2) {
      const labels: string[] = [];
      for (let rr = r + 1; rr <= sheet.maxRow; rr++) {
        const lab = cellAt(sheet, rr, 1);
        const anyPeriod = [2, 3, 4].some((c) => {
          const x = cellAt(sheet, rr, c);
          return x ? parsePeriod(x.value, fyEndMonth) !== null : false;
        });
        if (anyPeriod && rr > r + 1 && !lab) break;
        if (lab) labels.push(textOf(lab.value));
        if (anyPeriod && lab) break;
      }
      blocks.push({ headerRow: r, labelColumn: "A", periodColumns: cols, rowLabels: labels });
    }
  }
  return blocks;
}

import type { RawWorkbook, ValidationIssue } from "./types";

export interface FormulaStats {
  sheet: string;
  formulas: number;
  uncached: number;
  errors: number;
  uncachedRefs: string[];
}

export function inspectFormulas(wb: RawWorkbook): { stats: FormulaStats[]; issues: ValidationIssue[] } {
  const stats: FormulaStats[] = [];
  const issues: ValidationIssue[] = [];
  for (const sheet of wb.sheets) {
    let formulas = 0;
    let uncached = 0;
    let errors = 0;
    const uncachedRefs: string[] = [];
    for (const cell of sheet.cells.values()) {
      if (cell.errorValue) {
        errors += 1;
        issues.push({ severity: "ERROR", code: "CELL_ERROR_VALUE", sheet: sheet.name, cellRef: cell.ref, message: `Cell shows the error ${cell.errorValue}.` });
      }
      if (cell.formula) {
        formulas += 1;
        if (!cell.hasCachedValue && !cell.errorValue) {
          uncached += 1;
          uncachedRefs.push(cell.ref);
        }
      }
    }
    if (uncached > 0) {
      issues.push({
        severity: "WARNING",
        code: "FORMULA_NO_CACHED_VALUE",
        sheet: sheet.name,
        cellRef: uncachedRefs[0],
        message: `${uncached} formula cell(s) have no saved result (first: ${uncachedRefs.slice(0, 5).join(", ")}). Open and save the workbook in Excel, then re-upload. Values were not recalculated.`,
      });
    }
    stats.push({ sheet: sheet.name, formulas, uncached, errors, uncachedRefs });
  }
  return { stats, issues };
}

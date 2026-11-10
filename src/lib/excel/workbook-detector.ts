import { cellAt, findSheet, normLabel, textOf } from "./cells";
import type { Detection, RawWorkbook } from "./types";

const TYPE_B_KEY_SHEETS = ["README", "INPUTS", "HIST_IS", "HIST_BS", "RATIOS", "DCF", "THESIS", "RISKS", "CATALYSTS", "SOURCES"];

function readmeValue(wb: RawWorkbook, labelStart: string): string | null {
  const sheet = findSheet(wb, "README");
  if (!sheet) return null;
  for (let r = 1; r <= Math.min(sheet.maxRow, 40); r++) {
    const label = cellAt(sheet, r, 1);
    if (label && normLabel(textOf(label.value)).startsWith(labelStart)) {
      const v = textOf(cellAt(sheet, r, 2)?.value ?? null);
      return v || null;
    }
  }
  return null;
}

export function detectWorkbook(wb: RawWorkbook): Detection {
  const names = wb.sheets.map((s) => s.name.trim().toUpperCase());
  const matched = TYPE_B_KEY_SHEETS.filter((k) => names.includes(k));
  const score = matched.length / TYPE_B_KEY_SHEETS.length;
  const tickerText = readmeValue(wb, "ticker");
  const tickerMatch = tickerText ? /^[A-Z0-9][A-Z0-9._-]{1,11}/.exec(tickerText.toUpperCase()) : null;
  const base = {
    ticker: tickerMatch ? tickerMatch[0] : null,
    companyName: readmeValue(wb, "company"),
    asOf: readmeValue(wb, "as-of"),
    sheetCount: wb.sheets.length,
  };
  if (score >= 0.6 && wb.sheets.length < 35) {
    return { ...base, workbookType: "TYPE_B", confidence: score, evidence: [`${matched.length} of ${TYPE_B_KEY_SHEETS.length} expected sheets found`, `${wb.sheets.length} worksheets`] };
  }
  if (wb.sheets.length >= 35) {
    return { ...base, workbookType: "TYPE_A", confidence: 0.5, evidence: [`${wb.sheets.length} worksheets is consistent with the integrated multi-company workbook`] };
  }
  return { ...base, workbookType: "UNKNOWN", confidence: score, evidence: [`Only ${matched.length} of ${TYPE_B_KEY_SHEETS.length} expected sheets found`] };
}

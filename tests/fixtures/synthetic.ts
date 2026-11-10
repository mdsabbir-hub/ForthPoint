import { colLetter, workbookFromJson, type SheetJson } from "../../src/lib/excel/cells";
import type { RawWorkbook } from "../../src/lib/excel/types";

/** Entirely synthetic company "TESTCO". Not real research. */
type V = string | number | null | { f: string; v: number | null };
export interface Faults {
  imbalance?: boolean;
  dcfNetDebtWrong?: boolean;
  duplicateRow?: boolean;
  badPeriodHeader?: boolean;
  uncachedFormula?: boolean;
  blankInventory?: boolean;
  bsUnitBillion?: boolean;
  dropSheet?: string;
  thesisSell?: boolean;
}

function sheet(name: string, rows: Record<number, V[]>): SheetJson {
  const cells: SheetJson["cells"] = [];
  for (const [r, vals] of Object.entries(rows)) {
    vals.forEach((v, i) => {
      if (v === null) return;
      const ref = `${colLetter(i + 1)}${r}`;
      if (typeof v === "object") cells.push({ ref, value: v.v, formula: v.f, cached: v.v !== null });
      else cells.push({ ref, value: v });
    });
  }
  return { name, cells };
}

export function buildWorkbook(f: Faults = {}): RawWorkbook {
  const years = [2022, 2023, 2024];
  const rev = [1000, 1100, 1200], gp = [500, 550, 600], op = [300, 330, 360], ni = [200, 220, 240];
  const ocf = [250, 260, 270], capex = [100, 100, 100];
  const fcf = ocf.map((o, i) => o - capex[i]);
  const eps = ni.map((n) => n / 100);
  const hdr: V[] = ["Metric", ...years];
  const isRows: Record<number, V[]> = {
    1: ["TESTCO - Historical Income Statement"], 2: ["BDT mn except EPS"], 3: hdr,
    4: ["Net revenue", ...rev], 5: ["Gross profit", ...gp], 6: ["Operating profit", ...op], 7: ["Net income", ...ni], 8: ["EPS", ...eps],
    9: ["Operating cash flow", ...ocf], 10: ["Capex", ...capex],
    11: [f.duplicateRow ? "Net revenue" : "Free cash flow", ...fcf.map((x, i) => (f.uncachedFormula && i === 2 ? { f: "=D9-D10", v: null } : x))],
    13: hdr,
    14: ["Revenue growth", "n/a", rev[1] / rev[0] - 1, rev[2] / rev[1] - 1],
    15: ["Gross margin", ...gp.map((g, i) => g / rev[i])], 16: ["Operating margin", ...op.map((g, i) => g / rev[i])],
    17: ["Net margin", ...ni.map((g, i) => g / rev[i])], 18: ["FCF margin", ...fcf.map((g, i) => g / rev[i])],
  };
  if (f.badPeriodHeader) isRows[3] = ["Metric", 2022, "Last year", 2024];
  const bsHdr: V[] = ["Metric", "FY2023", "FY2024"];
  const bs: Record<number, V[]> = {
    1: ["TESTCO - Balance Sheet"], 2: [f.bsUnitBillion ? "BDT bn" : "BDT mn"], 3: bsHdr,
    4: ["Total assets", 1000, 1100], 5: ["Cash", 100, 110], 6: ["Inventory", 200, f.blankInventory ? null : 210], 7: ["Receivables", 150, 160],
    8: ["Equity", 600, 700], 9: ["Total liabilities", 400, f.imbalance ? 300 : 400], 10: ["Short-term bank loans", 0, 0],
    11: ["Supplier financing", 0, 0], 12: ["Lease liabilities", 50, 50],
    14: ["Ratio", "FY2023", "FY2024"], 15: ["Debt + lease / equity", 50 / 600, 50 / 700], 16: ["Cash / total assets", 0.1, 110 / 1100],
  };
  const sheets: SheetJson[] = [
    sheet("README", { 3: ["Purpose", "Synthetic test workbook"], 4: ["Company", "Test Company PLC"], 5: ["Ticker", "TESTCO (DSE)"], 6: ["As-of market data", "01-Jan-2025"],
      7: ["Currency / units", "BDT; financial statements in BDT million"], 8: ["Analyst recommendation", "See THESIS sheet (BUY; target derived from DCF)"] }),
    sheet("INPUTS", { 3: ["Company", "Test Company PLC"], 4: ["Ticker", "TESTCO"], 5: ["Shares outstanding (mn)", 100], 7: ["Market price (BDT)", 50], 8: ["Market cap (BDT mn)", 5000],
      22: ["Cash", 200], 23: ["Short-term loan", 0], 24: ["Lease liabilities", 100], 29: ["Net debt", -100], 30: ["EV", 4900] }),
    sheet("HIST_IS", isRows),
    sheet("HIST_BS", bs),
    sheet("RATIOS", { 2: ["Ratio", ...years], 7: ["ROE (avg equity where supported)", "n/a", "n/a", 0.35] }),
    sheet("DCF", { 5: ["WACC", 0.1], 6: ["Terminal growth", 0.04], 7: ["Net debt", f.dcfNetDebtWrong ? 4900 : -100], 8: ["Shares", 100], 20: ["EV", 6000],
      21: ["Less: net debt", f.dcfNetDebtWrong ? 4900 : -100], 22: ["Equity", f.dcfNetDebtWrong ? 1100 : 6100], 23: ["Per share", f.dcfNetDebtWrong ? 11 : 61] }),
    sheet("THESIS", { 4: ["Recommendation", f.thesisSell ? "SELL" : "BUY"] }),
    sheet("SCENARIOS", { 4: ["Bear", null, null, null, null, 30], 5: ["Base", null, null, null, null, 61], 6: ["Bull", null, null, null, null, 90] }),
    sheet("RISKS", { 3: ["Risk"] }),
    sheet("CATALYSTS", { 3: ["Catalyst"] }),
  ].filter((s) => s.name !== f.dropSheet);
  return workbookFromJson(sheets);
}

export function buildManySheets(n: number): RawWorkbook {
  return workbookFromJson(Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, cells: [{ ref: "A1", value: `Sheet ${i + 1}` }] })));
}

import { describe, expect, it } from "vitest";
import { runImportPipeline } from "../../src/lib/excel/import-pipeline";
import { buildManySheets, buildWorkbook, type Faults } from "../fixtures/synthetic";

const run = (f: Faults = {}, expectedTicker: string | null = null) => runImportPipeline(buildWorkbook(f), { expectedTicker });
const codes = (r: ReturnType<typeof run>, severity?: string) => r.issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

describe("valid synthetic workbook", () => {
  const r = run();
  it("is detected and extracted", () => {
    expect(r.detection.workbookType).toBe("TYPE_B");
    expect(r.detection.ticker).toBe("TESTCO");
    expect(r.metrics.length).toBeGreaterThan(30);
  });
  it("has no errors", () => {
    expect(codes(r, "ERROR")).toEqual([]);
  });
  it("keeps source cell, unit and classification", () => {
    const m = r.metrics.find((x) => x.metricCode === "REVENUE" && x.period.label === "FY2024");
    expect(m?.value).toBe(1200);
    expect(m?.sheet).toBe("HIST_IS");
    expect(m?.cellRef).toBe("D4");
    expect(m?.unit).toBe("million");
    expect(m?.classification).toBe("reported");
  });
  it("treats an explicit zero as a value", () => {
    const m = r.metrics.find((x) => x.metricCode === "SHORT_TERM_BANK_LOANS" && x.period.label === "FY2024");
    expect(m?.value).toBe(0);
  });
});

describe("faults are reported, never hidden", () => {
  it("unbalanced balance sheet is an error", () => expect(codes(run({ imbalance: true }), "ERROR")).toContain("BS_IMBALANCE"));
  it("wrong DCF net debt is an error", () => expect(codes(run({ dcfNetDebtWrong: true }), "ERROR")).toContain("DCF_NET_DEBT_MISMATCH"));
  it("missing required sheet is an error", () => expect(codes(run({ dropSheet: "HIST_BS" }), "ERROR")).toContain("SHEET_MISSING_REQUIRED"));
  it("duplicate metric row is an error", () => expect(codes(run({ duplicateRow: true }), "ERROR")).toContain("METRIC_ROW_DUPLICATE"));
  it("unrecognised period header is an error", () => expect(codes(run({ badPeriodHeader: true }), "ERROR")).toContain("PERIOD_UNRECOGNISED"));
  it("ticker mismatch is an error", () => expect(codes(run({}, "OTHER"), "ERROR")).toContain("TICKER_MISMATCH"));
  it("unit mismatch is a warning", () => expect(codes(run({ bsUnitBillion: true }), "WARNING")).toContain("UNIT_MISMATCH"));
  it("recommendation mismatch is a warning", () => expect(codes(run({ thesisSell: true }), "WARNING")).toContain("RECOMMENDATION_MISMATCH"));
  it("formula without a saved result is flagged and not imported", () => {
    const r = run({ uncachedFormula: true });
    expect(codes(r, "WARNING")).toContain("FORMULA_NO_CACHED_VALUE");
    expect(r.metrics.find((x) => x.metricCode === "FREE_CASH_FLOW" && x.period.label === "FY2024")).toBeUndefined();
  });
  it("a blank cell is missing, not zero", () => {
    const r = run({ blankInventory: true });
    expect(r.metrics.find((x) => x.metricCode === "INVENTORY" && x.period.label === "FY2024")).toBeUndefined();
    expect(codes(r, "INFO")).toContain("VALUE_MISSING");
  });
});

describe("unsupported workbooks", () => {
  it("large multi-sheet workbook gets no template and extracts nothing", () => {
    const r = runImportPipeline(buildManySheets(39));
    expect(r.detection.workbookType).toBe("TYPE_A");
    expect(r.metrics).toHaveLength(0);
    expect(codes(r, "ERROR")).toContain("NO_TEMPLATE_TYPE_A");
  });
  it("unknown workbook is rejected", () => {
    const r = runImportPipeline(buildManySheets(3));
    expect(codes(r, "ERROR")).toContain("WORKBOOK_UNRECOGNISED");
  });
});

import { describe, expect, it } from "vitest";
import { STATEMENTS } from "../../src/lib/finance/statements";
import { chartNumber, classificationMark, formatValue, unitLabel } from "../../src/lib/public/format";
import { chartSeries, hasAnyValue, latestAnnual, pivot, type MetricRow } from "../../src/lib/public/pivot";

const row = (code: string, label: string, end: string, value: number, over: Partial<MetricRow> = {}, type = "annual", forecast = false): MetricRow => ({
  code, value, unit: "million", currency: "BDT", classification: "reported", period: { label, type, endDate: end, isForecast: forecast }, ...over,
});

const data: MetricRow[] = [
  row("REVENUE", "FY2023", "2023-12-31", 1100), row("REVENUE", "FY2024", "2024-12-31", 1200),
  row("NET_INCOME", "FY2024", "2024-12-31", 240),
  row("GROSS_MARGIN", "FY2024", "2024-12-31", 0.5, { unit: "ratio", currency: null, classification: "calculated" }),
  row("TOTAL_ASSETS", "H1 2025", "2025-06-30", 1300, {}, "half"),
  row("REVENUE", "FY2025E", "2025-12-31", 1300, { classification: "estimated" }, "annual", true),
];

describe("format", () => {
  it("labels units", () => {
    expect(unitLabel("million", "BDT")).toBe("BDT mn");
    expect(unitLabel("per_share", "BDT")).toBe("BDT per share");
    expect(unitLabel("ratio", null)).toBe("%");
  });
  it("formats values", () => {
    expect(formatValue(0.5, "ratio")).toBe("50.0%");
    expect(formatValue(1234567.4, "million")).toBe("1,234,567");
    expect(formatValue(10.8148, "per_share")).toBe("10.81");
    expect(formatValue(12.34, "x")).toBe("12.3x");
  });
  it("scales ratios for charts only", () => {
    expect(chartNumber(0.25, "ratio")).toBe(25);
    expect(chartNumber(250, "million")).toBe(250);
  });
  it("marks classifications", () => {
    expect(classificationMark("reported")).toBe("");
    expect(classificationMark("calculated")).toBe("C");
    expect(classificationMark("estimated")).toBe("E");
  });
});

describe("pivot", () => {
  it("separates annual and interim periods", () => {
    const a = pivot(data, STATEMENTS.balance.items, "annual");
    expect(a.rows).toHaveLength(0);
    const i = pivot(data, STATEMENTS.balance.items, "interim");
    expect(i.columns.map((c) => c.label)).toEqual(["H1 2025"]);
  });
  it("orders columns by period end and flags forecasts", () => {
    const p = pivot(data, STATEMENTS.income.items, "annual");
    expect(p.columns.map((c) => c.label)).toEqual(["FY2023", "FY2024", "FY2025E"]);
    expect(p.columns[2].isForecast).toBe(true);
  });
  it("keeps a missing value as null, never zero", () => {
    const p = pivot(data, STATEMENTS.income.items, "annual");
    const ni = p.rows.find((r) => r.code === "NET_INCOME");
    expect(ni?.cells[0]).toBeNull();
    expect(ni?.cells[1]?.value).toBe(240);
  });
  it("drops rows that have no data at all", () => {
    const p = pivot(data, STATEMENTS.income.items, "annual");
    expect(p.rows.find((r) => r.code === "EPS")).toBeUndefined();
  });
});

describe("chart series and latest values", () => {
  it("leaves gaps as null and scales ratios to percent", () => {
    const p = pivot(data, [...STATEMENTS.income.items, ...STATEMENTS.ratios.items], "annual");
    const s = chartSeries(p, ["NET_INCOME", "GROSS_MARGIN"]);
    expect(s[0].NET_INCOME).toBeNull();
    expect(s[1].NET_INCOME).toBe(240);
    expect(s[1].GROSS_MARGIN).toBe(50);
    expect(hasAnyValue(s, ["NET_INCOME"])).toBe(true);
    expect(hasAnyValue(s, ["EPS"])).toBe(false);
  });
  it("latestAnnual ignores forecasts", () => {
    expect(latestAnnual(data, "REVENUE")?.periodLabel).toBe("FY2024");
    expect(latestAnnual(data, "EPS")).toBeNull();
  });
});

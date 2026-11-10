import { describe, expect, it } from "vitest";
import { parsePeriod } from "../../src/lib/excel/period-parser";
import { parseUnitLabel } from "../../src/lib/excel/unit-normalizer";

describe("parsePeriod", () => {
  it("parses annual labels", () => {
    expect(parsePeriod(2021)?.periodEnd).toBe("2021-12-31");
    expect(parsePeriod("FY2023")?.label).toBe("FY2023");
    expect(parsePeriod("2027E")?.isForecast).toBe(true);
  });
  it("parses half-year and derived labels", () => {
    const h1 = parsePeriod("H1 2025");
    expect(h1?.type).toBe("half");
    expect(h1?.periodEnd).toBe("2025-06-30");
    const h2 = parsePeriod("H2 2024 (derived)");
    expect(h2?.periodEnd).toBe("2024-12-31");
    expect(h2?.isDerived).toBe(true);
  });
  it("parses quarters and honours the fiscal year end month", () => {
    expect(parsePeriod("Q3 2025")?.periodEnd).toBe("2025-09-30");
    expect(parsePeriod("FY2025", 6)?.periodEnd).toBe("2025-06-30");
    expect(parsePeriod("H1 2025", 6)?.periodEnd).toBe("2024-12-31");
  });
  it("rejects text that is not a period", () => {
    expect(parsePeriod("Adjustment / note")).toBeNull();
    expect(parsePeriod("Metric")).toBeNull();
    expect(parsePeriod(null)).toBeNull();
    expect(parsePeriod(12)).toBeNull();
  });
});

describe("parseUnitLabel", () => {
  it("reads currency, scale and per-share exceptions", () => {
    const u = parseUnitLabel("BDT mn except EPS");
    expect(u.currency).toBe("BDT");
    expect(u.scale).toBe("million");
    expect(u.perShareExcepted).toBe(true);
    expect(parseUnitLabel("BDT; financial statements in BDT million").scale).toBe("million");
    expect(parseUnitLabel("BDT bn").scale).toBe("billion");
    expect(parseUnitLabel("no unit here").scale).toBeNull();
  });
});

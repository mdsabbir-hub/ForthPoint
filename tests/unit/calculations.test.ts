import { describe, expect, it } from "vitest";
import {
  absoluteChange, averageRoe, balanceSheetGap, epsFromNetIncome, freeCashFlow, gordonTerminalValue, margin, netDebt, percentChange, roic,
} from "../../src/lib/finance/calculations";

describe("percentChange", () => {
  it("uses the absolute value of the old number", () => {
    expect(percentChange(100, 150)).toBe(50);
    expect(percentChange(-100, -50)).toBe(50);
    expect(percentChange(200, 100)).toBe(-50);
  });
  it("returns null for zero or missing, never a number", () => {
    expect(percentChange(0, 10)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
    expect(percentChange(10, null)).toBeNull();
  });
});

describe("basic financial calculations", () => {
  it("absolute change", () => {
    expect(absoluteChange(10, 15)).toBe(5);
    expect(absoluteChange(null, 15)).toBeNull();
  });
  it("margin and EPS", () => {
    expect(margin(300, 1000)).toBeCloseTo(0.3, 10);
    expect(margin(300, 0)).toBeNull();
    expect(epsFromNetIncome(5840, 540)).toBeCloseTo(10.81, 2);
    expect(epsFromNetIncome(null, 540)).toBeNull();
  });
  it("free cash flow subtracts capex", () => {
    expect(freeCashFlow(250, 100)).toBe(150);
    expect(freeCashFlow(250, -100)).toBe(150);
    expect(freeCashFlow(null, 100)).toBeNull();
  });
  it("balance sheet gap", () => {
    expect(balanceSheetGap(1000, 400, 600)).toBe(0);
    expect(balanceSheetGap(1000, 300, 600)).toBe(100);
    expect(balanceSheetGap(1000, null, 600)).toBeNull();
  });
  it("ROE, ROIC and net debt", () => {
    expect(averageRoe(200, 400, 600)).toBeCloseTo(0.4, 10);
    expect(averageRoe(200, null, 600)).toBeNull();
    expect(roic(30, 200)).toBeCloseTo(0.15, 10);
    expect(netDebt(0, 4336, 11970)).toBe(-7634);
  });
  it("Gordon terminal value requires WACC above growth", () => {
    expect(gordonTerminalValue(100, 0.1, 0.04)).toBeCloseTo(1733.3333, 3);
    expect(gordonTerminalValue(100, 0.04, 0.04)).toBeNull();
    expect(gordonTerminalValue(100, 0.03, 0.04)).toBeNull();
  });
});

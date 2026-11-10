import { describe, expect, it } from "vitest";
import { compareSnapshots, summarize, type MetricSnap } from "../../src/lib/comparison/comparison-engine";
import { approvalBlockers, needsWarningAcknowledgement, publishBlockers } from "../../src/lib/publication/approval-rules";

const m = (over: Partial<MetricSnap> = {}): MetricSnap => ({
  metricCode: "REVENUE", periodKey: "annual:2024-12-31", periodLabel: "FY2024", value: 100, unit: "million", classification: "reported",
  formulaText: null, sheet: "HIST_IS", cellRef: "E4", ...over,
});

describe("compareSnapshots", () => {
  it("reports nothing when identical", () => {
    expect(compareSnapshots([m()], [m()], ["A"], ["A"])).toHaveLength(0);
  });
  it("detects a new metric", () => {
    const r = compareSnapshots([m()], [m(), m({ metricCode: "NET_INCOME" })], null, []);
    expect(r).toHaveLength(1);
    expect(r[0].changeType).toBe("added");
  });
  it("detects a changed value with absolute and percent change", () => {
    const r = compareSnapshots([m({ value: 100 })], [m({ value: 125 })], null, []);
    expect(r[0].changeType).toBe("changed");
    expect(r[0].absoluteChange).toBe(25);
    expect(r[0].percentChange).toBe(25);
  });
  it("detects a removed metric and does not treat it as zero", () => {
    const r = compareSnapshots([m()], [], null, []);
    expect(r[0].changeType).toBe("removed");
    expect(r[0].newValue).toBeNull();
    expect(r[0].percentChange).toBeNull();
  });
  it("null versus zero: a value going from 0 to 5 has no percent change", () => {
    const r = compareSnapshots([m({ value: 0 })], [m({ value: 5 })], null, []);
    expect(r[0].changeType).toBe("changed");
    expect(r[0].absoluteChange).toBe(5);
    expect(r[0].percentChange).toBeNull();
  });
  it("a metric missing on the new side is removed, not changed to zero", () => {
    const r = compareSnapshots([m({ value: 0 })], [], null, []);
    expect(r[0].changeType).toBe("removed");
  });
  it("detects formula, unit, classification and source changes", () => {
    const r = compareSnapshots([m()], [m({ formulaText: "=A1+B1", unit: "billion", classification: "calculated", cellRef: "E5" })], null, []);
    const types = r.map((x) => x.changeType);
    expect(types).toContain("formula");
    expect(types).toContain("unit");
    expect(types).toContain("classification");
    expect(types).toContain("source");
  });
  it("ignores formula whitespace and case", () => {
    expect(compareSnapshots([m({ formulaText: "=a1 + b1" })], [m({ formulaText: "=A1+B1" })], null, [])).toHaveLength(0);
  });
  it("detects added and removed periods and worksheets", () => {
    const r = compareSnapshots([m()], [m(), m({ periodKey: "annual:2025-12-31", periodLabel: "FY2025" })], ["HIST_IS", "OLD"], ["HIST_IS", "NEW"]);
    const s = summarize(r);
    expect(s.period).toBe(1);
    expect(s.sheet_added).toBe(1);
    expect(s.sheet_removed).toBe(1);
    expect(s.added).toBe(1);
  });
  it("with no baseline, everything is added", () => {
    const r = compareSnapshots(null, [m(), m({ metricCode: "EPS" })], null, ["HIST_IS"]);
    expect(summarize(r)).toEqual({ added: 2 });
  });
});

describe("approval rules", () => {
  const base = { jobStatus: "needs_review", unresolvedErrors: 0, unresolvedWarnings: 0, rejectedDiffs: 0, hasDraftSnapshot: true };
  it("a clean import can be approved", () => expect(approvalBlockers(base)).toEqual([]));
  it("errors block approval", () => expect(approvalBlockers({ ...base, unresolvedErrors: 2 })).toHaveLength(1));
  it("rejected changes block approval", () => expect(approvalBlockers({ ...base, rejectedDiffs: 1 })).toHaveLength(1));
  it("wrong status blocks approval", () => expect(approvalBlockers({ ...base, jobStatus: "rejected" })).toHaveLength(1));
  it("warnings need acknowledgement but do not block", () => {
    const s = { ...base, unresolvedWarnings: 3 };
    expect(approvalBlockers(s)).toEqual([]);
    expect(needsWarningAcknowledgement(s)).toBe(true);
  });
  it("only approved imports without errors publish", () => {
    expect(publishBlockers("approved", 0)).toEqual([]);
    expect(publishBlockers("needs_review", 0)).toHaveLength(1);
    expect(publishBlockers("approved", 1)).toHaveLength(1);
  });
});

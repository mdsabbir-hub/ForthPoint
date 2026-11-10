import { approxEqual, balanceSheetGap, epsFromNetIncome, equityValueFromEv, freeCashFlow, margin, netDebt } from "../finance/calculations";
import { cellByRef, numberOf, textOf } from "./cells";
import type { MappingTemplate } from "./mapping-engine";
import { periodKey } from "./period-parser";
import type { Detection, ExtractedMetric, RawWorkbook, ValidationIssue } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

class Lookup {
  private map = new Map<string, ExtractedMetric>();
  readonly periods = new Map<string, ExtractedMetric["period"]>();
  constructor(metrics: ExtractedMetric[]) {
    for (const m of metrics) {
      if (m.crossCheckOnly) continue;
      this.map.set(`${m.metricCode}|${periodKey(m.period)}`, m);
      this.periods.set(periodKey(m.period), m.period);
    }
  }
  get(code: string, key: string): ExtractedMetric | undefined { return this.map.get(`${code}|${key}`); }
  val(code: string, key: string): number | null { return this.get(code, key)?.value ?? null; }
}

export interface ValidatorContext {
  wb: RawWorkbook;
  tpl: MappingTemplate;
  detection: Detection;
  metrics: ExtractedMetric[];
  expectedTicker: string | null;
}

export function validateData(ctx: ValidatorContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { wb, tpl, detection } = ctx;
  const L = new Lookup(ctx.metrics);
  const anchor = (name: string) => { const a = tpl.anchors[name]; return a ? cellByRef(wb, a.sheet, a.ref) : undefined; };
  const num = (name: string) => numberOf(anchor(name));
  const where = (name: string) => ({ sheet: tpl.anchors[name]?.sheet, cellRef: tpl.anchors[name]?.ref });

  // Company identity
  const tReadme = detection.ticker;
  const tInputs = textOf(anchor("tickerInputs")?.value ?? null).toUpperCase() || null;
  if (!tReadme && !tInputs) issues.push({ severity: "ERROR", code: "TICKER_MISSING", ...where("tickerReadme"), message: "No ticker was found in the workbook." });
  if (tReadme && tInputs && tReadme !== tInputs) issues.push({ severity: "ERROR", code: "TICKER_INCONSISTENT", ...where("tickerInputs"), message: `README says ${tReadme} but INPUTS says ${tInputs}.` });
  if (ctx.expectedTicker && tReadme && ctx.expectedTicker.toUpperCase() !== tReadme) issues.push({ severity: "ERROR", code: "TICKER_MISMATCH", ...where("tickerReadme"), message: `You selected ${ctx.expectedTicker} but the workbook is for ${tReadme}.` });

  // Non-negative values
  const nonNeg = ["REVENUE", "TOTAL_ASSETS", "CASH", "INVENTORY", "RECEIVABLES", "TOTAL_LIABILITIES", "LEASE_LIABILITIES", "SHORT_TERM_BANK_LOANS", "SUPPLIER_FINANCING"];
  for (const m of ctx.metrics) if (!m.crossCheckOnly && nonNeg.includes(m.metricCode) && m.value < 0) issues.push({ severity: "WARNING", code: "NEGATIVE_UNEXPECTED", sheet: m.sheet, cellRef: m.cellRef, message: `${m.metricCode} is negative (${fmt(m.value)}) for ${m.period.label}.` });

  for (const [key, p] of L.periods) {
    // Balance sheet identity
    const gap = balanceSheetGap(L.val("TOTAL_ASSETS", key), L.val("TOTAL_LIABILITIES", key), L.val("TOTAL_EQUITY", key));
    const assets = L.get("TOTAL_ASSETS", key);
    if (gap !== null && assets && assets.value !== 0) {
      const rel = Math.abs(gap) / Math.abs(assets.value);
      if (rel > 0.01) issues.push({ severity: "ERROR", code: "BS_IMBALANCE", sheet: assets.sheet, cellRef: assets.cellRef, message: `${p.label}: assets ${fmt(assets.value)} differ from liabilities + equity by ${fmt(gap)} (${(rel * 100).toFixed(1)}%). The balance sheet does not balance; check for a missing liability or equity line.` });
      else if (rel > 0.001) issues.push({ severity: "WARNING", code: "BS_IMBALANCE_MINOR", sheet: assets.sheet, cellRef: assets.cellRef, message: `${p.label}: assets differ from liabilities + equity by ${fmt(gap)} (${(rel * 100).toFixed(2)}%).` });
    }
    // Cash-flow reconciliation
    const ocf = L.get("OPERATING_CASH_FLOW", key);
    const fcfV = freeCashFlow(L.val("OPERATING_CASH_FLOW", key), L.val("CAPEX", key));
    const fcf = L.get("FREE_CASH_FLOW", key);
    if (ocf && fcf && fcfV !== null && !approxEqual(fcf.value, fcfV, 1, 0.001)) issues.push({ severity: "WARNING", code: "FCF_MISMATCH", sheet: fcf.sheet, cellRef: fcf.cellRef, message: `${p.label}: free cash flow is ${fmt(fcf.value)} but operating cash flow minus capex is ${fmt(fcfV)}.` });
    // Profit ordering
    const rev = L.val("REVENUE", key), gp = L.val("GROSS_PROFIT", key), op = L.val("OPERATING_PROFIT", key);
    const gpm = L.get("GROSS_PROFIT", key);
    if (rev !== null && gp !== null && gp > rev && gpm) issues.push({ severity: "WARNING", code: "GROSS_PROFIT_EXCEEDS_REVENUE", sheet: gpm.sheet, cellRef: gpm.cellRef, message: `${p.label}: gross profit exceeds revenue.` });
    // Ratio recomputation (workbook values are never overwritten)
    const ratioChecks: Array<[string, number | null]> = [
      ["GROSS_MARGIN", margin(gp, rev)], ["OPERATING_MARGIN", margin(op, rev)],
      ["NET_MARGIN", margin(L.val("NET_INCOME", key), rev)], ["FCF_MARGIN", margin(L.val("FREE_CASH_FLOW", key), rev)],
    ];
    for (const [code, calc] of ratioChecks) {
      const stated = L.get(code, key);
      if (stated && calc !== null && Math.abs(stated.value - calc) > 0.0005) issues.push({ severity: "WARNING", code: "RATIO_MISMATCH", sheet: stated.sheet, cellRef: stated.cellRef, message: `${p.label}: ${code} is ${stated.value.toFixed(4)} in the workbook but ${calc.toFixed(4)} when recalculated from its inputs.` });
    }
  }

  // Normalized figures should be in the same range as reported ones. A far-off value usually means shifted rows.
  for (const [key, p] of L.periods) {
    const ne = L.get("NORMALIZED_EPS", key), eps = L.val("EPS", key);
    if (ne && eps !== null && eps > 0 && (ne.value / eps > 5 || ne.value / eps < 0.2)) {
      issues.push({ severity: "WARNING", code: "NORMALIZED_IMPLAUSIBLE", sheet: ne.sheet, cellRef: ne.cellRef, message: `${p.label}: normalized EPS ${fmt(ne.value)} is ${(ne.value / eps).toFixed(1)}x reported EPS ${fmt(eps)}. Check whether the rows on this sheet are aligned with their labels.` });
    }
  }

  // EPS vs net income / shares
  const shares = num("shares");
  if (shares) {
    let checked = 0;
    for (const [key, p] of L.periods) {
      if (p.type !== "annual") continue;
      const eps = L.get("EPS", key); const ni = L.val("NET_INCOME", key);
      const calc = epsFromNetIncome(ni, shares);
      if (!eps || calc === null) continue;
      checked += 1;
      if (!approxEqual(eps.value, calc, 0.05, 0.01)) issues.push({ severity: "WARNING", code: "EPS_INCONSISTENT", sheet: eps.sheet, cellRef: eps.cellRef, message: `${p.label}: EPS is ${eps.value} but net income / ${fmt(shares)} mn shares is ${calc.toFixed(2)}.` });
    }
    if (checked > 0) issues.push({ severity: "INFO", code: "EPS_SHARE_BASIS", message: `EPS was checked for ${checked} years using the current share count (${fmt(shares)} mn). Historical share counts may differ.` });
  }

  // Market and balance identities on INPUTS
  const price = num("price"), mcap = num("marketCap"), nd = num("netDebt"), ev = num("enterpriseValue");
  if (shares && price && mcap !== null && !approxEqual(mcap, shares * price, 1, 0.005)) issues.push({ severity: "WARNING", code: "MARKET_CAP_MISMATCH", ...where("marketCap"), message: `Market cap ${fmt(mcap)} differs from shares x price (${fmt(shares * price)}).` });
  const ndCalc = netDebt(num("shortTermLoan"), num("lease"), num("cash"));
  if (nd !== null && ndCalc !== null && !approxEqual(nd, ndCalc, 1, 0.001)) issues.push({ severity: "WARNING", code: "NET_DEBT_MISMATCH", ...where("netDebt"), message: `Net debt ${fmt(nd)} differs from loans + leases - cash (${fmt(ndCalc)}).` });
  if (mcap !== null && nd !== null && ev !== null && !approxEqual(ev, mcap + nd, 1, 0.001)) issues.push({ severity: "WARNING", code: "EV_MISMATCH", ...where("enterpriseValue"), message: `Enterprise value ${fmt(ev)} differs from market cap + net debt (${fmt(mcap + nd)}).` });

  // DCF consistency
  const dEv = num("dcfEv"), dNd = num("dcfNetDebtUsed"), dEq = num("dcfEquity"), dPs = num("dcfPerShare"), dSh = num("dcfShares");
  const wacc = num("dcfWacc"), g = num("dcfGrowth");
  if (wacc !== null && g !== null && g >= wacc) issues.push({ severity: "ERROR", code: "DCF_GROWTH_GE_WACC", ...where("dcfGrowth"), message: `Terminal growth (${g}) must be below WACC (${wacc}).` });
  const eqCalc = equityValueFromEv(dEv, dNd);
  if (dEq !== null && eqCalc !== null && !approxEqual(dEq, eqCalc, 1, 0.0001)) issues.push({ severity: "ERROR", code: "DCF_EQUITY_ARITHMETIC", ...where("dcfEquity"), message: `DCF equity value ${fmt(dEq)} is not enterprise value minus net debt (${fmt(eqCalc)}).` });
  if (dPs !== null && dEq !== null && dSh) {
    const psCalc = dEq / dSh;
    if (!approxEqual(dPs, psCalc, 0.01, 0.0001)) issues.push({ severity: "ERROR", code: "DCF_PER_SHARE_ARITHMETIC", ...where("dcfPerShare"), message: `DCF value per share ${fmt(dPs)} is not equity value / shares (${fmt(psCalc)}).` });
  }
  if (dNd !== null && nd !== null && !approxEqual(dNd, nd, 1, 0.005)) {
    const equalsEv = ev !== null && approxEqual(dNd, ev, 1, 0.001);
    let extra = "";
    if (dEv !== null && dSh) extra = ` With the INPUTS net debt, equity value would be ${fmt(dEv - nd)} and value per share ${fmt((dEv - nd) / dSh)}. Shown for review only; workbook values were not changed.`;
    issues.push({ severity: "ERROR", code: "DCF_NET_DEBT_MISMATCH", ...where("dcfNetDebtUsed"), message: `The DCF subtracts ${fmt(dNd)} as net debt but INPUTS net debt is ${fmt(nd)}.${equalsEv ? " The DCF figure equals the enterprise value, so the wrong cell appears to be linked." : ""}${extra}` });
  }
  for (const [name, label] of [["scenarioBear", "Bear"], ["scenarioBase", "Base"], ["scenarioBull", "Bull"]] as const) {
    const v = num(name);
    if (v !== null && v < 0) issues.push({ severity: "WARNING", code: "SCENARIO_NEGATIVE_VALUE", ...where(name), message: `${label} scenario implies a negative value per share (${fmt(v)}).` });
  }

  // Recommendation consistency
  const word = (c: ReturnType<typeof anchor>) => /\b(BUY|HOLD|SELL)\b/.exec(textOf(c?.value ?? null).toUpperCase())?.[1] ?? null;
  const r1 = word(anchor("readmeRecommendation")), r2 = word(anchor("thesisRecommendation"));
  if (r1 && r2 && r1 !== r2) issues.push({ severity: "WARNING", code: "RECOMMENDATION_MISMATCH", ...where("thesisRecommendation"), message: `README says ${r1} but the THESIS sheet says ${r2}.` });

  return issues;
}

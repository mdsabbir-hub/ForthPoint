/** Pure financial helpers. null means "not computable"; missing data is never treated as zero. */

export function safeDivide(n: number | null, d: number | null): number | null {
  if (n === null || d === null || !Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

export function absoluteChange(oldV: number | null, newV: number | null): number | null {
  if (oldV === null || newV === null) return null;
  return newV - oldV;
}

/** (new - old) / |old| * 100. Null when either side is missing or old is zero. */
export function percentChange(oldV: number | null, newV: number | null): number | null {
  if (oldV === null || newV === null || oldV === 0) return null;
  return ((newV - oldV) / Math.abs(oldV)) * 100;
}

export function margin(numerator: number | null, revenue: number | null): number | null {
  return safeDivide(numerator, revenue);
}

/** Net income and shares must use the same scale (e.g. BDT mn and mn shares). */
export function epsFromNetIncome(netIncome: number | null, sharesOutstanding: number | null): number | null {
  return safeDivide(netIncome, sharesOutstanding);
}

export function freeCashFlow(operatingCashFlow: number | null, capex: number | null): number | null {
  if (operatingCashFlow === null || capex === null) return null;
  return operatingCashFlow - Math.abs(capex);
}

/** Assets - (Liabilities + Equity). */
export function balanceSheetGap(assets: number | null, liabilities: number | null, equity: number | null): number | null {
  if (assets === null || liabilities === null || equity === null) return null;
  return assets - (liabilities + equity);
}

export function averageRoe(netIncome: number | null, equityOpen: number | null, equityClose: number | null): number | null {
  if (equityOpen === null || equityClose === null) return null;
  return safeDivide(netIncome, (equityOpen + equityClose) / 2);
}

export function roic(nopat: number | null, investedCapital: number | null): number | null {
  return safeDivide(nopat, investedCapital);
}

export function netDebt(debt: number | null, leases: number | null, cash: number | null): number | null {
  if (debt === null || leases === null || cash === null) return null;
  return debt + leases - cash;
}

export function equityValueFromEv(enterpriseValue: number | null, netDebtValue: number | null): number | null {
  if (enterpriseValue === null || netDebtValue === null) return null;
  return enterpriseValue - netDebtValue;
}

export function gordonTerminalValue(finalFcf: number, wacc: number, growth: number): number | null {
  if (wacc <= growth) return null;
  return (finalFcf * (1 + growth)) / (wacc - growth);
}

export function approxEqual(a: number, b: number, absTol: number, relTol = 0): boolean {
  const diff = Math.abs(a - b);
  return diff <= absTol || diff <= relTol * Math.max(Math.abs(a), Math.abs(b));
}

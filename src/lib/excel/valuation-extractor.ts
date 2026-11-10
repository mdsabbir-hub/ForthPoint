import { cellAt, findSheet, normLabel, textOf } from "./cells";
import type { CellValue, RawSheet, RawWorkbook, ValidationIssue } from "./types";

export interface MethodValue { code: "DCF" | "MULTIPLES" | "SCENARIO_WEIGHTED"; label: string; valuePerShare: number }
export interface ScenarioRow { scenario: "bear" | "base" | "bull"; perShare: number | null; probability: number | null; assumptions: Record<string, string | number | null> }
export interface PeerRow { label: string; ticker: string; currency: string; metrics: Record<string, number | null> }
export interface RiskRow { title: string; probability: string; impact: string; indicator: string; evidence: string; response: string; status: string }
export interface CatalystRow { title: string; direction: string; horizon: string; needs: string; metric: string; effect: string; status: string }

export interface ValuationExtract {
  valuationDate: string | null;
  recommendation: string | null;
  currentPrice: number | null;
  targetPrice: number | null;
  upside: number | null;
  marketCap: number | null;
  methods: MethodValue[];
  dcf: { wacc: number | null; terminalGrowth: number | null; enterpriseValue: number | null; equityValue: number | null; perShare: number | null; netDebtUsed: number | null; shares: number | null };
  scenarios: ScenarioRow[];
  multiples: Array<{ code: string; value: number }>;
  sensitivity: Array<{ wacc: number; growth: number; perShare: number }>;
  peers: PeerRow[];
  thesis: { keyArguments: string[]; variant: string[]; businessOverview: string | null };
  risks: RiskRow[];
  catalysts: CatalystRow[];
}

const num = (v: CellValue): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: CellValue): string => textOf(v);

function rowWhere(sheet: RawSheet, test: (label: string) => boolean, from = 1, needValue = false): number | null {
  for (let r = from; r <= sheet.maxRow; r++) {
    const a = cellAt(sheet, r, 1);
    if (!a || !test(normLabel(str(a.value)))) continue;
    if (needValue && cellAt(sheet, r, 2)?.value == null) continue;
    return r;
  }
  return null;
}
function valueRight(sheet: RawSheet | undefined, test: (l: string) => boolean, needValue = true): CellValue {
  if (!sheet) return null;
  const r = rowWhere(sheet, test, 1, needValue);
  return r ? cellAt(sheet, r, 2)?.value ?? null : null;
}

interface Table { headers: string[]; rows: Array<{ label: string; cells: Record<string, CellValue> }> }
function readTable(sheet: RawSheet | undefined, firstHeader: string): Table | null {
  if (!sheet) return null;
  const want = normLabel(firstHeader);
  const hr = rowWhere(sheet, (l) => l === want);
  if (!hr) return null;
  const headers: string[] = [];
  for (let c = 2; c <= sheet.maxCol; c++) headers.push(str(cellAt(sheet, hr, c)?.value ?? null));
  const rows: Table["rows"] = [];
  for (let r = hr + 1; r <= sheet.maxRow; r++) {
    const a = cellAt(sheet, r, 1);
    if (!a || str(a.value) === "") break;
    const cells: Record<string, CellValue> = {};
    headers.forEach((h, i) => { if (h) cells[h] = cellAt(sheet, r, i + 2)?.value ?? null; });
    rows.push({ label: str(a.value), cells });
  }
  return { headers, rows };
}
const pick = (cells: Record<string, CellValue>, startsWith: string): CellValue => {
  const k = Object.keys(cells).find((h) => normLabel(h).startsWith(startsWith));
  return k ? cells[k] : null;
};

function readBlock(sheet: RawSheet | undefined, headingStarts: string): string[] {
  if (!sheet) return [];
  const r = rowWhere(sheet, (l) => l.startsWith(headingStarts));
  if (!r) return [];
  const out: string[] = [];
  for (let i = r + 1; i <= sheet.maxRow; i++) {
    const t = str(cellAt(sheet, i, 1)?.value ?? null);
    if (!t) break;
    out.push(t);
  }
  return out;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
export function firstDate(text: string): string | null {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(text);
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
}

const PEER_METRICS: Array<[string, string]> = [
  ["p/e (ttm)", "PE_TTM"], ["fwd p/e", "PE_FWD"], ["p/b", "PB"], ["roe", "ROE"], ["div yield", "DIV_YIELD"], ["ev/ebitda", "EV_EBITDA"],
  ["rev growth", "REV_GROWTH"], ["net margin", "NET_MARGIN"], ["beta", "BETA"],
];

export function extractValuation(wb: RawWorkbook): { data: ValuationExtract | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const S = (n: string) => findSheet(wb, n);
  const missing = (what: string, sheet: string) => issues.push({ severity: "INFO", code: "VALUATION_PART_MISSING", sheet, message: `${what} was not found on ${sheet}, so it was not imported.` });

  const thesis = S("THESIS"), dcf = S("DCF"), scen = S("SCENARIOS"), sens = S("SENSITIVITY"), mult = S("MULTIPLES"), peers = S("PEERS");
  if (!thesis && !dcf) return { data: null, issues };

  const out: ValuationExtract = {
    valuationDate: firstDate(str(valueRight(S("README"), (l) => l.startsWith("as-of")))),
    recommendation: str(valueRight(thesis, (l) => l === "recommendation")) || null,
    currentPrice: num(valueRight(thesis, (l) => l.startsWith("current price"))),
    targetPrice: num(valueRight(thesis, (l) => l.startsWith("12-month target"))),
    upside: num(valueRight(thesis, (l) => l.startsWith("upside"))),
    marketCap: num(valueRight(S("INPUTS"), (l) => l.startsWith("market cap"))),
    methods: [], dcf: { wacc: null, terminalGrowth: null, enterpriseValue: null, equityValue: null, perShare: null, netDebtUsed: null, shares: null },
    scenarios: [], multiples: [], sensitivity: [], peers: [],
    thesis: { keyArguments: readBlock(thesis, "key arguments"), variant: readBlock(thesis, "variant perception"), businessOverview: null },
    risks: [], catalysts: [],
  };

  for (const [code, start, label] of [["DCF", "dcf base value", "DCF (mid-year)"], ["MULTIPLES", "multiples base value", "P/E multiple"], ["SCENARIO_WEIGHTED", "scenario-weighted value", "Scenario-weighted"]] as const) {
    const v = num(valueRight(thesis, (l) => l.startsWith(start)));
    if (v !== null) out.methods.push({ code, label, valuePerShare: v });
  }
  if (out.methods.length === 0) missing("Valuation methods", "THESIS");

  if (dcf) {
    out.dcf = {
      wacc: num(valueRight(dcf, (l) => l === "wacc")), terminalGrowth: num(valueRight(dcf, (l) => l === "terminal growth")),
      enterpriseValue: num(valueRight(dcf, (l) => l === "enterprise value")), equityValue: num(valueRight(dcf, (l) => l === "equity value")),
      perShare: num(valueRight(dcf, (l) => l.startsWith("implied value / share (bdt"))), netDebtUsed: num(valueRight(dcf, (l) => l.startsWith("less: net debt"))),
      shares: num(valueRight(dcf, (l) => l.startsWith("shares"))),
    };
  } else missing("The DCF", "DCF");

  const st = readTable(scen, "Scenario");
  if (st) {
    for (const r of st.rows) {
      const key = normLabel(r.label);
      if (key !== "bear" && key !== "base" && key !== "bull") continue;
      out.scenarios.push({
        scenario: key, perShare: num(pick(r.cells, "implied dcf")), probability: num(pick(r.cells, "probability")),
        assumptions: {
          revenueGrowth: typeof pick(r.cells, "revenue growth") === "number" ? (pick(r.cells, "revenue growth") as number) : str(pick(r.cells, "revenue growth")) || null,
          ebitMargin: typeof pick(r.cells, "ebit margin") === "number" ? (pick(r.cells, "ebit margin") as number) : str(pick(r.cells, "ebit margin")) || null,
          wacc: num(pick(r.cells, "wacc")), terminalGrowth: num(pick(r.cells, "terminal g")), thesis: str(pick(r.cells, "thesis")) || null,
        },
      });
    }
  }
  if (out.scenarios.length === 0) missing("Bear, base and bull scenarios", "SCENARIOS");

  if (mult) {
    for (const [start, code] of [["p/e (reported)", "PE_REPORTED"], ["p/e (normalized", "PE_NORMALIZED"], ["p/b", "PB"], ["dividend yield", "DIVIDEND_YIELD"]] as const) {
      const v = num(valueRight(mult, (l) => l.startsWith(start)));
      if (v !== null) out.multiples.push({ code, value: v });
    }
    const mt = readTable(mult, "Scenario");
    for (const r of mt?.rows ?? []) {
      const k = normLabel(r.label);
      const pe = num(pick(r.cells, "p/e multiple")), price = num(pick(r.cells, "implied price"));
      if (pe !== null) out.multiples.push({ code: `SCENARIO_PE_${k.toUpperCase().replace(/[^A-Z]/g, "_")}`, value: pe });
      if (price !== null) out.multiples.push({ code: `SCENARIO_PRICE_${k.toUpperCase().replace(/[^A-Z]/g, "_")}`, value: price });
    }
  }

  if (sens) {
    const hr = rowWhere(sens, (l) => /^wacc\s*\\\s*g$/.test(l));
    if (hr) {
      const growths: Array<number | null> = [];
      for (let c = 2; c <= sens.maxCol; c++) growths.push(num(cellAt(sens, hr, c)?.value ?? null));
      for (let r = hr + 1; r <= sens.maxRow; r++) {
        const w = num(cellAt(sens, r, 1)?.value ?? null);
        if (w === null) break;
        growths.forEach((g, i) => {
          const v = num(cellAt(sens, r, i + 2)?.value ?? null);
          if (g !== null && v !== null) out.sensitivity.push({ wacc: w, growth: g, perShare: v });
        });
      }
    }
  }
  if (out.sensitivity.length === 0) missing("The WACC by terminal growth grid", "SENSITIVITY");

  const pt = readTable(peers, "Company");
  for (const r of pt?.rows ?? []) {
    const metrics: Record<string, number | null> = {};
    for (const [start, code] of PEER_METRICS) metrics[code] = num(pick(r.cells, start));
    if (Object.values(metrics).every((v) => v === null)) continue; // listed but no data (e.g. not covered by the data source)
    out.peers.push({ label: r.label, ticker: str(pick(r.cells, "ticker")), currency: str(pick(r.cells, "ccy")), metrics });
  }

  const biz = S("BUSINESS");
  if (biz) {
    const parts: string[] = [];
    for (const l of ["business model", "brands", "manufacturing footprint", "2025 structural event"]) {
      const r = rowWhere(biz, (x) => x === l, 1, true);
      if (r) parts.push(`${str(cellAt(biz, r, 1)?.value ?? null)}: ${str(cellAt(biz, r, 2)?.value ?? null)}`);
    }
    out.thesis.businessOverview = parts.length ? parts.join("\n") : null;
  }

  for (const r of readTable(S("RISKS"), "Risk")?.rows ?? []) {
    out.risks.push({ title: r.label, probability: str(pick(r.cells, "probability")), impact: str(pick(r.cells, "impact")), indicator: str(pick(r.cells, "leading")), evidence: str(pick(r.cells, "current evidence")), response: str(pick(r.cells, "mitigation")), status: str(pick(r.cells, "status")) });
  }
  for (const r of readTable(S("CATALYSTS"), "Catalyst / event")?.rows ?? []) {
    out.catalysts.push({ title: r.label, direction: str(pick(r.cells, "expected")), horizon: str(pick(r.cells, "time")), needs: str(pick(r.cells, "what must")), metric: str(pick(r.cells, "metric")), effect: str(pick(r.cells, "potential")), status: str(pick(r.cells, "status")) });
  }

  issues.push({ severity: "INFO", code: "VALUATION_EXTRACTED", message: `Valuation data read: ${out.methods.length} methods, ${out.scenarios.length} scenarios, ${out.sensitivity.length} sensitivity cells, ${out.peers.length} peers, ${out.risks.length} risks, ${out.catalysts.length} catalysts.` });
  return { data: out, issues };
}

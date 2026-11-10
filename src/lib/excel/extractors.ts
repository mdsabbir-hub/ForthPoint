import { cellAt, findSheet, normLabel, numberOf, textOf } from "./cells";
import { parsePeriod } from "./period-parser";
import type { Classification, RawSheet, RawWorkbook } from "./types";

/* ---------- label-based lookups (robust to inserted or deleted rows) ---------- */

export interface Found { value: number; sheet: string; ref: string }

function rowLabel(sheet: RawSheet, row: number): string {
  const c = cellAt(sheet, row, 1);
  return c ? normLabel(textOf(c.value)) : "";
}

export function findRow(sheet: RawSheet, test: (label: string) => boolean, from = 1): number | null {
  for (let r = from; r <= sheet.maxRow; r++) if (test(rowLabel(sheet, r))) return r;
  return null;
}

function firstNumberInRow(sheet: RawSheet, row: number): Found | null {
  for (let c = 2; c <= sheet.maxCol; c++) {
    const cell = cellAt(sheet, row, c);
    const n = numberOf(cell);
    if (cell && n !== null) return { value: n, sheet: sheet.name, ref: cell.ref };
  }
  return null;
}

function firstTextInRow(sheet: RawSheet, row: number): string | null {
  for (let c = 2; c <= sheet.maxCol; c++) {
    const t = textOf(cellAt(sheet, row, c)?.value ?? null);
    if (t) return t;
  }
  return null;
}

export const eq = (s: string) => (l: string) => l === s;
export const starts = (s: string) => (l: string) => l.startsWith(s);
export const has = (...parts: string[]) => (l: string) => parts.every((p) => l.includes(p));

export function labelNumber(wb: RawWorkbook, sheetName: string, test: (l: string) => boolean, from = 1): Found | null {
  const sheet = findSheet(wb, sheetName);
  if (!sheet) return null;
  const r = findRow(sheet, test, from);
  return r === null ? null : firstNumberInRow(sheet, r);
}

export function labelText(wb: RawWorkbook, sheetName: string, test: (l: string) => boolean, from = 1): string | null {
  const sheet = findSheet(wb, sheetName);
  if (!sheet) return null;
  const r = findRow(sheet, test, from);
  return r === null ? null : firstTextInRow(sheet, r);
}

/** The unit statement in README, wherever it sits (row labels differ between workbook versions). */
export function findDeclaredUnit(wb: RawWorkbook): { text: string; ref: string } | null {
  const sheet = findSheet(wb, "README");
  if (!sheet) return null;
  for (const test of [has("currency", "unit"), starts("purpose"), has("unit")]) {
    const r = findRow(sheet, test);
    if (r === null) continue;
    for (let c = 2; c <= sheet.maxCol; c++) {
      const cell = cellAt(sheet, r, c);
      const t = textOf(cell?.value ?? null);
      if (cell && /\b(mn|million|bn|billion|crore|thousand)\b/i.test(t)) return { text: t, ref: cell.ref };
    }
  }
  return null;
}

/* ---------- INPUTS and DCF ---------- */

export interface InputsRead {
  ticker: string | null;
  shares: Found | null; price: Found | null; marketCap: Found | null;
  cash: Found | null; shortTermLoan: Found | null; lease: Found | null; netDebt: Found | null; enterpriseValue: Found | null;
}

export function readInputs(wb: RawWorkbook): InputsRead {
  const n = (t: (l: string) => boolean) => labelNumber(wb, "INPUTS", t);
  const tk = labelText(wb, "INPUTS", eq("ticker"));
  return {
    ticker: tk ? tk.toUpperCase() : null,
    shares: n(starts("shares outstanding")), price: n(starts("market price")), marketCap: n(starts("market cap")),
    cash: n(has("h1", "cash")), shortTermLoan: n(has("short-term bank loan")), lease: n(has("lease liabilities")),
    netDebt: n(starts("net debt")), enterpriseValue: n(starts("ev (")),
  };
}

export interface DcfRead {
  wacc: Found | null; growth: Found | null; shares: Found | null; enterpriseValue: Found | null;
  netDebtUsed: Found | null; equityValue: Found | null; perShare: Found | null;
}

export function readDcf(wb: RawWorkbook): DcfRead {
  const n = (t: (l: string) => boolean) => labelNumber(wb, "DCF", t);
  return {
    wacc: n(eq("wacc")), growth: n(eq("terminal growth")), shares: n(starts("shares")), enterpriseValue: n(eq("enterprise value")),
    netDebtUsed: n(starts("less: net debt")), equityValue: n(eq("equity value")), perShare: n(eq("implied value / share (bdt)")),
  };
}

export function readRecommendations(wb: RawWorkbook): { thesis: string | null; readme: string | null } {
  const word = (t: string | null) => (t ? /\b(BUY|HOLD|SELL)\b/.exec(t.toUpperCase())?.[1] ?? null : null);
  let thesis: string | null = null;
  const ts = findSheet(wb, "THESIS");
  if (ts) for (let r = 1; r <= ts.maxRow && !thesis; r++) if (rowLabel(ts, r) === "recommendation") thesis = word(firstTextInRow(ts, r));
  let readme: string | null = null;
  const rs = findSheet(wb, "README");
  if (rs) for (let r = 1; r <= rs.maxRow && !readme; r++) if (rowLabel(rs, r).includes("recommend")) readme = word(firstTextInRow(rs, r));
  return { thesis, readme };
}

/* ---------- valuation, peers and research text ---------- */

export interface ValuationExtract {
  valuationDate: string | null;
  marketPrice: number | null; marketCap: number | null; enterpriseValue: number | null; equityValue: number | null;
  targetPrice: number | null; recommendation: string | null;
  multiples: Array<{ code: string; value: number; classification: Classification }>;
  dcf: { wacc: number | null; growth: number | null; enterpriseValue: number | null; equityValue: number | null; perShare: number | null } | null;
  forecasts: Array<{ fiscalYear: number; fcf: number | null; discountFactor: number | null; presentValue: number | null }>;
  scenarios: Array<{ scenario: "bear" | "base" | "bull"; targetPrice: number | null; assumptions: Record<string, number | string | null> }>;
  sensitivities: Array<{ wacc: number; growth: number; perShare: number }>;
}

function parseAsOf(wb: RawWorkbook): string | null {
  const t = labelText(wb, "README", starts("as-of"));
  const m = t ? /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(t) : null;
  if (!m) return null;
  const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
  return mon < 0 ? null : `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function headerMap(sheet: RawSheet, row: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let c = 1; c <= sheet.maxCol; c++) {
    const t = normLabel(textOf(cellAt(sheet, row, c)?.value ?? null));
    if (t) m.set(t, c);
  }
  return m;
}
const colBy = (h: Map<string, number>, part: string): number | null => {
  for (const [k, v] of h) if (k.includes(part)) return v;
  return null;
};

export function extractValuation(wb: RawWorkbook): ValuationExtract | null {
  const dcfSheet = findSheet(wb, "DCF");
  const scenSheet = findSheet(wb, "SCENARIOS");
  const sensSheet = findSheet(wb, "SENSITIVITY");
  if (!dcfSheet && !scenSheet && !sensSheet) return null;
  const inp = readInputs(wb);
  const d = readDcf(wb);
  const target = labelNumber(wb, "THESIS", starts("12-month target price"));
  const rec = readRecommendations(wb).thesis;

  const multiples: ValuationExtract["multiples"] = [];
  const add = (code: string, f: Found | null, cls: Classification) => { if (f) multiples.push({ code, value: f.value, classification: cls }); };
  add("PE_RATIO", labelNumber(wb, "MULTIPLES", eq("p/e (reported)")), "reported");
  add("PE_RATIO_NORMALIZED", labelNumber(wb, "MULTIPLES", starts("p/e (normalized")), "normalized");
  add("PB_RATIO", labelNumber(wb, "MULTIPLES", eq("p/b")), "calculated");
  add("DIVIDEND_YIELD", labelNumber(wb, "MULTIPLES", eq("dividend yield")), "calculated");

  const forecasts: ValuationExtract["forecasts"] = [];
  if (dcfSheet) {
    const top = findRow(dcfSheet, starts("forecast fcf"));
    const hdr = top === null ? null : findRow(dcfSheet, eq("metric"), top);
    if (hdr !== null) {
      const fcfRow = findRow(dcfSheet, starts("fcf ("), hdr);
      const dfRow = findRow(dcfSheet, eq("discount factor"), hdr);
      const pvRow = findRow(dcfSheet, eq("pv of fcf"), hdr);
      for (let c = 2; c <= dcfSheet.maxCol; c++) {
        const p = parsePeriod(cellAt(dcfSheet, hdr, c)?.value ?? null);
        if (!p || p.type !== "annual") continue;
        forecasts.push({
          fiscalYear: p.fiscalYear,
          fcf: fcfRow ? numberOf(cellAt(dcfSheet, fcfRow, c)) : null,
          discountFactor: dfRow ? numberOf(cellAt(dcfSheet, dfRow, c)) : null,
          presentValue: pvRow ? numberOf(cellAt(dcfSheet, pvRow, c)) : null,
        });
      }
    }
  }

  const scenarios: ValuationExtract["scenarios"] = [];
  if (scenSheet) {
    const hdr = findRow(scenSheet, eq("scenario"));
    if (hdr !== null) {
      const h = headerMap(scenSheet, hdr);
      for (let r = hdr + 1; r <= scenSheet.maxRow; r++) {
        const key = rowLabel(scenSheet, r);
        if (key !== "bear" && key !== "base" && key !== "bull") { if (key === "") break; continue; }
        const val = (part: string) => { const c = colBy(h, part); return c ? numberOf(cellAt(scenSheet, r, c)) : null; };
        const thesisCol = colBy(h, "thesis");
        scenarios.push({
          scenario: key, targetPrice: val("implied dcf"),
          assumptions: {
            revenue_growth: val("revenue growth"), ebit_margin: val("ebit margin"), wacc: val("wacc"), terminal_growth: val("terminal"),
            probability: val("probability"), note: thesisCol ? textOf(cellAt(scenSheet, r, thesisCol)?.value ?? null) || null : null,
          },
        });
      }
    }
  }

  const sensitivities: ValuationExtract["sensitivities"] = [];
  if (sensSheet) {
    const hdr = findRow(sensSheet, (l) => /^wacc\s*[\\×x/]\s*(g|terminal)/.test(l));
    if (hdr !== null) {
      const growths: Array<{ col: number; g: number }> = [];
      for (let c = 2; c <= sensSheet.maxCol; c++) { const g = numberOf(cellAt(sensSheet, hdr, c)); if (g !== null) growths.push({ col: c, g }); }
      for (let r = hdr + 1; r <= sensSheet.maxRow; r++) {
        const w = numberOf(cellAt(sensSheet, r, 1));
        if (w === null) break;
        for (const { col, g } of growths) { const v = numberOf(cellAt(sensSheet, r, col)); if (v !== null) sensitivities.push({ wacc: w, growth: g, perShare: v }); }
      }
    }
  }

  return {
    valuationDate: parseAsOf(wb), marketPrice: inp.price?.value ?? null, marketCap: inp.marketCap?.value ?? null,
    enterpriseValue: d.enterpriseValue?.value ?? null, equityValue: d.equityValue?.value ?? null, targetPrice: target?.value ?? null, recommendation: rec,
    multiples,
    dcf: dcfSheet ? { wacc: d.wacc?.value ?? null, growth: d.growth?.value ?? null, enterpriseValue: d.enterpriseValue?.value ?? null, equityValue: d.equityValue?.value ?? null, perShare: d.perShare?.value ?? null } : null,
    forecasts, scenarios, sensitivities,
  };
}

export interface PeerRow { label: string; ticker: string | null; currency: string | null; metrics: Record<string, number> }

const PEER_COLS: Array<[string, string]> = [
  ["p/e (ttm)", "PE_TTM"], ["fwd p/e", "PE_FWD"], ["p/b", "PB"], ["roe", "ROE"], ["div yield", "DIV_YIELD"],
  ["ev/ebitda", "EV_EBITDA"], ["rev growth", "REV_GROWTH"], ["net margin", "NET_MARGIN"], ["beta", "BETA"], ["price", "PRICE"],
];

export function extractPeers(wb: RawWorkbook, subjectTicker: string | null): PeerRow[] {
  const sheet = findSheet(wb, "PEERS");
  if (!sheet) return [];
  let hdr: number | null = null;
  for (let r = 1; r <= sheet.maxRow && hdr === null; r++) {
    if (rowLabel(sheet, r) === "company" && normLabel(textOf(cellAt(sheet, r, 2)?.value ?? null)) === "ticker") hdr = r;
  }
  if (hdr === null) return [];
  const h = headerMap(sheet, hdr);
  const tickerCol = h.get("ticker") ?? 2;
  const ccyCol = h.get("ccy") ?? null;
  const out: PeerRow[] = [];
  for (let r = hdr + 1; r <= sheet.maxRow; r++) {
    const label = textOf(cellAt(sheet, r, 1)?.value ?? null);
    if (!label) break;
    const lower = normLabel(label);
    const isMedian = lower.startsWith("peer median");
    if (lower.includes(" vs ")) continue;
    const ticker = isMedian ? null : textOf(cellAt(sheet, r, tickerCol)?.value ?? null) || null;
    if (ticker && subjectTicker && ticker.toUpperCase() === subjectTicker.toUpperCase()) continue;
    const metrics: Record<string, number> = {};
    for (const [name, code] of PEER_COLS) {
      const c = h.get(name);
      const v = c ? numberOf(cellAt(sheet, r, c)) : null;
      if (v !== null) metrics[code] = v;
    }
    if (Object.keys(metrics).length === 0) continue;
    out.push({ label: isMedian ? "Peer median" : label, ticker, currency: ccyCol ? textOf(cellAt(sheet, r, ccyCol)?.value ?? null) || null : null, metrics });
  }
  return out;
}

export interface ResearchExtract {
  businessOverview: string | null; industryOverview: string | null; governance: string | null; thesis: string | null; recommendation: string | null;
  risks: Array<{ title: string; description: string; severity: string | null }>;
  catalysts: Array<{ title: string; description: string }>;
}

function tableRows(sheet: RawSheet, headerTest: (l: string) => boolean): { h: Map<string, number>; rows: number[] } | null {
  const hdr = findRow(sheet, headerTest);
  if (hdr === null) return null;
  const rows: number[] = [];
  for (let r = hdr + 1; r <= sheet.maxRow; r++) { if (rowLabel(sheet, r) === "") break; rows.push(r); }
  return { h: headerMap(sheet, hdr), rows };
}

export function extractResearch(wb: RawWorkbook): ResearchExtract | null {
  const join = (parts: string[]) => (parts.length ? parts.join("\n") : null);
  const cellText = (s: RawSheet, r: number, c: number | null) => (c ? textOf(cellAt(s, r, c)?.value ?? null) : "");

  let business: string | null = null;
  const bs = findSheet(wb, "BUSINESS");
  if (bs) {
    const parts: string[] = [];
    for (let r = 3; r <= bs.maxRow; r++) {
      const a = textOf(cellAt(bs, r, 1)?.value ?? null), b = textOf(cellAt(bs, r, 2)?.value ?? null);
      if (a && b && !/^key (economic driver|risks)/i.test(a)) parts.push(`${a}: ${b}`);
    }
    business = join(parts);
  }

  let industry: string | null = null;
  const es = findSheet(wb, "ESG_REGULATORY");
  if (es) {
    const t = tableRows(es, (l) => l === "item");
    if (t) {
      const sc = colBy(t.h, "current status"), qc = colBy(t.h, "quantification");
      industry = join(t.rows.map((r) => `${cellText(es, r, 1)}: ${[cellText(es, r, sc), cellText(es, r, qc)].filter(Boolean).join(". ")}`));
    }
  }

  let governance: string | null = null;
  const gs = findSheet(wb, "GOVERNANCE");
  if (gs) {
    const parts: string[] = [];
    for (let r = 1; r <= gs.maxRow; r++) {
      const l = rowLabel(gs, r);
      if (l === "implication" || l === "assessment") { const t = firstTextInRow(gs, r); if (t) parts.push(t); }
      if (l === "capital allocation priorities") { const t = textOf(cellAt(gs, r + 1, 1)?.value ?? null); if (t) parts.push(`Capital allocation: ${t}`); }
    }
    governance = join(parts);
  }

  let thesis: string | null = null;
  const ts = findSheet(wb, "THESIS");
  if (ts) {
    const args: string[] = [], variant: string[] = [];
    const k = findRow(ts, starts("key arguments")), v = findRow(ts, starts("variant perception"));
    if (k !== null) for (let r = k + 1; r <= ts.maxRow; r++) { const t = textOf(cellAt(ts, r, 1)?.value ?? null); if (!/^\d+\./.test(t)) break; args.push(t); }
    if (v !== null) for (let r = v + 1; r <= ts.maxRow; r++) { const t = textOf(cellAt(ts, r, 1)?.value ?? null); if (!t.startsWith("-")) break; variant.push(t); }
    const blocks = [args.length ? `Key arguments\n${args.join("\n")}` : "", variant.length ? `Variant perception\n${variant.join("\n")}` : ""].filter(Boolean);
    thesis = blocks.length ? blocks.join("\n\n") : null;
  }

  const risks: ResearchExtract["risks"] = [];
  const rs = findSheet(wb, "RISKS");
  if (rs) {
    const t = tableRows(rs, (l) => l === "risk");
    if (t) for (const r of t.rows) {
      const p = cellText(rs, r, colBy(t.h, "probability")), i = cellText(rs, r, colBy(t.h, "impact"));
      const ev = cellText(rs, r, colBy(t.h, "current evidence")), mit = cellText(rs, r, colBy(t.h, "mitigation"));
      risks.push({ title: cellText(rs, r, 1), description: [ev && `Evidence: ${ev}`, mit && `Response: ${mit}`].filter(Boolean).join(" "), severity: p || i ? `Probability ${p || "n/a"}, impact ${i || "n/a"}` : null });
    }
  }
  const catalysts: ResearchExtract["catalysts"] = [];
  const cs = findSheet(wb, "CATALYSTS");
  if (cs) {
    const t = tableRows(cs, starts("catalyst"));
    if (t) for (const r of t.rows) {
      const dir = cellText(cs, r, colBy(t.h, "expected direction")), hz = cellText(cs, r, colBy(t.h, "time horizon"));
      const need = cellText(cs, r, colBy(t.h, "what must happen")), ver = cellText(cs, r, colBy(t.h, "metric to verify"));
      catalysts.push({ title: cellText(cs, r, 1), description: [dir && `${dir}`, hz && `horizon ${hz}`].filter(Boolean).join("; ") + (need ? `. Needs: ${need}` : "") + (ver ? `. Verify: ${ver}` : "") });
    }
  }

  const rec = readRecommendations(wb).thesis;
  if (!business && !industry && !governance && !thesis && risks.length === 0 && catalysts.length === 0) return null;
  return { businessOverview: business, industryOverview: industry, governance, thesis, recommendation: rec, risks, catalysts };
}

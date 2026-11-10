import type { BlockMapping, MappingTemplate, RowMapping } from "../mapping-engine";

const m = (label: string, metricCode: string, kind: RowMapping["kind"], classification: RowMapping["classification"] = "auto", crossCheckOnly = false): RowMapping =>
  ({ label, metricCode, kind, classification, crossCheckOnly });

const isMain: BlockMapping = {
  headerRow: 3, firstDataRow: 4, lastDataRow: 11, labelColumn: 1,
  rows: [
    m("Net revenue", "REVENUE", "money"), m("Gross profit", "GROSS_PROFIT", "money"), m("Operating profit", "OPERATING_PROFIT", "money"),
    m("Net income", "NET_INCOME", "money"), m("EPS", "EPS", "per_share"), m("Operating cash flow", "OPERATING_CASH_FLOW", "money"),
    m("Capex", "CAPEX", "money"), m("Free cash flow", "FREE_CASH_FLOW", "money"),
  ],
};
const isRatios: BlockMapping = {
  headerRow: 13, firstDataRow: 14, lastDataRow: 18, labelColumn: 1,
  rows: [
    m("Revenue growth", "REVENUE_GROWTH", "ratio", "calculated"), m("Gross margin", "GROSS_MARGIN", "ratio", "calculated"),
    m("Operating margin", "OPERATING_MARGIN", "ratio", "calculated"), m("Net margin", "NET_MARGIN", "ratio", "calculated"),
    m("FCF margin", "FCF_MARGIN", "ratio", "calculated"),
  ],
};
const bsMain: BlockMapping = {
  headerRow: 3, firstDataRow: 4, lastDataRow: 12, labelColumn: 1,
  rows: [
    m("Total assets", "TOTAL_ASSETS", "money"), m("Cash", "CASH", "money"), m("Inventory", "INVENTORY", "money"),
    m("Receivables", "RECEIVABLES", "money"), m("Equity", "TOTAL_EQUITY", "money"), m("Total liabilities", "TOTAL_LIABILITIES", "money"),
    m("Short-term bank loans", "SHORT_TERM_BANK_LOANS", "money"), m("Supplier financing", "SUPPLIER_FINANCING", "money"),
    m("Lease liabilities", "LEASE_LIABILITIES", "money"),
  ],
};
const bsRatios: BlockMapping = {
  headerRow: 14, firstDataRow: 15, lastDataRow: 16, labelColumn: 1,
  rows: [m("Debt + lease / equity", "DEBT_LEASE_TO_EQUITY", "ratio", "calculated"), m("Cash / total assets", "CASH_TO_ASSETS", "ratio", "calculated")],
};
const normalized: BlockMapping = {
  headerRow: 2, firstDataRow: 3, lastDataRow: 9, labelColumn: 1,
  rows: [
    m("Reported net income", "NET_INCOME", "money", "auto", true), m("One-off restructuring / relocation", "ONE_OFF_ADJUSTMENTS", "money", "reported"),
    m("Normalized net income", "NORMALIZED_NET_INCOME", "money", "normalized"), m("Reported EPS", "EPS", "per_share", "auto", true),
    m("Normalized EPS", "NORMALIZED_EPS", "per_share", "normalized"), m("Reported FCF", "FREE_CASH_FLOW", "money", "auto", true),
    m("Normalized FCF", "NORMALIZED_FCF", "money", "normalized"),
  ],
};
const ratios: BlockMapping = {
  headerRow: 2, firstDataRow: 3, lastDataRow: 9, labelColumn: 1,
  rows: [
    m("Revenue growth", "REVENUE_GROWTH", "ratio", "calculated", true), m("Gross margin", "GROSS_MARGIN", "ratio", "calculated", true),
    m("Operating margin", "OPERATING_MARGIN", "ratio", "calculated", true), m("Net margin", "NET_MARGIN", "ratio", "calculated", true),
    m("ROE (avg equity where supported)", "ROE", "ratio", "calculated"), m("FCF margin", "FCF_MARGIN", "ratio", "calculated", true),
    m("Dividend payout (DPS / EPS)", "DIVIDEND_PAYOUT", "ratio", "calculated"),
  ],
};

/** Mapping for the individual-company research workbook layout (validated against BATBC). */
export const TYPE_B_V1: MappingTemplate = {
  id: "type-b-individual-v1",
  workbookType: "TYPE_B",
  version: 1,
  name: "Individual company research workbook v1",
  currency: "BDT",
  fiscalYearEndMonth: 12,
  defaultScale: "million",
  declaredUnitAnchor: { sheet: "README", ref: "B7" },
  sheets: [
    { sheet: "README", required: true, blocks: [] },
    { sheet: "INPUTS", required: true, blocks: [] },
    { sheet: "HIST_IS", required: true, unitLabelRef: "A2", blocks: [isMain, isRatios] },
    { sheet: "HIST_BS", required: true, unitLabelRef: "A2", blocks: [bsMain, bsRatios] },
    { sheet: "NORMALIZED", required: false, blocks: [normalized], cells: [{ ref: "C10", metricCode: "NORMALIZED_EPS", kind: "per_share", period: "FY2027E", classification: "estimated" }] },
    { sheet: "RATIOS", required: false, blocks: [ratios] },
    { sheet: "DCF", required: false, blocks: [] },
    { sheet: "THESIS", required: false, blocks: [] },
    { sheet: "SCENARIOS", required: false, blocks: [] },
  ],
  anchors: {
    tickerReadme: { sheet: "README", ref: "B5" },
    tickerInputs: { sheet: "INPUTS", ref: "B4" },
    shares: { sheet: "INPUTS", ref: "B5" },
    price: { sheet: "INPUTS", ref: "B7" },
    marketCap: { sheet: "INPUTS", ref: "B8" },
    cash: { sheet: "INPUTS", ref: "B22" },
    shortTermLoan: { sheet: "INPUTS", ref: "B23" },
    lease: { sheet: "INPUTS", ref: "B24" },
    netDebt: { sheet: "INPUTS", ref: "B29" },
    enterpriseValue: { sheet: "INPUTS", ref: "B30" },
    dcfWacc: { sheet: "DCF", ref: "B5" },
    dcfGrowth: { sheet: "DCF", ref: "B6" },
    dcfNetDebtInput: { sheet: "DCF", ref: "B7" },
    dcfShares: { sheet: "DCF", ref: "B8" },
    dcfEv: { sheet: "DCF", ref: "B20" },
    dcfNetDebtUsed: { sheet: "DCF", ref: "B21" },
    dcfEquity: { sheet: "DCF", ref: "B22" },
    dcfPerShare: { sheet: "DCF", ref: "B23" },
    scenarioBear: { sheet: "SCENARIOS", ref: "F4" },
    scenarioBase: { sheet: "SCENARIOS", ref: "F5" },
    scenarioBull: { sheet: "SCENARIOS", ref: "F6" },
    readmeRecommendation: { sheet: "README", ref: "B8" },
    thesisRecommendation: { sheet: "THESIS", ref: "B4" },
  },
};

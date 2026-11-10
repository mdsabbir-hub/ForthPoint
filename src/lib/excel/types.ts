export type Severity = "ERROR" | "WARNING" | "INFO";
export type Classification = "reported" | "calculated" | "normalized" | "estimated";
export type CellValue = string | number | boolean | Date | null;
export type MetricKind = "money" | "per_share" | "ratio" | "multiple";

export interface RawCell {
  ref: string;
  row: number;
  col: number;
  value: CellValue;
  formula: string | null;
  hasCachedValue: boolean;
  errorValue: string | null;
}

export interface RawSheet {
  name: string;
  maxRow: number;
  maxCol: number;
  cells: Map<string, RawCell>;
}

export interface RawWorkbook {
  sheets: RawSheet[];
}

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  sheet?: string;
  cellRef?: string;
}

export interface ParsedPeriod {
  type: "annual" | "half" | "quarterly";
  fiscalYear: number;
  periodEnd: string; // YYYY-MM-DD
  label: string;
  isDerived: boolean;
  isForecast: boolean;
}

export interface ExtractedMetric {
  metricCode: string;
  period: ParsedPeriod;
  value: number;
  currency: string | null;
  unit: string;
  classification: Classification;
  sheet: string;
  cellRef: string;
  rowLabel: string;
  formulaText: string | null;
  hasCachedValue: boolean;
  crossCheckOnly: boolean;
}

export interface SourceRecord {
  sheet: string;
  cellRef: string;
  rawValue: string | number | boolean | null;
  formulaText: string | null;
  hasCachedValue: boolean;
}

export interface Detection {
  workbookType: "TYPE_A" | "TYPE_B" | "UNKNOWN";
  confidence: number;
  ticker: string | null;
  companyName: string | null;
  asOf: string | null;
  sheetCount: number;
  evidence: string[];
}

export interface SheetSummary {
  name: string;
  rows: number;
  cols: number;
  formulas: number;
  uncachedFormulas: number;
  errorCells: number;
  mapped: boolean;
  metricsExtracted: number;
}

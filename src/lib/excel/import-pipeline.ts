import { findSheet } from "./cells";
import { validateData } from "./data-validator";
import { inspectFormulas } from "./formula-inspector";
import { extractWithTemplate, type MappingTemplate } from "./mapping-engine";
import { TYPE_B_V1 } from "./templates/type-b-v1";
import { extractValuation, type ValuationExtract } from "./valuation-extractor";
import { detectWorkbook } from "./workbook-detector";
import type { Detection, ExtractedMetric, RawWorkbook, SheetSummary, SourceRecord, ValidationIssue } from "./types";

export const TEMPLATES: MappingTemplate[] = [TYPE_B_V1];

export interface PipelineResult {
  detection: Detection;
  template: { id: string; version: number; name: string } | null;
  metrics: ExtractedMetric[];
  records: SourceRecord[];
  issues: ValidationIssue[];
  sheets: SheetSummary[];
  valuation: ValuationExtract | null;
}

const order = { ERROR: 0, WARNING: 1, INFO: 2 } as const;

export function runImportPipeline(wb: RawWorkbook, opts: { expectedTicker?: string | null } = {}): PipelineResult {
  const issues: ValidationIssue[] = [];
  const formulas = inspectFormulas(wb);
  issues.push(...formulas.issues);

  const detection = detectWorkbook(wb);
  const tpl = TEMPLATES.find((t) => t.workbookType === detection.workbookType) ?? null;
  let metrics: ExtractedMetric[] = [];
  let records: SourceRecord[] = [];
  let perSheet: Record<string, number> = {};
  let valuation: ValuationExtract | null = null;

  if (!tpl) {
    issues.push({
      severity: "ERROR",
      code: detection.workbookType === "TYPE_A" ? "NO_TEMPLATE_TYPE_A" : "WORKBOOK_UNRECOGNISED",
      message: detection.workbookType === "TYPE_A"
        ? "This looks like the integrated multi-company workbook, but no mapping template exists for it yet. Nothing was extracted."
        : "The workbook layout was not recognised as a supported research workbook. Nothing was extracted.",
    });
  } else {
    for (const s of tpl.sheets) {
      if (!findSheet(wb, s.sheet)) {
        issues.push({ severity: s.required ? "ERROR" : "WARNING", code: s.required ? "SHEET_MISSING_REQUIRED" : "SHEET_MISSING", sheet: s.sheet, message: `Expected worksheet "${s.sheet}" is missing.` });
      }
    }
    const known = new Set(tpl.sheets.map((s) => s.sheet.toLowerCase()));
    const extra = wb.sheets.filter((s) => !known.has(s.name.trim().toLowerCase())).map((s) => s.name);
    if (extra.length > 0) issues.push({ severity: "INFO", code: "SHEETS_NOT_MAPPED", message: `${extra.length} worksheets are not mapped to database fields by this template yet: ${extra.join(", ")}.` });

    const ex = extractWithTemplate(wb, tpl);
    metrics = ex.metrics;
    records = ex.records;
    perSheet = ex.perSheetCount;
    issues.push(...ex.issues);
    issues.push(...validateData({ wb, tpl, detection, metrics, expectedTicker: opts.expectedTicker ?? null }));
    try {
      const v = extractValuation(wb);
      valuation = v.data;
      issues.push(...v.issues);
    } catch (e) {
      issues.push({ severity: "WARNING", code: "VALUATION_READ_FAILED", message: `Valuation and research sheets could not be read: ${e instanceof Error ? e.message : "unknown error"}.` });
    }
    if (metrics.length === 0) issues.push({ severity: "ERROR", code: "NOTHING_EXTRACTED", message: "No financial values could be extracted from this workbook." });
  }

  const mappedNames = new Set((tpl?.sheets ?? []).map((s) => s.sheet.toLowerCase()));
  const sheets: SheetSummary[] = wb.sheets.map((s) => {
    const f = formulas.stats.find((x) => x.sheet === s.name);
    return {
      name: s.name, rows: s.maxRow, cols: s.maxCol, formulas: f?.formulas ?? 0, uncachedFormulas: f?.uncached ?? 0, errorCells: f?.errors ?? 0,
      mapped: mappedNames.has(s.name.trim().toLowerCase()), metricsExtracted: perSheet[s.name] ?? 0,
    };
  });

  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { detection, template: tpl ? { id: tpl.id, version: tpl.version, name: tpl.name } : null, metrics, records, issues, sheets, valuation };
}

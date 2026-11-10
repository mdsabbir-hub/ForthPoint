import { cellAt, cellByRef, findSheet, normLabel, refOf, textOf, toJsonSafe } from "./cells";
import { parsePeriod, periodKey } from "./period-parser";
import { parseUnitLabel, type Scale } from "./unit-normalizer";
import { extractNumber } from "./value-extractor";
import type {
  Classification, ExtractedMetric, MetricKind, ParsedPeriod, RawCell, RawSheet, RawWorkbook, SourceRecord, ValidationIssue,
} from "./types";

export interface RowMapping {
  label: string;
  metricCode: string;
  kind: MetricKind;
  classification: Classification | "auto"; // auto: formula => calculated, typed value => reported
  crossCheckOnly?: boolean; // compared with stored values but not stored itself
}
export interface BlockMapping {
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  labelColumn: number; // 1-based
  rows: RowMapping[];
}
export interface CellMapping {
  ref: string;
  metricCode: string;
  kind: MetricKind;
  period: string;
  classification: Classification;
}
export interface SheetMapping {
  sheet: string;
  required: boolean;
  unitLabelRef?: string;
  blocks: BlockMapping[];
  cells?: CellMapping[];
}
export interface Anchor {
  sheet: string;
  ref: string;
}
export interface MappingTemplate {
  id: string;
  workbookType: "TYPE_A" | "TYPE_B";
  version: number;
  name: string;
  currency: string;
  fiscalYearEndMonth: number;
  defaultScale: Scale;
  declaredUnitAnchor: Anchor;
  sheets: SheetMapping[];
  anchors: Record<string, Anchor>;
}

export interface ExtractionResult {
  metrics: ExtractedMetric[];
  records: SourceRecord[];
  issues: ValidationIssue[];
  perSheetCount: Record<string, number>;
}

const TOL_ABS = 1;
const TOL_REL = 0.001;

function record(sheet: string, cell: RawCell): SourceRecord {
  return { sheet, cellRef: cell.ref, rawValue: toJsonSafe(cell.value), formulaText: cell.formula, hasCachedValue: cell.hasCachedValue };
}

function unitFor(kind: MetricKind, currency: string, scale: Scale): { currency: string | null; unit: string } {
  switch (kind) {
    case "money": return { currency, unit: scale };
    case "per_share": return { currency, unit: "per_share" };
    case "ratio": return { currency: null, unit: "ratio" };
    case "multiple": return { currency: null, unit: "x" };
  }
}

function classify(c: Classification | "auto", cell: RawCell): Classification {
  if (c !== "auto") return c;
  return cell.formula ? "calculated" : "reported";
}

export function extractWithTemplate(wb: RawWorkbook, tpl: MappingTemplate): ExtractionResult {
  const issues: ValidationIssue[] = [];
  const out: ExtractedMetric[] = [];
  const records: SourceRecord[] = [];
  const perSheetCount: Record<string, number> = {};

  // Workbook-declared unit (README), used when a sheet does not state its own.
  const declaredCell = cellByRef(wb, tpl.declaredUnitAnchor.sheet, tpl.declaredUnitAnchor.ref);
  const declared = declaredCell ? parseUnitLabel(textOf(declaredCell.value)) : null;
  const declaredScale: Scale | null = declared?.scale ?? null;
  if (!declaredScale) {
    issues.push({ severity: "WARNING", code: "UNIT_NOT_DECLARED", sheet: tpl.declaredUnitAnchor.sheet, cellRef: tpl.declaredUnitAnchor.ref, message: `The workbook does not declare its measurement unit; assuming ${tpl.currency} ${tpl.defaultScale}.` });
  }
  const workbookScale: Scale = declaredScale ?? tpl.defaultScale;
  const currency = declared?.currency ?? tpl.currency;

  for (const sm of tpl.sheets) {
    const sheet: RawSheet | undefined = findSheet(wb, sm.sheet);
    if (!sheet) continue; // missing sheets are reported by the pipeline
    perSheetCount[sheet.name] = 0;

    let scale: Scale = workbookScale;
    if (sm.unitLabelRef) {
      const uc = sheet.cells.get(sm.unitLabelRef);
      const label = uc ? parseUnitLabel(textOf(uc.value)) : null;
      if (label?.scale) {
        scale = label.scale;
        if (declaredScale && label.scale !== declaredScale) {
          issues.push({ severity: "WARNING", code: "UNIT_MISMATCH", sheet: sheet.name, cellRef: sm.unitLabelRef, message: `Sheet unit is ${label.scale} but the workbook declares ${declaredScale}. Values on this sheet use the sheet unit.` });
        }
      }
    }

    for (const block of sm.blocks) {
      // 1. period columns from the header row
      const periods = new Map<number, ParsedPeriod>();
      const seen = new Map<string, string>();
      for (let c = block.labelColumn + 1; c <= sheet.maxCol; c++) {
        const h = cellAt(sheet, block.headerRow, c);
        if (!h) continue;
        const p = parsePeriod(h.value, tpl.fiscalYearEndMonth);
        if (!p) {
          const hasData = Array.from({ length: block.lastDataRow - block.firstDataRow + 1 }, (_, i) => cellAt(sheet, block.firstDataRow + i, c)).some((x) => x !== undefined && typeof x.value === "number");
          if (hasData) {
            issues.push({ severity: "ERROR", code: "PERIOD_UNRECOGNISED", sheet: sheet.name, cellRef: h.ref, message: `Column header "${textOf(h.value)}" is not a recognised reporting period, so its data was not imported.` });
          }
          continue;
        }
        const key = periodKey(p);
        if (seen.has(key)) {
          issues.push({ severity: "ERROR", code: "PERIOD_DUPLICATE", sheet: sheet.name, cellRef: h.ref, message: `Reporting period ${p.label} appears twice in the header (also ${seen.get(key)}). The second column was skipped.` });
          continue;
        }
        seen.set(key, h.ref);
        periods.set(c, p);
      }
      if (periods.size === 0) {
        issues.push({ severity: "ERROR", code: "PERIOD_HEADER_MISSING", sheet: sheet.name, cellRef: refOf(block.headerRow, block.labelColumn), message: `No reporting periods found in header row ${block.headerRow}. The sheet layout differs from the mapping template.` });
        continue;
      }

      // 2. rows, matched by label inside the expected range
      for (const rm of block.rows) {
        const want = normLabel(rm.label);
        const hits: number[] = [];
        for (let r = block.firstDataRow; r <= block.lastDataRow; r++) {
          const lc = cellAt(sheet, r, block.labelColumn);
          if (lc && normLabel(textOf(lc.value)) === want) hits.push(r);
        }
        if (hits.length === 0) {
          issues.push({ severity: "WARNING", code: "ROW_NOT_FOUND", sheet: sheet.name, cellRef: refOf(block.firstDataRow, block.labelColumn), message: `Expected row "${rm.label}" (${rm.metricCode}) was not found in rows ${block.firstDataRow}-${block.lastDataRow}. The sheet structure may have changed.` });
          continue;
        }
        if (hits.length > 1) {
          issues.push({ severity: "ERROR", code: "METRIC_ROW_DUPLICATE", sheet: sheet.name, cellRef: refOf(hits[1], block.labelColumn), message: `Row label "${rm.label}" appears ${hits.length} times (rows ${hits.join(", ")}). Only the first was used.` });
        }
        const row = hits[0];
        const missingPeriods: string[] = [];
        for (const [col, p] of periods) {
          const cell = cellAt(sheet, row, col);
          const ex = extractNumber(cell);
          const ref = refOf(row, col);
          if (ex.kind === "missing") {
            if (ex.reason === "blank") missingPeriods.push(p.label);
            continue;
          }
          if (ex.kind === "no_cached_value") continue; // reported by the formula inspector
          if (ex.kind === "error") continue; // reported by the formula inspector
          if (ex.kind === "invalid") {
            issues.push({ severity: "WARNING", code: "NUMBER_INVALID", sheet: sheet.name, cellRef: ref, message: `"${ex.raw}" in ${rm.label} (${p.label}) is not a valid number and was not imported.` });
            continue;
          }
          if (!cell) continue;
          if (ex.storedAsText) {
            issues.push({ severity: "WARNING", code: "NUMBER_STORED_AS_TEXT", sheet: sheet.name, cellRef: ref, message: `${rm.label} (${p.label}) is stored as text; it was read as ${ex.value}.` });
          }
          const u = unitFor(rm.kind, currency, scale);
          out.push({
            metricCode: rm.metricCode, period: p, value: ex.value, currency: u.currency, unit: u.unit,
            classification: classify(rm.classification, cell), sheet: sheet.name, cellRef: ref, rowLabel: rm.label,
            formulaText: cell.formula, hasCachedValue: cell.hasCachedValue, crossCheckOnly: Boolean(rm.crossCheckOnly),
          });
          if (!rm.crossCheckOnly) {
            records.push(record(sheet.name, cell));
            perSheetCount[sheet.name] += 1;
          }
        }
        if (missingPeriods.length > 0) {
          issues.push({ severity: "INFO", code: "VALUE_MISSING", sheet: sheet.name, cellRef: refOf(row, block.labelColumn), message: `${rm.label}: no value for ${missingPeriods.join(", ")}. Left empty, not treated as zero.` });
        }
      }
    }

    for (const cm of sm.cells ?? []) {
      const cell = sheet.cells.get(cm.ref);
      const p = parsePeriod(cm.period, tpl.fiscalYearEndMonth);
      const ex = extractNumber(cell);
      if (!p || ex.kind !== "number" || !cell) continue;
      const u = unitFor(cm.kind, currency, scale);
      out.push({
        metricCode: cm.metricCode, period: p, value: ex.value, currency: u.currency, unit: u.unit, classification: cm.classification,
        sheet: sheet.name, cellRef: cm.ref, rowLabel: textOf(cellAt(sheet, cell.row, 1)?.value ?? null), formulaText: cell.formula,
        hasCachedValue: cell.hasCachedValue, crossCheckOnly: false,
      });
      records.push(record(sheet.name, cell));
      perSheetCount[sheet.name] += 1;
    }
  }

  return dedupe(out, records, issues, perSheetCount);
}

function close(a: number, b: number): boolean {
  const d = Math.abs(a - b);
  return d <= TOL_ABS * 0.5 || d <= TOL_REL * Math.max(Math.abs(a), Math.abs(b));
}

/** One stored value per metric+period. Cross-check rows only confirm or contradict stored values. */
function dedupe(all: ExtractedMetric[], records: SourceRecord[], issues: ValidationIssue[], perSheetCount: Record<string, number>): ExtractionResult {
  const kept = new Map<string, ExtractedMetric>();
  let crossOk = 0;
  const pendingCross: ExtractedMetric[] = [];
  for (const m of all) {
    if (m.crossCheckOnly) { pendingCross.push(m); continue; }
    const key = `${m.metricCode}|${periodKey(m.period)}`;
    const prev = kept.get(key);
    if (!prev) { kept.set(key, m); continue; }
    if (close(prev.value, m.value)) {
      issues.push({ severity: "INFO", code: "DUPLICATE_CONSISTENT", sheet: m.sheet, cellRef: m.cellRef, message: `${m.metricCode} ${m.period.label} also appears at ${prev.sheet}!${prev.cellRef} with the same value. The first was kept.` });
    } else {
      issues.push({ severity: "ERROR", code: "DUPLICATE_METRIC_CONFLICT", sheet: m.sheet, cellRef: m.cellRef, message: `${m.metricCode} ${m.period.label} is ${m.value} here but ${prev.value} at ${prev.sheet}!${prev.cellRef}. The first value was kept; resolve the conflict in the workbook.` });
    }
    if (perSheetCount[m.sheet] !== undefined) perSheetCount[m.sheet] -= 1;
  }
  for (const m of pendingCross) {
    const base = kept.get(`${m.metricCode}|${periodKey(m.period)}`);
    if (!base) continue;
    if (close(base.value, m.value) || (m.unit === "ratio" && Math.abs(base.value - m.value) < 0.0005)) crossOk += 1;
    else issues.push({ severity: "WARNING", code: "CROSS_CHECK_MISMATCH", sheet: m.sheet, cellRef: m.cellRef, message: `${m.metricCode} ${m.period.label} is ${m.value} here but ${base.value} at ${base.sheet}!${base.cellRef}.` });
  }
  if (crossOk > 0) issues.push({ severity: "INFO", code: "CROSS_CHECKS_PASSED", message: `${crossOk} values repeated on other sheets agree with the stored values.` });
  const metrics = Array.from(kept.values());
  return { metrics, records, issues, perSheetCount };
}

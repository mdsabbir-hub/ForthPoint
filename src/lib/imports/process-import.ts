import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { compareAndStore } from "@/lib/comparison/compare-store";
import { runImportPipeline } from "@/lib/excel/import-pipeline";
import { periodKey } from "@/lib/excel/period-parser";
import { readWorkbook } from "@/lib/excel/workbook-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_FILE_BYTES, WORKBOOK_BUCKET } from "./constants";
import { looksLikeXlsx } from "./file-validation";

export type ProcessOutcome =
  | { ok: true; status: string; errors: number; warnings: number; infos: number; metrics: number }
  | { ok: false; httpStatus: number; message: string };

const CHUNK = 400;

async function insertChunks(admin: ReturnType<typeof createAdminClient>, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function processImportJob(jobId: string, actorId: string): Promise<ProcessOutcome> {
  const admin = createAdminClient();
  const { data: job } = await admin.from("import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, httpStatus: 404, message: "Import not found." };
  if (["approved", "published"].includes(job.status)) return { ok: false, httpStatus: 409, message: "This import is already approved and cannot be re-processed." };
  if (!job.storage_path) return { ok: false, httpStatus: 400, message: "No file has been uploaded for this import." };

  const fail = async (message: string, httpStatus: number, removeFile = false): Promise<ProcessOutcome> => {
    await admin.from("import_jobs").update({ status: "failed", error_message: message }).eq("id", jobId);
    if (removeFile) await admin.storage.from(WORKBOOK_BUCKET).remove([job.storage_path]);
    await writeAudit(admin, { actorId, action: "import.failed", entityType: "import_job", entityId: jobId, details: { message } });
    return { ok: false, httpStatus, message };
  };

  try {
    await admin.from("import_jobs").update({ status: "processing", error_message: null }).eq("id", jobId);
    // Re-processing: discard the previous draft and findings for this job.
    await admin.from("import_validation_issues").delete().eq("import_job_id", jobId);
    await admin.from("import_snapshots").delete().eq("import_job_id", jobId).eq("status", "draft");

    const dl = await admin.storage.from(WORKBOOK_BUCKET).download(job.storage_path);
    if (dl.error || !dl.data) return await fail("The uploaded file could not be found in storage.", 400);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) return await fail("The file is too large.", 413, true);
    if (!looksLikeXlsx(bytes)) return await fail("The file is not a valid Excel (.xlsx) workbook.", 422, true);

    const buffer = Buffer.from(bytes);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const { data: dup } = await admin.from("import_files").select("import_job_id").eq("sha256", sha256).neq("import_job_id", jobId).limit(1);
    if (dup && dup.length > 0) return await fail(`This exact file was already imported (import ${dup[0].import_job_id}).`, 409, true);
    const { data: existingFile } = await admin.from("import_files").select("id").eq("import_job_id", jobId).maybeSingle();
    if (!existingFile) {
      const { error } = await admin.from("import_files").insert({
        import_job_id: jobId, storage_bucket: WORKBOOK_BUCKET, storage_path: job.storage_path,
        original_filename: job.original_filename ?? "workbook.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: bytes.length, sha256,
      });
      if (error) throw new Error(`import_files: ${error.message}`);
    }

    const read = await readWorkbook(buffer).then((w) => ({ w }), (e: unknown) => ({ e }));
    if ("e" in read) return await fail(`The workbook could not be read: ${read.e instanceof Error ? read.e.message : "unknown error"}`, 422);
    const wb = read.w;

    let expectedTicker: string | null = null;
    if (job.company_id) {
      const { data: sec } = await admin.from("securities").select("ticker").eq("company_id", job.company_id).eq("is_primary", true).maybeSingle();
      expectedTicker = sec?.ticker ?? null;
    }
    const result = runImportPipeline(wb, { expectedTicker });
    const counts = { errors: 0, warnings: 0, infos: 0 };
    const summary = { detection: result.detection, template: result.template, sheets: result.sheets, metricsExtracted: result.metrics.length };

    // Resolve the company by selection or by the ticker found in the workbook.
    let companyId: string | null = job.company_id ?? null;
    if (!companyId && result.detection.ticker) {
      const { data: sec } = await admin.from("securities").select("company_id").eq("ticker", result.detection.ticker).maybeSingle();
      companyId = sec?.company_id ?? null;
    }
    const issues = [...result.issues];
    if (!companyId) {
      issues.push({ severity: "ERROR", code: "COMPANY_NOT_FOUND", message: `No company with ticker ${result.detection.ticker ?? "(none found)"} exists. Create it under Companies, then re-process this import.` });
    }
    const hasTemplate = result.template !== null;
    const saveIssues = async (snapshotId: string | null) => {
      for (const i of issues) counts[i.severity === "ERROR" ? "errors" : i.severity === "WARNING" ? "warnings" : "infos"] += 1;
      await insertChunks(admin, "import_validation_issues", issues.map((i) => ({
        import_job_id: jobId, snapshot_id: snapshotId, severity: i.severity, code: i.code, message: i.message, sheet_name: i.sheet ?? null, cell_ref: i.cellRef ?? null,
      })));
    };

    if (!companyId || !hasTemplate) {
      await saveIssues(null);
      const reason = !hasTemplate ? issues.find((i) => i.severity === "ERROR")?.message ?? "Unsupported workbook." : issues[issues.length - 1].message;
      await admin.from("import_jobs").update({ status: "failed", error_message: reason, workbook_type: result.detection.workbookType, detected_ticker: result.detection.ticker, summary: { ...summary, counts } }).eq("id", jobId);
      return { ok: false, httpStatus: 422, message: reason };
    }

    // Draft snapshot. The published data is never touched by an import.
    const { data: last } = await admin.from("import_snapshots").select("version_no").eq("company_id", companyId).order("version_no", { ascending: false }).limit(1);
    const versionNo = (last?.[0]?.version_no ?? 0) + 1;
    const { data: snap, error: snapErr } = await admin.from("import_snapshots").insert({ company_id: companyId, import_job_id: jobId, version_no: versionNo, status: "draft" }).select("id").single();
    if (snapErr || !snap) throw new Error(`import_snapshots: ${snapErr?.message ?? "no row"}`);

    try {
      const periodMap = new Map<string, { company_id: string; period_type: string; fiscal_year: number; period_end: string; label: string; is_forecast: boolean }>();
      for (const m of result.metrics) {
        const k = periodKey(m.period);
        if (!periodMap.has(k)) periodMap.set(k, { company_id: companyId, period_type: m.period.type, fiscal_year: m.period.fiscalYear, period_end: m.period.periodEnd, label: m.period.label, is_forecast: m.period.isForecast });
      }
      const { data: periodRows, error: pErr } = await admin.from("reporting_periods").upsert(Array.from(periodMap.values()), { onConflict: "company_id,period_type,period_end" }).select("id,period_type,period_end");
      if (pErr) throw new Error(`reporting_periods: ${pErr.message}`);
      const periodId = new Map<string, string>((periodRows ?? []).map((p) => [`${p.period_type}:${p.period_end}`, p.id as string]));

      const { data: defs, error: dErr } = await admin.from("metric_definitions").select("id,code");
      if (dErr) throw new Error(`metric_definitions: ${dErr.message}`);
      const metricId = new Map<string, string>((defs ?? []).map((d) => [d.code as string, d.id as string]));

      const sources: Record<string, unknown>[] = [];
      const metricRows: Record<string, unknown>[] = [];
      const unknownCodes = new Set<string>();
      for (const m of result.metrics) {
        const mid = metricId.get(m.metricCode);
        const pid = periodId.get(periodKey(m.period));
        if (!mid) { unknownCodes.add(m.metricCode); continue; }
        if (!pid) continue;
        const sourceId = randomUUID();
        sources.push({ id: sourceId, snapshot_id: snap.id, workbook_name: job.original_filename ?? "workbook.xlsx", sheet_name: m.sheet, cell_ref: m.cellRef, formula_text: m.formulaText });
        metricRows.push({ company_id: companyId, snapshot_id: snap.id, reporting_period_id: pid, metric_id: mid, value: m.value, currency: m.currency, unit: m.unit, classification: m.classification, is_forecast: m.period.isForecast, source_id: sourceId, formula_text: m.formulaText });
      }
      for (const code of unknownCodes) issues.push({ severity: "ERROR", code: "UNKNOWN_METRIC", message: `Metric ${code} has no definition in the database; its values were not stored.` });

      await insertChunks(admin, "financial_sources", sources);
      await insertChunks(admin, "financial_metrics", metricRows);
      await insertChunks(admin, "import_records", result.records.map((r) => ({ snapshot_id: snap.id, sheet_name: r.sheet, cell_ref: r.cellRef, raw_value: r.rawValue, formula_text: r.formulaText, has_cached_value: r.hasCachedValue })));
      await saveIssues(snap.id);
      try { await compareAndStore(admin, snap.id); } catch (ce) { console.error("comparison failed", ce); }
    } catch (e) {
      await admin.from("import_snapshots").delete().eq("id", snap.id);
      throw e;
    }

    await admin.from("import_jobs").update({
      status: "needs_review", company_id: companyId, workbook_type: result.detection.workbookType, detected_ticker: result.detection.ticker,
      error_message: null, summary: { ...summary, counts, snapshotId: snap.id, versionNo },
    }).eq("id", jobId);
    await writeAudit(admin, { actorId, action: "import.processed", entityType: "import_job", entityId: jobId, details: { metrics: result.metrics.length, ...counts } });
    return { ok: true, status: "needs_review", errors: counts.errors, warnings: counts.warnings, infos: counts.infos, metrics: result.metrics.length };
  } catch (e) {
    console.error("processImportJob failed", e);
    return await fail(`Processing failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}`, 500);
  }
}

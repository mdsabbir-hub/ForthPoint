import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compareSnapshots, summarize, type MetricSnap } from "./comparison-engine";

const PAGE = 1000;

type Joined<T> = T | T[] | null;
const one = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function loadSnapshotMetrics(admin: SupabaseClient, snapshotId: string): Promise<MetricSnap[]> {
  const out: MetricSnap[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("financial_metrics")
      .select("value,unit,classification,formula_text,metric_definitions(code),reporting_periods(label,period_type,period_end),financial_sources(sheet_name,cell_ref)")
      .eq("snapshot_id", snapshotId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`financial_metrics: ${error.message}`);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const def = one(r.metric_definitions as Joined<{ code: string }>);
      const per = one(r.reporting_periods as Joined<{ label: string; period_type: string; period_end: string }>);
      const src = one(r.financial_sources as Joined<{ sheet_name: string; cell_ref: string }>);
      if (!def || !per) continue;
      out.push({
        metricCode: def.code, periodKey: `${per.period_type}:${per.period_end}`, periodLabel: per.label, value: Number(r.value), unit: String(r.unit),
        classification: String(r.classification), formulaText: (r.formula_text as string | null) ?? null, sheet: src?.sheet_name ?? "", cellRef: src?.cell_ref ?? "",
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function sheetNames(admin: SupabaseClient, snapshotId: string): Promise<string[] | null> {
  const { data: snap } = await admin.from("import_snapshots").select("import_job_id").eq("id", snapshotId).maybeSingle();
  if (!snap) return null;
  const { data: job } = await admin.from("import_jobs").select("summary").eq("id", snap.import_job_id).maybeSingle();
  const sheets = job?.summary?.sheets as Array<{ name: string }> | undefined;
  return sheets ? sheets.map((s) => s.name) : null;
}

/** Compares a draft snapshot with the company's current publication and stores the result. Never touches published data. */
export async function compareAndStore(admin: SupabaseClient, newSnapshotId: string) {
  const { data: snap, error } = await admin.from("import_snapshots").select("id,company_id").eq("id", newSnapshotId).maybeSingle();
  if (error || !snap) throw new Error("Snapshot not found.");
  const { data: current } = await admin.from("publication_versions").select("snapshot_id").eq("company_id", snap.company_id).eq("is_current", true).maybeSingle();
  const oldId: string | null = current?.snapshot_id ?? null;

  const [newM, oldM, newSheets, oldSheets] = await Promise.all([
    loadSnapshotMetrics(admin, newSnapshotId),
    oldId ? loadSnapshotMetrics(admin, oldId) : Promise.resolve(null),
    sheetNames(admin, newSnapshotId),
    oldId ? sheetNames(admin, oldId) : Promise.resolve(null),
  ]);
  const rows = compareSnapshots(oldM, newM, oldSheets && newSheets ? oldSheets : null, newSheets ?? []);

  await admin.from("import_diffs").delete().eq("new_snapshot_id", newSnapshotId);
  const records = rows.map((r) => ({
    new_snapshot_id: newSnapshotId, old_snapshot_id: oldId, change_type: r.changeType, metric_code: r.metricCode, period_label: r.periodLabel,
    old_value: r.oldValue, new_value: r.newValue, absolute_change: r.absoluteChange, percent_change: r.percentChange,
    old_text: r.oldText, new_text: r.newText, sheet_name: r.sheet, cell_ref: r.cellRef,
    // Values with nothing to compare against need no individual review.
    decision: r.changeType === "added" ? "approved" : "pending",
  }));
  for (let i = 0; i < records.length; i += 400) {
    const { error: e } = await admin.from("import_diffs").insert(records.slice(i, i + 400));
    if (e) throw new Error(`import_diffs: ${e.message}`);
  }
  return { baselineSnapshotId: oldId, counts: summarize(rows) };
}

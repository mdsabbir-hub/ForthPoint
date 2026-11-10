import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, Stat } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import { ReprocessButton } from "./reprocess-button";

export const dynamic = "force-dynamic";

type Sheet = { name: string; rows: number; formulas: number; mapped: boolean; metricsExtracted: number; uncachedFormulas: number };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function ImportDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("import.review");
  const { id } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();
  const [{ data: file }, { data: issues }] = await Promise.all([
    supabase.from("import_files").select("original_filename,size_bytes,sha256").eq("import_job_id", id).maybeSingle(),
    supabase.from("import_validation_issues").select("id,severity,code,message,sheet_name,cell_ref").eq("import_job_id", id).order("created_at"),
  ]);
  const snapshotId: string | undefined = job.summary?.snapshotId;
  const { data: metrics } = snapshotId
    ? await supabase.from("financial_metrics").select("id,value,unit,classification,metric_definitions(code),reporting_periods(label,period_end),financial_sources(sheet_name,cell_ref)").eq("snapshot_id", snapshotId).limit(1000)
    : { data: [] as never[] };

  const rows = (metrics ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string, value: m.value as number, unit: m.unit as string, classification: m.classification as string,
    code: one(m.metric_definitions as { code: string } | { code: string }[] | null)?.code ?? "",
    period: one(m.reporting_periods as { label: string; period_end: string } | { label: string; period_end: string }[] | null),
    source: one(m.financial_sources as { sheet_name: string; cell_ref: string } | { sheet_name: string; cell_ref: string }[] | null),
  })).sort((a, b) => a.code.localeCompare(b.code) || (a.period?.period_end ?? "").localeCompare(b.period?.period_end ?? ""));

  const counts = job.summary?.counts ?? { errors: 0, warnings: 0, infos: 0 };
  const sheets: Sheet[] = job.summary?.sheets ?? [];
  const sev = ["ERROR", "WARNING", "INFO"] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/imports" className="text-sm text-muted">Imports</Link>
          <h1 className="truncate text-xl font-semibold">{job.original_filename ?? "Workbook"}</h1>
          <div className="mt-1 flex items-center gap-2"><Badge value={job.status} /><span className="font-mono text-xs text-muted">{job.workbook_type ?? "type unknown"} · {job.detected_ticker ?? "no ticker"}</span></div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {snapshotId ? <Link href={`/admin/imports/${id}/compare`} className="text-sm text-accent">Compare and approve</Link> : null}
          {can(session.roles, "import.upload") && job.status !== "approved" && job.status !== "published" ? <ReprocessButton jobId={id} /> : null}
        </div>
      </div>
      {job.error_message ? <Card className="border-danger/50 p-4 text-sm text-danger">{job.error_message}</Card> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Values extracted" value={job.summary?.metricsExtracted ?? null} />
        <Stat label="Errors" value={counts.errors} note="Block publication" />
        <Stat label="Warnings" value={counts.warnings} note="Need review" />
        <Stat label="Notes" value={counts.infos} />
      </div>
      {file ? <p className="font-mono text-xs text-muted">{(file.size_bytes / 1024).toFixed(0)} KB · sha256 {file.sha256.slice(0, 16)}…{job.summary?.template ? ` · template ${job.summary.template.id} v${job.summary.template.version}` : ""}{job.summary?.versionNo ? ` · draft v${job.summary.versionNo}` : ""}</p> : null}

      <section className="space-y-2">
        <h2 className="font-semibold">Validation findings</h2>
        {(issues ?? []).length === 0 ? <p className="text-sm text-muted">No findings recorded.</p> : sev.map((s) => {
          const list = (issues ?? []).filter((i) => i.severity === s);
          if (list.length === 0) return null;
          return (
            <Card key={s} className="divide-y divide-line">
              {list.map((i) => (
                <div key={i.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge value={s} /><span className="font-mono text-xs text-muted">{i.code}</span>{i.sheet_name ? <span className="font-mono text-xs text-muted">{i.sheet_name}{i.cell_ref ? `!${i.cell_ref}` : ""}</span> : null}</div>
                  <p>{i.message}</p>
                </div>
              ))}
            </Card>
          );
        })}
      </section>

      {sheets.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Worksheets ({sheets.length})</h2>
          <Card className="divide-y divide-line">
            {sheets.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{s.mapped ? `${s.metricsExtracted} values` : "not mapped"} · {s.formulas} formulas{s.uncachedFormulas ? ` · ${s.uncachedFormulas} unsaved` : ""}</span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Extracted values ({rows.length})</h2>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-2">Metric</th><th className="p-2">Period</th><th className="p-2 text-right">Value</th><th className="p-2">Unit</th><th className="p-2">Type</th><th className="p-2">Source</th></tr></thead>
              <tbody className="divide-y divide-line font-mono text-xs">
                {rows.map((r) => (
                  <tr key={r.id}><td className="p-2">{r.code}</td><td className="p-2">{r.period?.label}</td><td className="p-2 text-right">{r.value.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td><td className="p-2">{r.unit}</td><td className="p-2">{r.classification}</td><td className="p-2 text-muted">{r.source?.sheet_name}!{r.source?.cell_ref}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/roles";
import { approvalBlockers, needsWarningAcknowledgement, publishBlockers } from "@/lib/publication/approval-rules";
import { createClient } from "@/lib/supabase/server";
import { approveImport, publishImport, rejectImport, rerunComparison, reviewDiff } from "./actions";

export const dynamic = "force-dynamic";

type Diff = {
  id: string; change_type: string; metric_code: string | null; period_label: string | null; old_value: number | null; new_value: number | null;
  absolute_change: number | null; percent_change: number | null; old_text: string | null; new_text: string | null; sheet_name: string | null;
  cell_ref: string | null; decision: string; review_comment: string | null;
};
const n = (v: number | null) => (v === null ? "none" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const MAX_REVIEW_ROWS = 150;

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { roles } = await requirePermission("import.review");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("id,status,original_filename,detected_ticker,review_comment").eq("id", id).maybeSingle();
  if (!job) notFound();
  const { data: snaps } = await supabase.from("import_snapshots").select("id,version_no,status").eq("import_job_id", id).order("version_no", { ascending: false }).limit(1);
  const snap = snaps?.[0];
  const [{ data: issues }, { data: diffs }] = await Promise.all([
    supabase.from("import_validation_issues").select("severity,resolution").eq("import_job_id", id),
    snap ? supabase.from("import_diffs").select("*").eq("new_snapshot_id", snap.id).order("created_at").limit(3000) : Promise.resolve({ data: [] as Diff[] }),
  ]);
  const all: Diff[] = diffs ?? [];
  const baselineId: string | undefined = (diffs as Array<{ old_snapshot_id: string | null }> | null)?.[0]?.old_snapshot_id ?? undefined;
  const { data: baseline } = baselineId ? await supabase.from("import_snapshots").select("version_no").eq("id", baselineId).maybeSingle() : { data: null };

  const unresolved = (sev: string) => (issues ?? []).filter((i: { severity: string; resolution: string | null }) => i.severity === sev && !i.resolution).length;
  const state = {
    jobStatus: job.status as string, unresolvedErrors: unresolved("ERROR"), unresolvedWarnings: unresolved("WARNING"),
    rejectedDiffs: all.filter((d) => d.decision === "rejected").length, hasDraftSnapshot: snap?.status === "draft",
  };
  const blockers = approvalBlockers(state);
  const pubBlockers = publishBlockers(job.status, state.unresolvedErrors);
  const canDecide = can(roles, "import.publish");
  const counts: Record<string, number> = {};
  all.forEach((d) => { counts[d.change_type] = (counts[d.change_type] ?? 0) + 1; });
  const reviewable = all.filter((d) => d.change_type !== "added");
  const added = all.filter((d) => d.change_type === "added");
  const field = "h-10 w-full rounded border border-line bg-bg px-3 text-sm text-ink";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/imports/${id}`} className="text-sm text-muted">Import details</Link>
        <h1 className="truncate text-xl font-semibold">Compare and approve</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2"><Badge value={job.status} /><span className="font-mono text-xs text-muted">{job.original_filename} · {job.detected_ticker ?? "no ticker"}</span></div>
      </div>
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}
      {sp.ok ? <p className="text-sm text-accent">{sp.ok}</p> : null}
      {!snap ? <Card className="p-4 text-sm text-muted">This import has no snapshot, so there is nothing to compare.</Card> : (
        <>
          <p className="text-sm text-muted">{baseline ? `Compared with the currently published version (draft v${baseline.version_no}).` : "Nothing is published for this company yet, so every value is new."} Draft v{snap.version_no}.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="New values" value={counts.added ?? 0} />
            <Stat label="Changed" value={counts.changed ?? 0} />
            <Stat label="Removed" value={counts.removed ?? 0} />
            <Stat label="Other changes" value={(counts.unit ?? 0) + (counts.classification ?? 0) + (counts.formula ?? 0) + (counts.source ?? 0) + (counts.period ?? 0) + (counts.sheet_added ?? 0) + (counts.sheet_removed ?? 0)} note="Unit, formula, source, period, sheets" />
          </div>

          {job.status === "needs_review" && canDecide ? (
            <Card className="space-y-3 p-4">
              <h2 className="font-semibold">Decision</h2>
              {blockers.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-sm text-danger">{blockers.map((b) => <li key={b}>{b}</li>)}</ul> : null}
              <form className="space-y-3">
                <input type="hidden" name="jobId" value={id} />
                <textarea name="comment" rows={3} maxLength={1000} placeholder="Review comment (optional)" className="w-full rounded border border-line bg-bg p-3 text-sm text-ink" />
                {needsWarningAcknowledgement(state) ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="ack" className="mt-1" /><span>I have reviewed the {state.unresolvedWarnings} warning(s) on the import page and accept them.</span></label> : null}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" formAction={approveImport} disabled={blockers.length > 0}>Approve</Button>
                  <Button type="submit" variant="ghost" formAction={rejectImport}>Reject import</Button>
                  <Button type="submit" variant="ghost" formAction={rerunComparison}>Re-run comparison</Button>
                </div>
              </form>
            </Card>
          ) : null}

          {job.status === "approved" && canDecide ? (
            <Card className="space-y-3 p-4">
              <h2 className="font-semibold">Publish</h2>
              <p className="text-sm text-muted">Approved. Publishing makes this the version the public sees and keeps the previous one for rollback.</p>
              {pubBlockers.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-sm text-danger">{pubBlockers.map((b) => <li key={b}>{b}</li>)}</ul> : null}
              <form className="space-y-3">
                <input type="hidden" name="jobId" value={id} />
                <input name="comment" placeholder="Publication note (optional)" maxLength={500} className={field} />
                <div className="flex gap-3">
                  <Button type="submit" formAction={publishImport} disabled={pubBlockers.length > 0}>Publish now</Button>
                  <Button type="submit" variant="ghost" formAction={rejectImport}>Reject instead</Button>
                </div>
              </form>
            </Card>
          ) : null}
          {job.status === "published" ? <Card className="p-4 text-sm text-accent">This import is the published version. Manage it under Publications.</Card> : null}
          {job.status === "rejected" ? <Card className="p-4 text-sm text-muted">Rejected{job.review_comment ? `: ${job.review_comment}` : "."} The public site was not affected.</Card> : null}
          {!canDecide ? <p className="text-sm text-muted">You can inspect changes and add comments. Approving or publishing needs an administrator or publisher.</p> : null}

          <section className="space-y-2">
            <h2 className="font-semibold">Changes to review ({reviewable.length})</h2>
            {reviewable.length === 0 ? <p className="text-sm text-muted">No changes compared with the published version.</p> : null}
            {reviewable.slice(0, MAX_REVIEW_ROWS).map((d) => (
              <Card key={d.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge value={d.decision === "approved" ? "approved" : d.decision === "rejected" ? "failed" : "uploaded"} />
                  <span className="font-mono text-xs text-muted">{d.change_type}</span>
                  <span className="font-semibold">{d.metric_code ?? d.sheet_name}</span>
                  {d.period_label ? <span className="font-mono text-xs text-muted">{d.period_label}</span> : null}
                </div>
                {d.old_value !== null || d.new_value !== null ? (
                  <div className="font-mono text-xs">{n(d.old_value)} → {n(d.new_value)}{d.absolute_change !== null ? ` (${d.absolute_change > 0 ? "+" : ""}${n(d.absolute_change)}${d.percent_change !== null ? `, ${d.percent_change.toFixed(2)}%` : ", % n/a"})` : ""}</div>
                ) : null}
                {d.old_text || d.new_text ? <div className="break-words font-mono text-xs text-muted">{d.old_text ?? "none"} → {d.new_text ?? "none"}</div> : null}
                {d.sheet_name ? <div className="font-mono text-xs text-muted">{d.sheet_name}{d.cell_ref ? `!${d.cell_ref}` : ""}</div> : null}
                {job.status === "needs_review" ? (
                  <form action={reviewDiff} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="jobId" value={id} /><input type="hidden" name="diffId" value={d.id} />
                    {canDecide ? <select name="decision" defaultValue={d.decision} className="h-9 rounded border border-line bg-bg px-2 text-xs text-ink"><option value="pending">Pending</option><option value="approved">Approve</option><option value="rejected">Reject</option></select> : null}
                    <input name="comment" defaultValue={d.review_comment ?? ""} maxLength={500} placeholder="Comment" className="h-9 min-w-0 flex-1 rounded border border-line bg-bg px-2 text-xs text-ink" />
                    <Button type="submit" variant="ghost" className="h-9 px-3 text-xs">Save</Button>
                  </form>
                ) : d.review_comment ? <p className="text-xs text-muted">Comment: {d.review_comment}</p> : null}
              </Card>
            ))}
            {reviewable.length > MAX_REVIEW_ROWS ? <p className="text-sm text-muted">Showing the first {MAX_REVIEW_ROWS} of {reviewable.length} changes.</p> : null}
          </section>

          {added.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">New values ({added.length})</summary>
              <Card className="mt-2 divide-y divide-line">
                {added.slice(0, 300).map((d) => <div key={d.id} className="flex justify-between gap-3 p-2 font-mono text-xs"><span>{d.metric_code} {d.period_label}</span><span>{n(d.new_value)}</span></div>)}
              </Card>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

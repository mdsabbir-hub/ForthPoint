"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { compareAndStore } from "@/lib/comparison/compare-store";
import { can } from "@/lib/permissions/roles";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

function back(jobId: string, kind: "error" | "ok", message: string): never {
  revalidatePath(`/admin/imports/${jobId}/compare`);
  redirect(`/admin/imports/${jobId}/compare?${kind}=${encodeURIComponent(message)}`);
}

function jobIdFrom(formData: FormData): string {
  const parsed = uuid.safeParse(formData.get("jobId"));
  if (!parsed.success) redirect("/admin/imports");
  return parsed.data;
}

const text = (formData: FormData, name: string, max = 1000) => String(formData.get(name) ?? "").trim().slice(0, max);

export async function approveImport(formData: FormData) {
  const { user } = await requirePermission("import.publish");
  const jobId = jobIdFrom(formData);
  const { error } = await createAdminClient().rpc("approve_import", {
    p_job: jobId, p_actor: user.id, p_comment: text(formData, "comment"), p_ack: formData.get("ack") === "on",
  });
  if (error) back(jobId, "error", error.message);
  back(jobId, "ok", "Import approved. It is not public until you publish it.");
}

export async function rejectImport(formData: FormData) {
  const { user } = await requirePermission("import.publish");
  const jobId = jobIdFrom(formData);
  const { error } = await createAdminClient().rpc("reject_import", { p_job: jobId, p_actor: user.id, p_comment: text(formData, "comment") });
  if (error) back(jobId, "error", error.message);
  back(jobId, "ok", "Import rejected. The public site was not changed.");
}

export async function publishImport(formData: FormData) {
  const { user } = await requirePermission("import.publish");
  const jobId = jobIdFrom(formData);
  const admin = createAdminClient();
  const { data: snaps } = await admin.from("import_snapshots").select("id").eq("import_job_id", jobId).eq("status", "approved").order("version_no", { ascending: false }).limit(1);
  const snapshotId: string | undefined = snaps?.[0]?.id;
  if (!snapshotId) back(jobId, "error", "No approved snapshot found for this import.");
  const { error } = await admin.rpc("publish_snapshot", { p_snapshot: snapshotId, p_actor: user.id, p_notes: text(formData, "comment") });
  if (error) back(jobId, "error", error.message);
  revalidatePath("/admin/publications");
  back(jobId, "ok", "Published. This is now the current version for the company.");
}

export async function reviewDiff(formData: FormData) {
  const { user, roles } = await requirePermission("import.review");
  const jobId = jobIdFrom(formData);
  const diffId = uuid.safeParse(formData.get("diffId"));
  if (!diffId.success) back(jobId, "error", "Invalid change.");
  const admin = createAdminClient();
  const { data: job } = await admin.from("import_jobs").select("status").eq("id", jobId).maybeSingle();
  if (job?.status !== "needs_review") back(jobId, "error", "Changes can only be reviewed while the import awaits review.");
  const { data: diff } = await admin.from("import_diffs").select("id,new_snapshot_id").eq("id", diffId.data!).maybeSingle();
  const { data: snap } = diff ? await admin.from("import_snapshots").select("import_job_id").eq("id", diff.new_snapshot_id).maybeSingle() : { data: null };
  if (!diff || snap?.import_job_id !== jobId) back(jobId, "error", "That change does not belong to this import.");

  const update: Record<string, unknown> = { review_comment: text(formData, "comment") || null };
  if (can(roles, "import.publish")) {
    const decision = String(formData.get("decision"));
    if (!["pending", "approved", "rejected"].includes(decision)) back(jobId, "error", "Invalid decision.");
    update.decision = decision;
    update.reviewed_by = user.id;
  }
  const { error } = await admin.from("import_diffs").update(update).eq("id", diffId.data!);
  if (error) back(jobId, "error", "The review could not be saved.");
  back(jobId, "ok", can(roles, "import.publish") ? "Review saved." : "Comment saved.");
}

export async function rerunComparison(formData: FormData) {
  await requirePermission("import.publish");
  const jobId = jobIdFrom(formData);
  const admin = createAdminClient();
  const { data: job } = await admin.from("import_jobs").select("status").eq("id", jobId).maybeSingle();
  if (job?.status !== "needs_review") back(jobId, "error", "Comparison can only be re-run while the import awaits review.");
  const { data: snaps } = await admin.from("import_snapshots").select("id").eq("import_job_id", jobId).eq("status", "draft").order("version_no", { ascending: false }).limit(1);
  if (!snaps?.[0]) back(jobId, "error", "No draft snapshot found.");
  try {
    await compareAndStore(admin, snaps![0].id);
  } catch (e) {
    back(jobId, "error", e instanceof Error ? e.message.slice(0, 200) : "Comparison failed.");
  }
  back(jobId, "ok", "Comparison refreshed. Earlier review decisions were reset.");
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/api";
import { MAX_FILES_PER_BATCH, WORKBOOK_BUCKET } from "@/lib/imports/constants";
import { validateFileMeta } from "@/lib/imports/file-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const body = z.object({
  companyId: z.string().uuid().nullable().optional(),
  files: z.array(z.object({ name: z.string().min(1).max(200), size: z.number(), type: z.string().max(200) })).min(1).max(MAX_FILES_PER_BATCH),
});

export async function POST(req: Request) {
  const auth = await requireApiPermission("import.upload");
  if ("error" in auth) return auth.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const companyId = parsed.data.companyId ?? null;
  if (companyId) {
    const { data } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Company not found." }, { status: 400 });
  }
  const batchId = randomUUID();
  const items: Array<{ index: number; jobId?: string; path?: string; token?: string; error?: string }> = [];
  for (const [index, f] of parsed.data.files.entries()) {
    const problem = validateFileMeta(f.name, f.size, f.type);
    if (problem) { items.push({ index, error: problem }); continue; }
    const path = `${randomUUID()}.xlsx`;
    const { data: job, error } = await admin.from("import_jobs").insert({
      batch_id: batchId, company_id: companyId, status: "uploaded", created_by: auth.session.user.id, original_filename: f.name, storage_path: path,
    }).select("id").single();
    if (error || !job) { items.push({ index, error: "Could not create the import." }); continue; }
    const signed = await admin.storage.from(WORKBOOK_BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      await admin.from("import_jobs").update({ status: "failed", error_message: "Could not prepare the upload." }).eq("id", job.id);
      items.push({ index, error: "Could not prepare the upload." });
      continue;
    }
    items.push({ index, jobId: job.id, path, token: signed.data.token });
  }
  return NextResponse.json({ batchId, items });
}

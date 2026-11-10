"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

export async function rollbackPublication(formData: FormData) {
  const { user } = await requirePermission("import.publish");
  const company = uuid.safeParse(formData.get("companyId"));
  const target = uuid.safeParse(formData.get("publicationId"));
  if (!company.success || !target.success) redirect("/admin/publications?error=" + encodeURIComponent("Choose the earlier version to restore."));
  if (formData.get("confirm") !== "on") redirect("/admin/publications?error=" + encodeURIComponent("Tick the box to confirm the rollback."));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  const { error } = await createAdminClient().rpc("rollback_publication", { p_company: company.data, p_target_publication: target.data, p_actor: user.id, p_notes: notes || null });
  if (error) redirect("/admin/publications?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/publications");
  redirect("/admin/publications?ok=" + encodeURIComponent("Rolled back. The earlier version is current again."));
}

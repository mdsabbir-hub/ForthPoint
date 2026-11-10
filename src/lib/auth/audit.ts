import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function writeAudit(
  admin: SupabaseClient,
  entry: { actorId: string; action: string; entityType: string; entityId?: string; details?: Record<string, unknown> },
) {
  await admin.from("audit_logs").insert({
    actor_id: entry.actorId, action: entry.action, entity_type: entry.entityType,
    entity_id: entry.entityId ?? null, details: entry.details ?? {},
  });
}

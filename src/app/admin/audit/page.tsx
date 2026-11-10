import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requirePermission("audit.read");
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id,action,entity_type,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <Card className="divide-y divide-line">
        {(data ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>{r.action} <span className="text-muted">{r.entity_type}</span></span>
            <span className="font-mono text-xs text-muted">{new Date(r.created_at).toISOString().slice(0, 19).replace("T", " ")} UTC</span>
          </div>
        ))}
        {!data?.length ? <div className="p-3 text-sm text-muted">No activity recorded yet.</div> : null}
      </Card>
    </div>
  );
}

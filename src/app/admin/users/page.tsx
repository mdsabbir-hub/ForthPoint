import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePermission("users.manage");
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("id,email,created_at").order("created_at");
  const { data: roles } = await supabase.from("user_roles").select("user_id,role");
  const byUser = new Map<string, string[]>();
  (roles ?? []).forEach((r) => byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <Card className="divide-y divide-line">
        {(profiles ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span className="truncate">{p.email}</span>
            <span className="font-mono text-muted">{(byUser.get(p.id) ?? ["no role"]).join(", ")}</span>
          </div>
        ))}
        {!profiles?.length ? <div className="p-3 text-sm text-muted">No users found.</div> : null}
      </Card>
      <p className="text-sm text-muted">Role editing is added in a later phase. Until then, grant roles in the Supabase SQL editor.</p>
    </div>
  );
}

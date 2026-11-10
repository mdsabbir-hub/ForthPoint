import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, isAppRole, type AppRole, type Permission } from "@/lib/permissions/roles";

export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: rows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  const roles: AppRole[] = (rows ?? []).map((r) => r.role).filter(isAppRole);
  return { user: data.user, roles };
}

/** Server-side authorization gate for private pages. */
export async function requirePermission(permission: Permission) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, permission)) redirect("/forbidden");
  return session;
}

import { Stat, Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: any) => any) {
  const supabase = await createClient();
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  return error ? null : (n ?? 0);
}

export default async function AdminDashboard() {
  await requirePermission("admin.access");
  const [companies, published, pending, failed] = await Promise.all([
    count("companies"),
    count("publication_versions", (q) => q.eq("is_current", true)),
    count("import_jobs", (q) => q.in("status", ["uploaded", "processing", "needs_review"])),
    count("import_jobs", (q) => q.eq("status", "failed")),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total companies" value={companies} />
        <Stat label="Published companies" value={published} />
        <Stat label="Pending imports" value={pending} />
        <Stat label="Failed imports" value={failed} />
      </div>
      <Card className="p-4 text-sm text-muted">
        Workbook upload, validation and comparison arrive in Phase 2 and 3. Nothing has been imported yet.
      </Card>
    </div>
  );
}

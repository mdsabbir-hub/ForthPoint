import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import { rollbackPublication } from "./actions";

export const dynamic = "force-dynamic";

type Pub = {
  id: string; company_id: string; is_current: boolean; published_at: string; notes: string | null; rolled_back_from: string | null;
  import_snapshots: { version_no: number; import_job_id: string } | { version_no: number; import_job_id: string }[] | null;
  companies: { legal_name: string } | { legal_name: string }[] | null;
};
const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export default async function PublicationsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { roles } = await requirePermission("import.review");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("publication_versions").select("id,company_id,is_current,published_at,notes,rolled_back_from,import_snapshots(version_no,import_job_id),companies(legal_name)").order("published_at", { ascending: false }).limit(300);
  const pubs: Pub[] = data ?? [];
  const byCompany = new Map<string, Pub[]>();
  pubs.forEach((p) => byCompany.set(p.company_id, [...(byCompany.get(p.company_id) ?? []), p]));
  const canRollback = can(roles, "import.publish");
  const field = "h-10 w-full rounded border border-line bg-bg px-3 text-sm text-ink";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Publications</h1>
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}
      {sp.ok ? <p className="text-sm text-accent">{sp.ok}</p> : null}
      {byCompany.size === 0 ? <Card className="p-4 text-sm text-muted">Nothing has been published yet. Approve an import, then publish it from its compare page.</Card> : null}
      {Array.from(byCompany.entries()).map(([companyId, list]) => {
        const current = list.find((p) => p.is_current);
        const earlier = list.filter((p) => !p.is_current);
        return (
          <Card key={companyId} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{first(list[0].companies)?.legal_name}</span>
              {current ? <Badge value="published" /> : <Badge value="uploaded" />}
            </div>
            {current ? (
              <p className="text-sm">Current: draft v{first(current.import_snapshots)?.version_no} · {when(current.published_at)}{current.rolled_back_from ? " · restored by rollback" : ""}{current.notes ? ` · ${current.notes}` : ""}{" "}
                {first(current.import_snapshots)?.import_job_id ? <Link className="text-accent" href={`/admin/imports/${first(current.import_snapshots)?.import_job_id}`}>Open import</Link> : null}</p>
            ) : <p className="text-sm text-muted">No current publication.</p>}
            {earlier.length > 0 ? (
              <div className="space-y-1">
                <h3 className="text-sm text-muted">Earlier versions</h3>
                {earlier.map((p) => <div key={p.id} className="font-mono text-xs text-muted">v{first(p.import_snapshots)?.version_no} · {when(p.published_at)}{p.notes ? ` · ${p.notes}` : ""}</div>)}
              </div>
            ) : null}
            {canRollback && current && earlier.length > 0 ? (
              <form action={rollbackPublication} className="space-y-2 border-t border-line pt-3">
                <input type="hidden" name="companyId" value={companyId} />
                <label className="block text-sm"><span className="text-muted">Restore an earlier version</span>
                  <select name="publicationId" required className={field} defaultValue=""><option value="" disabled>Choose a version</option>
                    {earlier.map((p) => <option key={p.id} value={p.id}>v{first(p.import_snapshots)?.version_no} · {when(p.published_at)}</option>)}
                  </select>
                </label>
                <input name="notes" maxLength={500} placeholder="Reason (recorded in the audit log)" className={field} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" />I understand the public site will change immediately.</label>
                <Button type="submit" variant="ghost">Roll back</Button>
              </form>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  await requirePermission("import.review");
  const supabase = await createClient();
  const { data } = await supabase.from("import_jobs").select("id,status,original_filename,detected_ticker,created_at,summary").order("created_at", { ascending: false }).limit(100);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Imports</h1>
        <Link href="/admin/uploads" className="text-sm text-accent">Upload workbooks</Link>
      </div>
      <Card className="divide-y divide-line">
        {(data ?? []).map((j) => (
          <Link key={j.id} href={`/admin/imports/${j.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-raised">
            <div className="min-w-0">
              <div className="truncate">{j.original_filename ?? "Workbook"}</div>
              <div className="font-mono text-xs text-muted">{j.detected_ticker ?? "ticker unknown"} · {new Date(j.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {j.summary?.counts ? <span className="font-mono text-xs text-muted">{j.summary.counts.errors}E {j.summary.counts.warnings}W</span> : null}
              <Badge value={j.status} />
            </div>
          </Link>
        ))}
        {!data?.length ? <div className="p-3 text-sm text-muted">No imports yet.</div> : null}
      </Card>
    </div>
  );
}
